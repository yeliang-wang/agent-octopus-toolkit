import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const runDir = mustEnv("DOMAINFORGE_LAB_RUN_DIR");
const materialPath = mustEnv("DOMAINFORGE_LAB_MATERIAL");
const goal = mustEnv("DOMAINFORGE_LAB_GOAL");
const domainId = process.env.DOMAINFORGE_LAB_DOMAIN_ID ?? "jsnx";
const branch = process.env.DOMAINFORGE_LAB_BRANCH ?? "dev_prod";
const domainforgeRoot = process.env.DOMAINFORGE_ROOT ?? "/Users/wangyejing/project/domainforge-fabric";
const selfEvolutionPort = process.env.SELF_EVOLUTION_PORT ?? "18182";
const serviceUrl = process.env.DOMAINFORGE_FABRIC_SERVICE_URL ?? "http://127.0.0.1:18083";
const mcpHealthUrl = process.env.DOMAINFORGE_FABRIC_MCP_HEALTH_URL ?? "http://127.0.0.1:19728/health";
const executionPort = process.env.DOMAINFORGE_EXECUTION_PORT ?? "19528";
const screenshotRoot = process.env.DOMAINFORGE_EVOLUTION_LAB_SCREENSHOT_ROOT ?? "/tmp/domainforge-fabric-evolution-lab-screenshots";
const cli = path.join(domainforgeRoot, "gateways/domainforge-fabric-mcp/dist/src/cli.js");
const material = fs.readFileSync(materialPath, "utf8");
const materialUrl = extractMaterialUrl(material);
const materialTitle = extractMaterialTitle(material);
const outputs = [];

fs.copyFileSync(materialPath, path.join(runDir, "material.md"));

function call(name, args) {
  const startedAt = Date.now();
  const payload = JSON.stringify({ name, arguments: args });
  try {
    const stdout = execFileSync("node", [cli, "tool", payload], {
      cwd: path.join(domainforgeRoot, "gateways/domainforge-fabric-mcp"),
      env: process.env,
      encoding: "utf8",
      maxBuffer: 80 * 1024 * 1024
    });
    const result = JSON.parse(stdout);
    const item = {
      name,
      args: summarizeArgs(args),
      status: "SUCCEEDED",
      durationMs: Date.now() - startedAt,
      result
    };
    outputs.push(item);
    fs.writeFileSync(path.join(runDir, `${String(outputs.length).padStart(2, "0")}-${name}.json`), JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    const item = {
      name,
      args: summarizeArgs(args),
      status: "FAILED",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error)
    };
    outputs.push(item);
    throw error;
  }
}

