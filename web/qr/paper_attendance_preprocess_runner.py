#!/usr/bin/env python3
"""Memory-bounded browser runner using the frozen tracking/Coons functions."""
from __future__ import annotations

import json
import runpy
import sys
import time
import traceback
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from js import postMessage as _post_message
except ImportError:
    _post_message = None


def notify(stage: str, percent: int, message: str) -> None:
    if _post_message is not None:
        # A Python dict crosses the Pyodide boundary as a PyProxy, which the
        # Worker structured-clone algorithm cannot serialize.  Send plain JSON
        # and let the browser restore a native JavaScript object.
        _post_message(json.dumps({"type": "progress", "stage": stage,
                                  "percent": percent, "message": message},
                                 ensure_ascii=False))


class PreprocessStageError(RuntimeError):
    def __init__(self, stage: str, error: BaseException) -> None:
        super().__init__(str(error))
        self.stage = stage
        self.error = error
        self.traceback = traceback.format_exc()


def validated_points(corners, code="INVALID_GRID_CORNERS"):
    if not isinstance(corners, list) or len(corners) != 4:
        raise ValueError(code)
    points = []
    for point in corners:
        if not isinstance(point, dict):
            raise ValueError(code)
        x, y = float(point.get("x", -1)), float(point.get("y", -1))
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError(code)
        points.append((x, y))
    sign = 0
    twice_area = 0.0
    for index, point in enumerate(points):
        following = points[(index + 1) % 4]
        after = points[(index + 2) % 4]
        cross = ((following[0] - point[0]) * (after[1] - following[1]) -
                 (following[1] - point[1]) * (after[0] - following[0]))
        if abs(cross) < 1e-6 or (sign and (cross > 0) != (sign > 0)):
            raise ValueError(code)
        sign = cross
        twice_area += point[0] * following[1] - following[0] * point[1]
    if abs(twice_area) / 2 < .01:
        raise ValueError(code)
    return points


def points_to_seed(points) -> tuple[float, float, float, float]:
    top_left, top_right, bottom_right, bottom_left = points
    x0 = (top_left[0] + bottom_left[0]) / 2
    x1 = (top_right[0] + bottom_right[0]) / 2
    y0 = (top_left[1] + top_right[1]) / 2
    y1 = (bottom_left[1] + bottom_right[1]) / 2
    if x1 - x0 < .05 or y1 - y0 < .05:
        raise ValueError("INVALID_GRID_CORNERS")
    return x0, y0, x1, y1


def transform_point(coefficients, point):
    a, b, c, d, e, f, g, h = coefficients
    x, y = point
    denominator = g*x + h*y + 1
    if abs(denominator) < 1e-9:
        raise ValueError("INVALID_GRID_CORNERS")
    return ((a*x+b*y+c)/denominator, (d*x+e*y+f)/denominator)


