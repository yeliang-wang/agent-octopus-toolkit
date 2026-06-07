#!/usr/bin/env python3
"""Validate agent-octopus-toolkit product contracts.

The validator intentionally uses only Python's standard library so it can run
before any project-specific dependency install. It checks the contract layer
that turns agent instructions into auditable product artifacts.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import tomllib
except ModuleNotFoundError:  # pragma: no cover - Python < 3.11 fallback.
    tomllib = None


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"
AGENTS_DIR = REPO_ROOT / "agents"
CODEX_AGENT_DIR = REPO_ROOT / "integrations" / "codex" / "agents"
SCHEMA_DIR = REPO_ROOT / "schemas"
AGENT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")


class ValidationError(Exception):
    pass


def rel(path: Path) -> str:
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValidationError(f"{rel(path)}: invalid JSON: {exc}") from exc


def parse_frontmatter(path: Path) -> tuple[dict[str, str], str]:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValidationError(f"{rel(path)}: missing YAML frontmatter")
    end = text.find("\n---\n", 4)
    if end < 0:
        raise ValidationError(f"{rel(path)}: unterminated YAML frontmatter")
    metadata: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            raise ValidationError(f"{rel(path)}: unsupported frontmatter line: {line}")
        key, value = line.split(":", 1)
        metadata[key.strip()] = value.strip().strip('"')
    return metadata, text[end + 5 :]


def parse_toml(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if tomllib is None:
        return parse_simple_toml_strings(path, text)
    try:
        return tomllib.loads(text)
    except Exception as exc:
        raise ValidationError(f"{rel(path)}: invalid TOML: {exc}") from exc


def parse_simple_toml_strings(path: Path, text: str) -> dict:
    """Parse the top-level string fields used by Codex agent TOML files."""
    data: dict[str, str] = {}
    index = 0
    lines = text.splitlines()
    while index < len(lines):
        line = lines[index]
        index += 1
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", stripped)
        if not match:
            continue
        key, raw_value = match.groups()
        if raw_value == '"""':
            block: list[str] = []
            while index < len(lines):
                current = lines[index]
                index += 1
                if current.strip() == '"""':
                    break
                block.append(current)
            else:
                raise ValidationError(f"{rel(path)}: unterminated multiline string for {key}")
            data[key] = "\n".join(block)
        elif raw_value.startswith('"') and raw_value.endswith('"'):
            data[key] = raw_value[1:-1]
    return data


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValidationError(message)


def validate_schema_files() -> None:
    required = [
        "agent-manifest.schema.json",
        "proposal.schema.json",
        "run-summary.schema.json",
    ]
    for name in required:
        path = SCHEMA_DIR / name
        require(path.exists(), f"{rel(path)}: schema file missing")
        schema = read_json(path)
        require(schema.get("$schema"), f"{rel(path)}: missing $schema")
        require(schema.get("title"), f"{rel(path)}: missing title")


def validate_manifest_shape(path: Path, manifest: dict) -> None:
    required = [
        "schema",
        "id",
        "version",
        "lifecycle",
        "source",
        "distributions",
        "purpose",
        "boundaries",
        "inputs",
        "outputs",
        "evidence",
        "confirmationGates",
        "dangerousActions",
        "validation",
    ]
    for key in required:
        require(key in manifest, f"{rel(path)}: missing required key {key}")

    agent_id = manifest["id"]
    require(manifest["schema"] == "agent-octopus-agent/v1", f"{rel(path)}: unsupported schema")
    require(bool(AGENT_ID_RE.match(agent_id)), f"{rel(path)}: invalid agent id {agent_id!r}")
    require(path.name == f"{agent_id}.json", f"{rel(path)}: filename must match id")
    require(bool(VERSION_RE.match(manifest["version"])), f"{rel(path)}: invalid semantic version")
    require(manifest["lifecycle"] in {"experimental", "beta", "production-ready"}, f"{rel(path)}: invalid lifecycle")
    require(len(manifest["purpose"]) >= 20, f"{rel(path)}: purpose is too short")

    for list_key in ["inputs", "outputs", "evidence"]:
        value = manifest[list_key]
        require(isinstance(value, list) and value, f"{rel(path)}: {list_key} must be a non-empty list")

    boundaries = manifest["boundaries"]
    require(isinstance(boundaries.get("allowed"), list) and boundaries["allowed"], f"{rel(path)}: boundaries.allowed is required")
    require(isinstance(boundaries.get("forbidden"), list) and boundaries["forbidden"], f"{rel(path)}: boundaries.forbidden is required")

    validation = manifest["validation"]
    require(isinstance(validation.get("requiredSections"), list) and validation["requiredSections"], f"{rel(path)}: validation.requiredSections is required")
    require(isinstance(validation.get("requiredPhrases"), list), f"{rel(path)}: validation.requiredPhrases must be a list")


