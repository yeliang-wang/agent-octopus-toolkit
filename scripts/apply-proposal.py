#!/usr/bin/env python3
"""Review or accept an offline Octopus AgentOps proposal package."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


ALLOWED_PREFIXES = (
    "agents/",
    "integrations/codex/agents/",
)


def load_manifest(proposal_dir: Path) -> dict:
    manifest_path = proposal_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(f"manifest.json not found: {manifest_path}")
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def validate_relpath(relpath: str) -> None:
    if relpath.startswith("/") or ".." in Path(relpath).parts:
        raise SystemExit(f"Unsafe relpath in proposal: {relpath}")
    if not any(relpath.startswith(prefix) for prefix in ALLOWED_PREFIXES):
        raise SystemExit(f"Proposal path is outside managed agent files: {relpath}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Review or accept an Octopus AgentOps proposal")
    parser.add_argument("proposal_dir")
    parser.add_argument("--toolkit-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--accept", action="store_true", help="Write proposed files into the toolkit")
    parser.add_argument("--file", action="append", default=[], help="Only review/apply this relpath")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    proposal_dir = Path(args.proposal_dir).resolve()
    toolkit_root = Path(args.toolkit_root).resolve()
    manifest = load_manifest(proposal_dir)
    only = set(args.file)

    print(f"Proposal: {proposal_dir}")
    print(f"Title: {manifest.get('title') or '(none)'}")
    print(f"Created: {manifest.get('created_at')}")
    print(f"Project: {manifest.get('project_root')}")
    print()

    selected = []
    for change in manifest.get("changes", []):
        relpath = change["relpath"]
        validate_relpath(relpath)
        if only and relpath not in only:
            continue
        selected.append(change)

    if not selected:
        print("No matching changes.")
        return 0

    for change in selected:
        relpath = change["relpath"]
        diff_path = proposal_dir / change["diff_file"]
        proposed_file = proposal_dir / change["proposed_file"]
        target = toolkit_root / relpath
        print(f"== {relpath} ==")
        print(diff_path.read_text(encoding="utf-8", errors="replace"))
        if args.accept:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(proposed_file, target)
            print(f"ACCEPTED -> {target}")
        else:
            print("REVIEW ONLY. Re-run with --accept to apply this change.")
        print()

    if not args.accept:
        print("No toolkit files were modified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
