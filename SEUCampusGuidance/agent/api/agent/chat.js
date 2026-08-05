// POST /api/agent/chat —— 旧契约，供 web/ 的地图抽屉使用。
//
// 契约冻结：请求 { message }，响应 { message, placeIds }，状态码 405/400/503/500。
// 由 web/server.mjs:41-56 代理调用，改动会弄坏那个应用。新功能走 /api/chat。

import { answerLegacy } from "../../lib/legacy.mjs";
import { isConfigured } from "../../lib/deepseek.mjs";

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!isConfigured()) return json({ error: "DEEPSEEK_API_KEY is not configured" }, 503);
    try {
      const input = await request.json();
      const message = String(input.message || "").trim();
      if (!message) return json({ error: "message is required" }, 400);
      return json(await answerLegacy(message, { signal: request.signal }));
    } catch (error) {
      console.error(error);
      return json({ error: "Agent service temporarily unavailable" }, 500);
    }
  },
};
