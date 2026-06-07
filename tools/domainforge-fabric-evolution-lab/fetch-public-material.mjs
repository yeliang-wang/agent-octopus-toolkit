import fs from "node:fs";
import path from "node:path";

const materialRoot = mustEnv("DOMAINFORGE_EVOLUTION_LAB_MATERIAL_ROOT");
const usedPath = mustEnv("DOMAINFORGE_EVOLUTION_LAB_USED_SOURCES");
const iteration = Number(process.env.DOMAINFORGE_EVOLUTION_LAB_ITERATION ?? "0");
const goal = process.env.DOMAINFORGE_EVOLUTION_LAB_GOAL ?? "贷后风险预警与信用风险管理";

fs.mkdirSync(materialRoot, { recursive: true });
fs.mkdirSync(path.dirname(usedPath), { recursive: true });

const used = readUsed(usedPath);
const queries = [
  "银行 贷后 风险预警 系统 招标 公告",
  "农商银行 信用风险预警 系统 采购 需求",
  "银行 智能风控 平台 招标 贷后",
  "信贷 风险预警 信号库 规则配置 采购",
  "贷后 管理 风险预警 催收 电核 外包 招标",
  "商业银行 全流程 风险管控 平台 建设 项目",
  "信用风险监测预警系统 需求说明书 银行",
  "银行 预警任务 管理 风险信号 处置 闭环",
  "小微企业 信贷 风控 平台 贷后 预警",
  "银行 数字化 风控 贷中 贷后 预警 项目"
];

