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
const lifecycleRoot = path.join(projectRoot, "data", "release-coverage", lifecycleId);
const artifactRoot = path.join(lifecycleRoot, "artifacts");
const statePath = path.join(lifecycleRoot, "loop-state.json");
const statusPath = path.join(lifecycleRoot, "current-status.md");
const finalReportPath = path.resolve(projectRoot, profile.runner?.finalReports?.markdown ?? path.join(lifecycleRoot, "final-report.md"));
const finalReportJsonPath = path.resolve(projectRoot, profile.runner?.finalReports?.json ?? path.join(lifecycleRoot, "final-report.json"));
const logPath = path.join(tmpRoot, "loop.jsonl");
const textLogPath = path.join(tmpRoot, "loop.log");
const intervalMs = Number(args.intervalMs ?? profile.runner?.intervalMs ?? 30 * 60 * 1000);
const once = Boolean(args.once) || profile.runner?.mode === "once";
const blockerPolicy = profile.runner?.blockerPolicy ?? {};
const managedServices = [];
let shuttingDown = false;

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
  agent: "octopus-release-runner",
  projectId: profile.projectId,
  releaseTarget: profile.releaseTarget,
  targetPlanConfirmation: "confirmed"
});

process.on("SIGINT", () => {
  finish(130);
});
process.on("SIGTERM", () => {
  finish(143);
});

await startManagedServices();

let iteration = initialIteration();
while (true) {
  iteration += 1;
  append({ event: "iteration.started", iteration, at: new Date().toISOString() });
  const result = await runIteration(iteration);
  append({ event: "iteration.finished", iteration, at: new Date().toISOString(), result: compactResult(result) });
  writeIterationArtifact(iteration, result);
  writeState(baseState(result), result.decisionChain);
  if (result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO")) {
    writeFinalReport(result, "release-target-reached");
    append({ event: "loop.finished", at: new Date().toISOString(), status: result.releaseDecision.status, iteration, finalReport: finalReportPath });
    await finish(0);
  }
  if (once) {
    writeFinalReport(result, result.blocker ? "single-run-blocked" : "single-run-complete");
    append({ event: "loop.finished", at: new Date().toISOString(), status: result.releaseDecision?.status ?? "PENDING", iteration, finalReport: finalReportPath });
    await finish(result.blocker ? 1 : 0);
  }
  const blockerStop = evaluateBlockerStop(result);
  if (blockerStop.stop) {
    const stoppedResult = withLoopControl(result, blockerStop);
    writeIterationArtifact(iteration, stoppedResult);
    writeState(baseState(stoppedResult), stoppedResult.decisionChain);
    writeFinalReport(stoppedResult, blockerStop.terminalReason);
    append({
      event: "loop.paused_for_repair",
      at: new Date().toISOString(),
      status: stoppedResult.releaseDecision?.status ?? "PENDING",
      iteration,
      blocker: stoppedResult.blocker,
      policy: blockerStop.policy,
      repairWorkflows: summarizeWorkflowTypes(stoppedResult.repairWorkflows ?? []),
      finalReport: finalReportPath
    });
    await finish(blockerStop.exitCode);
  }
  await sleep(intervalMs);
}

async function finish(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  await stopManagedServices();
  process.exit(code);
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
        evidence = await runCommand(step.command, step.args ?? [], { cwd: path.resolve(projectRoot, step.cwd ?? "."), timeoutMs: step.timeoutMs, env: step.env, envUnset: step.envUnset });
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
        releaseEvidence = await postJson(step.url, buildReleaseEvidenceBody({ step, coverageMatrix, latestSummary, attempt }), { auth: true }).catch((error) => ({ error: String(error.message ?? error) }));
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
  const compactReleaseDecision = compactDecision(releaseDecision) ?? profileFinalReportDecision(coverageMatrix, blocker, attempt);
  const result = {
    attempt,
    projectId: profile.projectId,
    releaseTarget: profile.releaseTarget,
    currentPhase: "release-coverage-matrix-loop",
    coverageMatrix,
    decisionChain,
    commands,
    summary: compactSummary(unwrapData(latestSummary)),
    releaseEvidence: compactEvidence(releaseEvidence),
    releaseDecision: compactReleaseDecision,
    blocker,
    repairWorkflows: [],
    nextAction: blocker ? "Continue repair loop at next cadence." : "Continue until product-native release decision reaches GO.",
    updatedAt: new Date().toISOString()
  };
  result.repairWorkflows = buildRepairWorkflows(result);
  if (result.repairWorkflows.length > 0) {
    result.nextAction = summarizeWorkflowNextAction(result.repairWorkflows);
  }
  result.targetPlanSummary = buildIterationTargetPlanSummary(result);
  return result;
}

