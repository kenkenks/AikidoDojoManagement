#!/usr/bin/env python3
"""Independent full-page 20x20 grid auto-detection PoC.

The frozen line tracking / Coons mesh / card generation algorithm is loaded
unchanged.  This file only searches for its coarse 21x21 grid bounds after the
whole-paper perspective PoC has produced a front-facing page image.
"""
from __future__ import annotations

import argparse
import json
import runpy
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def smooth(values: np.ndarray, radius: int = 2) -> np.ndarray:
    kernel = np.ones(radius * 2 + 1, dtype=np.float64) / (radius * 2 + 1)
    return np.convolve(values.astype(np.float64), kernel, mode="same")


def local_peaks(score: np.ndarray, minimum_distance: int = 4) -> list[int]:
    raw = [index for index in range(2, len(score)-2)
           if score[index] >= score[index-1]
           and score[index] >= score[index+1]
           and score[index] == np.max(score[index-2:index+3])]
    selected: list[int] = []
    for index in sorted(raw, key=lambda value: float(score[value]), reverse=True):
        if all(abs(index-other) >= minimum_distance for other in selected):
            selected.append(index)
    return sorted(selected)


def best_regular_sequence(score: np.ndarray, count: int,
                          minimum_span: int, maximum_span: int) -> dict:
    """Find a regular sequence without using a fixed start or end seed."""
    peaks = local_peaks(score)
    floor = float(np.percentile(score, 55))
    peaks = [value for value in peaks if score[value] >= floor]
    best: dict | None = None
    for start_index, start in enumerate(peaks):
        for end in peaks[start_index+count-1:]:
            span = end-start
            if span < minimum_span or span > maximum_span:
                continue
            spacing = span/(count-1)
            if spacing < 20:
                continue
            tolerance = max(5, int(round(spacing*.24)))
            positions: list[int] = []
            strengths: list[float] = []
            deviations: list[float] = []
            valid = True
            for expected in np.linspace(start, end, count):
                nearby = [value for value in peaks if abs(value-expected) <= tolerance]
                if not nearby:
                    valid = False
                    break
                chosen = max(nearby, key=lambda value:
                             float(score[value]) - .18*abs(value-expected))
                if positions and chosen <= positions[-1]:
                    valid = False
                    break
                positions.append(chosen)
                strengths.append(float(score[chosen]))
                deviations.append(abs(chosen-expected))
            if not valid or len(set(positions)) != count:
                continue
            gaps = np.diff(positions).astype(float)
            gap_cv = float(np.std(gaps)/max(np.mean(gaps), 1))
            max_gap_error = float(np.max(np.abs(gaps-np.median(gaps))) /
                                  max(np.median(gaps), 1))
            deviation = float(np.mean(deviations)/spacing)
            strength = float(np.mean(strengths))
            # Prefer long, strong, regular sequences.  The large-area term is
            # what rejects the small qualification table on the right.
            rank = (strength * (span/len(score))**1.35 /
                    (1 + 7*gap_cv + 4*deviation + 2*max_gap_error))
            candidate = {
                "positions": positions,
                "span": span,
                "spacing": float(np.median(gaps)),
                "gap_cv": gap_cv,
                "max_gap_error_ratio": max_gap_error,
                "mean_snap_deviation_ratio": deviation,
                "mean_strength": strength,
                "rank": rank,
            }
            if best is None or candidate["rank"] > best["rank"]:
                best = candidate
    if best is None:
        raise RuntimeError("AUTO_GRID_REGULAR_SEQUENCE_NOT_FOUND")
    return best


def continuity(dark: np.ndarray, x_lines: list[int], y_lines: list[int]) -> dict:
    y0, y1 = y_lines[0], y_lines[-1]
    x0, x1 = x_lines[0], x_lines[-1]
    vertical = [float(np.mean(np.any(dark[y0:y1+1, max(0, x-2):x+3], axis=1)))
                for x in x_lines]
    horizontal = [float(np.mean(np.any(dark[max(0, y-2):y+3, x0:x1+1], axis=0)))
                  for y in y_lines]
    return {
        "vertical_mean": float(np.mean(vertical)),
        "vertical_min": float(np.min(vertical)),
        "horizontal_mean": float(np.mean(horizontal)),
        "horizontal_min": float(np.min(horizontal)),
    }


