#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
if (!args.profile) {
  fail("Usage: node scripts/release-coverage-matrix-runner.mjs --profile <octopus.project.json> [--once] [--project-root <path>]");
}

const profilePath = path.resolve(args.profile);
const profile = readJson(profilePath);
const projectRoot = path.resolve(args.projectRoot ?? profile.projectRoot ?? path.dirname(profilePath));
const lifecycleId = profile.lifecycleId;
const tmpRoot = path.join(projectRoot, ".tmp", lifecycleId);
const lifecycleRoot = path.join(projectRoot, "data", "production-lifecycle", lifecycleId);
const artifactRoot = path.join(lifecycleRoot, "artifacts");
const statePath = path.join(lifecycleRoot, "loop-state.json");
const statusPath = path.join(lifecycleRoot, "current-status.md");
const logPath = path.join(tmpRoot, "loop.jsonl");
const textLogPath = path.join(tmpRoot, "loop.log");
const intervalMs = Number(args.intervalMs ?? profile.runner?.intervalMs ?? 30 * 60 * 1000);
const once = Boolean(args.once) || profile.runner?.mode === "once";

fs.mkdirSync(tmpRoot, { recursive: true });
fs.mkdirSync(lifecycleRoot, { recursive: true });
fs.mkdirSync(artifactRoot, { recursive: true });
for (const envFile of profile.envFiles ?? []) loadEnvFile(path.resolve(projectRoot, envFile));
if (profile.auth?.tokenEnv && !process.env[profile.auth.tokenEnv] && profile.auth.defaultToken) {
  process.env[profile.auth.tokenEnv] = profile.auth.defaultToken;
}

if (profile.targetPlanConfirmation?.status !== "confirmed") {
  const state = baseState({
    attempt: initialIteration(),
    currentPhase: "pending-target-plan-confirmation",
    releaseDecision: { status: "BLOCKED" },
    blocker: "BLOCKED: pending loop target plan confirmation",
    nextAction: "Present targetPlan to the user and wait for explicit confirmation or edits."
  });
  writeState(state, []);
  append({ event: "loop.blocked", at: new Date().toISOString(), reason: state.blocker });
  process.exit(2);
}

append({
  event: "loop.started",
  at: new Date().toISOString(),
  agent: "production-lifecycle-governor",
  projectId: profile.projectId,
  releaseTarget: profile.releaseTarget,
  targetPlanConfirmation: "confirmed"
});

let iteration = initialIteration();
while (true) {
  iteration += 1;
  append({ event: "iteration.started", iteration, at: new Date().toISOString() });
  const result = await runIteration(iteration);
  append({ event: "iteration.finished", iteration, at: new Date().toISOString(), result: compactResult(result) });
  writeIterationArtifact(iteration, result);
  writeState(baseState(result), result.decisionChain);
  if (result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO")) {
    append({ event: "loop.finished", at: new Date().toISOString(), status: result.releaseDecision.status, iteration });
    process.exit(0);
  }
  if (once) process.exit(result.blocker ? 1 : 0);
  await sleep(intervalMs);
}

