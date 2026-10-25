#!/usr/bin/env python3
"""Independent whole-paper perspective PoC for the paper attendance sheet.

This script does not change the frozen preprocessing algorithm.  It rectifies
the photographed paper first, then invokes the existing grid detector and, if
possible, the existing full 400-card pipeline.
"""
from __future__ import annotations

import argparse
import json
import math
import runpy
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


# Measured on the original 2880 x 3840 iPhone photograph, TL/TR/BR/BL.
PAPER_CORNERS = np.array([
    [370.0, 1067.0],
    [2520.0, 1105.0],
    [2745.0, 2638.0],
    [99.0, 2598.0],
], dtype=np.float64)

# Only used to distinguish grid-location mismatch from remaining perspective
# distortion.  These are the visible 20x20 grid outer corners in the same
# original photograph, not a replacement for automatic grid detection.
GRID_CORNERS = np.array([
    [434.2, 1340.9],
    [2013.8, 1368.1],
    [2090.2, 2490.1],
    [254.1, 2461.9],
], dtype=np.float64)

OUTPUT_SIZE = (2800, 1980)  # A-series landscape aspect, large enough for rules.


def projective_coefficients(output_points: np.ndarray,
                            input_points: np.ndarray) -> list[float]:
    """Return PIL PERSPECTIVE coefficients mapping output to input."""
    matrix: list[list[float]] = []
    values: list[float] = []
    for (x, y), (u, v) in zip(output_points, input_points):
        matrix.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        values.append(u)
        matrix.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        values.append(v)
    result = np.linalg.solve(np.asarray(matrix), np.asarray(values))
    return result.tolist()


def transform_points(points: np.ndarray, source: np.ndarray,
                     destination: np.ndarray) -> np.ndarray:
    """Apply the source-to-destination homography to points."""
    coeff = projective_coefficients(source, destination)
    a, b, c, d, e, f, g, h = coeff
    transformed = []
    for x, y in points:
        denominator = g * x + h * y + 1
        transformed.append(((a*x + b*y + c) / denominator,
                            (d*x + e*y + f) / denominator))
    return np.asarray(transformed)


def draw_quad(image: Image.Image, points: np.ndarray, color: str,
              label: str) -> Image.Image:
    result = image.copy()
    draw = ImageDraw.Draw(result)
    xy = [tuple(map(float, point)) for point in points]
    draw.line(xy + [xy[0]], fill=color, width=12)
    for index, point in enumerate(xy):
        x, y = point
        draw.ellipse((x-18, y-18, x+18, y+18), fill="white", outline=color, width=7)
        draw.text((x+24, y-24), f"{label}{index+1}", fill=color)
    return result


def draw_grid_lines(image: Image.Image, x_lines: list[int],
                    y_lines: list[int]) -> Image.Image:
    result = image.copy()
    draw = ImageDraw.Draw(result)
    for x in x_lines:
        draw.line((x, 0, x, image.height-1), fill=(255, 45, 45), width=4)
    for y in y_lines:
        draw.line((0, y, image.width-1, y), fill=(35, 105, 255), width=4)
    return result


