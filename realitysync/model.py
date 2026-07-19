"""Domain models used by RealitySync."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class Issue:
    level: str
    code: str
    message: str
    file: str | None = None


@dataclass(frozen=True)
class ArchitectureDocument:
    arch_id: str
    title: str | None
    status: str | None
    path: Path
    issues: tuple[Issue, ...] = field(default_factory=tuple)

    @property
    def number(self) -> int:
        return int(self.arch_id.split("-", 1)[1])
