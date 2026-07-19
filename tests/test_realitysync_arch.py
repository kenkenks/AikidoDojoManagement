from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from realitysync.arch_sync import sync_architecture_index
from realitysync.generator import BEGIN_MARKER, END_MARKER


INDEX_SOURCE = """# Architecture Index

|No|タイトル|STATUS|概要|
|---|---|---|---|
|ARCH-001|Old|OLD|old|

# 更新ルール
"""


class ArchitectureSyncTests(unittest.TestCase):
    def make_project(self) -> Path:
        root = Path(tempfile.mkdtemp())
        architecture = root / "docs" / "Architecture"
        architecture.mkdir(parents=True)
        (architecture / "ARCH_INDEX.md").write_text(INDEX_SOURCE, encoding="utf-8")
        return root

    def test_generates_index_and_is_idempotent(self) -> None:
        root = self.make_project()
        architecture = root / "docs" / "Architecture"
        (architecture / "ARCH-001_First.md").write_text(
            "# ARCH-001 First\n\nSTATUS: ACTIVE\n", encoding="utf-8"
        )
        (architecture / "ARCH-003_Third").write_text(
            "ARCH-003\nThird\n\n状態\n検討中\n", encoding="utf-8"
        )

        first = sync_architecture_index(root)
        second = sync_architecture_index(root)
        content = (architecture / "ARCH_INDEX.md").read_text(encoding="utf-8")

        self.assertTrue(first.updated)
        self.assertFalse(second.updated)
        self.assertIn(BEGIN_MARKER, content)
        self.assertIn(END_MARKER, content)
        self.assertIn("|ARCH-001|First|ACTIVE||", content)
        self.assertIn("|ARCH-003|Third|検討中||", content)
        self.assertTrue(any(issue.code == "MISSING_NUMBER" for issue in first.issues))

    def test_duplicate_id_aborts_update(self) -> None:
        root = self.make_project()
        architecture = root / "docs" / "Architecture"
        (architecture / "ARCH-001_A.md").write_text("# ARCH-001 A\nSTATUS: ACTIVE\n", encoding="utf-8")
        (architecture / "ARCH-001_B.md").write_text("# ARCH-001 B\nSTATUS: ACTIVE\n", encoding="utf-8")

        before = (architecture / "ARCH_INDEX.md").read_text(encoding="utf-8")
        result = sync_architecture_index(root)
        after = (architecture / "ARCH_INDEX.md").read_text(encoding="utf-8")

        self.assertEqual(2, result.exit_code)
        self.assertEqual(before, after)
        self.assertTrue(any(issue.code == "DUPLICATE_ID" for issue in result.issues))

    def test_missing_status_is_unknown_with_warning(self) -> None:
        root = self.make_project()
        architecture = root / "docs" / "Architecture"
        (architecture / "ARCH-001_First.md").write_text("# ARCH-001 First\n", encoding="utf-8")

        result = sync_architecture_index(root)
        content = (architecture / "ARCH_INDEX.md").read_text(encoding="utf-8")

        self.assertEqual(1, result.exit_code)
        self.assertIn("|ARCH-001|First|UNKNOWN||", content)
        self.assertTrue(any(issue.code == "STATUS_MISSING" for issue in result.issues))


if __name__ == "__main__":
    unittest.main()
