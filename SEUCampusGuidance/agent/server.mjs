// 本地开发服务器：静态页 + 全部 /api 路由。
//
// 线上不跑这个文件——Vercel 用 api/ 下的 Function。但 Vercel 的 Node 运行时会自动探测
// 项目根的 server.mjs，只要它调用了 listen() 就会被捕获成接管全部路由的 Function，
// 与 api/ 冲突。所以 .vercelignore 必须包含本文件，改名或移动前先确认那条还在。

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAgent } from "./lib/agent-loop.mjs";
import { answerLegacy } from "./lib/legacy.mjs";
import { isConfigured } from "./lib/deepseek.mjs";
import { formatSse, errorEvent, SSE_HEADERS, HEARTBEAT_MS } from "./lib/sse.mjs";
import { checkRateLimit, clientIp } from "./lib/ratelimit.mjs";
import { validateChatInput } from "./lib/validate.mjs";
import { KNOWLEDGE_BUILD, CAMPUSES } from "./data/knowledge.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(rootDir, "public");
const port = Number(process.env.PORT || 5174);
const host = process.env.HOST || "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
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

async function handleChat(request, response) {
  if (!isConfigured()) return sendJson(response, 503, { error: "DEEPSEEK_API_KEY is not configured" });
  // 频控放在解析 body 之前，畸形请求的刷量也一并挡住。
  if (!checkRateLimit(clientIp(request.headers))) return sendJson(response, 429, { error: "too many requests" });

  let input;
  try {
    input = await readJson(request);
  } catch {
    return sendJson(response, 400, { error: "invalid json" });
  }
  const checked = validateChatInput(input);
  if (!checked.ok) return sendJson(response, checked.status, { error: checked.error });

  response.writeHead(200, SSE_HEADERS);
  response.flushHeaders?.();

  const abort = new AbortController();
  request.on("close", () => abort.abort());
  const heartbeat = setInterval(() => {
    if (!response.writableEnded) response.write(":\n\n");
  }, HEARTBEAT_MS);

  try {
    for await (const item of runAgent({ ...checked.value, signal: abort.signal })) {
      if (response.writableEnded) break;
      response.write(formatSse(item));
    }
  } catch (error) {
    if (abort.signal.aborted) {
      console.log("客户端断开，已终止本次生成");
    } else {
      // 上游错误详情只进服务端日志——它可能带 Key 片段和内部信息，不能下发给浏览器。
      console.error(error);
      if (!response.writableEnded) {
        const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
        response.write(formatSse(errorEvent(
          timedOut ? "timeout" : "upstream_error",
          timedOut ? "这次查询超时了，请再试一次。" : "模型服务暂时不可用，请稍后重试。",
        )));
      }
    }
  } finally {
    clearInterval(heartbeat);
    response.end();
  }
}

async function handleLegacyChat(request, response) {
  if (!isConfigured()) return sendJson(response, 503, { error: "DEEPSEEK_API_KEY is not configured" });
  const input = await readJson(request);
  const message = String(input.message || "").trim();
  if (!message) return sendJson(response, 400, { error: "message is required" });
  sendJson(response, 200, await answerLegacy(message));
}

async function serveStatic(request, response, pathname) {
  const relative = pathname === "/" ? "/index.html" : pathname;
  const absolute = path.join(publicDir, decodeURIComponent(relative));
  if (!absolute.startsWith(publicDir + path.sep)) return sendJson(response, 403, { error: "Forbidden" });
  try {
    const file = await fs.readFile(absolute);
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(absolute).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : file);
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (request, response) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  try {
    // 非 POST 要显式 405，否则会落到静态文件分支返回 404，与 Vercel Function 的行为不一致。
    if (pathname === "/api/chat" || pathname === "/api/agent/chat") {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed" });
      return pathname === "/api/chat"
        ? await handleChat(request, response)
        : await handleLegacyChat(request, response);
    }
    if (pathname === "/api/health" || pathname === "/health") {
      return sendJson(response, 200, {
        status: "ok",
        agentEnabled: isConfigured(),
        model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
        knowledge: {
          generatedAt: KNOWLEDGE_BUILD.generatedAt,
          chunks: KNOWLEDGE_BUILD.chunkCount,
          campuses: CAMPUSES.map((campus) => ({ slug: campus.slug, name: campus.name, version: campus.version })),
        },
      });
    }
    if (request.method === "GET" || request.method === "HEAD") {
      return await serveStatic(request, response, pathname);
    }
    sendJson(response, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: "Internal server error" });
    else response.end();
  }
});

server.listen(port, host, () => {
  console.log(`校区指南 Agent: http://${host}:${port}`);
  console.log(`知识库: ${KNOWLEDGE_BUILD.chunkCount} 个章节 / ${CAMPUSES.length} 个校区（构建于 ${KNOWLEDGE_BUILD.generatedAt.slice(0, 10)}）`);
  console.log(`模型: ${isConfigured() ? process.env.DEEPSEEK_MODEL || "deepseek-v4-flash" : "DEEPSEEK_API_KEY 未配置，问答将返回 503"}`);
});