def auto_detect(image: Image.Image) -> dict:
    gray = np.asarray(image.convert("L"))
    dark = gray < 165
    height, width = gray.shape
    started = time.perf_counter()

    # First locate the long 21-line horizontal structure over the whole page.
    horizontal_score = smooth(dark.sum(axis=1), 2)
    horizontal = best_regular_sequence(horizontal_score, 21,
                                       int(height*.45), int(height*.88))
    y_lines = horizontal["positions"]

    # Locate 21 vertical rules using only the discovered horizontal band.
    y_margin = max(4, int(np.median(np.diff(y_lines))*.18))
    vertical_score = smooth(dark[max(0, y_lines[0]-y_margin):
                                 min(height, y_lines[-1]+y_margin+1), :].sum(axis=0), 2)
    vertical = best_regular_sequence(vertical_score, 21,
                                     int(width*.48), int(width*.88))
    x_lines = vertical["positions"]

    # Refine the horizontal sequence using only the selected large grid.
    x_margin = max(4, int(np.median(np.diff(x_lines))*.18))
    horizontal_score = smooth(dark[:, max(0, x_lines[0]-x_margin):
                                   min(width, x_lines[-1]+x_margin+1)].sum(axis=1), 2)
    horizontal = best_regular_sequence(horizontal_score, 21,
                                       int(height*.45), int(height*.88))
    y_lines = horizontal["positions"]

    line_continuity = continuity(dark, x_lines, y_lines)
    grid_width, grid_height = x_lines[-1]-x_lines[0], y_lines[-1]-y_lines[0]
    area_ratio = float(grid_width*grid_height/(width*height))
    aspect_ratio = float(grid_width/grid_height)
    regularity = max(0.0, 1-(vertical["gap_cv"]+horizontal["gap_cv"])*5)
    continuity_score = min(line_continuity["vertical_mean"],
                           line_continuity["horizontal_mean"])
    area_score = min(1.0, area_ratio/.45)
    aspect_score = max(0.0, 1-abs(aspect_ratio-1.38)/.55)
    confidence = float(np.clip(.35*regularity + .3*continuity_score +
                               .2*area_score + .15*aspect_score, 0, 1))
    reasons = [
        "21 vertical and 21 horizontal regularly-spaced rules found",
        f"large-grid area ratio {area_ratio:.3f} rejects the smaller qualification table",
        f"gap CV vertical={vertical['gap_cv']:.4f}, horizontal={horizontal['gap_cv']:.4f}",
        f"line continuity vertical={line_continuity['vertical_mean']:.3f}, horizontal={line_continuity['horizontal_mean']:.3f}",
        f"grid aspect ratio={aspect_ratio:.3f}",
    ]
    return {
        "x_lines": x_lines,
        "y_lines": y_lines,
        "corners_tl_tr_br_bl": [[x_lines[0], y_lines[0]], [x_lines[-1], y_lines[0]],
                                  [x_lines[-1], y_lines[-1]], [x_lines[0], y_lines[-1]]],
        "confidence": confidence,
        "reasons": reasons,
        "vertical": {key: value for key, value in vertical.items() if key != "positions"},
        "horizontal": {key: value for key, value in horizontal.items() if key != "positions"},
        "continuity": line_continuity,
        "area_ratio": area_ratio,
        "aspect_ratio": aspect_ratio,
        "elapsed_ms": round((time.perf_counter()-started)*1000),
    }


def overlay(image: Image.Image, detection: dict, output: Path) -> None:
    result = image.copy()
    draw = ImageDraw.Draw(result)
    for x in detection["x_lines"]:
        draw.line((x, detection["y_lines"][0], x, detection["y_lines"][-1]),
                  fill=(255, 40, 40), width=5)
    for y in detection["y_lines"]:
        draw.line((detection["x_lines"][0], y, detection["x_lines"][-1], y),
                  fill=(35, 105, 255), width=5)
    result.save(output, quality=94)


