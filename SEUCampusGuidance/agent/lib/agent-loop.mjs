// 多轮工具调用循环。async generator，yield 的就是 SSE 事件对象。
//
// 结构上分两段，这是为了规避一个协议层的不确定性：
//   决策轮  stream:false + 带 tools   —— 工具调用一次性拿全，没有分片拼装风险
//   生成轮  stream:true  + 不带 tools —— 纯文本 delta，最标准的用法
// DeepSeek 官方文档列出的 streaming delta 字段只有 content/reasoning_content/role/logprobs，
// 没有 tool_calls，也没承诺流式下会返回工具调用，所以不赌它。
//
// 进循环前先做一次确定性预检索：本地关键词检索约 1ms、零 API 成本，作用是
//   ① 保证至少有一次召回，模型一次工具都不调也能答；
//   ② 常见问题被压到只需 1 次 API 调用。
// 这比 tool_choice:"required" 可靠，也不会逼着「你好」「我同学晕倒了」去检索。

import { complete, streamText } from "./deepseek.mjs";
import { TOOLS, executeTool, safeParseArgs, renderSearchResult } from "./tools.mjs";
import { searchGuide, versionOf } from "./retrieve.mjs";
import { campusName, detectCampus, isCampusSlug, DEFAULT_CAMPUS } from "./campus.mjs";
import { buildSystemPrompt, isEmergency } from "./prompt.mjs";

const MAX_TOOL_ROUNDS = 4;
const MAX_TOOL_CHARS = 9000; // 全流程注入给模型的检索正文总预算
const DECISION_MAX_TOKENS = 500;
const ANSWER_MAX_TOKENS = 1400;
const HISTORY_LIMIT = 6;
const DEADLINE_MS = 50_000; // 到点强制收尾，留出余量给生成轮
const MAX_SOURCES = 6;
const REPLAY_SLICE = 24;

function event(name, data) {
  return { event: name, data };
}

function clampHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant") && typeof item.content === "string")
    .slice(-HISTORY_LIMIT)
    .map((item) => ({ role: item.role, content: item.content.slice(0, 1500) }));
}

function buildSources(seen) {
  return [...seen.values()]
    .sort((a, b) => (b.round ?? 0) - (a.round ?? 0) || (b.score ?? 0) - (a.score ?? 0))
    .slice(0, MAX_SOURCES)
    .map((chunk) => ({
      id: chunk.id,
      campus: chunk.campus,
      campusName: chunk.campusName,
      section: chunk.sectionPath,
      pages: chunk.pages,
      version: chunk.version,
    }));
}

function* sliceForReplay(text) {
  for (let at = 0; at < text.length; at += REPLAY_SLICE) yield text.slice(at, at + REPLAY_SLICE);
}

export async function* runAgent({ message, campus: campusLock = null, history = [], signal } = {}) {
  const startedAt = Date.now();
  const locked = isCampusSlug(campusLock);
  let campus = locked ? campusLock : (detectCampus(message) || DEFAULT_CAMPUS);

  yield event("meta", {
    campus,
    campusName: campusName(campus),
    version: versionOf(campus),
    locked,
  });

  const seen = new Map();
  const calls = new Set();
  const budget = { remaining: MAX_TOOL_CHARS };

  // ① 确定性预检索
  const seed = searchGuide({ campus, query: message, topK: 3 });
  const seedText = renderSearchResult(seed, { campus, query: message, seen });
  budget.remaining -= seedText.length;
  for (const hit of seed) seen.set(hit.id, { ...hit, round: 0 });
  yield event("tool_result", {
    round: 0,
    name: "search_guide",
    auto: true,
    count: seed.length,
    sections: seed.map((hit) => hit.sectionPath),
  });

  const messages = [
    { role: "system", content: buildSystemPrompt({ campus, campusLock: locked, emergency: isEmergency(message) }) },
    ...clampHistory(history),
    { role: "user", content: `用户问题：${message}\n\n【系统预检索结果 · ${campusName(campus)}】\n${seedText}` },
  ];

  // ② 决策轮
  let round = 0;
  let directAnswer = null;
  let hitLimit = false;

  while (round < MAX_TOOL_ROUNDS) {
    if (Date.now() - startedAt > DEADLINE_MS) {
      hitLimit = true;
      break;
    }
    round += 1;

    const reply = await complete({
      messages,
      tools: TOOLS,
      toolChoice: "auto",
      maxTokens: DECISION_MAX_TOKENS,
      signal,
    });
    const choice = reply.choices?.[0] || {};
    const assistant = choice.message || {};
    const toolCalls = assistant.tool_calls || [];

    if (!toolCalls.length) {
      // 模型认为资料够了。若它已经写出完整答案（不是被 max_tokens 截断），直接复用，省一次调用。
      const content = String(assistant.content || "").trim();
      if (content.length > 40 && choice.finish_reason === "stop") directAnswer = content;
      round -= 1; // 这一轮没调用工具，不计入工具轮数
      break;
    }

    messages.push({ role: "assistant", content: assistant.content ?? null, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function?.name || "";
      const args = safeParseArgs(call.function?.arguments, { campus, message });
      yield event("tool_call", { round, name, args });

      const at = Date.now();
      const { text, hits } = executeTool(name, args, { seen, calls, budget });
      for (const hit of hits) seen.set(hit.id, { ...hit, round });

      // 模型改判了校区（跨校区问题的第二次检索），跟着走，除非用户锁定了校区。
      if (!locked && isCampusSlug(args.campus) && args.campus !== campus) campus = args.campus;

      yield event("tool_result", {
        round,
        name,
        count: hits.length,
        sections: hits.map((hit) => hit.sectionPath),
        tookMs: Date.now() - at,
      });
      messages.push({ role: "tool", tool_call_id: call.id, content: text });
    }

    if (round >= MAX_TOOL_ROUNDS) hitLimit = true;
  }

  // ③ 生成轮
  if (directAnswer) {
    for (const piece of sliceForReplay(directAnswer)) yield event("token", { t: piece });
  } else {
    if (hitLimit) {
      messages.push({
        role: "system",
        content: "已达到检索次数上限。请立即基于上文已检索到的内容作答；缺失的部分明确说明指南未覆盖，并引导用户查官方渠道。不要再尝试调用工具。",
      });
    }
    let streamed = false;
    try {
      for await (const delta of streamText({ messages, maxTokens: ANSWER_MAX_TOKENS, signal })) {
        streamed = true;
        yield event("token", { t: delta });
      }
    } catch (error) {
      if (streamed) throw error; // 已经吐了一半，不能再重来
      console.error("流式生成失败，回退非流式：", error.message);
    }
    if (!streamed) {
      // 降级：非流式补一次，按片回放，前端无感。
      const reply = await complete({ messages, maxTokens: ANSWER_MAX_TOKENS, signal });
      const content = String(reply.choices?.[0]?.message?.content || "").trim()
        || "抱歉，这次没能生成回答，请再试一次。";
      for (const piece of sliceForReplay(content)) yield event("token", { t: piece });
    }
  }

  yield event("sources", { sources: buildSources(seen) });
  yield event("done", {
    campus,
    campusName: campusName(campus),
    rounds: round,
    tookMs: Date.now() - startedAt,
    placeIds: [], // 地图联动是 P2，字段先占位
  });
}
