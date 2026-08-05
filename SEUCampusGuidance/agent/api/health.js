// GET /api/health —— 部署自检。不泄露 Key 本身，只报是否配置。

import { isConfigured } from "../lib/deepseek.mjs";
import { KNOWLEDGE_BUILD, CAMPUSES } from "../data/knowledge.mjs";

export default {
  async fetch(request) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
    return Response.json({
      status: "ok",
      agentEnabled: isConfigured(),
      model: process.env.DEEPSEEK_MODEL || "deepseek-v4-flash",
      knowledge: {
        generatedAt: KNOWLEDGE_BUILD.generatedAt,
        chunks: KNOWLEDGE_BUILD.chunkCount,
        campuses: CAMPUSES.map((campus) => ({ slug: campus.slug, name: campus.name, version: campus.version })),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  },
};
