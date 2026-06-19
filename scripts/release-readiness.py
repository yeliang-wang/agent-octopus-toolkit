#!/usr/bin/env python3
"""Run release-readiness checks for the toolkit.

This gate intentionally checks only facts that can be proven from the local
checkout. Competitive positioning belongs in docs; release eligibility belongs
in repeatable contract, generation, eval, install, and metadata checks.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_DIR = REPO_ROOT / "manifests" / "agents"
PLUGIN_DIR = REPO_ROOT / "plugins"
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def run(command: list[str], label: str) -> dict[str, Any]:
    completed = subprocess.run(
        command,
        cwd=REPO_ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return {
        "name": label,
        "status": "passed" if completed.returncode == 0 else "failed",
        "command": command,
        "stdout": completed.stdout.strip(),
        "stderr": completed.stderr.strip(),
    }


def add(checks: list[dict[str, Any]], name: str, passed: bool, detail: str = "") -> None:
    checks.append({"name": name, "status": "passed" if passed else "failed", "detail": detail})


def package_checks() -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    package = read_json(REPO_ROOT / "package.json")
    license_file = REPO_ROOT / "LICENSE"
    add(checks, "package-name", package.get("name") == "agent-octopus-toolkit", str(package.get("name")))
    add(checks, "package-version-semver", bool(SEMVER_RE.match(str(package.get("version", "")))), str(package.get("version")))
    add(checks, "package-public", package.get("private") is not True, "private must not be true for public release metadata")
    add(checks, "package-license", package.get("license") not in {"", None, "UNLICENSED"}, str(package.get("license")))
    add(checks, "license-file", license_file.exists() and "MIT License" in license_file.read_text(encoding="utf-8"), "LICENSE must exist")
    return checks


def lifecycle_checks() -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    agent_lifecycles = {path.stem: read_json(path)["lifecycle"] for path in sorted(MANIFEST_DIR.glob("*.json"))}
    plugin_lifecycles = {path.parent.name: read_json(path)["lifecycle"] for path in sorted(PLUGIN_DIR.glob("*/plugin.json"))}
    experimental_agents = [agent for agent, lifecycle in agent_lifecycles.items() if lifecycle == "experimental"]
    experimental_plugins = [plugin for plugin, lifecycle in plugin_lifecycles.items() if lifecycle == "experimental"]
    add(checks, "agent-lifecycles-release-track", not experimental_agents, ", ".join(experimental_agents))
    add(checks, "plugin-lifecycles-release-track", not experimental_plugins, ", ".join(experimental_plugins))
    add(checks, "agent-count", len(agent_lifecycles) >= 5, str(len(agent_lifecycles)))
    return checks


def loop_plan_checks() -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    for path in sorted(MANIFEST_DIR.glob("*.json")):
        manifest = read_json(path)
        agent_id = manifest["id"]
        loop_contract = manifest.get("loopContract", {})
        codex_goal = manifest.get("runtimeAdapters", {}).get("codexGoal", {})
        required_state = {"goal", "blocker", "nextAction", "stopCondition"}
        project_id = "release-readiness"
        artifacts = [
            str(codex_goal.get("stateArtifact", "")).replace("<projectId>", project_id),
            str(codex_goal.get("statusArtifact", "")).replace("<projectId>", project_id),
            str(codex_goal.get("evidenceRoot", "")).replace("<projectId>", project_id),
        ]
        add(checks, f"{agent_id}:loop-enabled", loop_contract.get("enabled") is True)
        add(checks, f"{agent_id}:codex-goal-supported", codex_goal.get("supported") is True and codex_goal.get("requiresFeature") == "goals")
        add(checks, f"{agent_id}:required-loop-state", required_state.issubset(set(loop_contract.get("stateFields", []))))
        add(checks, f"{agent_id}:artifact-plan", all(item.startswith("data/") for item in artifacts), ", ".join(artifacts))
        add(checks, f"{agent_id}:evidence-and-gates", loop_contract.get("evidenceRequired") is True and loop_contract.get("confirmationGatesPreserved") is True)
    return checks


def docs_checks() -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    release_doc = REPO_ROOT / "docs" / "release-readiness.md"
    baseline_doc = REPO_ROOT / "docs" / "competitive-baseline.md"
    add(checks, "readme-release-section", "Release Readiness" in readme)
    add(checks, "release-readiness-doc", release_doc.exists())
    add(checks, "competitive-baseline-doc", baseline_doc.exists())
    return checks


def command_checks() -> list[dict[str, Any]]:
    checks = [
        run([sys.executable, "scripts/validate-toolkit.py"], "contract-validation"),
        run([sys.executable, "scripts/generate-distributions.py", "--check"], "distribution-generation"),
        run([sys.executable, "scripts/generate-catalog.py", "--check"], "catalog-generation"),
        run([sys.executable, "scripts/evaluate-agents.py"], "deterministic-agent-eval"),
        run(["git", "diff", "--check"], "git-whitespace-check"),
    ]
    codex_status = run([sys.executable, "scripts/octopus-control.py", "codex-status", "--json"], "project-codex-status")
    if codex_status["status"] == "passed":
        try:
            parsed = json.loads(codex_status["stdout"])
        except json.JSONDecodeError:
            codex_status["status"] = "failed"
            codex_status["stderr"] = "codex status did not return JSON"
        else:
            goal_feature = parsed.get("codexGoalFeature", {}).get("goalsFeature")
            drifted = [
                item["id"]
                for item in parsed.get("codexAgents", [])
                if not item.get("installedExists") or not item.get("matchesToolkit")
            ]
            if drifted or goal_feature == "disabled":
                codex_status["status"] = "failed"
                codex_status["stderr"] = f"drifted={drifted} goalsFeature={goal_feature}"
            else:
                codex_status["stdout"] = f"agents current; goalsFeature={goal_feature}"
    checks.append(codex_status)
    return checks


def build_result() -> dict[str, Any]:
    groups = {
        "package": package_checks(),
        "lifecycle": lifecycle_checks(),
        "loopPlans": loop_plan_checks(),
        "docs": docs_checks(),
        "commands": command_checks(),
    }
    failed = [
        f"{group}:{check['name']}"
        for group, checks in groups.items()
        for check in checks
        if check["status"] != "passed"
    ]
    return {
        "schema": "agent-octopus-release-readiness/v1",
        "status": "passed" if not failed else "failed",
        "releaseLevel": "public-beta" if not failed else "not-ready",
        "groups": groups,
        "failedChecks": failed,
    }


def print_human(result: dict[str, Any]) -> None:
    print(f"[{result['status'].upper()}] release-readiness ({result['releaseLevel']})")
    for group, checks in result["groups"].items():
        failed = [check for check in checks if check["status"] != "passed"]
        if failed:
            print(f"- {group}: failed")
            for check in failed:
                detail = check.get("detail") or check.get("stderr") or check.get("stdout") or ""
                print(f"  - {check['name']}: {detail}")
        else:
            print(f"- {group}: passed")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Check release readiness")
    parser.add_argument("--json", action="store_true", help="Print machine-readable release readiness result")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = build_result()
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print_human(result)
    return 0 if result["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