const seededSources = [
  ["山西农商联合银行智能风险管控平台建设项目招标公告", "https://www.sxnx.com/sxrcb/2024-02/08/article_2024071615110269461.html", "全行级智能风险管控平台建设，覆盖统一风控模型、预警指标体系、贷前贷中贷后风险决策支持，强调规则筛选、模型匹配和差异化管理。"],
  ["渤海银行新一代信用风险管理平台贷后管理及风险预警子系统采购项目", "https://bj.chinamae.com/news/ee569435ffac38ebece5eefd9c9ea1a0.html", "围绕新一代信用风险管理平台建设贷后管理及风险预警子系统，关注预警信号、贷后任务、风险处置和系统化闭环管理。"],
  ["重庆农村商业银行数智化风险预警及贷后管理平台采购项目", "https://www.mpaypass.com.cn/news/202603/02102907.html", "数智化风险预警及贷后管理平台，建设内容包括软件产品、咨询服务、开发实施、预警模型建设、贷后检查模板和贷后报告自动化生成。"],
  ["云南红塔银行信用风险预警监测系统优化适配项目招标公告", "https://yunnan.zhaobiao.cn/bidding_v_53e759f7beec7627d4717210b94954f5.html", "信用风险预警监测系统优化适配，适合验证存量预警系统升级、规则适配、监测口径和专家能力演进。"],
  ["沧州银行风险预警系统项目招标", "https://m.mpaypass.com.cn/news/202303/07100257.html", "银行风险预警系统项目，适合抽取预警信号管理、风险任务分发、处置跟踪和预警规则维护等产品能力。"],
  ["乌鲁木齐银行运营风险监测平台项目招标公告", "https://www.gxxszb.com/Html/1682147.html", "运营风险监测平台项目，适合验证风险监测指标、任务闭环、预警发现和人工复核边界。"],
  ["九江银行智能风控平台需求说明书", "https://www.jjccb.com/portal/zh_CN/upload/Attachment/20190415145544517.pdf", "智能风控平台需求说明书，覆盖风险识别、模型和规则、数据接入、监测预警、策略执行和风控报表。"],
  ["重庆三峡银行大数据风控平台建设与应用项目招标公告", "https://www.ccqtgb.com/col92/161675.html", "大数据风控平台建设与应用，关注数据汇聚、模型分析、风控应用、预警策略和源代码交付能力。"],
  ["贵阳农商银行风险预警系统信创改造项目", "https://www.chinamae.com/purchases/3b966bb378828f633dff28fceb4c2976.html", "风险预警系统信创改造，适合验证旧系统适配、国产化改造、风险信号迁移和能力版本管理。"],
  ["湖州银行风险数据集市及数字化风控平台POC测试招标公告", "https://www.bbda.com/bidDetail/66c9da4a7c06a62215a99f73d57a9c05d73176c2d8245328d66138f8ef3df5e8.html", "风险数据集市和数字化风控平台 POC，关注风险数据底座、指标加工、模型实验和平台可行性验证。"],
  ["嘉兴银行风险预警管理系统信创改造项目招标", "https://m.mpaypass.com.cn/news/202505/12090844.html", "风险预警管理系统信创改造，适合压测预警管理、规则配置、任务闭环和版本演进。"],
  ["九江银行信用风险监测预警系统需求说明书", "https://www.jjccb.com/portal/zh_CN/upload/Attachment/20200228143128012.pdf", "信用风险监测预警系统需求说明书，涉及预警信号库、规则配置、风险监测、预警任务和处置闭环。"],
  ["贵州银行RWA风险加权资产暨大额风险暴露系统供应商征集公告", "https://www.bgzchina.com/article/82099", "RWA 风险加权资产和大额风险暴露系统，适合验证风险指标、监管口径、暴露计量和数据治理能力。"],
  ["中国邮政资金风险预警系统工程集中采购项目招标公告", "https://www.chinapost.com.cn/html1/report/23021/2920-1.htm", "资金风险预警系统工程，适合验证资金类风险信号、阈值配置、预警任务和处置审计。"],
  ["中国邮政储蓄银行贷后电核及催收业务处理外包服务采购项目", "https://www.chinapost.com.cn/html1/report/2302/2877-1.htm", "贷后电核及催收业务处理，覆盖系统推送风险预警业务的电话核实、记录留痕、非现场催收和处理闭环。"],
  ["数森科技信贷风控解决方案", "https://www.dataforesttech.com/solutions-credit.html", "信贷风控解决方案覆盖贷前、贷中、贷后全流程，通过设备指纹、身份核验、数据风控、实时监控和智能催收识别风险并提升审批与回款效率。"],
  ["拓尔思数星智能风控大数据平台", "https://www.yun88.com/product/11416.html", "智能风控大数据平台覆盖银行信贷准入、授信管理、反诈骗、贷后监控和催收，强调风险预警、关联传导、企业画像和实时监测。"],
  ["顶象 Dinsight 实时风控引擎", "https://www.dingxiang-inc.com/business/dinsight", "实时风控引擎覆盖贷后预警、策略库、机器学习模型、离线分析和风控闭环，适合验证规则、模型和处置链路的协同。"],
  ["逸风金科智能风险预警系统", "https://www.yifengjinke.com/FinancialRisk", "智能风险预警系统面向银行风险管理，支持企业负面动态监测、信贷风险盲点识别、贷后质量监控和风险名单推送。"],
  ["中电金信智能风控解决方案", "https://www.gientech.com/product/684.html", "智能风控解决方案将大数据和人工智能用于贷前、贷中、贷后全流程，支持实时交易监控、资金路径关联分析和动态风险预警。"],
  ["中关村科金得助智能风控系统", "https://www.zkj.com/riskcontrol", "智能风控系统支撑金融机构贷前审核、贷中监控、贷后管理、风险策略部署和实时异步风险决策。"],
  ["瀚信贷款业务风控服务", "https://www.hantele.com/solution/detail/186.html", "贷款业务风控服务提供贷前准入、贷中授信、贷后风险预警能力，并给出支持、维持、退出、处置等建议方案。"],
  ["七星智能数据服务贷后风险监测", "https://ssit-xm.com.cn/zhenxin.htm", "贷后风险监测覆盖银行小微贷、消费贷、抵押贷等场景，提供动态大规模风险监测、自动批量风险预警和风险监测报告。"],
  ["智能风控行业趋势报告", "https://pdf.dfcfw.com/pdf/H3_AP202101041446880812_1.pdf?1609769697000.pdf=", "智能风控行业趋势材料强调信贷场景全流程监管，贷中及贷后风险管理、动态跟踪预警和差异化风险策略。"],
  ["银行业人工智能智能风控应用报告", "https://pdf.dfcfw.com/pdf/H3_AP202105061490139649_1.pdf?1620338007000.pdf=", "银行业人工智能应用材料指出智能风控覆盖贷前、贷中、贷后三阶段，支持风险识别、预警标识和全流程自动化。"],
  ["智能风控助力银行转型升级", "https://file.01caijing.com/attachment/201812/7FE986845A844C0.pdf", "智能风控报告涉及贷后催收、客户催收评分模型、逾期可能性预测和按风险程度调整催收策略。"],
  ["信用风险预警系统公开功能说明", "https://pdf.dfcfw.com/pdf/H2_AN201612020148469828_1.pdf", "公开说明包含信用风险预警系统功能：客户风险预警信号与规则、风险视图、组合风险预警、预警排查流程、预警事件库和风险预警报告。"],
  ["上海金融风险监测预警体系服务需求", "https://jpg.zfcg.sh.gov.cn/sh-gov-open-doc/1024FPA/open/031fb6a8-777d-4767-8acc-c892517a6b68.pdf", "金融风险监测预警服务需求覆盖监测分析、预警算法、金融数据血缘、系统性金融风险评价和风险指标体系。"]
];

const candidate = await findCandidate();
if (!candidate) {
  throw new Error("No unused public internet material source found");
}

const material = renderMaterial(candidate);
const fileName = `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "Z")}-${slug(candidate.title)}.md`;
const filePath = path.join(materialRoot, fileName);
fs.writeFileSync(filePath, material);

used.urls.push({
  url: candidate.url,
  title: candidate.title,
  query: candidate.query,
  iteration,
  collectedAt: new Date().toISOString(),
  materialPath: filePath
});
fs.writeFileSync(usedPath, JSON.stringify(used, null, 2));

console.log(JSON.stringify({
  materialPath: filePath,
  url: candidate.url,
  title: candidate.title,
  query: candidate.query
}, null, 2));

