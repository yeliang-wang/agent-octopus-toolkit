#!/usr/bin/env python3
"""Create an offline Octopus AgentOps proposal package from installed agent edits.

This script is meant to run from a project where Octopus AgentOps agents
were installed. It does not require GitLab/GitHub permissions and does not
write back into the toolkit source tree.
"""

from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import json
import shutil
from pathlib import Path


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="surrogateescape")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def compare_file(source: Path, installed: Path, relpath: Path, proposal_dir: Path) -> dict | None:
    if not installed.exists() or not source.exists():
        return None
    if sha256(source) == sha256(installed):
        return None

    source_text = read_text(source)
    installed_text = read_text(installed)
    diff = "".join(
        difflib.unified_diff(
            source_text.splitlines(keepends=True),
            installed_text.splitlines(keepends=True),
            fromfile=f"toolkit/{relpath.as_posix()}",
            tofile=f"installed/{installed}",
        )
    )

    proposed_file = proposal_dir / "files" / relpath
    proposed_file.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(installed, proposed_file)

    diff_file = proposal_dir / "diffs" / f"{relpath.as_posix().replace('/', '__')}.diff"
    write_text(diff_file, diff)

    return {
        "relpath": relpath.as_posix(),
        "source_path": str(source),
        "installed_path": str(installed),
        "proposed_file": str(proposed_file.relative_to(proposal_dir)),
        "diff_file": str(diff_file.relative_to(proposal_dir)),
        "source_sha256": sha256(source),
        "installed_sha256": sha256(installed),
    }


def collect_codex(toolkit_root: Path, project_root: Path, proposal_dir: Path) -> list[dict]:
    source_dir = toolkit_root / "integrations" / "codex" / "agents"
    installed_dir = project_root / ".codex" / "agents"
    changes: list[dict] = []
    for source in sorted(source_dir.glob("*.toml")):
        relpath = Path("integrations") / "codex" / "agents" / source.name
        change = compare_file(source, installed_dir / source.name, relpath, proposal_dir)
        if change:
            change["tool"] = "codex"
            changes.append(change)
    return changes


def collect_claude(toolkit_root: Path, proposal_dir: Path) -> list[dict]:
    source_dir = toolkit_root / "agents"
    installed_dir = Path.home() / ".claude" / "agents"
    changes: list[dict] = []
    for source in sorted(source_dir.glob("*.md")):
        relpath = Path("agents") / source.name
        change = compare_file(source, installed_dir / source.name, relpath, proposal_dir)
        if change:
            change["tool"] = "claude-code"
            changes.append(change)
    return changes


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Create an offline Octopus AgentOps change proposal")
    parser.add_argument("--tool", choices=["codex", "claude-code", "all"], default="codex")
    parser.add_argument("--project-root", default=".", help="Target project root for Codex installs")
    parser.add_argument("--toolkit-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--out", default=None, help="Output proposal parent directory")
    parser.add_argument("--title", default="", help="Human-readable proposal title")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    toolkit_root = Path(args.toolkit_root).resolve()
    project_root = Path(args.project_root).resolve()
    out_parent = Path(args.out).resolve() if args.out else project_root / ".agent-octopus" / "proposals"
    timestamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    proposal_dir = out_parent / f"proposal-{timestamp}"
    proposal_dir.mkdir(parents=True, exist_ok=False)

    changes: list[dict] = []
    if args.tool in ("codex", "all"):
        changes.extend(collect_codex(toolkit_root, project_root, proposal_dir))
    if args.tool in ("claude-code", "all"):
        changes.extend(collect_claude(toolkit_root, proposal_dir))

    manifest = {
        "schema": "agent-octopus-proposal/v1",
        "title": args.title,
        "created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "tool": args.tool,
        "toolkit_root": str(toolkit_root),
        "project_root": str(project_root),
        "changes": changes,
    }
    write_text(proposal_dir / "manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    write_text(
        proposal_dir / "README.md",
        "# Octopus AgentOps proposal\n\n"
        "This package is a review proposal. It does not automatically update the Octopus AgentOps source repository.\n\n"
        "Review with:\n\n"
        "```bash\n"
        "/path/to/agent-octopus-toolkit/scripts/apply-proposal.py /path/to/proposal\n"
        "```\n\n"
        "Accept with:\n\n"
        "```bash\n"
        "/path/to/agent-octopus-toolkit/scripts/apply-proposal.py /path/to/proposal --accept\n"
        "```\n",
    )

    print(f"Proposal: {proposal_dir}")
    print(f"Changed files: {len(changes)}")
    for change in changes:
        print(f"- {change['relpath']} ({change['tool']})")
    if not changes:
        print("No installed agent differences were found.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
