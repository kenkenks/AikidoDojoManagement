"""Independent Pyodide adapter for whole-paper rectification + auto grid PoC.

The production preprocessing module is loaded unchanged. This adapter only
rectifies the photographed paper and supplies an automatically detected SEED.
"""
from __future__ import annotations

import json
import runpy
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image


OUTPUT_SIZE = (2800, 1980)


def projective_coefficients(output_points, input_points):
    matrix, values = [], []
    for (x, y), (u, v) in zip(output_points, input_points):
        matrix.append([x, y, 1, 0, 0, 0, -u*x, -u*y]); values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v*x, -v*y]); values.append(v)
    return np.linalg.solve(np.asarray(matrix), np.asarray(values)).tolist()


def smooth(values, radius=2):
    kernel = np.ones(radius*2+1, dtype=np.float64)/(radius*2+1)
    return np.convolve(values.astype(np.float64), kernel, mode="same")


def local_peaks(score, minimum_distance=4):
    raw = [i for i in range(2, len(score)-2)
           if score[i] >= score[i-1] and score[i] >= score[i+1]
           and score[i] == np.max(score[i-2:i+3])]
    selected = []
    for index in sorted(raw, key=lambda value: float(score[value]), reverse=True):
        if all(abs(index-other) >= minimum_distance for other in selected):
            selected.append(index)
    return sorted(selected)


def best_regular_sequence(score, count, minimum_span, maximum_span):
    peaks = local_peaks(score)
    floor = float(np.percentile(score, 55))
    peaks = [value for value in peaks if score[value] >= floor]
    best = None
    for start_index, start in enumerate(peaks):
        for end in peaks[start_index+count-1:]:
            span = end-start
            if span < minimum_span or span > maximum_span:
                continue
            spacing = span/(count-1)
            if spacing < 20:
                continue
            tolerance = max(5, int(round(spacing*.24)))
            positions, strengths, deviations = [], [], []
            for expected in np.linspace(start, end, count):
                nearby = [value for value in peaks if abs(value-expected) <= tolerance]
                if not nearby:
                    positions = []
                    break
                chosen = max(nearby, key=lambda value: float(score[value])-.18*abs(value-expected))
                if positions and chosen <= positions[-1]:
                    positions = []
                    break
                positions.append(chosen); strengths.append(float(score[chosen])); deviations.append(abs(chosen-expected))
            if len(positions) != count or len(set(positions)) != count:
                continue
            gaps = np.diff(positions).astype(float)
            gap_cv = float(np.std(gaps)/max(np.mean(gaps), 1))
            max_gap_error = float(np.max(np.abs(gaps-np.median(gaps)))/max(np.median(gaps), 1))
            deviation = float(np.mean(deviations)/spacing)
            strength = float(np.mean(strengths))
            rank = strength*(span/len(score))**1.35/(1+7*gap_cv+4*deviation+2*max_gap_error)
            candidate = {"positions": positions, "span": span, "spacing": float(np.median(gaps)),
                         "gap_cv": gap_cv, "max_gap_error_ratio": max_gap_error,
                         "mean_snap_deviation_ratio": deviation, "mean_strength": strength,
                         "rank": rank}
            if best is None or rank > best["rank"]:
                best = candidate
    if best is None:
        raise RuntimeError("AUTO_GRID_REGULAR_SEQUENCE_NOT_FOUND")
    return best


def line_continuity(dark, x_lines, y_lines):
    y0, y1, x0, x1 = y_lines[0], y_lines[-1], x_lines[0], x_lines[-1]
    vertical = [float(np.mean(np.any(dark[y0:y1+1, max(0, x-2):x+3], axis=1))) for x in x_lines]
    horizontal = [float(np.mean(np.any(dark[max(0, y-2):y+3, x0:x1+1], axis=0))) for y in y_lines]
    return {"vertical_mean": float(np.mean(vertical)), "vertical_min": float(np.min(vertical)),
            "horizontal_mean": float(np.mean(horizontal)), "horizontal_min": float(np.min(horizontal))}