async function findCandidate() {
  const start = iteration % queries.length;
  for (let offset = 0; offset < queries.length; offset += 1) {
    const query = queries[(start + offset) % queries.length];
    const results = await search(query, iteration + offset);
    for (const result of results) {
      const url = normalizeUrl(result.url);
      if (!url || used.urls.some((item) => normalizeUrl(item.url) === url)) continue;
      if (isExcludedUrl(url)) continue;
      if (isLikelyHomePage(url)) continue;
      if (!looksRelevant(`${result.title} ${result.description}`)) continue;
      if (!looksLikeProjectMaterial(`${result.title} ${result.description} ${url}`)) continue;
      const page = await fetchPage(url);
      if (!looksRelevant(`${result.title} ${result.description} ${page.text}`)) continue;
      if (!looksLikeProjectMaterial(`${result.title} ${result.description} ${page.text}`)) continue;
      return {
        query,
        url,
        title: cleanText(page.title || result.title || "公开风控材料"),
        description: cleanText(result.description || ""),
        pageText: page.text
      };
    }
  }
  for (const [title, sourceUrl, fallbackText] of seededSources) {
    const url = normalizeUrl(sourceUrl);
    if (!url || used.urls.some((item) => normalizeUrl(item.url) === url)) continue;
    const page = await fetchPage(url);
    return {
      query: "seeded-public-source",
      url,
      title,
      description: "",
      pageText: page.text || fallbackText || ""
    };
  }
  return null;
}

async function search(query, seed) {
  const first = 1 + (seed % 5) * 10;
  const url = `https://www.bing.com/search?format=rss&first=${first}&q=${encodeURIComponent(query)}`;
  const xml = await fetchText(url);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1]);
  return items.map((item) => ({
    title: decodeXml(textBetween(item, "title")),
    url: decodeXml(textBetween(item, "link")),
    description: stripTags(decodeXml(textBetween(item, "description")))
  }));
}

async function fetchPage(url) {
  try {
    const html = await fetchText(url);
    const title = decodeHtml(textBetween(html, "title"));
    const mainText = stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    )
      .split("\n")
      .map(cleanText)
      .filter((line) => line.length >= 18 && looksRelevant(line))
      .slice(0, 12)
      .join("\n");
    return { title, text: mainText };
  } catch {
    return { title: "", text: "" };
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 domainforge-fabric-evolution-lab/1.0"
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function renderMaterial(candidate) {
  const facts = [
    candidate.description,
    ...candidate.pageText.split("\n")
  ].map(cleanText).filter(Boolean);
  const uniqueFacts = [...new Set(facts)].slice(0, 10);
  return [
    `# 公网材料 Vibe：${candidate.title}`,
    "",
    `- 采集时间：${new Date().toISOString()}`,
    `- 搜索词：${candidate.query}`,
    `- 来源 URL：${candidate.url}`,
    `- 本轮目标：${goal}`,
    "",
    "## 公开材料要点归纳",
    "",
    ...uniqueFacts.map((fact) => `- ${fact}`),
    "",
    "## E2E 进化压力目标",
    "",
    `围绕“${goal}”，验证 DomainForge Fabric 是否能从公网业务材料完成素材理解、目标结构化、匹配规则推荐、可达性评估、候选能力映射、方案预览，并把运行证据提交给 self-evolution。`,
    "",
    "## 边界",
    "",
    "- preview-only，不自动发布。",
    "- 不使用客户敏感数据。",
    "- 不复用历史轮次 URL。"
  ].join("\n");
}

function readUsed(file) {
  if (!fs.existsSync(file)) return { urls: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { urls: Array.isArray(parsed.urls) ? parsed.urls : [] };
  } catch {
    return { urls: [] };
  }
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function looksRelevant(text) {
  const value = String(text ?? "");
  const hits = [
    /银行|农商|金融/,
    /信贷|贷后|授信|贷款/,
    /信用风险|风险预警|风控|预警|风险管控/,
    /催收|电核|处置|闭环|任务/,
    /招标|采购|项目|需求|系统|平台/
  ].filter((pattern) => pattern.test(value)).length;
  return hits >= 2;
}

function isLikelyHomePage(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.replace(/\/+$/, "");
    return pathname === "" || pathname === "/cn" || pathname === "/zh_CN";
  } catch {
    return false;
  }
}

function isExcludedUrl(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    const full = `${host}${parsed.pathname}`.toLowerCase();
    return /baike\.baidu\.com|wikipedia\.org|zhihu\.com|baidu\.com\/s|bing\.com|so\.com|sogou\.com/.test(host)
      || /login|signin|passport|auth|ccbisonline|ccb.+login|\/cn\/$/.test(full);
  } catch {
    return true;
  }
}

function looksLikeProjectMaterial(text) {
  return /招标|采购|公告|公示|中标|征集|需求说明书|采购需求|竞争性|磋商|投标/.test(String(text ?? ""));
}

function textBetween(text, tag) {
  const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? match[1] : "";
}

function stripTags(text) {
  return decodeHtml(text.replace(/<[^>]+>/g, " "));
}

function decodeXml(text) {
  return decodeHtml(text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
}

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanText(text) {
  return decodeHtml(String(text ?? "")).replace(/\s+/g, " ").trim();
}

function slug(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "public-material";
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}
