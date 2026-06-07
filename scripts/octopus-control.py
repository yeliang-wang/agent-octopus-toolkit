#!/usr/bin/env python3
"""Control-plane CLI for Octopus AgentOps."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"
PLUGIN_DIR = REPO_ROOT / "plugins"
CATALOG_DIR = REPO_ROOT / "catalog"


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


def load_plugins() -> list[dict]:
    return [read_json(path) for path in sorted(PLUGIN_DIR.glob("*/plugin.json"))]


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


def cmd_plugins(args: argparse.Namespace) -> int:
    plugins = load_plugins()
    if args.json:
        print(json.dumps({"plugins": plugins}, ensure_ascii=False, indent=2))
        return 0
    rows = [[plugin["id"], plugin["version"], plugin["lifecycle"], plugin["category"], ",".join(plugin["agents"])] for plugin in plugins]
    print_table(["plugin", "version", "lifecycle", "category", "agents"], rows)
    return 0


def searchable_blob(item: dict) -> str:
    return json.dumps(item, ensure_ascii=False).lower()


def cmd_search(args: argparse.Namespace) -> int:
    query = " ".join(args.query).strip().lower()
    if not query:
        raise SystemExit("search query is required")
    agent_catalog = read_json(CATALOG_DIR / "agents.json")
    plugin_catalog = read_json(CATALOG_DIR / "plugins.json")
    agent_hits = [agent for agent in agent_catalog["agents"] if query in searchable_blob(agent)]
    plugin_hits = [plugin for plugin in plugin_catalog["plugins"] if query in searchable_blob(plugin)]
    if args.json:
        print(json.dumps({"query": query, "agents": agent_hits, "plugins": plugin_hits}, ensure_ascii=False, indent=2))
        return 0
    print(f"Query: {query}")
    if plugin_hits:
        print("\nPlugins:")
        print_table(["plugin", "lifecycle", "category", "agents"], [[p["id"], p["lifecycle"], p["category"], ",".join(p["agents"])] for p in plugin_hits])
    if agent_hits:
        print("\nAgents:")
        print_table(["agent", "plugin", "lifecycle", "category"], [[a["id"], a["pluginId"], a["lifecycle"], a["category"]] for a in agent_hits])
    if not plugin_hits and not agent_hits:
        print("No matches.")
        return 1
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


def cmd_install(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    agents: list[str] = []
    if args.agent:
        agents.extend(args.agent)
    if args.plugin:
        plugin_by_id = {plugin["id"]: plugin for plugin in load_plugins()}
        for plugin_id in args.plugin:
            plugin = plugin_by_id.get(plugin_id)
            if not plugin:
                raise SystemExit(f"unknown plugin: {plugin_id}")
            agents.extend(plugin["agents"])
    if not agents:
        command = [str(REPO_ROOT / "scripts" / "install.sh"), "--tool", args.tool, "--update"]
        if args.dry_run:
            command.append("--dry-run")
        return subprocess.call(command, cwd=project_root)
    status = 0
    for agent_id in sorted(set(agents)):
        command = [str(REPO_ROOT / "scripts" / "install.sh"), "--tool", args.tool, "--agent", agent_id, "--update"]
        if args.dry_run:
            command.append("--dry-run")
        status = subprocess.call(command, cwd=project_root) or status
    return status


def cmd_proposals(args: argparse.Namespace) -> int:
    project_root = Path(args.project_root).resolve()
    proposal_root = project_root / ".agent-octopus" / "proposals"
    proposals = []
    for manifest_path in sorted(proposal_root.glob("proposal-*/manifest.json")):
        manifest = read_json(manifest_path)
        proposals.append({
            "path": str(manifest_path.parent),
            "title": manifest.get("title") or "",
            "created_at": manifest.get("created_at") or "",
            "tool": manifest.get("tool") or "",
            "changeCount": len(manifest.get("changes", [])),
        })
    if args.json:
        print(json.dumps({"projectRoot": str(project_root), "proposals": proposals}, ensure_ascii=False, indent=2))
        return 0
    if not proposals:
        print(f"No proposals under {proposal_root}")
        return 0
    print_table(["created", "tool", "changes", "title", "path"], [[p["created_at"], p["tool"], str(p["changeCount"]), p["title"], p["path"]] for p in proposals])
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Octopus AgentOps control plane")
    sub = parser.add_subparsers(dest="command", required=True)

    list_parser = sub.add_parser("list", help="List managed agents")
    list_parser.add_argument("--json", action="store_true")
    list_parser.set_defaults(func=cmd_list)

    plugins_parser = sub.add_parser("plugins", help="List plugin packages")
    plugins_parser.add_argument("--json", action="store_true")
    plugins_parser.set_defaults(func=cmd_plugins)

    search_parser = sub.add_parser("search", help="Search agent and plugin catalog")
    search_parser.add_argument("query", nargs="+")
    search_parser.add_argument("--json", action="store_true")
    search_parser.set_defaults(func=cmd_search)

    status_parser = sub.add_parser("codex-status", help="Check project-scoped Codex install drift")
    status_parser.add_argument("--project-root", default=".")
    status_parser.add_argument("--json", action="store_true")
    status_parser.set_defaults(func=cmd_codex_status)

    install_parser = sub.add_parser("install", help="Install agents or plugins into a target project")
    install_parser.add_argument("--project-root", default=".")
    install_parser.add_argument("--tool", choices=["codex", "claude-code"], default="codex")
    install_parser.add_argument("--agent", action="append", default=[])
    install_parser.add_argument("--plugin", action="append", default=[])
    install_parser.add_argument("--dry-run", action="store_true")
    install_parser.set_defaults(func=cmd_install)

    proposal_parser = sub.add_parser("proposals", help="List offline proposals in a target project")
    proposal_parser.add_argument("--project-root", default=".")
    proposal_parser.add_argument("--json", action="store_true")
    proposal_parser.set_defaults(func=cmd_proposals)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
