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


def render_codex_goal_adapter(manifest: dict) -> str:
    adapter = manifest.get("runtimeAdapters", {}).get("codexGoal", {})
    loop_contract = manifest.get("loopContract", {})
    if not adapter.get("supported"):
        return ""
    stop_policies = ", ".join(loop_contract.get("stopPolicies", []))
    state_fields = ", ".join(loop_contract.get("stateFields", []))
    cadence_modes = ", ".join(loop_contract.get("cadenceModes", []))
    goal_window_fields = ", ".join(loop_contract.get("goalWindow", {}).get("fields", []))
    coverage_fields = ", ".join(loop_contract.get("coverageMatrix", {}).get("fields", []))
    repair_actions = ", ".join(loop_contract.get("repairPolicy", {}).get("actions", []))
    decision_chain_fields = ", ".join(loop_contract.get("decisionChain", {}).get("fields", []))
    return f"""

## Codex Goal Runtime Adapter

This agent is Codex-goal compatible without being Codex-only. Treat Codex `/goal` as the outer objective runtime and this agent's Goal-Driven Loop Mode as the inner domain loop protocol.

Codex goal mapping:

- `outerGoal`: {adapter["outerGoal"]}
- `innerLoopAgent`: {adapter["innerLoopAgent"]}
- `requiresFeature`: {adapter["requiresFeature"]}
- `stateArtifact`: {adapter["stateArtifact"]}
- `statusArtifact`: {adapter["statusArtifact"]}
- `evidenceRoot`: {adapter["evidenceRoot"]}
- `resumePolicy`: {adapter["resumePolicy"]}

Loop contract summary:

- `loopCadence` modes: {cadence_modes}
- `goalWindow` fields: {goal_window_fields}
- `coverageMatrix` fields: {coverage_fields}
- `repairPolicy` actions: {repair_actions}
- `decisionChain` fields: {decision_chain_fields}
- `stopPolicies`: {stop_policies}
- `loopState` fields: {state_fields}

When running under Codex `/goal`, establish the loop goal window, release coverage matrix, and per-phase decision chain before starting or resuming: `finalGoal`, `phaseGoals`, `acceptanceCriteria`, `targetPlan`, `targetPlanConfirmation`, `reportCadence`, `finalDecision`, `coverageMatrix`, `evidenceMap`, `blockerPolicy`, `repairPolicy`, `releaseDecision`, and `decisionChain` must be explicit or product-native. Before any loop action starts, present the provided or inferred target plan to the user as a confirmation proposal, including the final target, phase targets, per-phase acceptance criteria, release coverage matrix, evidence sources, blocker policy, repair policy, report cadence, and final decision vocabulary. Mark which parts came from the user, which came from product-native discovery, and which were inferred from context. Require explicit user confirmation before entering the loop. If the target plan is unconfirmed, stop as `BLOCKED: pending loop target plan confirmation`; do not start, resume, or continue the loop until the user confirms or edits the plan. Persist or report `loopState` after every iteration, keep confirmation gates authoritative, and stop instead of bypassing pending user approval, missing evidence, or a declared stop policy. Every phase report must print the decision chain that led to its conclusion: evidence used, rule applied, options considered, chosen decision, rejected alternatives when relevant, and next action. Persist summary state only in `loop-state.json`; large API responses, release decisions, risk registers, logs, screenshots, traces, and full evidence payloads must be externalized to iteration artifacts and referenced by path. JSONL loop logs must record event summaries, not full result payloads. Resume from the persisted attempt and product-native evidence store after restart, and enforce a state size guard before writing state so payload growth cannot terminate the loop. A loop that repeats the same blocker must switch from rerun mode into diagnosis, productized repair, and verification; if that cannot be done under the current permissions, stop as `BLOCKED` or `NO-GO`. Do not claim completion until the final goal, coverage matrix, decision chain, and acceptance criteria are evidence-proven. Do not weaken this agent's domain boundary merely because the outer runtime is continuous.
"""


def render_codex_toml(manifest: dict) -> str:
    source = REPO_ROOT / manifest["source"]["claudeMarkdown"]
    metadata, body = parse_frontmatter(source)
    body = body + render_codex_goal_adapter(manifest)
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
