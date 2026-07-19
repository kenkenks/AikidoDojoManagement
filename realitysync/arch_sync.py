"""Use case for synchronizing ARCH_INDEX.md."""

from __future__ import annotations

import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from .generator import generate_architecture_table, update_index_content, write_if_changed
from .logging_jsonl import JsonlLogger
from .model import ArchitectureDocument, Issue
from .parser import parse_architecture
from .scanner import scan_architecture_files
from .validator import validate_architectures


@dataclass(frozen=True)
class ArchSyncResult:
    scanned: int
    indexed: int
    updated: bool
    issues: tuple[Issue, ...]
    duration_ms: int
    log_path: Path

    @property
    def warning_count(self) -> int:
        return sum(issue.level == "WARNING" for issue in self.issues)

    @property
    def error_count(self) -> int:
        return sum(issue.level == "ERROR" for issue in self.issues)

    @property
    def exit_code(self) -> int:
        if self.error_count:
            return 2
        if self.warning_count:
            return 1
        return 0


def sync_architecture_index(project_root: Path) -> ArchSyncResult:
    started = time.perf_counter()
    run_id = f"rs-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid4().hex[:4]}"
    logger = JsonlLogger(project_root, run_id)
    architecture_dir = project_root / "docs" / "Architecture"
    index_path = architecture_dir / "ARCH_INDEX.md"

    logger.write("INFO", "sync_started", command="sync arch", version="0.1.0")
    paths = scan_architecture_files(architecture_dir)
    logger.write("INFO", "scan_completed", count=len(paths), files=[path.name for path in paths])

    documents: list[ArchitectureDocument] = [parse_architecture(path) for path in paths]
    issues = validate_architectures(documents)

    for issue in issues:
        logger.write(issue.level, "issue_detected", code=issue.code, message=issue.message, file=issue.file)

    errors = [issue for issue in issues if issue.level == "ERROR"]
    updated = False
    if not errors:
        generated = generate_architecture_table(documents)
        current = index_path.read_text(encoding="utf-8-sig")
        next_content = update_index_content(current, generated)
        updated = write_if_changed(index_path, next_content)
        logger.write("CHANGE" if updated else "INFO", "index_updated" if updated else "index_unchanged", target=str(index_path.relative_to(project_root)))
    else:
        logger.write("ERROR", "sync_aborted", reason="validation_error", count=len(errors))

    duration_ms = round((time.perf_counter() - started) * 1000)
    result = ArchSyncResult(len(paths), len(documents), updated, tuple(issues), duration_ms, logger.path)
    logger.write(
        "INFO",
        "sync_completed",
        scanned=result.scanned,
        indexed=result.indexed,
        updated=result.updated,
        warnings=result.warning_count,
        errors=result.error_count,
        duration_ms=result.duration_ms,
        exit_code=result.exit_code,
    )
    return result
