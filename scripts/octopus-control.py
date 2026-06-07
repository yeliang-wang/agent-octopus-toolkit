#!/usr/bin/env python3
"""Lightweight control plane for agent-octopus-toolkit."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_manifests() -> list[dict]:
    return [read_json(path) for path in sorted(MANIFEST_DIR.glob("*.json"))]


def print_table(headers: list[str], rows: list[list[str]]) -> None:
    widths = [len(header) for header in headers]
    for row in rows:
        for index, cell in enumerate(row):
            widths[index] = max(widths[index], len(cell))
    print("  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("  ".join("-" * width for width in widths))
    for row in rows:
        print("  ".join(cell.ljust(widths[index]) for index, cell in enumerate(row)))


def cmd_list(args: argparse.Namespace) -> int:
    manifests = load_manifests()
    rows = [
        [
            manifest["id"],
            manifest["version"],
            manifest["lifecycle"],
            manifest["source"]["claudeMarkdown"],
            manifest["distributions"]["codexToml"],
        ]
        for manifest in manifests
    ]
    if args.json:
        print(json.dumps({"agents": manifests}, ensure_ascii=False, indent=2))
    else:
        print_table(["agent", "version", "lifecycle", "source", "codex"], rows)
    return 0


def codex_status_for_project(project_root: Path) -> list[dict]:
    installed_dir = project_root / ".codex" / "agents"
    statuses = []
    for manifest in load_manifests():
        source = REPO_ROOT / manifest["distributions"]["codexToml"]
        installed = installed_dir / source.name
        status = {
            "id": manifest["id"],
            "version": manifest["version"],
            "lifecycle": manifest["lifecycle"],
            "source": str(source),
            "installed": str(installed),
            "installedExists": installed.exists(),
            "matchesToolkit": False,
        }
        if source.exists() and installed.exists():
            status["sourceSha256"] = sha256(source)
            status["installedSha256"] = sha256(installed)
            status["matchesToolkit"] = status["sourceSha256"] == status["installedSha256"]
        statuses.append(status)
    return statuses


def cmd_codex_status(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    statuses = codex_status_for_project(project_root)
    if args.json:
        print(json.dumps({"projectRoot": str(project_root), "codexAgents": statuses}, ensure_ascii=False, indent=2))
        return 0

    rows = []
    for item in statuses:
        if not item["installedExists"]:
            state = "missing"
        elif item["matchesToolkit"]:
            state = "current"
        else:
            state = "drifted"
        rows.append([item["id"], item["version"], item["lifecycle"], state, item["installed"]])
    print(f"Project: {project_root}")
    print_table(["agent", "version", "lifecycle", "status", "installed"], rows)
    return 1 if any(not item["installedExists"] or not item["matchesToolkit"] for item in statuses) else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="agent-octopus lightweight control plane")
    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list", help="List managed agents")
    list_parser.add_argument("--json", action="store_true")
    list_parser.set_defaults(func=cmd_list)

    status_parser = sub.add_parser("codex-status", help="Check project-scoped Codex install drift")
    status_parser.add_argument("--project-root", default=".")
    status_parser.add_argument("--json", action="store_true")
    status_parser.set_defaults(func=cmd_codex_status)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
