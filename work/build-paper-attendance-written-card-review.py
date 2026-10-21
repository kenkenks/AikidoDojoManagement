#!/usr/bin/env python3
"""Build a review sheet for the 27 known written attendance cells."""
from pathlib import Path
import json

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
SOURCE_DIR = ROOT / "paper-attendance-cards-current-20261021"
OUT = SOURCE_DIR / "written-27-review"
OUT.mkdir(parents=True, exist_ok=True)

# Coordinates use image order: row 1 is the top row, column 1 is the left.
TRUTH = [
    (1,1,"10/5"),(2,1,"10/3"),(3,1,"9/30"),(4,1,"9/28"),(5,1,"9/26"),(6,1,"9/26"),
    (7,1,"9/15"),(8,1,"9/25"),(9,1,"9/23"),(10,1,"9/23"),(11,1,"9/21"),(12,1,"9/21"),
    (13,1,"9/19"),(14,1,"9/19"),(14,2,"10/16"),(15,1,"9/18"),(15,2,"10/16"),
    (16,1,"9/16"),(16,2,"10/12"),(17,1,"9/14"),(17,2,"10/12"),(18,1,"9/14"),(18,2,"10/1"),
    (19,1,"9/12"),(19,2,"10/10"),(20,1,"9/12"),(20,2,"10/10"),
]

normalized = Image.open(SOURCE_DIR / "02-mesh-normalized.jpg").convert("RGB")
font = ImageFont.load_default(size=24)
small = ImageFont.load_default(size=19)
panel_w, panel_h = 500, 330
sheet = Image.new("RGB", (panel_w * 3, panel_h * 9), "white")
draw = ImageDraw.Draw(sheet)
details = []

for index, (row, col, expected) in enumerate(TRUTH):
    x0, y0 = (col-1)*320, (row-1)*180
    card = normalized.crop((x0, y0, x0+320, y0+180))
    enlarged = card.resize((480, 270), Image.Resampling.LANCZOS)
    px, py = (index % 3)*panel_w, (index // 3)*panel_h
    draw.rectangle((px, py, px+panel_w-1, py+panel_h-1), outline="#444", width=2)
    printed_row = 21-row
    number = (row-1)*20 + col
    draw.text((px+10, py+6),
              f"#{number:03d} image-row={row:02d} printed-row={printed_row:02d} col={col:02d} truth={expected}",
              fill="#111", font=small)
    sheet.paste(enlarged, (px+10, py+48))
    card.save(OUT / f"written-{index+1:02d}-row-{row:02d}-col-{col:02d}-{expected.replace('/','-')}.png")
    details.append({"index": index+1, "number": number, "image_row": row,
                    "printed_row": printed_row, "column": col, "expected": expected})

sheet.save(OUT / "written-27-card-review.jpg", quality=96)
(OUT / "written-27-cells.json").write_text(json.dumps(details, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"cards": 27, "sheet": str(OUT / 'written-27-card-review.jpg')}, ensure_ascii=False))