async function runIteration(attempt) {
  const coverageMatrix = [];
  const decisionChain = [];
  const commands = [];
  let latestSummary;
  let releaseEvidence;
  let releaseDecision;

  for (const step of profile.steps ?? []) {
    const phase = step.id;
    let evidence;
    let status = "NOT_RUN";
    let blocker = "";
    let nextRepairAction = "continue";
    let decision = "continue";
    let rationale = "Step completed.";

    try {
      if (step.type === "health" || step.type === "http" || step.type === "boundary") {
        evidence = await runHttpStep(step);
        status = evidence.ok ? "PASS" : "BLOCKED";
        blocker = evidence.ok ? "" : evidence.error ?? `HTTP status ${evidence.status}`;
      } else if (step.type === "command") {
        evidence = await runCommand(step.command, step.args ?? [], { cwd: path.resolve(projectRoot, step.cwd ?? "."), timeoutMs: step.timeoutMs });
        commands.push({ id: step.id, ...evidence });
        status = evidence.code === 0 ? "PASS" : "FAIL";
        blocker = evidence.code === 0 ? "" : `${step.command} ${(step.args ?? []).join(" ")} exited ${evidence.code}`;
      } else if (step.type === "sandbox-verify") {
        const cmdArgs = [path.join(repoRoot, "sandbox", "production-representative", "scripts", "verify-sandbox.py"), "--output-root", path.join(repoRoot, "data", "production-representative-sandbox"), "--generated"];
        if (step.includeFault) cmdArgs.push("--include-fault");
        evidence = await runCommand("python3", cmdArgs, { cwd: repoRoot, timeoutMs: step.timeoutMs ?? 5 * 60 * 1000 });
        commands.push({ id: step.id, ...evidence });
        status = evidence.code === 0 ? "PASS" : "BLOCKED";
        blocker = evidence.code === 0 ? "" : "production representative sandbox verification failed";
      } else if (step.type === "sandbox-register") {
        evidence = await runSandboxRegister(step);
        status = evidence.ok ? "PASS" : "BLOCKED";
        blocker = evidence.ok ? "" : evidence.error ?? "representative project registration failed";
      } else if (step.type === "release-evidence") {
        latestSummary = await fetchJson(step.summaryUrl, { auth: true }).catch((error) => ({ error: String(error.message ?? error) }));
        releaseEvidence = await postJson(step.url, buildReleaseEvidenceBody({ coverageMatrix, latestSummary, attempt }), { auth: true }).catch((error) => ({ error: String(error.message ?? error) }));
        evidence = compactEvidence(releaseEvidence);
        status = releaseEvidence?.error ? "BLOCKED" : "PASS";
        blocker = releaseEvidence?.error ?? "";
      } else if (step.type === "release-decision") {
        const raw = await fetchJson(step.url, { auth: true }).catch((error) => ({ error: String(error.message ?? error) }));
        releaseDecision = pickLatestDecision(raw);
        evidence = compactDecision(releaseDecision) ?? compactEvidence(raw);
        status = releaseDecision ? (releaseDecision.status === (step.goStatus ?? "GO") ? "PASS" : "FAIL") : "BLOCKED";
        blocker = releaseDecision ? `release decision is ${releaseDecision.status}` : "release decision missing";
      } else {
        evidence = { error: `unknown step type ${step.type}` };
        status = "BLOCKED";
        blocker = evidence.error;
      }
    } catch (error) {
      evidence = { error: String(error.message ?? error) };
      status = "BLOCKED";
      blocker = evidence.error;
    }

    if (status !== "PASS") {
      decision = step.required === false ? "continue-with-warning" : "repair blocker";
      rationale = blocker || "Required evidence did not pass.";
      nextRepairAction = step.nextRepairAction ?? "diagnose, repair, and verify this matrix row";
    }

    coverageMatrix.push(row(step, status, blocker, nextRepairAction));
    decisionChain.push(chain(phase, evidence, step.requiredEvidence, ["continue", "repair blocker", "block"], decision, rationale, nextRepairAction));
  }

  const blockerRow = coverageMatrix.find((item) => item.status !== "PASS" && item.required !== false);
  const blocker = blockerRow ? `${blockerRow.capability}/${blockerRow.scenario}: ${blockerRow.blocker}` : "";
  return {
    attempt,
    projectId: profile.projectId,
    releaseTarget: profile.releaseTarget,
    currentPhase: "release-coverage-matrix-loop",
    coverageMatrix,
    decisionChain,
    commands,
    summary: compactSummary(unwrapData(latestSummary)),
    releaseEvidence: compactEvidence(releaseEvidence),
    releaseDecision: compactDecision(releaseDecision),
    blocker,
    nextAction: blocker ? "Continue repair loop at next cadence." : "Continue until product-native release decision reaches GO.",
    updatedAt: new Date().toISOString()
  };
}

async function runHttpStep(step) {
  if (step.envRequired?.length) {
    const missing = step.envRequired.filter((name) => !process.env[name]);
    return { ok: missing.length === 0, envConfigured: Object.fromEntries(step.envRequired.map((name) => [name, Boolean(process.env[name])])), error: missing.length ? `missing env: ${missing.join(", ")}` : undefined };
  }
  const data = await fetchAny(step.url, { auth: step.auth !== false, headers: resolveHeaders(step.headers ?? {}) });
  const ok = matchesExpect(data, step.expect);
  return { ok, status: data.status, body: compactEvidence(data), error: ok ? undefined : "HTTP response did not match expected fields" };
}

async function runSandboxRegister(step) {
  const outputRoot = path.join(repoRoot, "data", "production-representative-sandbox");
  const registerArgs = [
    path.join(repoRoot, "sandbox", "production-representative", "scripts", "register-target.py"),
    "--target", step.target,
    "--base-url", step.baseUrl,
    "--output-root", outputRoot,
    "--profile", path.resolve(repoRoot, step.profile),
    "--apply"
  ];
  const command = await runCommand("python3", registerArgs, { cwd: repoRoot, timeoutMs: step.timeoutMs ?? 5 * 60 * 1000 });
  let parsed;
  try {
    parsed = JSON.parse(command.stdoutText);
  } catch {
    parsed = undefined;
  }
  const registrations = parsed?.registrations ?? [];
  const ok = command.code === 0 && registrations.length > 0 && registrations.every((item) => {
    const body = item.response?.body?.data ?? item.response?.body;
    return item.response?.status >= 200 && item.response?.status < 300 && body?.validation?.status === "VERIFIED";
  });
  return { ok, command, registrations: registrations.map((item) => ({ projectId: item.projectId, status: item.response?.status, validation: (item.response?.body?.data ?? item.response?.body)?.validation?.status })) };
}

