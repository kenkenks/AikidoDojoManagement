"""Filesystem scanners. Scanning only observes Reality; it does not parse or modify it."""

from __future__ import annotations

import re
from pathlib import Path

ARCH_FILE_PATTERN = re.compile(r"^ARCH-(\d{3})(?:_|\b)")


def scan_architecture_files(architecture_dir: Path) -> list[Path]:
    if not architecture_dir.is_dir():
        raise FileNotFoundError(f"Architecture directory not found: {architecture_dir}")

    files: list[Path] = []
    for path in architecture_dir.iterdir():
        if not path.is_file() or path.name == "ARCH_INDEX.md":
            continue
        if ARCH_FILE_PATTERN.match(path.name):
            files.append(path)

    return sorted(files, key=lambda path: (_number_from_name(path.name), path.name))


def _number_from_name(name: str) -> int:
    match = ARCH_FILE_PATTERN.match(name)
    if not match:
        return 999_999
    return int(match.group(1))
