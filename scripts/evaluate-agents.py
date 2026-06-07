#!/usr/bin/env python3
"""Run deterministic agent quality evaluations."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def load_manifests() -> list[dict]:
    return [read_json(path) for path in sorted(MANIFEST_DIR.glob("*.json"))]


def check_agent(manifest: dict) -> dict:
    checks = []

    def add(name: str, passed: bool, detail: str = "") -> None:
        checks.append({"name": name, "status": "passed" if passed else "failed", "detail": detail})

    source = REPO_ROOT / manifest["source"]["claudeMarkdown"]
    codex = REPO_ROOT / manifest["distributions"]["codexToml"]
    source_text = source.read_text(encoding="utf-8")
    codex_text = codex.read_text(encoding="utf-8")

    add("source-exists", source.exists(), str(source))
    add("codex-exists", codex.exists(), str(codex))
    add("confirmation-gates", len(manifest["confirmationGates"]) > 0, ",".join(manifest["confirmationGates"]))
    add("dangerous-actions", len(manifest["dangerousActions"]) > 0, ",".join(manifest["dangerousActions"]))
    add("evidence-policy", len(manifest["evidence"]) >= 3, ",".join(manifest["evidence"]))
    add("native-tools", len(manifest["native"]["tools"]) > 0, ",".join(manifest["native"]["tools"]))
    add("codex-generated-instructions", "developer_instructions" in codex_text and manifest["id"] in codex_text, "")
    add("source-final-report", "Final Report" in source_text or "Final Response" in source_text, "")

    failed = [check for check in checks if check["status"] != "passed"]
    return {"agentId": manifest["id"], "status": "failed" if failed else "passed", "checks": checks}


def install_roundtrip() -> dict:
    tmp = tempfile.mkdtemp(prefix="agent-octopus-eval-")
    try:
        install = subprocess.run(
            [str(REPO_ROOT / "scripts" / "install.sh"), "--tool", "codex", "--update"],
            cwd=tmp,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        status = subprocess.run(
            [str(REPO_ROOT / "scripts" / "octopus-control.py"), "codex-status", "--project-root", tmp, "--json"],
            cwd=REPO_ROOT,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        parsed = json.loads(status.stdout) if status.returncode == 0 else {}
        return {
            "status": "passed" if install.returncode == 0 and status.returncode == 0 else "failed",
            "projectRoot": tmp,
            "installReturnCode": install.returncode,
            "statusReturnCode": status.returncode,
            "codexAgents": parsed.get("codexAgents", []),
        }
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def run_eval() -> dict:
    agent_results = [check_agent(manifest) for manifest in load_manifests()]
    generation_checks = []
    for label, command in [
        ("distribution-generation", ["python3", "scripts/generate-distributions.py", "--check"]),
        ("catalog-generation", ["python3", "scripts/generate-catalog.py", "--check"]),
        ("contract-validation", ["python3", "scripts/validate-toolkit.py"]),
    ]:
        completed = subprocess.run(command, cwd=REPO_ROOT, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        generation_checks.append({
            "name": label,
            "status": "passed" if completed.returncode == 0 else "failed",
            "stdout": completed.stdout.strip(),
            "stderr": completed.stderr.strip(),
        })

    roundtrip = install_roundtrip()
    failed = any(result["status"] != "passed" for result in agent_results)
    failed = failed or any(check["status"] != "passed" for check in generation_checks)
    failed = failed or roundtrip["status"] != "passed"
    return {
        "schema": "agent-octopus-eval/v1",
        "suiteId": "deterministic-quality-v1",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "status": "failed" if failed else "passed",
        "agentResults": agent_results,
        "generationChecks": generation_checks,
        "installRoundtrip": roundtrip,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate Octopus AgentOps agents")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--out", default="")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = run_eval()
    if args.out:
        Path(args.out).write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(f"[{result['status'].upper()}] {result['suiteId']}")
        for agent in result["agentResults"]:
            print(f"- {agent['agentId']}: {agent['status']}")
        print(f"- install-roundtrip: {result['installRoundtrip']['status']}")
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
