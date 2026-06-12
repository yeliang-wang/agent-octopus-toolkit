import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const runDir = process.env.PRODUCT_EVOLUTION_LAB_RUN_DIR;
const productRoot = process.env.PRODUCT_EVOLUTION_LAB_PRODUCT_ROOT ?? process.cwd();
const productId = process.env.PRODUCT_EVOLUTION_LAB_PRODUCT_ID ?? path.basename(productRoot);
const goal = process.env.PRODUCT_EVOLUTION_LAB_GOAL ?? "";
const iteration = process.env.PRODUCT_EVOLUTION_LAB_ITERATION ?? "0";
const e2eCommand = process.env.PRODUCT_EVOLUTION_LAB_E2E_COMMAND ?? "";

if (!runDir) {
  throw new Error("PRODUCT_EVOLUTION_LAB_RUN_DIR is required");
}
if (!goal) {
  throw new Error("PRODUCT_EVOLUTION_LAB_GOAL is required");
}
if (!e2eCommand) {
  throw new Error("PRODUCT_EVOLUTION_LAB_E2E_COMMAND is required");
}

fs.mkdirSync(runDir, { recursive: true });

function runCommand(label, command) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, {
    cwd: productRoot,
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      PRODUCT_EVOLUTION_LAB_RUN_DIR: runDir,
      PRODUCT_EVOLUTION_LAB_PRODUCT_ROOT: productRoot,
      PRODUCT_EVOLUTION_LAB_PRODUCT_ID: productId,
      PRODUCT_EVOLUTION_LAB_GOAL: goal,
      PRODUCT_EVOLUTION_LAB_ITERATION: iteration
    }
  });
  const endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(runDir, `${label}.stdout.log`), result.stdout ?? "");
  fs.writeFileSync(path.join(runDir, `${label}.stderr.log`), result.stderr ?? "");
  return {
    label,
    command,
    startedAt,
    endedAt,
    exitCode: result.status,
    signal: result.signal,
    stdoutPath: path.join(runDir, `${label}.stdout.log`),
    stderrPath: path.join(runDir, `${label}.stderr.log`)
  };
}

const e2e = runCommand("e2e", e2eCommand);
const status = e2e.exitCode === 0 ? "SUCCEEDED" : "FAILED";
const report = {
  schema: "product-evolution-lab/run-result/v1",
  productId,
  productRoot,
  goal,
  iteration,
  status,
  runDir,
  evidence: {
    e2e
  },
  loopState: {
    goal,
    round: Number(iteration),
    runtimeTarget: process.env.PRODUCT_EVOLUTION_LAB_RUNTIME_TARGET ?? "unspecified",
    e2eResult: status,
    blocker: status === "SUCCEEDED" ? null : "E2E command failed",
    nextAction: status === "SUCCEEDED" ? "continue or inspect improvement workflow" : "inspect logs and product gap"
  },
  createdAt: new Date().toISOString()
};

fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(report, null, 2));
fs.writeFileSync(
  path.join(runDir, "report.md"),
  [
    "# product-evolution-lab iteration report",
    "",
    `- productId: ${productId}`,
    `- goal: ${goal}`,
    `- iteration: ${iteration}`,
    `- status: ${status}`,
    `- e2e stdout: ${report.evidence.e2e.stdoutPath}`,
    `- e2e stderr: ${report.evidence.e2e.stderrPath}`,
    ""
  ].join("\n")
);

if (status !== "SUCCEEDED") {
  process.exitCode = 1;
}
