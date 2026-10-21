#!/usr/bin/env python3
"""Independent paper-attendance image preprocessing prototype.

This script writes image artifacts only. It never calls an API or Firestore.
It uses the existing review-screen corners as a coarse search seed, then snaps
all 21 x/y grid boundaries to image evidence before extracting 400 cards.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

ROWS = COLS = 20
CARD_W, CARD_H = 320, 180
MESH_SUBDIV = 8
# Character strokes may cross any of the four printed outer rules.  The normal
# 20x20 image remains rule-to-rule; only the separate extraction image maps a
# narrow source margin into its outermost cards.
CHARACTER_SOURCE_MARGIN = 28
# Search seeds inherited from paper_attendance_review.js, refined below.
SEED = (270 / 4284, 1622 / 5712, 3255 / 4284, 3754 / 5712)


def smooth(values: np.ndarray, radius: int = 2) -> np.ndarray:
    kernel = np.ones(radius * 2 + 1, dtype=np.float64) / (radius * 2 + 1)
    return np.convolve(values.astype(np.float64), kernel, mode="same")


def snap_regular_lines(score: np.ndarray, start: float, end: float, count: int,
                       radius: int) -> list[int]:
    """Snap regularly-spaced seed positions to local projection maxima."""
    result: list[int] = []
    for expected in np.linspace(start, end, count):
        lo = max(0, int(round(expected)) - radius)
        hi = min(len(score), int(round(expected)) + radius + 1)
        position = lo + int(np.argmax(score[lo:hi]))
        if result and position <= result[-1]:
            raise RuntimeError("GRID_LINES_NOT_MONOTONIC")
        result.append(position)
    gaps = np.diff(result)
    median = float(np.median(gaps))
    if median <= 0 or np.max(np.abs(gaps - median)) > median * 0.35:
        raise RuntimeError("GRID_LINE_SPACING_UNSTABLE")
    return result


def detect_grid(gray: np.ndarray) -> tuple[list[int], list[int], np.ndarray]:
    height, width = gray.shape
    x0, y0, x1, y1 = (SEED[0] * width, SEED[1] * height,
                       SEED[2] * width, SEED[3] * height)
    # Dark pixels form long projection peaks at printed grid lines. The broad
    # search band tolerates camera position changes while excluding page text.
    dark = gray < 165
    y_band = dark[max(0, int(y0 - height * .035)):min(height, int(y1 + height * .035)), :]
    x_band = dark[:, max(0, int(x0 - width * .035)):min(width, int(x1 + width * .035))]
    vertical = smooth(y_band.sum(axis=0), 2)
    horizontal = smooth(x_band.sum(axis=1), 2)
    # Keep the local window well below half a cell, otherwise handwriting in
    # the first columns can pull two adjacent seeds onto the same stroke.
    x_lines = snap_regular_lines(vertical, x0, x1, COLS + 1, max(12, int(width * .006)))
    y_lines = snap_regular_lines(horizontal, y0, y1, ROWS + 1, max(12, int(height * .0062)))
    return x_lines, y_lines, dark


def local_intersection(dark: np.ndarray, x: int, y: int, radius: int = 6) -> tuple[int, int]:
    """Refine an intersection while requiring continuous line evidence.

    A tiny cross alone is easily attracted by handwriting.  Separate long
    vertical/horizontal support windows keep the point on the printed mesh.
    """
    h, w = dark.shape
    candidates_x = range(max(1, x - radius), min(w - 1, x + radius + 1))
    candidates_y = range(max(1, y - radius), min(h - 1, y + radius + 1))
    xx = max(candidates_x, key=lambda value: int(dark[max(0, y-24):min(h, y+25), value].sum()))
    yy = max(candidates_y, key=lambda value: int(dark[value, max(0, x-32):min(w, x+33)].sum()))
    return xx, yy


def refine_vertical_intersection(dark: np.ndarray, expected_x: int, y: int,
                                 radius: int = 48) -> int:
    """Find the vertical rule at a horizontal-grid crossing.

    Pixels immediately on the horizontal rule are excluded.  This lets a
    curved vertical rule move far from its global projection seed without the
    horizontal line making every x position look equally strong.
    """
    h, w = dark.shape
    lo, hi = max(1, expected_x-radius), min(w-1, expected_x+radius+1)
    best_x, best_score = expected_x, -1e9
    for xx in range(lo, hi):
        support = (int(dark[max(0, y-34):max(0, y-5), xx].sum()) +
                   int(dark[min(h, y+5):min(h, y+35), xx].sum()))
        delta = xx - expected_x
        score = support - 0.012 * delta * delta
        if score > best_score:
            best_x, best_score = xx, score
    return best_x


def trace_vertical_rule_continuous(gray: np.ndarray, expected_x: int,
                                   y_start: int, y_end: int,
                                   radius: int = 48, y_step: int = 4
                                   ) -> list[tuple[float, float]]:
    """Trace one complete vertical rule before choosing its intersections.

    A local intersection can repeatedly lock onto handwritten ``1`` strokes.
    This full-height path instead requires narrow vertical evidence to remain
    continuous across cell interiors.  A small slope state permits gradual
    paper curvature without allowing jumps to handwriting, folds or shadows.
    """
    h, w = gray.shape
    lo = max(2, expected_x-radius)
    hi = min(w-3, expected_x+radius)
    xs = np.arange(lo, hi+1, dtype=np.int32)
    ys = list(range(max(2, y_start), min(h-3, y_end)+1, y_step))
    if ys[-1] != min(h-3, y_end):
        ys.append(min(h-3, y_end))
    slopes = np.arange(-2, 3, dtype=np.int32)
    darkness = 255.0-gray.astype(np.float64)
    evidence = np.zeros((len(ys), len(xs)), dtype=np.float64)
    for k, yy in enumerate(ys):
        ya, yb = max(0, yy-10), min(h, yy+11)
        for j, xx in enumerate(xs):
            center = float(darkness[ya:yb, xx-1:xx+2].mean())
            left = float(darkness[ya:yb, xx-10:xx-7].mean())
            right = float(darkness[ya:yb, xx+8:xx+11].mean())
            # Narrow center-minus-surround evidence rejects broad shadows.
            evidence[k, j] = center - 0.5*(left+right)

    inf = 1e15
    costs = np.full((len(xs), len(slopes)), inf, dtype=np.float64)
    back = np.full((len(ys), len(xs), len(slopes)), -1, dtype=np.int8)
    anchor = 0.0015*(xs-expected_x)**2
    costs[:, :] = -1.8*evidence[0, :, None] + anchor[:, None]
    for k in range(1, len(ys)):
        nxt = np.full_like(costs, inf)
        for j in range(len(xs)):
            for si, slope in enumerate(slopes):
                prev_j = j-int(slope)
                if prev_j < 0 or prev_j >= len(xs):
                    continue
                candidates = costs[prev_j, :] + 0.65*(slopes-slope)**2
                psi = int(np.argmin(candidates))
                nxt[j, si] = (candidates[psi] - 1.8*evidence[k, j] +
                              anchor[j] + 0.035*slope*slope)
                back[k, j, si] = psi
        costs = nxt

    j, si = np.unravel_index(int(np.argmin(costs)), costs.shape)
    chosen = [0]*len(ys)
    chosen[-1] = j
    for k in range(len(ys)-1, 0, -1):
        slope = int(slopes[si])
        prev_j = j-slope
        si = int(back[k, j, si])
        j = prev_j
        chosen[k-1] = j
    return [(float(xs[j]), float(y)) for y, j in zip(ys, chosen)]


def vertical_intersections_from_continuous_rules(
        gray: np.ndarray, x_lines: list[int],
        horizontal: list[list[tuple[float, float]]]
        ) -> list[list[tuple[int, int]]]:
    """Sample 21 continuous vertical paths at the 21 horizontal rules."""
    paths = [trace_vertical_rule_continuous(
                gray, x_lines[c],
                int(round(horizontal[0][c*MESH_SUBDIV][1])),
                int(round(horizontal[ROWS][c*MESH_SUBDIV][1])))
             for c in range(COLS+1)]
    result = [[(0, 0) for _ in range(COLS+1)] for _ in range(ROWS+1)]
    for c, path in enumerate(paths):
        path_y = np.asarray([p[1] for p in path])
        path_x = np.asarray([p[0] for p in path])
        for r in range(ROWS+1):
            y = int(round(horizontal[r][c*MESH_SUBDIV][1]))
            x = int(round(float(np.interp(y, path_y, path_x))))
            result[r][c] = (x, y)
    # The search corridors are narrower than half a cell; assert ordering so
    # no column identity can be exchanged by the continuity refinement.
    for r in range(ROWS+1):
        if any(result[r][c][0] >= result[r][c+1][0] for c in range(COLS)):
            raise RuntimeError("CONTINUOUS_VERTICAL_LINES_NOT_MONOTONIC")
    return result


def trace_vertical_segment(dark: np.ndarray, p0: tuple[int, int], p1: tuple[int, int],
                           count: int, radius: int = 34) -> list[tuple[float, float]]:
    """Trace one vertical printed rule with fixed, evidence-based endpoints.

    Dynamic programming rewards vertical ink and penalizes changes in slope.
    The endpoints are the intersections refined above, so the path cannot jump
    to a fold or shadow that does not connect two horizontal grid crossings.
    """
    h, w = dark.shape
    offsets = np.arange(-radius, radius + 1)
    zero = radius
    costs = np.full((count + 1, len(offsets)), 1e12, dtype=np.float64)
    back = np.zeros((count + 1, len(offsets)), dtype=np.int16)
    costs[0, zero] = 0.0
    expected = []
    evidence = []
    for k in range(count + 1):
        t = k / count
        x = (1-t) * p0[0] + t * p1[0]
        y = (1-t) * p0[1] + t * p1[1]
        expected.append((x, y))
        yy = int(round(y))
        values = []
        for delta in offsets:
            xx = max(0, min(w-1, int(round(x)) + int(delta)))
            values.append(float(dark[max(0, yy-16):min(h, yy+17), xx].sum()))
        evidence.append(np.asarray(values))
    for k in range(1, count + 1):
        allowed = [zero] if k == count else range(len(offsets))
        for j in allowed:
            delta = offsets[j]
            transition = costs[k-1] + 0.28 * (offsets-delta) ** 2
            previous = int(np.argmin(transition))
            costs[k, j] = transition[previous] - 1.35 * evidence[k][j] + 0.008 * delta ** 2
            back[k, j] = previous
    chosen = [zero] * (count + 1)
    for k in range(count, 0, -1):
        chosen[k-1] = int(back[k, chosen[k]])
    return [(x + float(offsets[index]), y) for (x, y), index in zip(expected, chosen)]


def track_horizontal(dark: np.ndarray, x: float, y: float, radius: int = 9) -> float:
    """Locate a horizontal rule near (x, y), using directional support."""
    h, w = dark.shape
    xx = int(round(x))
    candidates = range(max(1, int(round(y)) - radius), min(h - 1, int(round(y)) + radius + 1))
    expected = int(round(y))
    return float(max(candidates, key=lambda yy:
                     float(dark[yy, max(0, xx-34):min(w, xx+35)].sum())
                     - 0.12 * (yy - expected) ** 2))


def trace_horizontal_rule(gray: np.ndarray, x_lines: list[int], y_lines: list[int],
                          row: int, count: int, radius: int = 46) -> list[tuple[float, float]]:
    """Trace one horizontal rule without trusting local_intersection y values.

    The path is solved from left to right with dynamic programming.  Ink
    evidence is directional, slope changes are penalized, and the search band
    is bounded by the midpoints to adjacent horizontal rules.  This lets the
    lower bowed rules move tens of pixels away from their projection seed while
    preventing a jump to handwriting, a fold, or a neighbouring rule.
    """
    h, w = gray.shape
    n = count
    xs: list[float] = []
    for k in range(COLS * n + 1):
        c, s = min(k // n, COLS - 1), k % n
        if k == COLS * n:
            c, s = COLS - 1, n
        u = s / n
        xs.append((1-u) * x_lines[c] + u * x_lines[c+1])

    expected = float(y_lines[row])
    lower = 1 if row == 0 else int(round((y_lines[row-1] + y_lines[row]) / 2)) + 2
    upper = h - 2 if row == ROWS else int(round((y_lines[row] + y_lines[row+1]) / 2)) - 2
    lo = max(lower, int(round(expected)) - radius)
    hi = min(upper, int(round(expected)) + radius)
    ys = np.arange(lo, hi + 1, dtype=np.int32)
    slopes = np.arange(-2, 3, dtype=np.int32)

    evidence = np.zeros((len(xs), len(ys)), dtype=np.float64)
    for k, xf in enumerate(xs):
        xx = int(round(xf))
        xa, xb = max(0, xx-22), min(w, xx+23)
        for j, yy in enumerate(ys):
            center = 255.0 - float(gray[yy, xa:xb].mean())
            surrounding_rows = [max(0, yy-delta) for delta in (15, 10, 6)] + [
                min(h-1, yy+delta) for delta in (6, 10, 15)]
            surround = float(np.mean([255.0-float(gray[sy, xa:xb].mean())
                                      for sy in surrounding_rows]))
            # Long horizontal support distinguishes a rule from a local stroke,
            # while center-minus-surround rejects broad shadows.
            long_a, long_b = max(0, xx-42), min(w, xx+43)
            long_center = 255.0 - float(gray[yy, long_a:long_b].mean())
            long_surround = 0.5 * (
                255.0-float(gray[max(0, yy-10), long_a:long_b].mean()) +
                255.0-float(gray[min(h-1, yy+10), long_a:long_b].mean()))
            evidence[k, j] = 2.4 * (center-surround) + 0.8 * (long_center-long_surround)

    inf = 1e15
    costs = np.full((len(ys), len(slopes)), inf, dtype=np.float64)
    back = np.full((len(xs), len(ys), len(slopes)), -1, dtype=np.int8)
    anchor = 0.006 * (ys - expected) ** 2
    for j in range(len(ys)):
        costs[j, :] = -evidence[0, j] + anchor[j]

    for k in range(1, len(xs)):
        nxt = np.full_like(costs, inf)
        for j, yy in enumerate(ys):
            for si, slope in enumerate(slopes):
                prev_j = j - int(slope)
                if prev_j < 0 or prev_j >= len(ys):
                    continue
                candidates = (costs[prev_j, :] + 0.72 * (slopes-slope) ** 2 +
                              0.035 * slope ** 2)
                psi = int(np.argmin(candidates))
                nxt[j, si] = (candidates[psi] - evidence[k, j] +
                              0.006 * (float(yy)-expected) ** 2)
                back[k, j, si] = psi
        costs = nxt

    j, si = np.unravel_index(int(np.argmin(costs)), costs.shape)
    chosen = [0] * len(xs)
    chosen[-1] = j
    for k in range(len(xs)-1, 0, -1):
        slope = int(slopes[si])
        prev_j = j - slope
        si = int(back[k, j, si])
        j = prev_j
        chosen[k-1] = j
    return [(x, float(ys[j])) for x, j in zip(xs, chosen)]


def trace_horizontal_rules(gray: np.ndarray, x_lines: list[int], y_lines: list[int],
                           count: int) -> list[list[tuple[float, float]]]:
    """Trace all 21 horizontal rules independently inside ordered corridors."""
    return [trace_horizontal_rule(gray, x_lines, y_lines, row, count)
            for row in range(ROWS + 1)]


def align_horizontal_x_to_intersections(
        horizontal: list[list[tuple[float, float]]],
        points: list[list[tuple[int, int]]], count: int
        ) -> list[list[tuple[float, float]]]:
    """Make horizontal and vertical mesh boundaries share identical corners.

    Horizontal-rule tracking determines Y only.  Its original X samples are
    based on global projection seeds, while vertical tracking refines the true
    X at every intersection.  Interpolate those refined intersection X values
    across each cell so a Coons patch cannot discard the vertical result at
    its top and bottom edges.
    """
    aligned: list[list[tuple[float, float]]] = []
    for r, row in enumerate(horizontal):
        result: list[tuple[float, float]] = []
        for k, (_old_x, y) in enumerate(row):
            c, s = min(k // count, COLS - 1), k % count
            if k == COLS * count:
                c, s = COLS - 1, count
            u = s / count
            x = (1-u) * points[r][c][0] + u * points[r][c+1][0]
            result.append((x, y))
        aligned.append(result)
    return aligned


def track_vertical(dark: np.ndarray, x: float, y: float, radius: int = 9) -> float:
    """Locate a vertical rule near (x, y), using directional support."""
    h, w = dark.shape
    yy = int(round(y))
    candidates = range(max(1, int(round(x)) - radius), min(w - 1, int(round(x)) + radius + 1))
    expected = int(round(x))
    return float(max(candidates, key=lambda xx:
                     float(dark[max(0, yy-26):min(h, yy+27), xx].sum())
                     - 0.12 * (xx - expected) ** 2))


def build_mesh(dark: np.ndarray, x_lines: list[int], y_lines: list[int],
               points: list[list[tuple[int, int]]],
               horizontal: list[list[tuple[float, float]]] | None = None,
               vertical: list[list[tuple[float, float]]] | None = None
               ) -> list[tuple[tuple[int, int, int, int], tuple[float, ...]]]:
    """Map line samples to an ideal grid with per-cell Coons patches."""
    n = MESH_SUBDIV
    if horizontal is None:
        raise ValueError("HORIZONTAL_RULE_PATHS_REQUIRED")

    if vertical is None:
        vertical = []
        for c in range(COLS + 1):
            col: list[tuple[float, float]] = []
            for r in range(ROWS):
                p0, p1 = points[r][c], points[r + 1][c]
                segment = trace_vertical_segment(dark, p0, p1, n)
                col.extend(segment if r == 0 else segment[1:])
            vertical.append(col)

    def coons(r: int, c: int, su: int, sv: int) -> tuple[float, float]:
        u, v = su / n, sv / n
        top = horizontal[r][c*n + su]
        bottom = horizontal[r+1][c*n + su]
        left = vertical[c][r*n + sv]
        right = vertical[c+1][r*n + sv]
        p00, p10, p11, p01 = points[r][c], points[r][c+1], points[r+1][c+1], points[r+1][c]
        boundary_x = (1-u)*left[0] + u*right[0] + (1-v)*top[0] + v*bottom[0]
        boundary_y = (1-u)*left[1] + u*right[1] + (1-v)*top[1] + v*bottom[1]
        bilinear_x = ((1-u)*(1-v)*p00[0] + u*(1-v)*p10[0] + u*v*p11[0] + (1-u)*v*p01[0])
        bilinear_y = ((1-u)*(1-v)*p00[1] + u*(1-v)*p10[1] + u*v*p11[1] + (1-u)*v*p01[1])
        return boundary_x - bilinear_x, boundary_y - bilinear_y

    mesh = []
    for r in range(ROWS):
        for c in range(COLS):
            for sv in range(n):
                for su in range(n):
                    x0 = c*CARD_W + round(su*CARD_W/n)
                    x1 = c*CARD_W + round((su+1)*CARD_W/n)
                    y0 = r*CARD_H + round(sv*CARD_H/n)
                    y1 = r*CARD_H + round((sv+1)*CARD_H/n)
                    tl = coons(r, c, su, sv)
                    tr = coons(r, c, su+1, sv)
                    br = coons(r, c, su+1, sv+1)
                    bl = coons(r, c, su, sv+1)
                    quad = (tl[0], tl[1], bl[0], bl[1], br[0], br[1], tr[0], tr[1])
                    mesh.append(((x0, y0, x1, y1), quad))
    return mesh


def alignment_metrics(image: Image.Image) -> dict:
    """Measure local dark-rule displacement from the ideal output lattice."""
    gray = np.asarray(image.convert("L"))
    dark = gray < 150
    h, w = dark.shape
    vertical, horizontal = [], []
    search_radius = CARD_W // 2 - 8
    for x0 in range(0, w + 1, CARD_W):
        x0 = min(x0, w - 1)
        previous_offset = 0
        for y in range(CARD_H // 2, h, CARD_H):
            lo, hi = max(0, x0-search_radius), min(w, x0+search_radius+1)
            scores = dark[max(0, y-28):min(h, y+29), lo:hi].sum(axis=0).astype(float)
            offsets = np.arange(lo, hi) - x0
            # Search the complete half-cell width. Continuity, rather than a
            # narrow search window, prevents folds and handwriting from being
            # mistaken for the connected printed rule.
            objective = scores - 0.12 * (offsets-previous_offset) ** 2 - 0.001 * offsets ** 2
            found_offset = int(offsets[int(np.argmax(objective))])
            vertical.append(abs(found_offset))
            previous_offset = found_offset
    for y0 in range(0, h + 1, CARD_H):
        y0 = min(y0, h - 1)
        for x in range(CARD_W // 2, w, CARD_W):
            lo, hi = max(0, y0-15), min(h, y0+16)
            scores = dark[lo:hi, max(0, x-38):min(w, x+39)].sum(axis=1).astype(float)
            offsets = np.arange(lo, hi) - y0
            found = lo + int(np.argmax(scores - 0.35 * offsets ** 2))
            horizontal.append(abs(found - y0))

    def summary(values: list[int]) -> dict:
        return {"samples": len(values), "mean_abs_px": round(float(np.mean(values)), 3),
                "p95_abs_px": round(float(np.percentile(values, 95)), 3),
                "max_abs_px": int(np.max(values))}
    combined = vertical + horizontal
    return {"vertical": summary(vertical), "horizontal": summary(horizontal),
            "combined": summary(combined),
            "vertical_search_radius_px": search_radius,
            "horizontal_search_radius_px": 15}


def ink_mask(card: Image.Image) -> tuple[Image.Image, int, float]:
    """Conservative difference candidate mask; printed content is retained."""
    gray = np.asarray(card.convert("L"), dtype=np.int16)
    # Ignore a generous border so grid lines do not dominate the score.
    inner = gray[18:-18, 24:-24]
    background = float(np.percentile(inner, 78))
    mask_inner = inner < min(160, background - 32)
    # Remove isolated one-pixel noise but keep thin handwriting.
    neighbors = (mask_inner[:-2, 1:-1] + mask_inner[2:, 1:-1] +
                 mask_inner[1:-1, :-2] + mask_inner[1:-1, 2:])
    clean = np.zeros_like(mask_inner)
    clean[1:-1, 1:-1] = mask_inner[1:-1, 1:-1] & (neighbors >= 1)
    mask = np.zeros_like(gray, dtype=np.uint8)
    mask[18:-18, 24:-24] = clean.astype(np.uint8) * 255
    return Image.fromarray(mask, "L"), int(clean.sum()), background


def label_card(card: Image.Image, number: int, printed_row: int, column: int,
               status: str, score: int) -> Image.Image:
    top = 34
    canvas = Image.new("RGB", (CARD_W, CARD_H + top), "white")
    canvas.paste(card.convert("RGB"), (0, top))
    draw = ImageDraw.Draw(canvas)
    color = {"candidate": "#bd1e1e", "review": "#b86b00", "blank": "#555555"}[status]
    draw.rectangle((0, 0, CARD_W - 1, top - 1), fill="#f3f5f7", outline=color, width=2)
    draw.text((7, 8), f"#{number:03d}  row={printed_row:02d} col={column:02d}  {status}  ink={score}",
              fill=color, font=ImageFont.load_default())
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("image")
    parser.add_argument("output")
    args = parser.parse_args()
    source_path, out = Path(args.image), Path(args.output)
    cards_dir = out / "cards"
    cards_dir.mkdir(parents=True, exist_ok=True)

    source = Image.open(source_path).convert("RGB")
    gray = np.asarray(source.convert("L"))
    x_lines, y_lines, dark = detect_grid(gray)
    horizontal = trace_horizontal_rules(gray, x_lines, y_lines, MESH_SUBDIV)
    # Horizontal y coordinates come from independently traced continuous
    # paths, not local_intersection().  Vertical x refinement remains bounded
    # to each expected column and is evaluated at the traced crossing.
    points = vertical_intersections_from_continuous_rules(gray, x_lines, horizontal)
    horizontal = align_horizontal_x_to_intersections(horizontal, points, MESH_SUBDIV)

    overlay = source.copy()
    draw = ImageDraw.Draw(overlay)
    for row in points:
        draw.line(row, fill=(255, 40, 40), width=7)
    for col in range(COLS + 1):
        draw.line([points[row][col] for row in range(ROWS + 1)], fill=(40, 120, 255), width=7)
    overlay.save(out / "01-grid-detection.jpg", quality=92)

    vertical = None
    mesh = build_mesh(dark, x_lines, y_lines, points, horizontal, vertical)
    normalized = source.transform((COLS * CARD_W, ROWS * CARD_H), Image.Transform.MESH,
                                  mesh, resample=Image.Resampling.BICUBIC)

    # Build a second, character-extraction-only warp.  The central 20x20 grid
    # definition is untouched; only its four source boundaries are extended.
    vertical = []
    for c in range(COLS + 1):
        col: list[tuple[float, float]] = []
        for r in range(ROWS):
            segment = trace_vertical_segment(dark, points[r][c], points[r+1][c], MESH_SUBDIV)
            col.extend(segment if r == 0 else segment[1:])
        vertical.append(col)
    extraction_points = [list(row) for row in points]
    extraction_horizontal = [list(row) for row in horizontal]
    extraction_vertical = [list(col) for col in vertical]
    source_h, source_w = gray.shape
    margin = CHARACTER_SOURCE_MARGIN
    extraction_horizontal[0] = [(x, max(0, y-margin)) for x, y in extraction_horizontal[0]]
    extraction_horizontal[-1] = [(x, min(source_h-1, y+margin))
                                  for x, y in extraction_horizontal[-1]]
    for r in range(ROWS + 1):
        x, y = extraction_horizontal[r][0]
        extraction_horizontal[r][0] = (max(0, x-margin), y)
        x, y = extraction_horizontal[r][-1]
        extraction_horizontal[r][-1] = (min(source_w-1, x+margin), y)
    extraction_vertical[0] = [(max(0, x-margin), y) for x, y in extraction_vertical[0]]
    extraction_vertical[-1] = [(min(source_w-1, x+margin), y)
                               for x, y in extraction_vertical[-1]]
    for c in range(COLS + 1):
        x, y = extraction_vertical[c][0]
        extraction_vertical[c][0] = (x, max(0, y-margin))
        x, y = extraction_vertical[c][-1]
        extraction_vertical[c][-1] = (x, min(source_h-1, y+margin))
    for r in range(ROWS + 1):
        for c in range(COLS + 1):
            x, y = extraction_points[r][c]
            if c == 0: x = max(0, x-margin)
            if c == COLS: x = min(source_w-1, x+margin)
            if r == 0: y = max(0, y-margin)
            if r == ROWS: y = min(source_h-1, y+margin)
            extraction_points[r][c] = (x, y)
    extraction_mesh = build_mesh(dark, x_lines, y_lines, extraction_points,
                                 extraction_horizontal, extraction_vertical)
    character_normalized = source.transform(
        (COLS * CARD_W, ROWS * CARD_H), Image.Transform.MESH, extraction_mesh,
        resample=Image.Resampling.BICUBIC)
    template = Image.new("RGB", normalized.size, "white")
    diff_sheet = Image.new("L", normalized.size, 0)
    manifest = []
    raw_cards = []
    for r in range(ROWS):
        for c in range(COLS):
            card = character_normalized.crop(
                (c * CARD_W, r * CARD_H, (c+1) * CARD_W, (r+1) * CARD_H))
            mask, score, background = ink_mask(card)
            normalized.paste(card, (c * CARD_W, r * CARD_H))
            diff_sheet.paste(mask, (c * CARD_W, r * CARD_H))
            # Conservative three-way screening. Borderline and printed content
            # are review, never silently discarded.
            status = "candidate" if score >= 900 else "review" if score >= 180 else "blank"
            number = r * COLS + c + 1
            printed_row = ROWS - r
            labeled = label_card(card, number, printed_row, c + 1, status, score)
            filename = f"card-{number:03d}-row-{printed_row:02d}-col-{c+1:02d}-{status}.png"
            labeled.save(cards_dir / filename)
            raw_cards.append((labeled, status))
            manifest.append({"number": number, "printed_row": printed_row, "column": c + 1,
                             "status": status, "ink_score": score,
                             "background_level": round(background, 2), "file": f"cards/{filename}"})

    normalized.save(out / "02-mesh-normalized.jpg", quality=94)
    character_normalized.save(out / "02b-character-extraction-normalized.jpg", quality=94)
    td = ImageDraw.Draw(template)
    for x in range(0, normalized.width + 1, CARD_W): td.line((x, 0, x, normalized.height), fill="#777", width=2)
    for y in range(0, normalized.height + 1, CARD_H): td.line((0, y, normalized.width, y), fill="#777", width=2)
    template.save(out / "03-grid-template.png")
    diff_sheet.save(out / "04-difference-mask.png")

    ideal_overlay = normalized.copy()
    iod = ImageDraw.Draw(ideal_overlay)
    for x in range(0, ideal_overlay.width + 1, CARD_W):
        xx = min(x, ideal_overlay.width - 1)
        iod.line((xx, 0, xx, ideal_overlay.height - 1), fill=(255, 40, 40), width=3)
    for y in range(0, ideal_overlay.height + 1, CARD_H):
        yy = min(y, ideal_overlay.height - 1)
        iod.line((0, yy, ideal_overlay.width - 1, yy), fill=(30, 120, 255), width=3)
    ideal_overlay.save(out / "06-normalized-ideal-grid-overlay.jpg", quality=94)
    metrics = alignment_metrics(normalized)
    (out / "alignment-metrics.json").write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2), encoding="utf-8")

    thumb_w, thumb_h = 180, 121
    contact = Image.new("RGB", (COLS * thumb_w, ROWS * thumb_h), "white")
    for i, (card, _status) in enumerate(raw_cards):
        contact.paste(card.resize((thumb_w, thumb_h), Image.Resampling.LANCZOS),
                      ((i % COLS) * thumb_w, (i // COLS) * thumb_h))
    contact.save(out / "05-numbered-card-index.jpg", quality=92)

    counts = {name: sum(1 for row in manifest if row["status"] == name)
              for name in ("candidate", "review", "blank")}
    report = {"source": str(source_path), "source_size": list(source.size),
              "grid": {"rows": ROWS, "columns": COLS, "x_lines": x_lines, "y_lines": y_lines,
                       "warp": "line-sampled Coons mesh", "subdivisions_per_cell": MESH_SUBDIV,
                       "alignment_metrics": metrics},
              "character_extraction": {"source_margin_px": CHARACTER_SOURCE_MARGIN,
                                       "image": "02b-character-extraction-normalized.jpg",
                                       "grid_definition_changed": False},
              "screening": {"candidate_min": 900, "review_min": 180, "counts": counts,
                            "warning": "Printed text cannot be reconstructed from the detected grid and remains reviewable."},
              "cards": manifest}
    (out / "manifest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(out), "counts": counts,
                      "x_gap_median": float(np.median(np.diff(x_lines))),
                      "y_gap_median": float(np.median(np.diff(y_lines))),
                      "alignment": metrics["combined"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
