globalThis.window ||= {};
await import("../data/map-features.js");
await import("../data/guide-data.js");

const mapFeatures = globalThis.window.MAP_FEATURES || [];
const guideData = globalThis.window.GUIDE_DATA || { records: [] };
const deepseekTimeoutMs = Number(process.env.DEEPSEEK_TIMEOUT_MS || 35_000);

function json(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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
  const rank = (items, limit) => items
    .map((item) => ({ item, score: relevanceScore(item, terms) }))
    .sort((a, b) => b.score - a.score)
    .filter((entry) => entry.score > 0)
    .slice(0, limit)
    .map((entry) => entry.item);
  return {
    mapFeatures: rank(mapFeatures, 10),
    guideRecords: rank(guideData.records || [], 15),
  };
}

async function answerQuestion(message) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  if (!deepseekKey) return json({ error: "DEEPSEEK_API_KEY is not configured" }, 503);

  const context = findRelevantContext(message);
  const completion = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(deepseekTimeoutMs),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${deepseekKey}`,
    },
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
    const parsed = JSON.parse(content.replace(/^```json\s*|\s*```$/g, ""));
    return json({
      message: String(parsed.message || "暂时没有找到可靠答案。"),
      placeIds: Array.isArray(parsed.placeIds)
        ? parsed.placeIds.filter((id) => mapFeatures.some((item) => item.id === id))
        : [],
    });
  } catch {
    return json({ message: content || "暂时没有找到可靠答案。", placeIds: [] });
  }
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    try {
      const input = await request.json();
      const message = String(input.message || "").trim();
      if (!message) return json({ error: "message is required" }, 400);
      return await answerQuestion(message);
    } catch (error) {
      console.error(error);
      return json({ error: "Agent service temporarily unavailable" }, 500);
    }
  },
};
