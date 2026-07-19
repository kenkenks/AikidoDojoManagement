"""Markdown generators for Architecture indexes."""

from __future__ import annotations

import re
from pathlib import Path

from .model import ArchitectureDocument

BEGIN_MARKER = "<!-- REALITYSYNC:ARCH_INDEX:BEGIN -->"
END_MARKER = "<!-- REALITYSYNC:ARCH_INDEX:END -->"
TABLE_PATTERN = re.compile(
    r"\|No\|タイトル\|STATUS\|概要\|\s*\n"
    r"\|---\|---\|---\|---\|\s*\n"
    r"(?:\|.*\|\s*\n)*",
    re.MULTILINE,
)


def generate_architecture_table(documents: list[ArchitectureDocument]) -> str:
    lines = [
        BEGIN_MARKER,
        "",
        "|No|タイトル|STATUS|概要|",
        "|---|---|---|---|",
    ]

    for document in sorted(documents, key=lambda item: (item.number, item.path.name)):
        title = _escape_cell(document.title or "（タイトル未取得）")
        status = _escape_cell(document.status or "UNKNOWN")
        lines.append(f"|{document.arch_id}|{title}|{status}||")

    lines.extend(["", END_MARKER])
    return "\n".join(lines)


def update_index_content(current: str, generated_block: str) -> str:
    if BEGIN_MARKER in current or END_MARKER in current:
        if current.count(BEGIN_MARKER) != 1 or current.count(END_MARKER) != 1:
            raise ValueError("RealitySync marker is incomplete or duplicated in ARCH_INDEX.md")
        before, rest = current.split(BEGIN_MARKER, 1)
        _, after = rest.split(END_MARKER, 1)
        return _normalize_newlines(before + generated_block + after)

    match = TABLE_PATTERN.search(current)
    if not match:
        raise ValueError("Existing Architecture table not found in ARCH_INDEX.md")

    updated = current[: match.start()] + generated_block + "\n" + current[match.end() :]
    return _normalize_newlines(updated)


def write_if_changed(path: Path, content: str) -> bool:
    current = path.read_text(encoding="utf-8-sig") if path.exists() else ""
    normalized = _normalize_newlines(content)
    if _normalize_newlines(current) == normalized:
        return False
    path.write_text(normalized, encoding="utf-8", newline="\n")
    return True


def _escape_cell(value: str) -> str:
    return value.replace("|", "\\|").replace("\n", " ").strip()


def _normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")
