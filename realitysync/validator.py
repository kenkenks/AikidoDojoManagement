"""Validation rules for Architecture Reality."""

from __future__ import annotations

from collections import Counter

from .model import ArchitectureDocument, Issue


def validate_architectures(documents: list[ArchitectureDocument]) -> list[Issue]:
    issues: list[Issue] = []
    counts = Counter(document.arch_id for document in documents)

    for arch_id, count in sorted(counts.items()):
        if count > 1:
            issues.append(Issue("ERROR", "DUPLICATE_ID", f"{arch_id} が {count} 件あります"))

    numbers = sorted(document.number for document in documents)
    if numbers:
        existing = set(numbers)
        missing = [number for number in range(numbers[0], numbers[-1] + 1) if number not in existing]
        if missing:
            formatted = ", ".join(f"ARCH-{number:03d}" for number in missing)
            issues.append(Issue("INFO", "MISSING_NUMBER", f"欠番: {formatted}"))

    for document in documents:
        issues.extend(document.issues)

    return issues