function curlJson(url) {
  return JSON.parse(execFileSync("curl", ["-fsS", url], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
}

function postJson(url, body) {
  return JSON.parse(execFileSync("curl", [
    "-fsS", "-X", "POST", url,
    "-H", "content-type: application/json",
    "-d", JSON.stringify(body)
  ], { encoding: "utf8", maxBuffer: 40 * 1024 * 1024 }));
}

const readiness = collectProductionReadiness();
fs.writeFileSync(path.join(runDir, "readiness.json"), JSON.stringify(readiness, null, 2));

const intake = call("business_capability_evolution", {
  action: "intake_create",
  domainId,
  goal,
  message: goal,
  policy: { releaseStrategy: "preview-only", mergeRequestPolicy: "low-risk-only", materialPolicy: "public-vibe" },
  materials: [{ fileName: path.basename(materialPath), contentType: "text/markdown", content: material }]
});
const sessionId = intake.sessionId ?? intake?.session?.sessionId ?? intake?.data?.sessionId;
if (!sessionId) throw new Error("business_capability_evolution intake did not return sessionId");

call("constitution_get", { domainId });
call("domain_capability_map", { domainId, view: "summary" });
const normalized = call("business_capability_evolution", { action: "goal_normalize", sessionId, goal });
call("business_capability_evolution", { action: "material_analyze", sessionId });
call("business_capability_evolution", {
  action: "matching_rule_recommend",
  sessionId,
  goal,
  rules: ["只输出候选映射", "处置/退出/拒绝必须保留人工复核", "preview-only 禁止自动发布"]
});
const feasibility = call("business_capability_evolution", { action: "feasibility_assess", sessionId, goal, rules: ["preview-only", "low-risk-mr-only"] });
const assets = call("business_capability_evolution", { action: "asset_match", sessionId });
const planPreview = call("business_capability_evolution", { action: "plan_preview", sessionId, releaseStrategy: "preview-only", confirmed: false });

const now = new Date().toISOString();
const feasibilityStatus = feasibility?.feasibility?.status;
const recommendedCount = Number(assets?.candidateReview?.recommendedCount ?? 0);
const disputedCount = Number(assets?.candidateReview?.disputedCount ?? 0);
const planPreviewStatus = planPreview?.planPreview?.status;
const hasProductGap = feasibilityStatus !== "FULLY_ACHIEVABLE" || disputedCount > 0 || recommendedCount === 0;
const productSignalAttributes = {
  sessionId,
  domainId,
  goal,
  goalType: normalized?.goal?.goalType,
  feasibilityStatus,
  recommendedCount,
  disputedCount,
  planPreviewStatus,
  materialPath,
  materialUrl,
  candidateReview: assets?.candidateReview,
  feasibilityGaps: summarizeFeasibilityGaps(feasibility?.feasibility),
  capabilityMatches: summarizeCapabilityMatches(assets),
  planPreviewSummary: summarizePlanPreview(planPreview?.planPreview)
};
const events = [
  ...buildProductionEvidenceEvents({ now, runId: path.basename(runDir), sessionId, readiness }),
  {
    id: `evt-${path.basename(runDir)}-preview-completed`,
    type: "business-capability.preview.completed",
    source: "mcp",
    timestamp: now,
    severity: "LOW",
    message: `Preview-only evolution completed; material=${path.basename(materialPath)}; goal=${goal}`,
    module: "mcp",
    traceId: sessionId,
    attributes: {
      sessionId,
      domainId,
      goal,
      goalType: normalized?.goal?.goalType,
      materialPath,
      materialUrl,
      planPreviewStatus
    }
  },
  {
    id: `evt-${path.basename(runDir)}-e2e-product-signal`,
    type: hasProductGap ? "mcp-e2e.product-gap" : "mcp-e2e.production-signal",
    source: "mcp",
    timestamp: now,
    severity: hasProductGap ? "HIGH" : "LOW",
    message: `MCP E2E signal: feasibility=${feasibilityStatus}; recommended=${recommendedCount}; disputed=${disputedCount}; planPreview=${planPreviewStatus}; material=${path.basename(materialPath)}`,
    module: "mcp",
    traceId: sessionId,
    attributes: productSignalAttributes
  }
];

const selfEvolutionRun = JSON.parse(execFileSync("curl", [
  "-fsS", "-X", "POST", `http://127.0.0.1:${selfEvolutionPort}/api/v1/self-evolution/runs`,
  "-H", "content-type: application/json",
  "-d", JSON.stringify({ ref: branch, from: now, to: now, events, createMergeRequest: false })
], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 }));
const reviewConsoleUrl = `http://127.0.0.1:${selfEvolutionPort}/review`;
const reviewIds = Array.isArray(selfEvolutionRun?.data?.reviewIds) ? selfEvolutionRun.data.reviewIds : [];
const reviews = reviewIds.map((id) => curlJson(`http://127.0.0.1:${selfEvolutionPort}/api/v1/self-evolution/reviews/${encodeURIComponent(id)}`).data);
const simulatedUserFlows = reviews.map((review, index) => simulateProductionUserFlow(review, index));
const finalReviews = reviewIds.map((id) => curlJson(`http://127.0.0.1:${selfEvolutionPort}/api/v1/self-evolution/reviews/${encodeURIComponent(id)}`).data);

const summary = {
  runId: path.basename(runDir),
  sessionId,
  domainId,
  goal,
  materialPath,
  materialUrl,
  materialTitle,
  goalType: normalized?.goal?.goalType,
  feasibilityStatus,
  recommendedCount,
  disputedCount,
  planPreviewStatus,
  e2eScenario: {
    material: {
      title: materialTitle,
      url: materialUrl,
      path: materialPath
    },
    goal,
    goalType: normalized?.goal?.goalType,
    completedFlows: summarizeMcpFlow(outputs),
    completedFunctions: [
      "公网素材采集与去重",
      "业务能力进化 intake",
      "领域宪章读取",
      "领域能力地图读取",
      "进化目标结构化",
      "素材分析",
      "匹配规则推荐",
      "可达性评估",
      "候选资产映射",
      "preview-only 方案预览",
      "生产就绪证据快照",
      "self-evolution 证据提交",
      "review 用户确认闭环模拟"
    ]
  },
  selfEvolution: selfEvolutionRun.data,
  reviewConsoleUrl,
  reviews: finalReviews.map((review) => ({
    id: review.id,
    status: review.status,
    automationLevel: review.plan?.automationLevel,
    problemStatement: review.plan?.problemStatement,
    expectedFileCount: Array.isArray(review.plan?.expectedFiles) ? review.plan.expectedFiles.length : 0,
    plan: summarizeReviewPlan(review.plan),
    mergeRequest: review.mergeRequest,
    ci: review.ci
  })),
  productionReadiness: summarizeReadiness(readiness),
  simulatedUserFlows,
  outputCount: outputs.length
};

fs.writeFileSync(path.join(runDir, "events.jsonl"), events.map((event) => JSON.stringify(event)).join("\n") + "\n");
fs.writeFileSync(path.join(runDir, "mcp-results.json"), JSON.stringify({ summary, outputs }, null, 2));
fs.writeFileSync(path.join(runDir, "self-evolution-run.json"), JSON.stringify(selfEvolutionRun, null, 2));
fs.writeFileSync(path.join(runDir, "user-flow-results.json"), JSON.stringify(simulatedUserFlows, null, 2));
fs.writeFileSync(path.join(runDir, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.join(runDir, "report.md"), renderReport(summary));
console.log(JSON.stringify(summary, null, 2));

function summarizeArgs(args) {
  const copy = JSON.parse(JSON.stringify(args ?? {}));
  if (copy.materials) {
    copy.materials = copy.materials.map((item) => ({
      fileName: item.fileName,
      contentType: item.contentType,
      content: `[omitted ${item.content?.length ?? 0} chars]`
    }));
  }
  return copy;
}

function collectProductionReadiness() {
  return {
    service: curlJson(`${serviceUrl}/health`),
    mcp: curlJson(mcpHealthUrl),
    selfEvolution: curlJson(`http://127.0.0.1:${selfEvolutionPort}/health`),
    ports: {
      execution: checkPort(executionPort),
      service: checkPort(new URL(serviceUrl).port || "18083"),
      mcp: checkPort(new URL(mcpHealthUrl).port || "19728"),
      selfEvolution: checkPort(selfEvolutionPort)
    },
    processSnapshot: processSnapshot(),
    collectedAt: new Date().toISOString()
  };
}

function checkPort(port) {
  try {
    const stdout = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
    return { port: Number(port), listening: stdout.trim().length > 0, detail: stdout.split(/\r?\n/).slice(1, 4).join("\n") };
  } catch {
    return { port: Number(port), listening: false, detail: "" };
  }
}

function processSnapshot() {
  try {
    return execFileSync("screen", ["-ls"], { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((line) => /domainforge-fabric|domainforge-evolution-lab/.test(line))
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildProductionEvidenceEvents({ now, runId, sessionId, readiness }) {
  const portEntries = Object.entries(readiness.ports ?? {});
  const allPortsListening = portEntries.every(([, value]) => value?.listening);
  return [
    {
      id: `evt-${runId}-production-readiness`,
      type: "production.readiness.snapshot",
      source: "deployment",
      timestamp: now,
      severity: allPortsListening ? "LOW" : "HIGH",
      message: `Production-like stack readiness: service=${readiness.service?.status}; mcp=${readiness.mcp?.status}; selfEvolution=${readiness.selfEvolution?.status}; allPortsListening=${allPortsListening}`,
      module: "domainforge-fabric-runtime",
      traceId: sessionId,
      attributes: readiness
    },
    {
      id: `evt-${runId}-review-user-loop-contract`,
      type: "review.user-loop.contract",
      source: "manual",
      timestamp: now,
      severity: "LOW",
      message: "Review Console must push every complete evolution plan to the user and support continue-discussion, confirm-execution, and ignore-skip paths.",
      module: "domainforge-fabric-self-evolution",
      traceId: sessionId,
      attributes: {
        reviewUrl: `http://127.0.0.1:${selfEvolutionPort}/review`,
        userLoopActions: ["continue-discussion", "confirm-execution", "ignore-skip"],
        productBoundary: "lab simulates users and external production flow; self-evolution and fabric keep real product behavior"
      }
    }
  ];
}

function simulateProductionUserFlow(review, index) {
  const scenarios = ["continue-discussion", "confirm-execution", "ignore-skip"];
  const scenario = scenarios[(Number(process.env.DOMAINFORGE_EVOLUTION_LAB_ITERATION ?? index) + index) % scenarios.length];
  const base = `http://127.0.0.1:${selfEvolutionPort}/api/v1/self-evolution/reviews/${encodeURIComponent(review.id)}`;
  const result = { reviewId: review.id, scenario, steps: [], screenshots: [] };
  result.screenshots.push(captureReviewScreenshot(path.basename(runDir), `${index}-before`));
  const question = "请基于完整进化报告说明生产级证据链、影响范围、用户确认门禁，以及是否会越过 domains 业务边界。";
  result.steps.push({ action: "ask-report", response: postJson(`${base}/messages`, { question }).data?.status });
  result.screenshots.push(captureReviewScreenshot(path.basename(runDir), `${index}-after-question`));

  if (scenario === "continue-discussion") {
    const userPrompt = "这个方案哪里不对，请补充证据解释并调整后再给我 review。";
    result.steps.push({
      action: "prompt-request-changes",
      prompt: userPrompt,
      response: postJson(`${base}/decision`, {
        action: "request-changes",
        actor: "evolution-lab-product-owner",
        note: `生产用户闭环模拟：用户在 /review prompt 输入：${userPrompt}`
      }).data?.status
    });
  } else if (scenario === "confirm-execution") {
    const userPrompt = "确认执行，进入 MR、CI/CD、发布确认和运行阶段。";
    result.steps.push({
      action: "prompt-confirm-execution",
      prompt: userPrompt,
      response: postJson(`${base}/decision`, {
        action: "accept",
        actor: "evolution-lab-product-owner",
        note: `生产用户闭环模拟：用户在 /review prompt 输入：${userPrompt}`
      }).data?.status
    });
  } else {
    const userPrompt = "忽略跳过，本轮不处理。";
    result.steps.push({
      action: "prompt-ignore-skip",
      prompt: userPrompt,
      response: postJson(`${base}/decision`, {
        action: "observe-only",
        actor: "evolution-lab-product-owner",
        note: `生产用户闭环模拟：用户在 /review prompt 输入：${userPrompt}`
      }).data?.status
    });
  }
  result.screenshots.push(captureReviewScreenshot(path.basename(runDir), `${index}-after-decision`));
  return result;
}

function captureReviewScreenshot(runId, label) {
  const dir = path.join(screenshotRoot, runId);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `review-${label}-${Date.now()}.png`);
  const profile = path.join(dir, `.chrome-profile-${process.pid}-${label}`);
  try {
    execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--window-size=1440,1200",
      "--virtual-time-budget=5000",
      `--user-data-dir=${profile}`,
      `--screenshot=${file}`,
      `http://127.0.0.1:${selfEvolutionPort}/review`
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000, maxBuffer: 5 * 1024 * 1024 });
    return { label, status: "SUCCEEDED", path: file };
  } catch (error) {
    if (isValidPng(file)) {
      return { label, status: "SUCCEEDED_WITH_TIMEOUT", path: file, warning: error instanceof Error ? error.message : String(error) };
    }
    return { label, status: "FAILED", path: file, error: error instanceof Error ? error.message : String(error) };
  } finally {
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

function isValidPng(file) {
  try {
    const header = fs.readFileSync(file).subarray(0, 8);
    return header.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  } catch {
    return false;
  }
}

function summarizeReadiness(readiness) {
  return {
    serviceStatus: readiness.service?.status,
    mcpStatus: readiness.mcp?.status,
    selfEvolutionStatus: readiness.selfEvolution?.status,
    gitlabConfigured: readiness.selfEvolution?.gitlabConfigured,
    allPortsListening: Object.values(readiness.ports ?? {}).every((item) => item?.listening)
  };
}

function extractMaterialUrl(text) {
  const sourceLine = text.split(/\r?\n/).find((line) => line.includes("来源 URL"));
  const match = (sourceLine ?? text).match(/https?:\/\/\S+/);
  return match ? match[0].replace(/[),，。；;]+$/, "") : undefined;
}

function extractMaterialTitle(text) {
  const heading = text.split(/\r?\n/).find((line) => line.trim().startsWith("# "));
  return heading ? heading.replace(/^#\s+/, "").trim() : path.basename(materialPath);
}

function summarizeMcpFlow(items) {
  return items.map((item, index) => ({
    order: index + 1,
    tool: item.name,
    action: item.args?.action,
    status: item.status,
    durationMs: item.durationMs
  }));
}

function summarizeFeasibilityGaps(feasibilityValue) {
  const candidates = [
    feasibilityValue?.gaps,
    feasibilityValue?.gapAnalysis,
    feasibilityValue?.missingCapabilities,
    feasibilityValue?.limitations,
    feasibilityValue?.risks
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  return candidates.map((item) => typeof item === "string" ? item : JSON.stringify(item)).slice(0, 8);
}

function summarizeCapabilityMatches(assetsValue) {
  const candidates = [
    assetsValue?.candidateCapabilities,
    assetsValue?.capabilityMatches,
    assetsValue?.candidateReview?.recommended,
    assetsValue?.candidateReview?.disputed
  ].flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  return candidates.map((item) => {
    if (typeof item === "string") return item;
    return {
      id: item?.id ?? item?.capabilityId ?? item?.roleId ?? item?.skillId,
      name: item?.name ?? item?.title ?? item?.capabilityName,
      status: item?.status ?? item?.decision ?? item?.recommendation
    };
  }).slice(0, 12);
}

function summarizePlanPreview(planPreviewValue) {
  if (!planPreviewValue) return undefined;
  return {
    status: planPreviewValue.status,
    planCount: Array.isArray(planPreviewValue.plans) ? planPreviewValue.plans.length : undefined,
    changesCount: Array.isArray(planPreviewValue.changes) ? planPreviewValue.changes.length : undefined
  };
}

function summarizeReviewPlan(plan) {
  if (!plan) return undefined;
  return {
    title: plan.title,
    problemStatement: plan.problemStatement,
    whyEvolutionNeeded: plan.whyEvolutionNeeded,
    expectedEvolutionEffect: plan.expectedEvolutionEffect,
    proposedEvolutionApproach: plan.proposedEvolutionApproach,
    automationLevel: plan.automationLevel,
    evidenceChain: plan.evidenceChain,
    sourceImpactMap: plan.sourceImpactMap,
    expectedFiles: plan.expectedFiles,
    changeStrategy: plan.changeStrategy,
    implementationSteps: plan.implementationSteps,
    validationPlan: plan.validationPlan,
    riskAnalysis: plan.riskAnalysis,
    rollbackPlan: plan.rollbackPlan,
    userConfirmationFlow: plan.userConfirmationFlow,
    productionReadinessChecks: plan.productionReadinessChecks,
    architectureGuidance: plan.architectureGuidance
  };
}

function renderReport(summary) {
  const reviewPlanLines = summary.reviews.length > 0
    ? summary.reviews.flatMap((review, index) => renderReviewPlan(review, index))
    : ["未产生进化方案。"];
  const flowLines = (summary.e2eScenario?.completedFlows ?? []).map((flow) => {
    const action = flow.action ? `:${flow.action}` : "";
    return `| ${flow.order} | ${flow.tool}${action} | ${flow.status} | ${flow.durationMs} |`;
  });
  const userFlowLines = summary.simulatedUserFlows.flatMap((flow) => [
    `- reviewId: ${flow.reviewId}`,
    `  - scenario: ${flow.scenario}`,
    `  - steps: ${flow.steps.map((step) => `${step.action} => ${step.response}`).join("；") || "none"}`,
    `  - screenshots: ${(flow.screenshots ?? []).map((shot) => `${shot.label}=${shot.status} ${shot.path}`).join("；") || "none"}`
  ]);
  return [
    "# domainforge-fabric-evolution-lab 持续运行批次报告",
    "",
    "## 1. 端到端执行了哪些场景",
    "",
    `- runId: ${summary.runId}`,
    `- sessionId: ${summary.sessionId}`,
    `- domainId: ${summary.domainId}`,
    `- goal: ${summary.goal}`,
    `- materialTitle: ${summary.materialTitle ?? ""}`,
    `- materialUrl: ${summary.materialUrl ?? ""}`,
    `- materialPath: ${summary.materialPath}`,
    `- goalType: ${summary.goalType}`,
    `- productionReadiness: ${JSON.stringify(summary.productionReadiness)}`,
    "",
    "### 完成的流程、功能、场景",
    "",
    ...(summary.e2eScenario?.completedFunctions ?? []).map((item) => `- ${item}`),
    "",
    "### MCP E2E 执行链路",
    "",
    "| # | tool/action | status | durationMs |",
    "|---|---|---|---|",
    ...(flowLines.length > 0 ? flowLines : ["| - | none | - | - |"]),
    "",
    "### /review 生产用户闭环模拟",
    "",
    ...(userFlowLines.length > 0 ? userFlowLines : ["- none"]),
    "",
    "## 2. 是否产生进化方案",
    "",
    summary.reviews.length > 0 ? "是，已产生进化方案并推送到 /review 等待或处理用户确认。" : "否，本轮未产生进化方案。",
    "",
    `- feasibilityStatus: ${summary.feasibilityStatus}`,
    `- recommendedCount: ${summary.recommendedCount}`,
    `- disputedCount: ${summary.disputedCount}`,
    `- planPreviewStatus: ${summary.planPreviewStatus}`,
    `- selfEvolutionBundle: ${summary.selfEvolution?.evidenceBundleId ?? ""}`,
    `- selfEvolutionOpportunityCount: ${summary.selfEvolution?.opportunityCount ?? 0}`,
    `- selfEvolutionPlanCount: ${summary.selfEvolution?.planCount ?? 0}`,
    `- selfEvolutionReviewCount: ${summary.selfEvolution?.reviewCount ?? 0}`,
    `- reviewConsole: ${summary.reviewConsoleUrl}`,
    `- reviews: ${summary.reviews.map((review) => `${review.id}:${review.status}`).join(", ") || "none"}`,
    `- mergeRequests: ${(summary.selfEvolution?.mergeRequests ?? []).length}`,
    "",
    "### 进化方案内容",
    "",
    ...reviewPlanLines,
    ""
  ].join("\n");
}

function renderReviewPlan(review, index) {
  const plan = review.plan ?? {};
  return [
    `#### 方案 ${index + 1}: ${review.id}`,
    "",
    `- status: ${review.status}`,
    `- title: ${plan.title ?? ""}`,
    `- automationLevel: ${plan.automationLevel ?? review.automationLevel ?? ""}`,
    `- problemStatement: ${plan.problemStatement ?? review.problemStatement ?? ""}`,
    "",
    "##### 用户决策摘要",
    ...renderList([
      plan.whyEvolutionNeeded ? `为什么需要进化：${plan.whyEvolutionNeeded}` : undefined,
      plan.expectedEvolutionEffect ? `进化之后的效果：${plan.expectedEvolutionEffect}` : undefined,
      plan.proposedEvolutionApproach ? `采取什么方案：${plan.proposedEvolutionApproach}` : undefined
    ].filter(Boolean)),
    "",
    "##### 证据链",
    ...renderList(plan.evidenceChain),
    "",
    "##### 影响范围",
    ...renderList(plan.sourceImpactMap?.likelyFiles ?? plan.expectedFiles),
    "",
    "##### 方案策略",
    ...renderList(plan.changeStrategy),
    "",
    "##### 执行步骤",
    ...renderList(plan.implementationSteps),
    "",
    "##### 验证计划",
    ...renderList(plan.validationPlan),
    "",
    "##### 风险与回滚",
    ...renderList(plan.riskAnalysis),
    ...renderList(plan.rollbackPlan),
    "",
    "##### 用户确认闭环",
    ...renderList(plan.userConfirmationFlow),
    "",
    "##### 生产就绪检查",
    ...renderList(plan.productionReadinessChecks)
  ];
}

function renderList(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  if (items.length === 0) return ["- 无"];
  return items.map((item) => `- ${formatReportValue(item)}`);
}

function formatReportValue(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const preferred = value.message ?? value.description ?? value.summary ?? value.path ?? value.file ?? value.name ?? value.title;
    if (preferred) return String(preferred);
    return JSON.stringify(value);
  }
  return String(value);
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}