async function startManagedServices() {
  for (const service of profile.services ?? []) {
    const healthUrl = service.healthUrl;
    if (healthUrl && await serviceHealthOk(healthUrl, service).catch(() => false)) {
      append({ event: "service.already_running", at: new Date().toISOString(), id: service.id, healthUrl });
      managedServices.push({ id: service.id, external: true });
      continue;
    }
    const cwd = path.resolve(projectRoot, service.cwd ?? ".");
    const env = buildCommandEnv(service);
    const logFile = path.resolve(projectRoot, service.logFile ?? path.join(".tmp", lifecycleId, `${service.id}.log`));
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    const logStream = fs.createWriteStream(logFile, { flags: "a" });
    const child = spawn(service.command, service.args ?? [], {
      cwd,
      env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.pipe(logStream, { end: false });
    child.stderr.pipe(logStream, { end: false });
    const record = { id: service.id, child, logStream, logFile };
    managedServices.push(record);
    append({ event: "service.started", at: new Date().toISOString(), id: service.id, pid: child.pid, command: [service.command, ...(service.args ?? [])], logFile });
    child.on("exit", (code, signal) => {
      append({ event: "service.exited", at: new Date().toISOString(), id: service.id, code, signal, logFile });
    });
    const ready = healthUrl ? await waitForServiceHealth(healthUrl, service) : { ok: true };
    if (!ready.ok) {
      append({ event: "service.health_failed", at: new Date().toISOString(), id: service.id, healthUrl, error: ready.error, logFile });
    }
  }
}

async function stopManagedServices() {
  for (const service of [...managedServices].reverse()) {
    if (service.external || !service.child) continue;
    if (service.child.exitCode === null && !service.child.killed) {
      service.child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => service.child.once("exit", resolve)),
        sleep(5000).then(() => {
          if (service.child.exitCode === null && !service.child.killed) service.child.kill("SIGKILL");
        })
      ]);
    }
    service.logStream?.end();
  }
}

async function waitForServiceHealth(url, service) {
  const timeoutMs = Number(service.readyTimeoutMs ?? 60_000);
  const pollMs = Number(service.readyPollMs ?? 1000);
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    const ok = await serviceHealthOk(url, service).catch((error) => {
      lastError = String(error.message ?? error);
      return false;
    });
    if (ok) return { ok: true };
    const current = managedServices.find((item) => item.id === service.id);
    if (current?.child?.exitCode !== null) {
      return { ok: false, error: `service exited before healthy with code ${current.child.exitCode}` };
    }
    await sleep(pollMs);
  }
  return { ok: false, error: lastError || `health check timed out after ${timeoutMs}ms` };
}

async function serviceHealthOk(url, service = {}) {
  const data = await fetchAny(url, { auth: service.auth === true, headers: resolveHeaders(service.headers ?? {}) });
  return matchesExpect(data, service.expect ?? { status: "UP" });
}