def try_detect(namespace: dict, image: Image.Image,
               seed: tuple[float, float, float, float] | None,
               output: Path) -> dict:
    detector = namespace["detect_grid"]
    if seed is not None:
        detector.__globals__["SEED"] = seed
    started = time.perf_counter()
    try:
        x_lines, y_lines, _ = detector(np.asarray(image.convert("L")))
        draw_grid_lines(image, x_lines, y_lines).save(output, quality=92)
        return {
            "success": True,
            "elapsed_ms": round((time.perf_counter()-started)*1000),
            "vertical_lines": len(x_lines),
            "horizontal_lines": len(y_lines),
            "x_gap_median": float(np.median(np.diff(x_lines))),
            "y_gap_median": float(np.median(np.diff(y_lines))),
            "overlay": output.name,
        }
    except Exception as error:
        return {
            "success": False,
            "elapsed_ms": round((time.perf_counter()-started)*1000),
            "error_type": type(error).__name__,
            "error": str(error),
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("output")
    parser.add_argument("--algorithm", required=True)
    args = parser.parse_args()
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)

    source = Image.open(args.image).convert("RGB")
    if source.size != (2880, 3840):
        raise RuntimeError(f"UNEXPECTED_SOURCE_SIZE:{source.size}")
    draw_quad(draw_quad(source, PAPER_CORNERS, "#ff2525", "P"),
              GRID_CORNERS, "#1677ff", "G").save(output / "01-source-corners.jpg", quality=92)

    width, height = OUTPUT_SIZE
    destination = np.array([[0, 0], [width-1, 0], [width-1, height-1],
                            [0, height-1]], dtype=np.float64)
    inverse = projective_coefficients(destination, PAPER_CORNERS)
    rectified = source.transform(OUTPUT_SIZE, Image.Transform.PERSPECTIVE,
                                 inverse, Image.Resampling.BICUBIC)
    rectified.save(output / "02-paper-rectified.jpg", quality=94)

    transformed_grid = transform_points(GRID_CORNERS, PAPER_CORNERS, destination)
    draw_quad(rectified, transformed_grid, "#1677ff", "G").save(
        output / "03-rectified-grid-location.jpg", quality=92)
    gx0 = float((transformed_grid[0, 0] + transformed_grid[3, 0]) / (2*width))
    gx1 = float((transformed_grid[1, 0] + transformed_grid[2, 0]) / (2*width))
    gy0 = float((transformed_grid[0, 1] + transformed_grid[1, 1]) / (2*height))
    gy1 = float((transformed_grid[3, 1] + transformed_grid[2, 1]) / (2*height))
    location_seed = (gx0, gy0, gx1, gy1)

    original_ns = runpy.run_path(args.algorithm, run_name="paper_poc_original")
    fixed_seed = tuple(original_ns["SEED"])
    before = try_detect(original_ns, source, fixed_seed,
                        output / "04-before-fixed-seed-grid.jpg")

    fixed_ns = runpy.run_path(args.algorithm, run_name="paper_poc_fixed")
    after_fixed = try_detect(fixed_ns, rectified, fixed_seed,
                             output / "05-after-fixed-seed-grid.jpg")

    located_ns = runpy.run_path(args.algorithm, run_name="paper_poc_located")
    after_located = try_detect(located_ns, rectified, location_seed,
                               output / "06-after-location-seed-grid.jpg")

    pipeline = {"attempted": False, "success": False}
    if after_located["success"]:
        pipeline["attempted"] = True
        pipeline_output = output / "full-pipeline"
        located_ns["detect_grid"].__globals__["SEED"] = location_seed
        previous_argv = sys.argv
        started = time.perf_counter()
        try:
            sys.argv = [args.algorithm, str(output / "02-paper-rectified.jpg"),
                        str(pipeline_output)]
            located_ns["main"]()
            manifest = json.loads((pipeline_output / "manifest.json").read_text(encoding="utf-8"))
            pipeline.update({
                "success": True,
                "elapsed_ms": round((time.perf_counter()-started)*1000),
                "cards": len(manifest["cards"]),
                "counts": manifest["screening"]["counts"],
                "output": str(pipeline_output),
            })
        except Exception as error:
            pipeline.update({
                "success": False,
                "elapsed_ms": round((time.perf_counter()-started)*1000),
                "error_type": type(error).__name__,
                "error": str(error),
            })
        finally:
            sys.argv = previous_argv

    report = {
        "source": str(Path(args.image)),
        "source_size": list(source.size),
        "paper_corners_tl_tr_br_bl": PAPER_CORNERS.tolist(),
        "grid_corners_for_location_diagnosis": GRID_CORNERS.tolist(),
        "rectified_size": list(OUTPUT_SIZE),
        "fixed_seed": list(fixed_seed),
        "rectified_grid_location_seed": list(location_seed),
        "before_perspective_fixed_seed": before,
        "after_perspective_fixed_seed": after_fixed,
        "after_perspective_location_seed": after_located,
        "full_existing_pipeline": pipeline,
        "algorithm_changed": False,
    }
    (output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
