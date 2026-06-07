#!/usr/bin/env python3
"""Generate searchable agent and plugin catalogs."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
AGENT_MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"
PLUGIN_DIR = REPO_ROOT / "plugins"
CATALOG_DIR = REPO_ROOT / "catalog"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def write_if_changed(path: Path, content: str, check: bool, changed: list[str]) -> None:
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    if current == content:
        return
    changed.append(path.relative_to(REPO_ROOT).as_posix())
    if not check:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


def build_catalog() -> tuple[dict, dict]:
    agents = [read_json(path) for path in sorted(AGENT_MANIFEST_DIR.glob("*.json"))]
    plugins = [read_json(path) for path in sorted(PLUGIN_DIR.glob("*/plugin.json"))]
    plugin_by_id = {plugin["id"]: plugin for plugin in plugins}
    agent_entries = []
    for agent in agents:
        plugin = plugin_by_id.get(agent["pluginId"])
        agent_entries.append({
            "id": agent["id"],
            "version": agent["version"],
            "lifecycle": agent["lifecycle"],
            "pluginId": agent["pluginId"],
            "pluginTitle": plugin["title"] if plugin else None,
            "category": agent["category"],
            "purpose": agent["purpose"],
            "source": agent["source"],
            "distributions": agent["distributions"],
            "native": agent["native"],
            "inputs": agent["inputs"],
            "outputs": agent["outputs"],
            "confirmationGates": agent["confirmationGates"],
            "dangerousActions": agent["dangerousActions"],
        })
    plugin_entries = []
    for plugin in plugins:
        plugin_entries.append({
            **plugin,
            "agentCount": len(plugin["agents"]),
            "agentSummaries": [
                {"id": agent["id"], "lifecycle": agent["lifecycle"], "category": agent["category"]}
                for agent in agents
                if agent["id"] in set(plugin["agents"])
            ],
        })
    return (
        {"schema": "agent-octopus-agent-catalog/v1", "agentCount": len(agent_entries), "agents": agent_entries},
        {"schema": "agent-octopus-plugin-catalog/v1", "pluginCount": len(plugin_entries), "plugins": plugin_entries},
    )


def generate(check: bool) -> int:
    agent_catalog, plugin_catalog = build_catalog()
    changed: list[str] = []
    write_if_changed(CATALOG_DIR / "agents.json", json.dumps(agent_catalog, ensure_ascii=False, indent=2) + "\n", check, changed)
    write_if_changed(CATALOG_DIR / "plugins.json", json.dumps(plugin_catalog, ensure_ascii=False, indent=2) + "\n", check, changed)
    if check and changed:
        print("Generated catalogs are stale:")
        for item in changed:
            print(f"- {item}")
        return 1
    if changed:
        print(f"Generated catalogs: {', '.join(changed)}")
    else:
        print("Catalogs are current")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate agent-octopus catalogs")
    parser.add_argument("--check", action="store_true", help="Fail if generated catalogs differ")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return generate(args.check)


if __name__ == "__main__":
    raise SystemExit(main())