function buildReleaseEvidenceBody({ coverageMatrix, latestSummary, attempt }) {
  const now = new Date().toISOString();
  const matrix = coverageMatrix.map((item) => ({
    id: `${item.capability}-${item.scenario}`,
    name: `${item.capability}/${item.scenario}`,
    required: item.required !== false,
    status: item.status === "PASS" ? "PASS" : item.status === "NOT_APPLICABLE" ? "NOT-APPLICABLE" : "FAIL",
    evidence: item.blocker ? [item.blocker] : [item.requiredEvidence],
    updatedAt: now
  }));
  return {
    id: `${profile.projectId}-${profile.releaseTarget.toLowerCase()}-${safeTimestamp(new Date())}-i${attempt}`,
    projectId: profile.projectId,
    target: profile.releaseTarget,
    source: "agent-octopus-toolkit release-coverage-matrix-runner",
    summary: compactSummary(unwrapData(latestSummary)),
    scenarioMatrix: matrix,
    policyEvaluations: matrix.map((item) => ({
      id: `policy-${item.id}`,
      name: item.name,
      status: item.status === "PASS" ? "PASSED" : "FAILED",
      severity: item.status === "PASS" ? "LOW" : "HIGH",
      evidence: item.evidence
    })),
    createdAt: now
  };
}

function writeState(state, decisionChain) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  fs.writeFileSync(statusPath, renderStatus(state, decisionChain), "utf8");
}

function baseState(result) {
  return {
    goal: `${profile.projectId} ${profile.releaseTarget} release coverage matrix loop`,
    finalGoal: profile.targetPlan.finalGoal,
    phaseGoals: profile.targetPlan.phaseGoals,
    currentPhase: result.currentPhase,
    acceptanceCriteria: profile.targetPlan.acceptanceCriteria,
    targetPlan: profile.targetPlan,
    targetPlanConfirmation: profile.targetPlanConfirmation,
    reportCadence: `${Math.floor(intervalMs / 60000)} minute cadence`,
    finalDecision: result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO") ? "DONE" : "PENDING",
    attempt: result.attempt,
    targetProduct: profile.projectId,
    releaseTarget: profile.releaseTarget,
    coverageMatrix: result.coverageMatrix ?? [],
    decisionChain: result.decisionChain ?? [],
    releaseDecision: result.releaseDecision,
    summary: result.summary,
    blocker: result.blocker,
    nextAction: result.nextAction,
    latestArtifact: path.join(artifactRoot, `iteration-${String(result.attempt ?? 0).padStart(4, "0")}.json`),
    stopCondition: result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO") ? "release_target_reached" : "continue_until_go_or_unrepairable_blocker",
    updatedAt: result.updatedAt ?? new Date().toISOString()
  };
}

function writeIterationArtifact(iterationNumber, result) {
  const artifactPath = path.join(artifactRoot, `iteration-${String(iterationNumber).padStart(4, "0")}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(result, null, 2) + "\n", "utf8");
}

function renderStatus(state, decisionChain) {
  return `# ${profile.projectId} ${profile.releaseTarget} Release Coverage Matrix Loop

Updated: ${state.updatedAt}

## Target Plan Confirmation

- Status: ${state.targetPlanConfirmation?.status ?? "missing"}
- Confirmed at: ${state.targetPlanConfirmation?.confirmedAt ?? "unknown"}

## Release Decision

- Status: ${state.releaseDecision?.status ?? "PENDING"}
- ID: ${state.releaseDecision?.id ?? "none"}
- Failed criteria: ${state.releaseDecision?.failedCriteria ?? "unknown"}
- High open risks: ${state.releaseDecision?.highOpenRisks ?? "unknown"}

## Blocker

${state.blocker || "none"}

## Coverage Matrix

${state.coverageMatrix.map((item) => `- ${item.status} ${item.capability}/${item.scenario}: ${item.requiredEvidence}`).join("\n")}

## Latest Phase Decision Chain

${decisionChain.map((item) => `### ${item.phase}

- evidence: ${JSON.stringify(item.evidence).slice(0, 1000)}
- rule: ${item.rule}
- options: ${item.options.join(", ")}
- decision: ${item.decision}
- rationale: ${item.rationale}
- nextAction: ${item.nextAction}
`).join("\n")}
`;
}

function row(step, status, blocker, nextRepairAction) {
  return {
    capability: step.capability ?? step.type,
    scenario: step.scenario ?? step.id,
    connectedProject: step.connectedProject ?? "",
    requiredEvidence: step.requiredEvidence,
    status,
    required: step.required !== false,
    blocker: blocker ? String(blocker).slice(0, 1200) : "",
    nextRepairAction
  };
}

function chain(phase, evidence, rule, options, decision, rationale, nextAction) {
  return { phase, evidence: compactEvidence(evidence), rule, options, decision, rationale, nextAction };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { headers: requestHeaders(options) });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 500)}`);
  return body;
}

