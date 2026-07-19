"""Command-line interface for the Dojo Framework."""

from __future__ import annotations

import argparse
from pathlib import Path

from .arch_sync import sync_architecture_index


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="dojo", description="Dojo Framework CLI")
    subcommands = parser.add_subparsers(dest="command", required=True)

    sync_parser = subcommands.add_parser("sync", help="Synchronize generated assets from project Reality")
    sync_targets = sync_parser.add_subparsers(dest="target", required=True)
    arch_parser = sync_targets.add_parser("arch", help="Synchronize docs/Architecture/ARCH_INDEX.md")
    arch_parser.add_argument("--verbose", action="store_true", help="Show detected issues and log location")
    arch_parser.add_argument("--root", type=Path, default=None, help="Project root (default: directory containing dojo.py)")

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "sync" and args.target == "arch":
        project_root = (args.root or Path(__file__).resolve().parents[1]).resolve()
        try:
            result = sync_architecture_index(project_root)
        except (FileNotFoundError, ValueError, OSError) as exc:
            print("RealitySync — ARCH_INDEX")
            print(f"\nFATAL: {exc}")
            return 4

        print("RealitySync — ARCH_INDEX")
        print()
        print(f"Scanned   {result.scanned:3d}")
        print(f"Indexed   {result.indexed:3d}")
        print(f"Updated   {1 if result.updated else 0:3d}")
        print(f"Warnings  {result.warning_count:3d}")
        print(f"Errors    {result.error_count:3d}")
        print()
        print(f"ARCH_INDEX.md {'UPDATED' if result.updated else 'UNCHANGED'}")
        print(f"Completed in {result.duration_ms / 1000:.2f}s")

        if args.verbose and result.issues:
            print("\nIssues")
            for issue in result.issues:
                location = f" [{issue.file}]" if issue.file else ""
                print(f"{issue.level:7s} {issue.code}{location}: {issue.message}")
            print(f"\nLog: {result.log_path.relative_to(project_root)}")

        return result.exit_code

    return 3