def auto_detect(image):
    gray = np.asarray(image.convert("L")); dark = gray < 165
    height, width = gray.shape; started = time.perf_counter()
    horizontal = best_regular_sequence(smooth(dark.sum(axis=1), 2), 21, int(height*.45), int(height*.88))
    y_lines = horizontal["positions"]
    margin = max(4, int(np.median(np.diff(y_lines))*.18))
    vertical = best_regular_sequence(smooth(dark[max(0, y_lines[0]-margin):min(height, y_lines[-1]+margin+1), :].sum(axis=0), 2), 21, int(width*.48), int(width*.88))
    x_lines = vertical["positions"]
    margin = max(4, int(np.median(np.diff(x_lines))*.18))
    horizontal = best_regular_sequence(smooth(dark[:, max(0, x_lines[0]-margin):min(width, x_lines[-1]+margin+1)].sum(axis=1), 2), 21, int(height*.45), int(height*.88))
    y_lines = horizontal["positions"]
    continuity = line_continuity(dark, x_lines, y_lines)
    grid_width, grid_height = x_lines[-1]-x_lines[0], y_lines[-1]-y_lines[0]
    area_ratio = float(grid_width*grid_height/(width*height)); aspect_ratio = float(grid_width/grid_height)
    regularity = max(0.0, 1-(vertical["gap_cv"]+horizontal["gap_cv"])*5)
    confidence = float(np.clip(.35*regularity+.3*min(continuity["vertical_mean"], continuity["horizontal_mean"])+.2*min(1.0, area_ratio/.45)+.15*max(0.0, 1-abs(aspect_ratio-1.38)/.55), 0, 1))
    return {"x_lines": x_lines, "y_lines": y_lines,
            "corners_tl_tr_br_bl": [[x_lines[0], y_lines[0]], [x_lines[-1], y_lines[0]], [x_lines[-1], y_lines[-1]], [x_lines[0], y_lines[-1]]],
            "confidence": confidence, "continuity": continuity, "area_ratio": area_ratio,
            "aspect_ratio": aspect_ratio, "elapsed_ms": round((time.perf_counter()-started)*1000)}


def main():
    algorithm_path, input_path, output_path, corners_path = map(Path, sys.argv[1:5])
    output_path.mkdir(parents=True, exist_ok=True)
    timings = {}; total_started = time.perf_counter()
    source = Image.open(input_path).convert("RGB")
    normalized = np.asarray(json.loads(corners_path.read_text(encoding="utf-8"))["paper_corners"], dtype=np.float64)
    if normalized.shape != (4, 2) or np.any(normalized < 0) or np.any(normalized > 1):
        raise RuntimeError("INVALID_NORMALIZED_PAPER_CORNERS")
    paper = normalized*np.asarray(source.size, dtype=np.float64)
    width, height = OUTPUT_SIZE
    destination = np.asarray([[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]], dtype=np.float64)
    started = time.perf_counter()
    rectified = source.transform(OUTPUT_SIZE, Image.Transform.PERSPECTIVE,
                                 projective_coefficients(destination, paper), Image.Resampling.BICUBIC)
    timings["rectification_ms"] = round((time.perf_counter()-started)*1000)
    rectified_path = output_path/"paper-rectified.jpg"; rectified.save(rectified_path, quality=94)
    detection = auto_detect(rectified); timings["auto_grid_ms"] = detection["elapsed_ms"]
    namespace = runpy.run_path(str(algorithm_path), run_name="pyodide_auto_grid_pipeline")
    seed = (detection["x_lines"][0]/width, detection["y_lines"][0]/height,
            detection["x_lines"][-1]/width, detection["y_lines"][-1]/height)
    namespace["detect_grid"].__globals__["SEED"] = seed
    previous = sys.argv; started = time.perf_counter()
    try:
        sys.argv = [str(algorithm_path), str(rectified_path), str(output_path/"pipeline")]
        namespace["main"]()
    finally:
        sys.argv = previous
    timings["existing_pipeline_ms"] = round((time.perf_counter()-started)*1000)
    manifest = json.loads((output_path/"pipeline"/"manifest.json").read_text(encoding="utf-8"))
    timings["total_ms"] = round((time.perf_counter()-total_started)*1000)
    truth = {1,21,41,61,81,101,121,141,161,181,201,221,241,261,262,281,282,301,302,321,322,341,342,361,362,381,382}
    truth_detected = sorted(card["number"] for card in manifest["cards"]
                            if card["number"] in truth and card["status"] != "blank")
    report = {"runtime": "pyodide", "source_size": list(source.size), "rectified_size": list(OUTPUT_SIZE),
              "detection": detection, "timings": timings, "cards": len(manifest["cards"]),
              "screening": manifest["screening"], "written_truth_detected": len(truth_detected),
              "written_truth_missed": sorted(truth-set(truth_detected)),
              "alignment_metrics": manifest["grid"]["alignment_metrics"]}
    (output_path/"report.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    main()
