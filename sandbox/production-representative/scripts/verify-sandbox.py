#!/usr/bin/env python3
"""Verify production-representative sandbox contracts and generated repositories."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


SANDBOX_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SANDBOX_ROOT.parents[1]
MANIFEST_PATH = SANDBOX_ROOT / "manifest.json"
REQUIRED_PROJECTS = {
    "node-service",
    "web-dashboard",
    "mcp-tooling",
    "data-pipeline",
    "flaky-quality-gate",
}
REQUIRED_SHARED_AGENTS = {
    "mcp-e2e-governor",
    "user-flow-debug",
    "scm-sync-governor",
    "product-evolution-lab",
}
REQUIRED_BOUNDARIES = {
    "git",
    "target-product-registration",
    "scm",
    "ci-cd",
    "llm-or-runtime",
    "product-native-evidence",
}


def run(command: list[str], cwd: Path) -> dict:
    completed = subprocess.run(command, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return {
        "command": command,
        "cwd": str(cwd),
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def run_shell(command: str, cwd: Path) -> dict:
    completed = subprocess.run(command, cwd=cwd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    return {
        "command": command,
        "cwd": str(cwd),
        "returncode": completed.returncode,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def add(checks: list[dict], name: str, passed: bool, detail: str = "") -> None:
    checks.append({"name": name, "status": "passed" if passed else "failed", "detail": detail})


def verify_manifest(checks: list[dict]) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    project_ids = {project["id"] for project in manifest.get("projects", [])}
    shared_agents = set(manifest.get("sharedByAgents", []))
    boundaries = set(manifest.get("requiredBoundaries", []))
    add(checks, "manifest-schema", manifest.get("schema") == "agent-octopus-production-representative-sandbox/v1")
    add(checks, "manifest-projects", REQUIRED_PROJECTS.issubset(project_ids), ", ".join(sorted(project_ids)))
    add(checks, "manifest-shared-agents", REQUIRED_SHARED_AGENTS.issubset(shared_agents), ", ".join(sorted(shared_agents)))
    add(checks, "manifest-boundaries", REQUIRED_BOUNDARIES.issubset(boundaries), ", ".join(sorted(boundaries)))
    add(checks, "manifest-release-evidence-rule", "real Git repositories" in manifest.get("releaseEvidenceRule", "") and "mock-only" in manifest.get("releaseEvidenceRule", ""))
    for project in manifest["projects"]:
        template = SANDBOX_ROOT / project["template"]
        add(checks, f"{project['id']}:template-exists", template.exists(), str(template))
        add(checks, f"{project['id']}:package-json", (template / "package.json").exists())
        add(checks, f"{project['id']}:jenkinsfile", (template / "Jenkinsfile").exists())
        add(checks, f"{project['id']}:validation-commands", len(project.get("validation", {}).get("commands", [])) >= 2)
        add(checks, f"{project['id']}:coverage-tags", len(project.get("coverageTags", [])) >= 4)
    return manifest


def verify_generated(checks: list[dict], output_root: Path, include_fault: bool) -> None:
    generated_path = output_root / "generated-projects.json"
    add(checks, "generated-manifest-exists", generated_path.exists(), str(generated_path))
    if not generated_path.exists():
        return
    generated = json.loads(generated_path.read_text(encoding="utf-8"))
    for project in generated.get("projects", []):
        root = Path(project["root"])
        add(checks, f"{project['id']}:generated-root", root.exists(), str(root))
        add(checks, f"{project['id']}:git-repo", (root / ".git").exists())
        status = run(["git", "status", "--short"], root)
        add(checks, f"{project['id']}:git-clean", status["returncode"] == 0 and status["stdout"] == "", status["stdout"])
        for command in project.get("validationCommands", []):
            result = run(command.split(), root)
            add(checks, f"{project['id']}:validate:{command}", result["returncode"] == 0, result["stderr"] or result["stdout"])
        fault_command = project.get("faultInjectionCommand")
        if include_fault and fault_command:
            result = run_shell(fault_command, root)
            add(checks, f"{project['id']}:fault-injection-fails", result["returncode"] != 0, "fault command must fail before repair")


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify production-representative sandbox")
    parser.add_argument("--output-root", default=str(REPO_ROOT / "data" / "production-representative-sandbox"))
    parser.add_argument("--generated", action="store_true", help="verify generated repositories under output root")
    parser.add_argument("--include-fault", action="store_true", help="verify fault injection commands fail as release blockers")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    checks: list[dict] = []
    verify_manifest(checks)
    if args.generated:
        verify_generated(checks, Path(args.output_root).resolve(), args.include_fault)

    failed = [check for check in checks if check["status"] != "passed"]
    result = {"status": "passed" if not failed else "failed", "checks": checks}
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        for check in checks:
            detail = f" - {check['detail']}" if check.get("detail") else ""
            print(f"[{check['status'].upper()}] {check['name']}{detail}")
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
