// 用假的 DeepSeek 响应验证 agent-loop 的控制流。**不需要真 API key，不花钱。**
//
//   node scripts/loop-mock.mjs
//
// 这个项目没有测试框架，这是唯一能回归测试多轮循环的手段：改 agent-loop.mjs
// 或 tools.mjs 之后应当先跑它，再用 loop-demo.mjs 打真实 API。
//
// 覆盖：换词重检、预检索快路径、轮数上限、重复调用检测、跨校区切换、流式降级。

import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.DEEPSEEK_API_KEY = "sk-mock";

const AGENT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let scenario = [];
let callLog = [];

function toolCallReply(name, args) {
  return {
    choices: [{
      finish_reason: "tool_calls",
      message: { content: null, tool_calls: [{ id: `call_${callLog.length}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] },
    }],
  };
}
function textReply(text, finish = "stop") {
  return { choices: [{ finish_reason: finish, message: { content: text } }] };
}
function sseStream(text) {
  const frames = [...text].map((ch) => `data: ${JSON.stringify({ choices: [{ delta: { content: ch } }] })}\n\n`);
  frames.push("data: [DONE]\n\n");
  return new Response(new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const frame of frames) controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  }), { status: 200 });
}

globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  callLog.push({ stream: body.stream, hasTools: Boolean(body.tools) });
  const next = scenario.shift();
  if (!next) throw new Error("场景用尽，说明循环比预期多调了一次");
  if (next.type === "stream") return sseStream(next.text);
  return new Response(JSON.stringify(next.payload), { status: 200, headers: { "Content-Type": "application/json" } });
};

const { runAgent } = await import(`${AGENT}/lib/agent-loop.mjs`);

async function collect(input) {
  const events = [];
  let answer = "";
  for await (const item of runAgent(input)) {
    events.push(item.event);
    if (item.event === "token") answer += item.data.t;
    else if (item.event === "sources") events.sources = item.data.sources;
    else if (item.event === "done") events.done = item.data;
    else if (item.event === "tool_call") (events.toolCalls ??= []).push(item.data);
  }
  return { events, answer };
}

function check(label, condition, detail = "") {
  console.log(`${condition ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!condition) process.exitCode = 1;
}

// ── 场景 1：模型换词重检（这是多轮的核心价值）──────────────────────
console.log("\n【场景 1】首检未命中 → 模型改写关键词重检 → 作答");
callLog = [];
scenario = [
  { type: "json", payload: toolCallReply("search_guide", { campus: "jiulonghu", query: "剪头发" }) },
  { type: "json", payload: toolCallReply("search_guide", { campus: "jiulonghu", query: "理发" }) },
  { type: "json", payload: textReply("READY", "stop") },
  { type: "stream", text: "2025.09 版指南显示，梅园有 0809 理发。" },
];
let r = await collect({ message: "哪里能剪头发", campus: "jiulonghu" });
check("事件序列以 meta 开头", r.events[0] === "meta");
check("有预检索 tool_result", r.events[1] === "tool_result");
check("发生了 2 次工具调用", r.events.toolCalls?.length === 2, `实际 ${r.events.toolCalls?.length}`);
check("第二次改写成了「理发」", r.events.toolCalls?.[1]?.args?.query === "理发");
check("回答被流式吐出", r.answer.includes("理发"), JSON.stringify(r.answer));
check("sources 非空", (r.events.sources?.length ?? 0) > 0, `${r.events.sources?.length} 条`);
check("决策轮非流式、生成轮流式", callLog.at(-1).stream === true && callLog[0].stream === false);
check("生成轮不带 tools", callLog.at(-1).hasTools === false);

// ── 场景 2：直接作答（预检索够用，省一次调用）─────────────────────
console.log("\n【场景 2】预检索够用 → 模型不调工具直接作答");
callLog = [];
scenario = [{ type: "json", payload: textReply("2025.09 版指南显示，床铺约 1.95m × 0.85m，购买前建议向宿管复核。") }];
r = await collect({ message: "梅园床帘多大", campus: "jiulonghu" });
check("没有工具调用事件", !r.events.toolCalls);
check("只调了 1 次 API", callLog.length === 1, `实际 ${callLog.length}`);
check("直接答案被回放", r.answer.includes("1.95"), JSON.stringify(r.answer.slice(0, 30)));
check("rounds 为 0", r.events.done?.rounds === 0, `实际 ${r.events.done?.rounds}`);

// ── 场景 3：轮数上限 ────────────────────────────────────────────
console.log("\n【场景 3】模型不停调工具 → 4 轮后强制收尾");
callLog = [];
scenario = [
  ...Array.from({ length: 4 }, (_, i) => ({ type: "json", payload: toolCallReply("search_guide", { campus: "jiulonghu", query: `词${i}` }) })),
  { type: "stream", text: "基于已检索内容作答。" },
];
r = await collect({ message: "测试轮数上限", campus: "jiulonghu" });
check("正好 4 轮工具调用", r.events.toolCalls?.length === 4, `实际 ${r.events.toolCalls?.length}`);
check("最终仍然出了答案", r.answer.length > 0);
check("done.rounds = 4", r.events.done?.rounds === 4, `实际 ${r.events.done?.rounds}`);

// ── 场景 4：重复调用检测 ────────────────────────────────────────
console.log("\n【场景 4】模型用同样参数重复调用 → 应被劝退而非死循环");
callLog = [];
const same = { campus: "jiulonghu", query: "梅园 床铺" };
scenario = [
  { type: "json", payload: toolCallReply("search_guide", same) },
  { type: "json", payload: toolCallReply("search_guide", same) },
  { type: "json", payload: textReply("READY") }, // 模型收手：调完工具还需一轮决策才知道「够了」
  { type: "stream", text: "好的。" },
];
r = await collect({ message: "测试重复", campus: "jiulonghu" });
check("两次调用都被记录", r.events.toolCalls?.length === 2);
check("循环正常结束未卡死", r.answer.length > 0);
check("API 调用数 = 决策3 + 生成1", callLog.length === 4, `实际 ${callLog.length}`);

// ── 场景 5：跨校区切换 ──────────────────────────────────────────
console.log("\n【场景 5】未锁定校区时，模型改判校区应被跟随");
callLog = [];
scenario = [
  { type: "json", payload: toolCallReply("search_guide", { campus: "wuxi", query: "无人小巴" }) },
  { type: "json", payload: textReply("READY") },
  { type: "stream", text: "无锡校区的无人小巴……" },
];
r = await collect({ message: "无人小巴几点发车" });
check("done.campus 跟随到 wuxi", r.events.done?.campus === "wuxi", `实际 ${r.events.done?.campus}`);

// ── 场景 6：流式失败降级 ────────────────────────────────────────
console.log("\n【场景 6】生成轮流式失败 → 自动回退非流式");
callLog = [];
scenario = [
  { type: "json", payload: textReply("x", "length") }, // 太短+被截断，不复用
];
let failedOnce = false;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  if (body.stream && !failedOnce) { failedOnce = true; throw new Error("模拟流式失败"); }
  if (body.stream) return sseStream("不该走到这");
  const next = scenario.shift();
  if (next) return new Response(JSON.stringify(next.payload), { status: 200 });
  return new Response(JSON.stringify(textReply("降级后的非流式回答。")), { status: 200 });
};
r = await collect({ message: "测试降级", campus: "jiulonghu" });
check("降级后仍然有答案", r.answer.includes("降级后"), JSON.stringify(r.answer));
globalThis.fetch = realFetch;

console.log(process.exitCode ? "\n有失败项" : "\n全部通过");