async function fetchAny(url, options = {}) {
  const response = await fetch(url, { headers: requestHeaders(options) });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { status: response.status, textTail: tail(text, 1000) };
  }
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 500)}`);
  return body;
}

async function postJson(url, body, options = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...requestHeaders(options), "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${url} returned ${response.status}: ${text.slice(0, 500)}`);
  return parsed;
}

function requestHeaders(options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.auth !== false) {
    const auth = profile.auth ?? {};
    const token = process.env[auth.tokenEnv] ?? auth.defaultToken;
    if (token) headers[auth.header ?? "authorization"] = `${auth.scheme ?? "Bearer"} ${token}`;
  }
  return headers;
}

function resolveHeaders(raw) {
  const headers = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") headers[key] = value;
    else if (value?.env && process.env[value.env]) headers[key] = process.env[value.env];
  }
  return headers;
}

function matchesExpect(data, expect = undefined) {
  if (!expect) return true;
  return Object.entries(expect).every(([key, value]) => getPath(data, key) === value);
}

function getPath(data, dotted) {
  return String(dotted).split(".").reduce((current, key) => current?.[key], data);
}

function pickLatestDecision(raw) {
  const data = unwrapData(raw);
  const items = Array.isArray(data) ? data : data?.items ?? data?.decisions ?? [];
  if (!items.length) return undefined;
  return items[0];
}

function compactDecision(decision) {
  if (!decision) return undefined;
  return {
    id: decision.id,
    status: decision.status,
    failedCriteria: decision.failedCriteria ?? decision.summary?.failedCriteria,
    passedCriteria: decision.passedCriteria ?? decision.summary?.passedCriteria,
    highOpenRisks: decision.highOpenRisks ?? decision.summary?.highOpenRisks,
    createdAt: decision.createdAt
  };
}

function compactSummary(data) {
  if (!data || typeof data !== "object") return data;
  const keys = ["projectCount", "runCount", "evaluationDatasetCount", "opportunityCount", "successfulEvolutionBatchCount", "codeUpgradeCount", "pipelineCount", "releaseBlockedCount", "releaseReadinessScore"];
  return Object.fromEntries(keys.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

function compactEvidence(value, max = 4000) {
  if (value === undefined || value === null) return value;
  const text = JSON.stringify(value);
  if (text.length <= max) return value;
  return { summary: text.slice(0, max), truncatedBytes: text.length - max };
}

function compactResult(result) {
  return {
    loopAgent: "production-lifecycle-governor",
    iteration: result.attempt,
    currentPhase: result.currentPhase,
    releaseDecision: result.releaseDecision,
    summary: result.summary,
    blocker: result.blocker,
    nextAction: result.nextAction
  };
}

async function runCommand(command, commandArgs, options = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, { cwd: options.cwd ?? projectRoot, env: process.env, shell: false });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\nTIMEOUT after ${options.timeoutMs}ms`;
    }, options.timeoutMs ?? 30 * 60 * 1000);
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = { code, durationMs: Date.now() - started, stdoutTail: tail(stdout), stderrTail: tail(stderr) };
      Object.defineProperty(result, "stdoutText", { value: stdout, enumerable: false });
      Object.defineProperty(result, "stderrText", { value: stderr, enumerable: false });
      fs.appendFileSync(textLogPath, `\n\n$ ${command} ${commandArgs.join(" ")}\nexit=${code} durationMs=${result.durationMs}\n--- stdout tail ---\n${result.stdoutTail}\n--- stderr tail ---\n${result.stderrTail}\n`, "utf8");
      resolve(result);
    });
  });
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#") || !line.includes("=")) continue;
    const [key, ...rest] = line.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").trim();
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unwrapData(value) {
  return value?.data ?? value;
}

function initialIteration() {
  try {
    if (!fs.existsSync(statePath)) return 0;
    const state = readJson(statePath);
    return Number.isFinite(Number(state.attempt)) ? Number(state.attempt) : 0;
  } catch {
    return 0;
  }
}

function append(event) {
  fs.appendFileSync(logPath, JSON.stringify(event) + "\n", "utf8");
}

function tail(text, max = 5000) {
  return String(text ?? "").slice(-max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--once") parsed.once = true;
    else if (item.startsWith("--")) parsed[item.slice(2)] = argv[index + 1];
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