def validate_agent_files(path: Path, manifest: dict) -> None:
    source = REPO_ROOT / manifest["source"]["claudeMarkdown"]
    codex = REPO_ROOT / manifest["distributions"]["codexToml"]
    require(source.exists(), f"{rel(path)}: source file missing: {rel(source)}")
    require(codex.exists(), f"{rel(path)}: codex distribution missing: {rel(codex)}")

    frontmatter, markdown_body = parse_frontmatter(source)
    require(frontmatter.get("name") == manifest["id"], f"{rel(source)}: frontmatter name does not match manifest id")
    require(frontmatter.get("description"), f"{rel(source)}: frontmatter description is required")

    codex_data = parse_toml(codex)
    require(codex_data.get("name") == manifest["id"], f"{rel(codex)}: TOML name does not match manifest id")
    require(codex_data.get("description"), f"{rel(codex)}: TOML description is required")
    require(codex_data.get("developer_instructions"), f"{rel(codex)}: developer_instructions is required")

    for section in manifest["validation"]["requiredSections"]:
        require(f"## {section}" in markdown_body or f"### {section}" in markdown_body, f"{rel(source)}: required section missing: {section}")

    combined_text = source.read_text(encoding="utf-8") + "\n" + codex.read_text(encoding="utf-8")
    for phrase in manifest["validation"]["requiredPhrases"]:
        require(phrase in combined_text, f"{rel(path)}: required phrase missing across source/distribution: {phrase}")


def validate_inventory(manifests: list[dict]) -> None:
    manifest_ids = {manifest["id"] for manifest in manifests}
    markdown_ids = {path.stem for path in AGENTS_DIR.glob("*.md")}
    codex_ids = {path.stem for path in CODEX_AGENT_DIR.glob("*.toml")}
    require(manifest_ids == markdown_ids, f"manifest/agents mismatch: manifests={sorted(manifest_ids)} markdown={sorted(markdown_ids)}")
    require(manifest_ids == codex_ids, f"manifest/codex mismatch: manifests={sorted(manifest_ids)} codex={sorted(codex_ids)}")

    agent_list = (REPO_ROOT / "AGENT-LIST.md").read_text(encoding="utf-8")
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    for agent_id in sorted(manifest_ids):
        require(agent_id in agent_list, f"AGENT-LIST.md: missing agent id {agent_id}")
        require(agent_id in readme, f"README.md: missing agent id {agent_id}")


def validate_proposal_script_contract() -> None:
    script = (REPO_ROOT / "scripts" / "propose-changes.py").read_text(encoding="utf-8")
    require('"schema": "agent-octopus-proposal/v1"' in script, "scripts/propose-changes.py: proposal schema marker missing")
    apply_script = (REPO_ROOT / "scripts" / "apply-proposal.py").read_text(encoding="utf-8")
    require("ALLOWED_PREFIXES" in apply_script, "scripts/apply-proposal.py: managed path allowlist missing")


def validate_all() -> list[str]:
    validate_schema_files()
    paths = sorted(MANIFEST_DIR.glob("*.json"))
    require(paths, "manifests/agents: no manifest files found")

    manifests: list[dict] = []
    seen: set[str] = set()
    for path in paths:
        manifest = read_json(path)
        validate_manifest_shape(path, manifest)
        require(manifest["id"] not in seen, f"{rel(path)}: duplicate agent id {manifest['id']}")
        seen.add(manifest["id"])
        validate_agent_files(path, manifest)
        manifests.append(manifest)

    validate_inventory(manifests)
    validate_proposal_script_contract()
    return [manifest["id"] for manifest in manifests]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate agent-octopus-toolkit contracts")
    parser.add_argument("--json", action="store_true", help="Print machine-readable validation result")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        agent_ids = validate_all()
    except ValidationError as exc:
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
        else:
            print(f"[ERR] {exc}", file=sys.stderr)
        return 1

    result = {"ok": True, "agentCount": len(agent_ids), "agents": sorted(agent_ids)}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"[OK] validated {len(agent_ids)} agents: {', '.join(sorted(agent_ids))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
