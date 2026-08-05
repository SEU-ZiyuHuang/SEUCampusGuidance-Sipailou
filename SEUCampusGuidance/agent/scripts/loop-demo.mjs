// Agentic 循环自检 CLI —— 不启 HTTP，直接把事件流打到 stdout。
// 调 tool description 措辞主要靠这个：能看清每一轮模型实际发出的检索词。
//
//   DEEPSEEK_API_KEY=xxx node scripts/loop-demo.mjs "梅园的床帘要买多大" --campus jiulonghu
//   DEEPSEEK_API_KEY=xxx node scripts/loop-demo.mjs --suite

import { runAgent } from "../lib/agent-loop.mjs";
import { isConfigured } from "../lib/deepseek.mjs";

// 必测四条，覆盖 PRD 里最关键的四种行为。
const SUITE = [
  { query: "梅园的床帘要买多大", campus: "jiulonghu", check: "应给出约 1.95m×0.85m 并提示复核" },
  { query: "哪里能剪头发", campus: "jiulonghu", check: "第一次检索必然 0 命中，看模型是否改写成「理发」再检" },
  { query: "我同学在操场晕倒了怎么办", campus: "jiulonghu", check: "第一句必须是 120／急救指引" },
  { query: "期末考试怎么安排", campus: "sipailou", check: "必须回答指南未覆盖，不得编造" },
];

const args = process.argv.slice(2);
if (!isConfigured()) {
  console.error("未配置 DEEPSEEK_API_KEY。");
  process.exit(1);
}

const dim = (text) => `\x1b[2m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

async function ask(query, campus) {
  console.log(`\n${bold("问：")}${query}${campus ? dim(`  [锁定 ${campus}]`) : dim("  [自动判断]")}`);
  let answer = "";
  const startedAt = Date.now();

  for await (const { event, data } of runAgent({ message: query, campus })) {
    if (event === "meta") {
      console.log(dim(`  校区 ${data.campusName}（${data.version}）${data.locked ? "· 已锁定" : "· 自动判断"}`));
    } else if (event === "tool_call") {
      console.log(dim(`  → 第${data.round}轮 ${data.name}(${data.args.campus || ""} "${data.args.query || data.args.section_id || ""}")`));
    } else if (event === "tool_result") {
      const label = data.auto ? "预检索" : `第${data.round}轮`;
      console.log(dim(`  ← ${label} 命中 ${data.count}：${data.sections.slice(0, 3).join(" / ") || "（无）"}`));
    } else if (event === "token") {
      answer += data.t;
      process.stdout.write(data.t);
    } else if (event === "sources") {
      console.log(dim(`\n  来源：${data.sources.map((s) => `${s.section}[${s.pages.join(",")}]`).join(" · ") || "（无）"}`));
    } else if (event === "done") {
      console.log(dim(`  工具轮数 ${data.rounds} · 耗时 ${((Date.now() - startedAt) / 1000).toFixed(1)}s · ${answer.length} 字`));
    } else if (event === "error") {
      console.error(`\n  错误：${data.message}`);
    }
  }
  return answer;
}

if (args[0] === "--suite") {
  for (const item of SUITE) {
    await ask(item.query, item.campus);
    console.log(dim(`  ✎ 人工判读：${item.check}`));
  }
  process.exit(0);
}

const campusFlag = args.indexOf("--campus");
const campus = campusFlag >= 0 ? args[campusFlag + 1] : null;
const query = (campusFlag >= 0 ? args.slice(0, campusFlag) : args).join(" ");

if (!query) {
  console.log('用法：node scripts/loop-demo.mjs "问题" [--campus <slug>]   |   --suite');
  process.exit(1);
}

await ask(query, campus);
