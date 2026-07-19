"""Parsers that convert Architecture documents into domain models."""

from __future__ import annotations

import re
from pathlib import Path

from .model import ArchitectureDocument, Issue

ARCH_ID_PATTERN = re.compile(r"\bARCH-(\d{3})\b", re.IGNORECASE)
FILENAME_ARCH_ID_PATTERN = re.compile(r"^ARCH-(\d{3})", re.IGNORECASE)
ARCH_WITH_TITLE_PATTERN = re.compile(
    r"^\s*#{0,6}\s*(ARCH-\d{3})\s+(.+?)\s*$", re.IGNORECASE
)
STATUS_INLINE_PATTERN = re.compile(r"^\s*STATUS\s*:\s*(.+?)\s*$", re.IGNORECASE)


def parse_architecture(path: Path) -> ArchitectureDocument:
    issues: list[Issue] = []
    filename_id = _id_from_filename(path)

    try:
        text = path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as exc:
        issues.append(Issue("ERROR", "ENCODING", f"UTF-8で読み込めません: {exc}", path.name))
        return ArchitectureDocument(filename_id, None, None, path, tuple(issues))

    lines = text.splitlines()
    nonempty = [(index, line.strip()) for index, line in enumerate(lines) if line.strip()]

    if not nonempty:
        issues.append(Issue("WARNING", "EMPTY_DOCUMENT", "文書が空です", path.name))
        return ArchitectureDocument(filename_id, None, None, path, tuple(issues))

    body_id = _primary_body_id(lines)
    if body_id is not None and body_id != filename_id:
        issues.append(
            Issue(
                "ERROR",
                "ID_MISMATCH",
                f"ファイル名のID {filename_id} と本文先頭のID {body_id} が一致しません",
                path.name,
            )
        )

    title = _parse_title(lines, filename_id)
    if title is None:
        issues.append(Issue("WARNING", "TITLE_MISSING", "タイトルを取得できません", path.name))

    status = _parse_status(lines)
    if status is None:
        issues.append(Issue("WARNING", "STATUS_MISSING", "STATUSを取得できません", path.name))

    return ArchitectureDocument(filename_id, title, status, path, tuple(issues))


def _primary_body_id(lines: list[str]) -> str | None:
    """Return the document's declared ID near the top, ignoring later cross references."""
    for line in lines[:15]:
        cleaned = _clean_heading(line)
        match = re.match(r"^(ARCH-\d{3})(?:\s|$)", cleaned, re.IGNORECASE)
        if match:
            return match.group(1).upper()
    return None


def _id_from_filename(path: Path) -> str:
    match = FILENAME_ARCH_ID_PATTERN.search(path.name)
    if not match:
        raise ValueError(f"Architecture ID not found in filename: {path.name}")
    return match.group(0).upper()


def _parse_title(lines: list[str], arch_id: str) -> str | None:
    # 1. '# ARCH-001 Title' or 'ARCH-001 Title'
    for line in lines[:30]:
        match = ARCH_WITH_TITLE_PATTERN.match(line)
        if match and match.group(1).upper() == arch_id:
            title = _clean_heading(match.group(2))
            if title:
                return title

    # 2. A line containing only the ID, followed by the next meaningful line.
    for index, line in enumerate(lines[:30]):
        if _clean_heading(line).upper() == arch_id:
            candidate = _next_nonempty(lines, index + 1)
            if candidate:
                cleaned = _clean_heading(candidate)
                if not _is_metadata_heading(cleaned):
                    return cleaned

    # 3. Explicit 'タイトル' label followed by its value.
    for index, line in enumerate(lines[:40]):
        if _clean_heading(line) == "タイトル":
            candidate = _next_nonempty(lines, index + 1)
            if candidate:
                return _clean_heading(candidate)

    return None


def _parse_status(lines: list[str]) -> str | None:
    # 1. 'STATUS: value'
    for line in lines[:50]:
        match = STATUS_INLINE_PATTERN.match(_clean_heading(line, strip_hash=False))
        if match:
            value = match.group(1).strip()
            return value or None

    # 2. 'STATUS' or '状態' followed by the next meaningful line.
    for index, line in enumerate(lines[:50]):
        label = _clean_heading(line)
        if label.upper() == "STATUS" or label == "状態":
            candidate = _next_nonempty(lines, index + 1)
            if candidate:
                return _clean_heading(candidate)

    return None


def _next_nonempty(lines: list[str], start: int) -> str | None:
    for line in lines[start:]:
        if line.strip():
            return line.strip()
    return None


def _clean_heading(value: str, *, strip_hash: bool = True) -> str:
    cleaned = value.strip()
    if strip_hash:
        cleaned = re.sub(r"^#{1,6}\s*", "", cleaned)
    return cleaned.strip()


def _is_metadata_heading(value: str) -> bool:
    normalized = value.upper()
    return normalized in {"STATUS", "TYPE", "AREA", "PRIORITY", "状態", "目的"}
