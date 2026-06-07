#!/usr/bin/env python3
"""Generate Codex agent distributions from canonical Markdown agents."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise SystemExit(f"missing frontmatter: {path}")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise SystemExit(f"unterminated frontmatter: {path}")
    metadata: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip('"')
    return metadata, text[end + 5 :].strip() + "\n"


def toml_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def multiline_toml(value: str) -> str:
    if '"""' in value:
        value = value.replace('"""', '\\"\\"\\"')
    return f'"""\n{value}"""'


def render_codex_toml(manifest: dict) -> str:
    source = REPO_ROOT / manifest["source"]["claudeMarkdown"]
    metadata, body = parse_frontmatter(source)
    description = metadata.get("description") or manifest["purpose"]
    native = manifest["native"]
    header = [
        f"name = {toml_string(manifest['id'])}",
        f"description = {toml_string(description)}",
        f"model = {toml_string(native['model'])}",
    ]
    if native["tools"]:
        header.append("tools = [" + ", ".join(toml_string(item) for item in native["tools"]) + "]")
    if native["disallowedTools"]:
        header.append("disallowed_tools = [" + ", ".join(toml_string(item) for item in native["disallowedTools"]) + "]")
    if native["skills"]:
        header.append("skills = [" + ", ".join(toml_string(item) for item in native["skills"]) + "]")
    if native["allowedSpawnAgents"]:
        header.append("allowed_spawn_agents = [" + ", ".join(toml_string(item) for item in native["allowedSpawnAgents"]) + "]")
    header.append(f"memory = {toml_string(native['memory'])}")
    header.append(f"developer_instructions = {multiline_toml(body)}")
    return "\n".join(header) + "\n"


def generate(check: bool) -> int:
    changed: list[str] = []
    for manifest_path in sorted(MANIFEST_DIR.glob("*.json")):
        manifest = read_json(manifest_path)
        target = REPO_ROOT / manifest["distributions"]["codexToml"]
        rendered = render_codex_toml(manifest)
        current = target.read_text(encoding="utf-8") if target.exists() else ""
        if current != rendered:
            changed.append(target.relative_to(REPO_ROOT).as_posix())
            if not check:
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(rendered, encoding="utf-8")

    if check and changed:
        print("Generated Codex distributions are stale:")
        for item in changed:
            print(f"- {item}")
        return 1
    if changed:
        print(f"Generated {len(changed)} Codex distributions")
    else:
        print("Codex distributions are current")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Generate Codex distributions from Markdown agents")
    parser.add_argument("--check", action="store_true", help="Fail if generated output differs")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    return generate(args.check)


if __name__ == "__main__":
    raise SystemExit(main())
