// 旧契约实现：POST /api/agent/chat → { message, placeIds }
//
// web/ 的地图抽屉（web/app.js:256-288）依赖这个形态，web/server.mjs:41-56 正往这里代理。
// 请求字段、响应字段和状态码都已冻结，改动会弄坏那个应用。新功能一律走 /api/chat。
//
// 与新版的区别：单轮、非流式、由模型返回 JSON（因为要给出地图点位 id）。

import { MAP_FEATURES } from "../data/map-features.mjs";
import { searchGuide, tokenize } from "./retrieve.mjs";
import { detectCampus } from "./campus.mjs";
import { buildLegacySystemPrompt } from "./prompt.mjs";
import { complete } from "./deepseek.mjs";

// 地图抽屉只服务四牌楼校区，所以问题里认不出校区时落到四牌楼，而不是全局默认的九龙湖。
const LEGACY_CAMPUS = "sipailou";

function scoreFeature(feature, terms) {
  const haystack = JSON.stringify(feature).toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? Math.min(term.length, 4) : 0), 0);
}

function findRelevantContext(message, campus) {
  const terms = tokenize(message);
  const features = MAP_FEATURES
    .map((feature) => ({ feature, score: scoreFeature(feature, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((entry) => entry.feature);
  const guideSections = searchGuide({ campus, query: message, topK: 4 }).map((chunk) => ({
    section: chunk.sectionPath,
    version: chunk.version,
    pages: chunk.pages,
    text: chunk.text,
  }));
  return { mapFeatures: features, guideSections };
}

export async function answerLegacy(message, { signal } = {}) {
  const campus = detectCampus(message) || LEGACY_CAMPUS;
  const context = findRelevantContext(message, campus);
  const payload = await complete({
    messages: [
      { role: "system", content: buildLegacySystemPrompt({ campus }) },
      { role: "user", content: `用户问题：${message}\n\n可用校园数据：${JSON.stringify(context)}` },
    ],
    maxTokens: 900,
    signal,
  });

  const content = payload.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
    return {
      message: String(parsed.message || "暂时没有找到可靠答案。"),
      placeIds: Array.isArray(parsed.placeIds)
        ? parsed.placeIds.filter((id) => MAP_FEATURES.some((feature) => feature.id === id))
        : [],
    };
  } catch {
    return { message: content || "暂时没有找到可靠答案。", placeIds: [] };
  }
}