function profileFinalReportDecision(coverageMatrix, blocker, attempt) {
  if (profile.releaseDecision?.mode !== "profile-final-report") return undefined;
  const requiredRows = coverageMatrix.filter((item) => item.required !== false);
  const failedRows = requiredRows.filter((item) => item.status !== "PASS");
  const status = failedRows.length === 0 ? (profile.releaseDecision?.goStatus ?? "GO") : "BLOCKED";
  return {
    id: `${profile.projectId}-${profile.releaseTarget.toLowerCase()}-profile-final-report-i${attempt}`,
    status,
    failedCriteria: failedRows.length,
    highOpenRisks: status === "GO" ? 0 : failedRows.length,
    source: profile.releaseDecision?.source ?? "runner coverage matrix and final report",
    evidence: blocker || `${requiredRows.length}/${requiredRows.length} required coverage rows passed`
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

function buildReleaseEvidenceBody({ step, coverageMatrix, latestSummary, attempt }) {
  const now = new Date().toISOString();
  const matrix = coverageMatrix.map((item) => ({
    id: `${item.capability}-${item.scenario}`,
    name: `${item.capability}/${item.scenario}`,
    required: item.required !== false,
    status: item.status === "PASS" ? "PASS" : item.status === "NOT_APPLICABLE" ? "NOT-APPLICABLE" : "FAIL",
    evidence: item.blocker ? [item.blocker] : [item.requiredEvidence],
    updatedAt: now
  }));
  const fileEvidence = readReleaseEvidenceFile(step.releaseEvidenceFile);
  return {
    id: `${profile.projectId}-${profile.releaseTarget.toLowerCase()}-${safeTimestamp(new Date())}-i${attempt}`,
    projectId: profile.projectId,
    target: profile.releaseTarget,
    source: "octopus-agentops release-coverage-matrix-runner",
    summary: compactSummary(unwrapData(latestSummary)),
    scenarioMatrix: [
      ...matrix,
      ...(Array.isArray(step.scenarioMatrix) ? step.scenarioMatrix : []),
      ...(Array.isArray(fileEvidence.scenarioMatrix) ? fileEvidence.scenarioMatrix : [])
    ],
    policyEvaluations: matrix.map((item) => ({
      id: `policy-${item.id}`,
      name: item.name,
      status: item.status === "PASS" ? "PASSED" : "FAILED",
      severity: item.status === "PASS" ? "LOW" : "HIGH",
      evidence: item.evidence
    })),
    artifactPaths: [
      ...(Array.isArray(step.artifactPaths) ? step.artifactPaths : []),
      ...(Array.isArray(fileEvidence.artifactPaths) ? fileEvidence.artifactPaths : [])
    ],
    createdAt: now
  };
}

function readReleaseEvidenceFile(rawPath) {
  if (!rawPath) return {};
  const filePath = path.resolve(projectRoot, rawPath);
  if (!fs.existsSync(filePath)) return {};
  return readJson(filePath);
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
    repairWorkflows: result.repairWorkflows ?? [],
    loopControl: result.loopControl,
    latestArtifact: path.join(artifactRoot, `iteration-${String(result.attempt ?? 0).padStart(4, "0")}.json`),
    iterationPlanTargetSummaries: collectIterationTargetPlanSummaries(result),
    finalReport: {
      markdown: finalReportPath,
      json: finalReportJsonPath,
      status: result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO") ? "available" : "pending"
    },
    stopCondition: result.loopControl?.status === "PAUSED_FOR_REPAIR"
      ? "paused_for_repair_before_resume"
      : result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO")
        ? "release_target_reached"
        : "continue_until_go_or_unrepairable_blocker",
    updatedAt: result.updatedAt ?? new Date().toISOString()
  };
}

function writeIterationArtifact(iterationNumber, result) {
  const artifactPath = path.join(artifactRoot, `iteration-${String(iterationNumber).padStart(4, "0")}.json`);
  fs.writeFileSync(artifactPath, JSON.stringify(result, null, 2) + "\n", "utf8");
}

function writeFinalReport(result, terminalReason) {
  const iterationSummaries = collectIterationTargetPlanSummaries(result);
  const report = {
    schema: "agent-octopus-final-release-report/v1",
    projectId: profile.projectId,
    releaseTarget: profile.releaseTarget,
    lifecycleId,
    terminalReason,
    generatedAt: new Date().toISOString(),
    targetPlan: profile.targetPlan,
    targetPlanConfirmation: profile.targetPlanConfirmation,
    releaseDecision: result.releaseDecision,
    finalTargetSummary: buildFinalTargetSummary(result, iterationSummaries),
    iterationPlanTargetSummaries: iterationSummaries,
    coverageMatrix: result.coverageMatrix ?? [],
    decisionChain: result.decisionChain ?? [],
    summary: result.summary,
    blocker: result.blocker,
    nextAction: result.nextAction,
    repairWorkflows: result.repairWorkflows ?? [],
    artifacts: {
      lifecycleRoot,
      status: statusPath,
      state: statePath,
      iterationArtifacts: artifactRoot,
      finalReport: finalReportPath,
      finalReportJson: finalReportJsonPath,
      loopLog: logPath,
      commandLog: textLogPath
    },
    productionReleaseRule: "No mock, fake, stub, simulator, fixture-only, demo-only, smoke-only, or chat-only evidence is counted as production release proof."
  };
  fs.mkdirSync(path.dirname(finalReportPath), { recursive: true });
  fs.mkdirSync(path.dirname(finalReportJsonPath), { recursive: true });
  fs.writeFileSync(finalReportJsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  fs.writeFileSync(finalReportPath, renderFinalReport(report), "utf8");
}

function buildIterationTargetPlanSummary(result) {
  const matrix = result.coverageMatrix ?? [];
  const requiredRows = matrix.filter((item) => item.required !== false);
  const passedRows = requiredRows.filter((item) => item.status === "PASS");
  const failedRows = requiredRows.filter((item) => item.status !== "PASS");
  return {
    iteration: result.attempt,
    updatedAt: result.updatedAt,
    finalGoal: profile.targetPlan.finalGoal,
    releaseTarget: profile.releaseTarget,
    phaseGoals: profile.targetPlan.phaseGoals,
    acceptanceCriteria: profile.targetPlan.acceptanceCriteria,
    coverage: {
      required: requiredRows.length,
      passed: passedRows.length,
      failedOrBlocked: failedRows.length
    },
    releaseDecision: result.releaseDecision?.status ?? "PENDING",
    blocker: result.blocker || "",
    targetAlignment: result.releaseDecision?.status === (profile.releaseDecision?.goStatus ?? "GO") ? "GA_RELEASE_TARGET_REACHED" : "GA_RELEASE_TARGET_NOT_REACHED",
    artifact: path.join(artifactRoot, `iteration-${String(result.attempt ?? 0).padStart(4, "0")}.json`)
  };
}

function buildFinalTargetSummary(result, iterationSummaries) {
  const latest = iterationSummaries.at(-1) ?? buildIterationTargetPlanSummary(result);
  const goStatus = profile.releaseDecision?.goStatus ?? "GO";
  return {
    finalGoal: profile.targetPlan.finalGoal,
    finalDecision: result.releaseDecision?.status ?? "PENDING",
    targetReached: result.releaseDecision?.status === goStatus,
    loopControl: result.loopControl,
    totalIterations: iterationSummaries.length,
    latestIteration: latest.iteration,
    latestCoverage: latest.coverage,
    blocker: result.blocker || "",
    unmetAcceptanceCriteria: latest.targetAlignment === "GA_RELEASE_TARGET_REACHED" ? [] : profile.targetPlan.acceptanceCriteria,
    conclusion: result.releaseDecision?.status === goStatus
      ? `${profile.releaseTarget} Release Target reached.`
      : result.loopControl?.status === "PAUSED_FOR_REPAIR"
        ? `${profile.releaseTarget} Release Target not reached; loop paused for productized repair before resume.`
        : `${profile.releaseTarget} Release Target not reached.`
  };
}

function collectIterationTargetPlanSummaries(currentResult) {
  const summaries = [];
  if (fs.existsSync(artifactRoot)) {
    for (const fileName of fs.readdirSync(artifactRoot).filter((name) => /^iteration-\d+\.json$/.test(name)).sort()) {
      try {
        const artifact = readJson(path.join(artifactRoot, fileName));
        summaries.push(artifact.targetPlanSummary ?? buildIterationTargetPlanSummary(artifact));
      } catch {
        // Ignore corrupt in-progress artifacts; the latest state still records the active blocker.
      }
    }
  }
  if (currentResult && !summaries.some((item) => Number(item.iteration) === Number(currentResult.attempt))) {
    summaries.push(currentResult.targetPlanSummary ?? buildIterationTargetPlanSummary(currentResult));
  }
  return summaries.slice(-200);
}

function renderFinalReport(report) {
  return `# ${report.projectId} ${report.releaseTarget} Release Target Final Report

Generated: ${report.generatedAt}

## Final Target Summary

- Final goal: ${report.finalTargetSummary.finalGoal}
- Final decision: ${report.finalTargetSummary.finalDecision}
- Target reached: ${report.finalTargetSummary.targetReached ? "yes" : "no"}
- Total iterations summarized: ${report.finalTargetSummary.totalIterations}
- Latest iteration: ${report.finalTargetSummary.latestIteration ?? "unknown"}
- Required coverage: ${report.finalTargetSummary.latestCoverage?.passed ?? 0}/${report.finalTargetSummary.latestCoverage?.required ?? 0} passed
- Blocker: ${report.finalTargetSummary.blocker || "none"}
- Loop control: ${report.finalTargetSummary.loopControl?.status ?? "RUNNING"}
- Conclusion: ${report.finalTargetSummary.conclusion}

## Repair Workflows

${renderRepairWorkflowsMarkdown(report.repairWorkflows ?? [])}

## Target Plan

- Confirmation: ${report.targetPlanConfirmation?.status ?? "missing"}
- Confirmed at: ${report.targetPlanConfirmation?.confirmedAt ?? "unknown"}
- Release target: ${report.releaseTarget}
- Final decision vocabulary: ${(report.targetPlan.finalDecision ?? []).join(", ")}

### Phase Targets

${(report.targetPlan.phaseGoals ?? []).map((item, index) => `${index + 1}. ${item}`).join("\n")}

### Acceptance Criteria

${(report.targetPlan.acceptanceCriteria ?? []).map((item) => `- ${item}`).join("\n")}

## Loop Plan/Target Iteration Summary

| Iteration | Updated At | Release Decision | Coverage | Target Alignment | Blocker |
| --- | --- | --- | --- | --- | --- |
${report.iterationPlanTargetSummaries.map((item) => `| ${item.iteration} | ${item.updatedAt ?? ""} | ${item.releaseDecision ?? "PENDING"} | ${item.coverage?.passed ?? 0}/${item.coverage?.required ?? 0} | ${item.targetAlignment ?? "unknown"} | ${escapeTable(item.blocker || "none")} |`).join("\n")}

## Latest Coverage Matrix

${(report.coverageMatrix ?? []).map((item) => `- ${item.status} ${item.capability}/${item.scenario}: ${item.requiredEvidence}${item.blocker ? `; blocker=${item.blocker}` : ""}`).join("\n")}

## Latest Phase Decision Chain

${(report.decisionChain ?? []).map((item) => `### ${item.phase}

- rule: ${item.rule}
- decision: ${item.decision}
- rationale: ${item.rationale}
- nextAction: ${item.nextAction}
`).join("\n")}

## Artifacts

- State: ${report.artifacts.state}
- Current status: ${report.artifacts.status}
- Iteration artifacts: ${report.artifacts.iterationArtifacts}
- JSON report: ${report.artifacts.finalReportJson}
- Loop log: ${report.artifacts.loopLog}
- Command log: ${report.artifacts.commandLog}

## Production Release Evidence Rule

${report.productionReleaseRule}
`;
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

## Loop Control

- Status: ${state.loopControl?.status ?? "RUNNING"}
- Policy: ${state.loopControl?.policy ?? "continue"}
- Reason: ${state.loopControl?.reason ?? "none"}
- Resume command: ${state.loopControl?.resumeCommand ?? "none"}

## Repair Workflows

${renderRepairWorkflowsMarkdown(state.repairWorkflows ?? state.loopControl?.repairWorkflows ?? [])}

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

function evaluateBlockerStop(result) {
  if (!result.blocker) return { stop: false };
  const mode = blockerPolicy.mode ?? "continue";
  if (mode === "continue") return { stop: false };

  if (mode === "stop-on-required-blocker") {
    return blockerStop("required-blocker", "blocked-requires-repair");
  }

  if (mode === "stop-on-repeated-blocker") {
    const threshold = Math.max(1, Number(blockerPolicy.repeatedThreshold ?? 2));
    if (countConsecutiveBlocker(result.blocker) >= threshold) {
      return blockerStop(`repeated-blocker-${threshold}`, "repeated-blocker-requires-repair");
    }
  }

  return { stop: false };
}

function blockerStop(policy, terminalReason) {
  return {
    stop: true,
    policy,
    terminalReason,
    exitCode: Number(blockerPolicy.exitCode ?? 2),
    reason: blockerPolicy.reason ?? "Required release coverage blocker must be repaired before the next loop run."
  };
}

function countConsecutiveBlocker(blocker) {
  let count = 0;
  if (!fs.existsSync(artifactRoot)) return count;
  const files = fs.readdirSync(artifactRoot).filter((name) => /^iteration-\d+\.json$/.test(name)).sort().reverse();
  for (const fileName of files) {
    try {
      const artifact = readJson(path.join(artifactRoot, fileName));
      if (artifact.blocker === blocker) count += 1;
      else break;
    } catch {
      break;
    }
  }
  return count;
}

function withLoopControl(result, blockerStopResult) {
  const resumeCommand = `npm --prefix ${repoRoot} run release:runner -- --profile ${profilePath}`;
  const repairWorkflows = result.repairWorkflows?.length ? result.repairWorkflows : buildRepairWorkflows(result);
  return {
    ...result,
    repairWorkflows,
    nextAction: summarizeWorkflowNextAction(repairWorkflows) || blockerPolicy.nextAction || "Stop the loop, repair the product blocker, verify targeted evidence, then resume the runner.",
    loopControl: {
      status: "PAUSED_FOR_REPAIR",
      policy: blockerStopResult.policy,
      reason: blockerStopResult.reason,
      blocker: result.blocker,
      repairRequired: true,
      repairWorkflows,
      resumeCommand,
      pausedAt: new Date().toISOString()
    }
  };
}

function buildRepairWorkflows(result) {
  if (!result.blocker) return [];
  const now = new Date().toISOString();
  const workflows = [];
  const failedRows = (result.coverageMatrix ?? []).filter((item) => item.required !== false && item.status !== "PASS");
  for (const rowItem of failedRows) {
    if (`${rowItem.capability}/${rowItem.scenario}`.toLowerCase().includes("release-decision") && result.releaseDecision?.failedCriteriaDetails?.length) continue;
    workflows.push(workflowForMatrixRow(rowItem, result, now));
  }
  for (const criterion of result.releaseDecision?.failedCriteriaDetails ?? []) {
    workflows.push(workflowForReleaseCriterion(criterion, result, now));
  }
  return dedupeWorkflows(workflows).map((workflow, index) => ({
    ...workflow,
    id: `${result.projectId}-${result.releaseTarget.toLowerCase()}-repair-${String(result.attempt).padStart(4, "0")}-${index + 1}-${workflow.type}`,
    createdAt: now
  }));
}

function workflowForMatrixRow(rowItem, result, now) {
  const key = `${rowItem.capability}/${rowItem.scenario}`.toLowerCase();
  if (key.includes("production-e2e")) {
    return repairWorkflow({
      type: "product-defect",
      severity: "P0",
      summary: "Production E2E failed on a required real-boundary release row.",
      blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
      ownerAgent: "octopus-release-runner",
      commands: ["npm run check", "npm run test:e2e:production"],
      evidenceRequired: [
        "production E2E exits 0 with real LLM, SCM, code-upgrader, and Jenkins boundaries",
        "changed product code or configuration is committed before loop resume",
        "no mock/fake/stub/simulator/fixture-only proof is counted"
      ],
      steps: [
        step("diagnose", "Read the failing iteration artifact, command stderr tail, and product runtime logs to identify the exact product defect."),
        step("repair", "Patch the product code/configuration that caused the E2E failure; do not weaken release criteria."),
        step("verify", "Run npm run check and npm run test:e2e:production successfully."),
        step("resume", "Resume the release runner only after targeted verification passes.")
      ],
      resumeAllowedWhen: "Targeted product verification and production E2E both pass."
    });
  }
  if (key.includes("npm-check") || key.includes("repository")) {
    return repairWorkflow({
      type: "repository-quality",
      severity: "P0",
      summary: "Repository quality gate failed.",
      blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
      ownerAgent: "octopus-release-runner",
      commands: ["npm run check"],
      evidenceRequired: ["npm run check exits 0"],
      steps: [
        step("diagnose", "Inspect the failing check output and identify the broken package or test."),
        step("repair", "Fix the code, tests, or generated assets without bypassing the check."),
        step("verify", "Run npm run check successfully."),
        step("resume", "Resume the release runner after the quality gate passes.")
      ],
      resumeAllowedWhen: "Repository quality gate exits 0."
    });
  }
  if (key.includes("jenkins") || key.includes("pipeline")) {
    return repairWorkflow({
      type: "external-ci-boundary",
      severity: "P0",
      summary: "Required Jenkins/CI boundary did not pass.",
      blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
      ownerAgent: "scm-sync-governor",
      commands: [],
      evidenceRequired: ["Jenkins endpoint/job is reachable through the real configured boundary", "pipeline run succeeds or produces actionable failure logs"],
      steps: [
        step("diagnose", "Inspect Jenkins connectivity, credentials, job name, parameters, and latest build logs."),
        step("repair", "Fix connector configuration, job parameters, or the product pipeline definition."),
        step("verify", "Trigger or query the real Jenkins job and capture successful boundary evidence."),
        step("resume", "Resume only after Jenkins evidence is real and passing.")
      ],
      resumeAllowedWhen: "Real Jenkins boundary and required job evidence are passing."
    });
  }
  if (key.includes("gitlab") || key.includes("github") || key.includes("scm")) {
    return repairWorkflow({
      type: "scm-boundary",
      severity: "P0",
      summary: "Required SCM boundary did not pass.",
      blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
      ownerAgent: "scm-sync-governor",
      commands: [],
      evidenceRequired: ["SCM API is reachable with the configured token", "repository branch/MR operations are proven through the real provider"],
      steps: [
        step("diagnose", "Inspect SCM token, repository settings, branch permissions, and API response."),
        step("repair", "Fix credentials, repository registration, branch policy, or provider configuration."),
        step("verify", "Run the real SCM boundary check and capture provider response evidence."),
        step("resume", "Resume after SCM evidence is passing.")
      ],
      resumeAllowedWhen: "Real SCM boundary evidence is passing."
    });
  }
  if (key.includes("llm") || key.includes("glm")) {
    return repairWorkflow({
      type: "llm-boundary",
      severity: "P0",
      summary: "Required LLM boundary did not pass.",
      blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
      ownerAgent: "mcp-e2e-governor",
      commands: [],
      evidenceRequired: ["LLM provider, model, and API key are configured", "a real invocation trace succeeds without printing secrets"],
      steps: [
        step("diagnose", "Inspect provider/model resolution, API key availability, and latest LLM error."),
        step("repair", "Fix LLM route configuration, credentials, prompt contract, or output parsing."),
        step("verify", "Run a real LLM-backed check and capture invocation metadata."),
        step("resume", "Resume after real LLM evidence is passing.")
      ],
      resumeAllowedWhen: "Real LLM invocation chain passes."
    });
  }
  if (key.includes("health") || key.includes("runtime") || key.includes("code-upgrader")) {
    return repairWorkflow({
      type: "runtime-health",
      severity: "P0",
      summary: "Required runtime health check failed.",
      blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
      ownerAgent: "octopus-release-runner",
      commands: [],
      evidenceRequired: ["required health endpoint returns UP"],
      steps: [
        step("diagnose", "Inspect process, port, runtime mode, data root, and health endpoint response."),
        step("repair", "Fix runtime configuration or product startup failure."),
        step("verify", "Confirm the real health endpoint returns UP."),
        step("resume", "Resume after runtime health is stable.")
      ],
      resumeAllowedWhen: "Required runtime health endpoint returns UP."
    });
  }
  return repairWorkflow({
    type: "coverage-evidence-gap",
    severity: "P1",
    summary: "Required release coverage row did not pass.",
    blocker: `${rowItem.capability}/${rowItem.scenario}: ${rowItem.blocker}`,
    ownerAgent: "octopus-release-runner",
    commands: [],
    evidenceRequired: [rowItem.requiredEvidence],
    steps: [
      step("diagnose", "Inspect the failed coverage row and determine whether this is a product defect or missing real evidence."),
      step("repair", "Productize the missing behavior or collect the required real evidence."),
      step("verify", "Run the targeted coverage check successfully."),
      step("resume", "Resume after the row is PASS or explicitly NO-GO with real evidence.")
    ],
    resumeAllowedWhen: "The required coverage row has real passing evidence or a documented terminal NO-GO."
  });
}

function workflowForReleaseCriterion(criterion, result, now) {
  const id = String(criterion.id ?? criterion.name ?? "").toLowerCase();
  if (id.includes("soak")) {
    return repairWorkflow({
      type: "soak-governance",
      severity: "P1",
      summary: "GA soak duration has not reached the configured release target.",
      blocker: `${criterion.id}: actual=${criterion.actual}, target=${criterion.target}`,
      ownerAgent: "octopus-release-runner",
      commands: [],
      evidenceRequired: ["successful soak seconds reach the configured target", "soak evidence is from the product-native release decision"],
      steps: [
        step("diagnose", "Confirm current succeeded soak seconds and whether the soak clock is advancing."),
        step("repair", "If soak is not advancing, repair the soak/evidence ingestion path; otherwise keep the loop in soak governance instead of product-defect repair."),
        step("verify", "Refresh /api/v1/release/decisions and confirm succeededSoakSeconds increases or reaches target."),
        step("resume", "Resume or continue only according to soak governance status.")
      ],
      resumeAllowedWhen: "Soak is advancing correctly or target soak seconds are satisfied."
    });
  }
  if (id.includes("required-scenarios")) {
    return repairWorkflow({
      type: "scenario-evidence-gap",
      severity: "P0",
      summary: "Required GA scenarios are missing or not passing.",
      blocker: `${criterion.id}: ${formatEvidence(criterion.evidence)}`,
      ownerAgent: "mcp-e2e-governor",
      commands: [],
      evidenceRequired: ["llm-failure-containment, scm-failure-containment, rollback, and other required scenarios have real PASS evidence"],
      steps: [
        step("diagnose", "List each NOT-RUN/FAIL scenario from the release decision and map it to the missing product path."),
        step("repair", "Implement or execute the real scenario workflow; do not substitute smoke-only or fixture-only checks."),
        step("verify", "Generate product-native release evidence showing each required scenario as PASS."),
        step("resume", "Resume after required scenarios are PASS or explicitly terminal NO-GO with real evidence.")
      ],
      resumeAllowedWhen: "All required GA scenarios are product-native PASS or terminally justified."
    });
  }
  if (id.includes("risk")) {
    return repairWorkflow({
      type: "risk-closure",
      severity: "P0",
      summary: "High or critical open release risks remain.",
      blocker: `${criterion.id}: ${formatEvidence(criterion.evidence)}`,
      ownerAgent: "octopus-release-runner",
      commands: [],
      evidenceRequired: ["high/critical open risks are closed, downgraded with evidence, or accepted through an explicit release decision"],
      steps: [
        step("diagnose", "Inspect the release risk register and identify each high/critical open risk."),
        step("repair", "Close the risk through product fix, verified mitigation, or explicit governance decision."),
        step("verify", "Regenerate release evidence and confirm highOpenRisks is zero or accepted by policy."),
        step("resume", "Resume after risk closure evidence is product-native.")
      ],
      resumeAllowedWhen: "No unaccepted high/critical open risks remain."
    });
  }
  return repairWorkflow({
    type: "release-criterion",
    severity: "P1",
    summary: "A required release decision criterion failed.",
    blocker: `${criterion.id}: actual=${criterion.actual}, target=${criterion.target}`,
    ownerAgent: "octopus-release-runner",
    commands: [],
    evidenceRequired: criterion.evidence ?? [],
    steps: [
      step("diagnose", "Inspect the failed release criterion and source evidence."),
      step("repair", "Fix the product, evidence, or governance gap behind the criterion."),
      step("verify", "Regenerate the release decision and confirm the criterion passes."),
      step("resume", "Resume after the release criterion is resolved.")
    ],
    resumeAllowedWhen: "The failed release criterion is resolved in /api/v1/release/decisions."
  });
}

function repairWorkflow(fields) {
  return {
    type: fields.type,
    severity: fields.severity,
    summary: fields.summary,
    blocker: fields.blocker,
    ownerAgent: fields.ownerAgent,
    stopLoop: true,
    repairRequired: true,
    resumeAllowedWhen: fields.resumeAllowedWhen,
    commands: fields.commands ?? [],
    evidenceRequired: fields.evidenceRequired ?? [],
    steps: fields.steps ?? []
  };
}

function step(action, instruction) {
  return { action, instruction };
}

function dedupeWorkflows(workflows) {
  const seen = new Set();
  return workflows.filter((workflow) => {
    const key = `${workflow.type}:${workflow.blocker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function summarizeWorkflowNextAction(workflows) {
  if (!workflows.length) return "";
  const types = summarizeWorkflowTypes(workflows).join(", ");
  return `Stop the matrix loop, execute repair workflow(s) by blocker type [${types}], verify required real evidence, then resume the runner.`;
}

function summarizeWorkflowTypes(workflows) {
  return [...new Set(workflows.map((workflow) => workflow.type))];
}

function renderRepairWorkflowsMarkdown(workflows) {
  if (!workflows.length) return "- none";
  return workflows.map((workflow) => [
    `### ${workflow.type}`,
    "",
    `- Severity: ${workflow.severity}`,
    `- Owner agent: ${workflow.ownerAgent}`,
    `- Summary: ${workflow.summary}`,
    `- Blocker: ${workflow.blocker}`,
    `- Resume allowed when: ${workflow.resumeAllowedWhen}`,
    `- Commands: ${workflow.commands?.length ? workflow.commands.join("; ") : "none"}`,
    "- Evidence required:",
    ...(workflow.evidenceRequired ?? []).map((item) => `  - ${item}`),
    "- Steps:",
    ...(workflow.steps ?? []).map((item) => `  - ${item.action}: ${item.instruction}`)
  ].join("\n")).join("\n\n");
}

function formatEvidence(evidence) {
  return Array.isArray(evidence) ? evidence.join("; ") : String(evidence ?? "");
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
  return [...items].sort((left, right) => decisionTimestamp(right) - decisionTimestamp(left))[0];
}

function decisionTimestamp(decision) {
  return Date.parse(decision?.generatedAt ?? decision?.createdAt ?? decision?.updatedAt ?? "") || 0;
}

function compactDecision(decision) {
  if (!decision) return undefined;
  const criteria = Array.isArray(decision.criteria) ? decision.criteria : [];
  const failedCriteriaDetails = criteria
    .filter((criterion) => criterion?.status === "FAIL")
    .map((criterion) => ({
      id: criterion.id,
      name: criterion.name,
      actual: criterion.actual,
      target: criterion.target,
      required: criterion.required,
      evidence: Array.isArray(criterion.evidence) ? criterion.evidence.slice(0, 20) : []
    }));
  return {
    id: decision.id,
    status: decision.status,
    failedCriteria: decision.failedCriteria ?? decision.summary?.failedCriteria ?? failedCriteriaDetails.length,
    passedCriteria: decision.passedCriteria ?? decision.summary?.passedCriteria ?? criteria.filter((criterion) => criterion?.status === "PASS").length,
    highOpenRisks: decision.highOpenRisks ?? decision.summary?.highOpenRisks,
    failedCriteriaDetails,
    createdAt: decision.createdAt ?? decision.generatedAt
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
    loopAgent: "octopus-release-runner",
    iteration: result.attempt,
    currentPhase: result.currentPhase,
    releaseDecision: result.releaseDecision,
    summary: result.summary,
    blocker: result.blocker,
    repairWorkflows: summarizeWorkflowTypes(result.repairWorkflows ?? []),
    nextAction: result.nextAction
  };
}

async function runCommand(command, commandArgs, options = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const commandEnv = buildCommandEnv(options);
    const child = spawn(command, commandArgs, { cwd: options.cwd ?? projectRoot, env: commandEnv, shell: false });
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
      const result = { code, durationMs: Date.now() - started, stdoutTail: redactSensitiveText(tail(stdout)), stderrTail: redactSensitiveText(tail(stderr)) };
      Object.defineProperty(result, "stdoutText", { value: stdout, enumerable: false });
      Object.defineProperty(result, "stderrText", { value: stderr, enumerable: false });
      fs.appendFileSync(textLogPath, `\n\n$ ${command} ${commandArgs.join(" ")}\nexit=${code} durationMs=${result.durationMs}\n--- stdout tail ---\n${result.stdoutTail}\n--- stderr tail ---\n${result.stderrTail}\n`, "utf8");
      resolve(result);
    });
  });
}

function buildCommandEnv(options = {}) {
  const env = { ...process.env };
  for (const name of options.envUnset ?? []) delete env[name];
  for (const [key, value] of Object.entries(options.env ?? {})) {
    env[key] = String(value);
  }
  return env;
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

function redactSensitiveText(text) {
  return String(text ?? "")
    .replace(/glpat-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(/(token|password|secret|credential|api[_-]?key)([=:\s]+)([^\s"',}]+)/gi, "$1$2[REDACTED]");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function escapeTable(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
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
