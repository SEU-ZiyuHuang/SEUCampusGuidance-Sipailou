import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
const mapKey = process.env.TENCENT_MAP_KEY || "";
const buildVersion = (process.env.RENDER_GIT_COMMIT || "local").slice(0, 7);
const deepseekTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 35_000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

async function loadBrowserData(file, variableName) {
  try {
    const source = await fs.readFile(path.join(rootDir, file), "utf8");
    const sandbox = { window: {} };
    vm.runInNewContext(source, sandbox, { timeout: 1000 });
    return sandbox.window[variableName] || [];
  } catch {
    return [];
  }
}

const [mapFeatures, guideData] = await Promise.all([
  loadBrowserData("data/map-features.js", "MAP_FEATURES"),
  loadBrowserData("data/guide-data.js", "GUIDE_DATA"),
]);

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 100_000) throw new Error("Request body too large");
  }
  return JSON.parse(body || "{}");
}

function tokenizeSearchText(value) {
  const chunks = String(value).toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]+/gu) || [];
  const terms = new Set();
  for (const chunk of chunks) {
    if (!/^[\p{Script=Han}]+$/u.test(chunk)) {
      terms.add(chunk);
      continue;
    }
    const characters = Array.from(chunk);
    if (characters.length <= 4) terms.add(chunk);
    for (let size = 2; size <= Math.min(4, characters.length); size += 1) {
      for (let index = 0; index <= characters.length - size; index += 1) {
        terms.add(characters.slice(index, index + size).join(""));
      }
    }
  }
  return [...terms];
}

function relevanceScore(item, terms) {
  const haystack = JSON.stringify(item).toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? Math.min(term.length, 4) : 0), 0);
}

function findRelevantContext(message) {
  const terms = tokenizeSearchText(message);
  const scoredFeatures = mapFeatures.map((item) => {
    return { item, score: relevanceScore(item, terms) };
  }).sort((a, b) => b.score - a.score).filter((entry) => entry.score > 0).slice(0, 10).map((entry) => entry.item);
  const records = (guideData.records || []).map((item) => {
    return { item, score: relevanceScore(item, terms) };
  }).sort((a, b) => b.score - a.score).filter((entry) => entry.score > 0).slice(0, 15).map((entry) => entry.item);
  return { mapFeatures: scoredFeatures, guideRecords: records };
}

async function handleAgent(request, response) {
  if (!deepseekKey) return sendJson(response, 503, { error: "DEEPSEEK_API_KEY is not configured" });
  const input = await readJson(request);
  const message = String(input.message || "").trim();
  if (!message) return sendJson(response, 400, { error: "message is required" });
  const context = findRelevantContext(message);
  const completion = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(deepseekTimeoutMs),
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${deepseekKey}` },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      stream: false,
      messages: [
        {
          role: "system",
          content: [
            "你是东南大学四牌楼校园指南Agent。只能依据提供的校园数据回答，不得编造地点、时间或实时状态。",
            "数据中verified=false代表未经人工核验，必须在回答中提醒用户。",
            "请只输出一个JSON对象，格式为：{\"message\":\"中文回答\",\"placeIds\":[\"地图地点ID\"]}。",
            "placeIds只能使用提供的mapFeatures中的id；没有合适地点时返回空数组。",
          ].join("\n"),
        },
        { role: "user", content: `用户问题：${message}\n\n可用校园数据：${JSON.stringify(context)}` },
      ],
    }),
  });
  if (!completion.ok) {
    const detail = await completion.text();
    throw new Error(`DeepSeek API ${completion.status}: ${detail.slice(0, 300)}`);
  }
  const payload = await completion.json();
  const content = payload.choices?.[0]?.message?.content || "";
  try {
    const clean = content.replace(/^```json\s*|\s*```$/g, "");
    const parsed = JSON.parse(clean);
    return sendJson(response, 200, {
      message: String(parsed.message || "暂时没有找到可靠答案。"),
      placeIds: Array.isArray(parsed.placeIds) ? parsed.placeIds.filter((id) => mapFeatures.some((item) => item.id === id)) : [],
    });
  } catch {
    return sendJson(response, 200, { message: content || "暂时没有找到可靠答案。", placeIds: [] });
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/runtime-config.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    response.end(`window.APP_CONFIG=${JSON.stringify({ tencentMapKey: mapKey, agentEnabled: Boolean(deepseekKey), model: "deepseek-v4-flash", version: buildVersion })};`);
    return;
  }
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === "/") pathname = "/index.html";
  const absolutePath = path.resolve(rootDir, `.${pathname}`);
  if (!absolutePath.startsWith(rootDir + path.sep)) return sendJson(response, 403, { error: "Forbidden" });
  try {
    const stat = await fs.stat(absolutePath);
    const filePath = stat.isDirectory() ? path.join(absolutePath, "index.html") : absolutePath;
    const file = await fs.readFile(filePath);
    response.writeHead(200, { "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/agent/chat") return await handleAgent(request, response);
    if (request.method === "GET" || request.method === "HEAD") return await serveStatic(request, response);
    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`SEU campus guide demo: http://${host}:${port}`);
  console.log(`Tencent map: ${mapKey ? "configured" : "fallback schematic"}`);
  console.log(`Agent: ${deepseekKey ? "DeepSeek V4 Flash" : "local browser mock"}`);
});