def compare_overlay(image: Image.Image, automatic: list[list[int]],
                    manual: list[list[float]], output: Path) -> dict:
    result = image.copy()
    draw = ImageDraw.Draw(result)
    auto_points = [tuple(point) for point in automatic]
    manual_points = [tuple(point) for point in manual]
    draw.line(auto_points+[auto_points[0]], fill=(20, 180, 70), width=10)
    draw.line(manual_points+[manual_points[0]], fill=(255, 150, 20), width=7)
    differences = [float(np.linalg.norm(np.asarray(a)-np.asarray(m)))
                   for a, m in zip(auto_points, manual_points)]
    result.save(output, quality=94)
    return {
        "corner_distances_px": differences,
        "mean_corner_distance_px": float(np.mean(differences)),
        "max_corner_distance_px": float(np.max(differences)),
        "legend": {"automatic": "green", "manual_reference": "orange"},
    }


def full_pipeline(algorithm: str, image_path: Path, output: Path,
                  detection: dict) -> dict:
    namespace = runpy.run_path(algorithm, run_name="auto_grid_pipeline")
    width, height = Image.open(image_path).size
    seed = (detection["x_lines"][0]/width, detection["y_lines"][0]/height,
            detection["x_lines"][-1]/width, detection["y_lines"][-1]/height)
    namespace["detect_grid"].__globals__["SEED"] = seed
    previous = sys.argv
    started = time.perf_counter()
    try:
        sys.argv = [algorithm, str(image_path), str(output)]
        namespace["main"]()
        manifest = json.loads((output/"manifest.json").read_text(encoding="utf-8"))
        return {"success": True,
                "elapsed_ms": round((time.perf_counter()-started)*1000),
                "cards": len(manifest["cards"]),
                "counts": manifest["screening"]["counts"]}
    except Exception as error:
        return {"success": False,
                "elapsed_ms": round((time.perf_counter()-started)*1000),
                "stage": "existing_grid_tracking_or_card_generation",
                "error_type": type(error).__name__, "error": str(error)}
    finally:
        sys.argv = previous


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rectified", required=True)
    parser.add_argument("--previous-report", required=True)
    parser.add_argument("--manual-grid-overlay", required=True)
    parser.add_argument("--algorithm", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    image = Image.open(args.rectified).convert("RGB")
    previous = json.loads(Path(args.previous_report).read_text(encoding="utf-8"))
    detection = auto_detect(image)
    overlay(image, detection, output/"01-auto-grid-overlay.jpg")

    # The previous PoC stored its manual diagnostic corners in the original
    # photograph.  Its rectified-grid overlay provides the corresponding
    # reference rectangle: x=.05..755 and y=.21..925 of 2800x1980.
    manual = [[.05*image.width, .21*image.height],
              [.755*image.width, .21*image.height],
              [.755*image.width, .925*image.height],
              [.05*image.width, .925*image.height]]
    comparison = compare_overlay(image, detection["corners_tl_tr_br_bl"], manual,
                                 output/"02-auto-vs-manual.jpg")
    pipeline = full_pipeline(args.algorithm, Path(args.rectified),
                             output/"full-pipeline", detection)

    methods = {
        "A_original_fixed_seed": {
            "grid_detection": previous["before_perspective_fixed_seed"],
            "line_tracking": {"success": False, "reason": "grid detection failed"},
            "card_generation": {"success": False},
        },
        "B_rectified_fixed_seed": {
            "grid_detection": previous["after_perspective_fixed_seed"],
            "line_tracking": {"success": False, "reason": "grid detection failed"},
            "card_generation": {"success": False},
        },
        "C_rectified_auto_grid": {
            "grid_detection": {"success": True,
                               "elapsed_ms": detection["elapsed_ms"],
                               "vertical_lines": len(detection["x_lines"]),
                               "horizontal_lines": len(detection["y_lines"]),
                               "corners": detection["corners_tl_tr_br_bl"],
                               "confidence": detection["confidence"]},
            "line_tracking": {"success": pipeline["success"]},
            "card_generation": pipeline,
        },
        "D_rectified_manual_grid": {
            "grid_detection": previous["after_perspective_location_seed"],
            "line_tracking": {"success": previous["full_existing_pipeline"]["success"]},
            "card_generation": previous["full_existing_pipeline"],
        },
    }
    report = {"automatic_detection": detection,
              "automatic_vs_manual": comparison,
              "methods": methods,
              "existing_algorithm_changed": False}
    (output/"report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2),
                                      encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
