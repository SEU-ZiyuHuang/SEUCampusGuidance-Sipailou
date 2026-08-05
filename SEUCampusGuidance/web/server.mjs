import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const mapKey = process.env.TENCENT_MAP_KEY || "";
const buildVersion = (process.env.RENDER_GIT_COMMIT || "local").slice(0, 7);
const agentServiceUrl = process.env.AGENT_SERVICE_URL || "http://127.0.0.1:5174";
const agentTimeoutMs = Number(process.env.AGENT_TIMEOUT_MS || 40_000);

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

// 将 /api/agent/chat 转发到独立的 Agent 服务（SEUCampusGuidance/agent/）
async function proxyAgent(request, response) {
  const input = await readJson(request);
  try {
    const upstream = await fetch(`${agentServiceUrl}/api/agent/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(agentTimeoutMs),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = await upstream.json();
    sendJson(response, upstream.status, payload);
  } catch (error) {
    console.error(error);
    sendJson(response, 503, { error: "Agent 服务未启动：请先在 SEUCampusGuidance/agent 目录运行 npm start" });
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (requestUrl.pathname === "/runtime-config.js") {
    response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
    response.end(`window.APP_CONFIG=${JSON.stringify({ tencentMapKey: mapKey, agentEnabled: true, model: "deepseek-v4-flash", version: buildVersion })};`);
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
    if (request.method === "POST" && request.url === "/api/agent/chat") return await proxyAgent(request, response);
    if (request.method === "GET" || request.method === "HEAD") return await serveStatic(request, response);
    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(port, host, () => {
  console.log(`SEU campus guide web: http://${host}:${port}`);
  console.log(`Tencent map: ${mapKey ? "configured" : "fallback schematic"}`);
  console.log(`Agent: proxied to ${agentServiceUrl}`);
});