def main() -> None:
    algorithm, image_path, output_path = sys.argv[1:4]
    mode = sys.argv[4] if len(sys.argv) > 4 else "half-fast"
    out = Path(output_path)
    cards_dir = out / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    ns = runpy.run_path(algorithm, run_name="paper_attendance_frozen")
    rectifier_path = sys.argv[5] if len(sys.argv) > 5 else ""
    hint_path = sys.argv[6] if len(sys.argv) > 6 else ""
    hints = json.loads(Path(hint_path).read_text(encoding="utf-8")) if hint_path else {}
    grid_points = validated_points(hints.get("grid_corners"), "INVALID_GRID_CORNERS") if hints.get("grid_corners") else None
    paper_points = validated_points(hints.get("paper_corners"), "INVALID_PAPER_CORNERS") if hints.get("paper_corners") else None
    rows, cols, card_w, card_h, subdiv = (ns[x] for x in
        ("ROWS", "COLS", "CARD_W", "CARD_H", "MESH_SUBDIV"))
    timings: dict[str, int] = {}

    stage_progress = {
        "decode": (8, 11, "画像を読み込んでいます"),
        "paper_rectification": (11, 13, "用紙全体を正面化しています"),
        "auto_grid_detection": (13, 15, "正面化した用紙から20×20格子を探索しています"),
        "grayscale": (15, 16, "濃淡画像を準備しています"),
        "grid_detection": (16, 19, "20×20格子を検出しています"),
        "horizontal_tracking": (17, 42, "横罫線を追跡しています"),
        "vertical_intersections_half": (42, 74, "1/2画像で縦罫線を粗探索し、元画像で交点を確定しています"),
        "vertical_tracking": (74, 82, "元画像で縦罫線を精密追跡しています"),
        "mesh_build": (82, 86, "441交点から補正メッシュを作成しています"),
    }

    def stage(name, function):
        start_percent, end_percent, message = stage_progress.get(name, (5, 85, name))
        notify(name, start_percent, message)
        started = time.perf_counter()
        try:
            value = function()
        except Exception as error:
            raise PreprocessStageError(name, error) from error
        timings[name] = round((time.perf_counter() - started) * 1000)
        notify(name, end_percent, message + "（完了）")
        return value

    source = stage("decode", lambda: Image.open(image_path).convert("RGB"))
    original_size = list(source.size)
    paper_detection = None
    if paper_points is not None:
        if not rectifier_path:
            raise PreprocessStageError("paper_rectification", RuntimeError("PAPER_RECTIFIER_UNAVAILABLE"))
        adapter = runpy.run_path(rectifier_path, run_name="paper_attendance_rectifier")
        source_paper = np.asarray(paper_points, dtype=np.float64) * np.asarray(source.size, dtype=np.float64)
        scale_percent = max(50, min(100, int(hints.get("image_scale_percent", 100))))
        output_size = tuple(max(1, round(value*scale_percent/100)) for value in adapter["OUTPUT_SIZE"])
        destination = np.asarray([[0, 0], [output_size[0]-1, 0], [output_size[0]-1, output_size[1]-1], [0, output_size[1]-1]], dtype=np.float64)
        source_before_rectification = source
        source = stage("paper_rectification", lambda: source_before_rectification.transform(
            output_size, Image.Transform.PERSPECTIVE,
            adapter["projective_coefficients"](destination, source_paper), Image.Resampling.BICUBIC))
        if grid_points is None:
            paper_detection = stage("auto_grid_detection", lambda: adapter["auto_detect"](source))
            manual_seed = (paper_detection["x_lines"][0]/source.width,
                           paper_detection["y_lines"][0]/source.height,
                           paper_detection["x_lines"][-1]/source.width,
                           paper_detection["y_lines"][-1]/source.height)
        else:
            source_grid = np.asarray(grid_points, dtype=np.float64) * np.asarray(source_before_rectification.size, dtype=np.float64)
            forward = adapter["projective_coefficients"](source_paper, destination)
            rectified_grid = [transform_point(forward, point) for point in source_grid]
            manual_seed = points_to_seed([(x/source.width, y/source.height) for x, y in rectified_grid])
        del source_before_rectification, source_paper, destination
    else:
        manual_seed = points_to_seed(grid_points) if grid_points is not None else None
    if manual_seed is not None:
        # detect_grid reads SEED from the runpy namespace. A supplied or
        # automatically detected hint must never fall back to the frozen seed.
        ns["detect_grid"].__globals__["SEED"] = manual_seed
    gray = stage("grayscale", lambda: np.asarray(source.convert("L")))
    x_lines, y_lines, dark = stage("grid_detection", lambda: ns["detect_grid"](gray))
    horizontal = stage("horizontal_tracking", lambda: ns["trace_horizontal_rules"](
        gray, x_lines, y_lines, subdiv))
    point_comparison = None
    if mode in ("half", "half-fast"):
        baseline_points = (stage("vertical_intersections_baseline", lambda:
            ns["vertical_intersections_from_continuous_rules"](gray, x_lines, horizontal))
            if mode == "half" else None)

        def half_resolution_points():
            half_image = source.convert("L").resize(
                (source.width // 2, source.height // 2), Image.Resampling.LANCZOS)
            half_gray = np.asarray(half_image)
            half_horizontal = [[(x/2.0, y/2.0) for x, y in row] for row in horizontal]
            half_x_lines = [int(round(x/2)) for x in x_lines]
            paths = [ns["trace_vertical_rule_continuous"](
                half_gray, half_x_lines[c],
                int(round(half_horizontal[0][c*subdiv][1])),
                int(round(half_horizontal[rows][c*subdiv][1])),
                radius=24, y_step=4) for c in range(cols+1)]
            result = [[(0, 0) for _ in range(cols+1)] for _ in range(rows+1)]
            for c, path in enumerate(paths):
                path_y = np.asarray([p[1] for p in path])
                path_x = np.asarray([p[0] for p in path])
                for r in range(rows+1):
                    y = int(round(horizontal[r][c*subdiv][1]))
                    coarse_x = int(round(2.0 * float(np.interp(y/2.0, path_y, path_x))))
                    # Final coordinates are always fixed against full-resolution ink.
                    x = ns["refine_vertical_intersection"](dark, coarse_x, y, radius=10)
                    result[r][c] = (x, y)
            for r in range(rows+1):
                if any(result[r][c][0] >= result[r][c+1][0] for c in range(cols)):
                    raise RuntimeError("HALF_VERTICAL_LINES_NOT_MONOTONIC")
            return result

        points = stage("vertical_intersections_half", half_resolution_points)
        if baseline_points is not None:
            errors = [abs(points[r][c][0]-baseline_points[r][c][0])
                      for r in range(rows+1) for c in range(cols+1)]
            point_comparison = {"mean_abs_x_px": round(float(np.mean(errors)), 4),
                                "p95_abs_x_px": round(float(np.percentile(errors, 95)), 4),
                                "max_abs_x_px": int(max(errors)),
                                "different_points": sum(1 for value in errors if value)}
    else:
        points = stage("vertical_intersections", lambda:
            ns["vertical_intersections_from_continuous_rules"](gray, x_lines, horizontal))
    horizontal = ns["align_horizontal_x_to_intersections"](horizontal, points, subdiv)

    def make_vertical():
        result = []
        for c in range(cols + 1):
            column = []
            for r in range(rows):
                segment = ns["trace_vertical_segment"](dark, points[r][c], points[r+1][c], subdiv)
                column.extend(segment if r == 0 else segment[1:])
            result.append(column)
        return result
    vertical = stage("vertical_tracking", make_vertical)

    extraction_points = [list(row) for row in points]
    extraction_horizontal = [list(row) for row in horizontal]
    extraction_vertical = [list(column) for column in vertical]
    source_h, source_w = gray.shape
    margin = ns["CHARACTER_SOURCE_MARGIN"]
    extraction_horizontal[0] = [(x, max(0, y-margin)) for x, y in extraction_horizontal[0]]
    extraction_horizontal[-1] = [(x, min(source_h-1, y+margin)) for x, y in extraction_horizontal[-1]]
    for r in range(rows + 1):
        x, y = extraction_horizontal[r][0]; extraction_horizontal[r][0] = (max(0, x-margin), y)
        x, y = extraction_horizontal[r][-1]; extraction_horizontal[r][-1] = (min(source_w-1, x+margin), y)
    extraction_vertical[0] = [(max(0, x-margin), y) for x, y in extraction_vertical[0]]
    extraction_vertical[-1] = [(min(source_w-1, x+margin), y) for x, y in extraction_vertical[-1]]
    for c in range(cols + 1):
        x, y = extraction_vertical[c][0]; extraction_vertical[c][0] = (x, max(0, y-margin))
        x, y = extraction_vertical[c][-1]; extraction_vertical[c][-1] = (x, min(source_h-1, y+margin))
    for r in range(rows + 1):
        for c in range(cols + 1):
            x, y = extraction_points[r][c]
            if c == 0: x = max(0, x-margin)
            if c == cols: x = min(source_w-1, x+margin)
            if r == 0: y = max(0, y-margin)
            if r == rows: y = min(source_h-1, y+margin)
            extraction_points[r][c] = (x, y)
    full_mesh = stage("mesh_build", lambda: ns["build_mesh"](
        dark, x_lines, y_lines, extraction_points, extraction_horizontal, extraction_vertical))

    def quadrant_mesh(qr: int, qc: int):
        ox, oy = qc * 10 * card_w, qr * 10 * card_h
        x2, y2 = ox + 10 * card_w, oy + 10 * card_h
        result = []
        for box, quad in full_mesh:
            if box[0] >= ox and box[2] <= x2 and box[1] >= oy and box[3] <= y2:
                result.append(((box[0]-ox, box[1]-oy, box[2]-ox, box[3]-oy), quad))
        return result

    manifest = []
    quadrant_alignment = []
    warp_ms = cards_ms = 0
    try:
      for qr in range(2):
        for qc in range(2):
            quadrant_number = qr * 2 + qc + 1
            notify("quadrant_warp", 86 + (quadrant_number - 1) * 3,
                   f"補正画像と400カードを生成しています（{quadrant_number}/4）")
            started = time.perf_counter()
            quadrant = source.transform((10*card_w, 10*card_h), Image.Transform.MESH,
                quadrant_mesh(qr, qc), resample=Image.Resampling.BICUBIC)
            warp_ms += round((time.perf_counter()-started)*1000)
            quadrant_alignment.append({"row": qr+1, "column": qc+1,
                "metrics": ns["alignment_metrics"](quadrant)["combined"]})
            quadrant.save(out / f"quadrant-{qr+1}-{qc+1}.jpg", quality=94)
            started = time.perf_counter()
            for lr in range(10):
                for lc in range(10):
                    r, c = qr*10+lr, qc*10+lc
                    card = quadrant.crop((lc*card_w, lr*card_h, (lc+1)*card_w, (lr+1)*card_h))
                    _mask, score, background = ns["ink_mask"](card)
                    status = "candidate" if score >= 900 else "review" if score >= 180 else "blank"
                    number, printed_row = r*cols+c+1, rows-r
                    filename = f"card-{number:03d}.png"
                    card.save(cards_dir / filename)
                    manifest.append({"number": number, "printed_row": printed_row, "column": c+1,
                        "status": status, "ink_score": score, "background_level": round(background,2),
                        "file": f"cards/{filename}"})
            cards_ms += round((time.perf_counter()-started)*1000)
            del quadrant
            notify("quadrant_warp", 86 + quadrant_number * 3,
                   f"補正画像と400カードを生成しています（{quadrant_number}/4 完了）")
    except Exception as error:
        raise PreprocessStageError("card_generation", error) from error
    timings["quadrant_warp"] = warp_ms
    timings["card_generation"] = cards_ms
    manifest.sort(key=lambda x: x["number"])
    counts = {name: sum(1 for x in manifest if x["status"] == name)
              for name in ("candidate", "review", "blank")}
    report = {"source_size": list(source.size), "original_source_size": original_size,
              "paper_rectification": {"applied": paper_points is not None,
                  "paper_corners": hints.get("paper_corners"),
                  "auto_grid_detection": paper_detection},
              "grid": {"rows": rows, "columns": cols,
                  "point_comparison": point_comparison},
              "screening": {"candidate_min": 900, "review_min": 180, "counts": counts},
              "timings_ms": timings, "quadrant_alignment": quadrant_alignment,
              "cards": manifest}
    (out / "manifest.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
    notify("complete", 100, "画像前処理が完了しました")


if __name__ == "__main__":
    try:
        main()
    except PreprocessStageError as error:
        output = Path(sys.argv[3]);output.mkdir(parents=True, exist_ok=True)
        (output / "error.json").write_text(json.dumps({
            "stage": error.stage,
            "code": type(error.error).__name__,
            "message": str(error.error),
            "traceback": error.traceback,
            "detail": error.traceback,
        }, ensure_ascii=False), encoding="utf-8")
    except Exception as error:
        output = Path(sys.argv[3]);output.mkdir(parents=True, exist_ok=True)
        detail = traceback.format_exc()
        (output / "error.json").write_text(json.dumps({
            "stage": "runtime",
            "code": type(error).__name__,
            "message": str(error),
            "traceback": detail,
            "detail": detail,
        }, ensure_ascii=False), encoding="utf-8")
