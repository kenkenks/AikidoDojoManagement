#!/usr/bin/env python3
"""Memory-bounded browser runner using the frozen tracking/Coons functions."""
from __future__ import annotations

import json
import runpy
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

try:
    from js import postMessage as _post_message
except ImportError:
    _post_message = None


def notify(stage: str, percent: int, message: str) -> None:
    if _post_message is not None:
        _post_message({"type": "progress", "stage": stage,
                       "percent": percent, "message": message})


def main() -> None:
    algorithm, image_path, output_path = sys.argv[1:4]
    mode = sys.argv[4] if len(sys.argv) > 4 else "half-fast"
    out = Path(output_path)
    cards_dir = out / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)
    ns = runpy.run_path(algorithm, run_name="paper_attendance_frozen")
    rows, cols, card_w, card_h, subdiv = (ns[x] for x in
        ("ROWS", "COLS", "CARD_W", "CARD_H", "MESH_SUBDIV"))
    timings: dict[str, int] = {}

    stage_progress = {
        "decode": (8, 11, "画像を読み込んでいます"),
        "grayscale": (11, 13, "濃淡画像を準備しています"),
        "grid_detection": (13, 17, "20×20格子を検出しています"),
        "horizontal_tracking": (17, 42, "横罫線を追跡しています"),
        "vertical_intersections_half": (42, 74, "1/2画像で縦罫線を粗探索し、元画像で交点を確定しています"),
        "vertical_tracking": (74, 82, "元画像で縦罫線を精密追跡しています"),
        "mesh_build": (82, 86, "441交点から補正メッシュを作成しています"),
    }

    def stage(name, function):
        start_percent, end_percent, message = stage_progress.get(name, (5, 85, name))
        notify(name, start_percent, message)
        started = time.perf_counter()
        value = function()
        timings[name] = round((time.perf_counter() - started) * 1000)
        notify(name, end_percent, message + "（完了）")
        return value

    source = stage("decode", lambda: Image.open(image_path).convert("RGB"))
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
    timings["quadrant_warp"] = warp_ms
    timings["card_generation"] = cards_ms
    manifest.sort(key=lambda x: x["number"])
    counts = {name: sum(1 for x in manifest if x["status"] == name)
              for name in ("candidate", "review", "blank")}
    report = {"source_size": list(source.size), "grid": {"rows": rows, "columns": cols,
                  "point_comparison": point_comparison},
              "screening": {"candidate_min": 900, "review_min": 180, "counts": counts},
              "timings_ms": timings, "quadrant_alignment": quadrant_alignment,
              "cards": manifest}
    (out / "manifest.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")
    notify("complete", 100, "画像前処理が完了しました")


if __name__ == "__main__":
    main()
