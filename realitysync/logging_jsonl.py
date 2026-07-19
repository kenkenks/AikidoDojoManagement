"""Structured JSONL execution logging."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


class JsonlLogger:
    def __init__(self, project_root: Path, run_id: str) -> None:
        self.run_id = run_id
        self.path = project_root / ".realitysync" / "logs" / f"{run_id}.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, level: str, event: str, **values: Any) -> None:
        record = {
            "time": datetime.now().astimezone().isoformat(timespec="milliseconds"),
            "level": level,
            "run_id": self.run_id,
            "event": event,
            **values,
        }
        with self.path.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
