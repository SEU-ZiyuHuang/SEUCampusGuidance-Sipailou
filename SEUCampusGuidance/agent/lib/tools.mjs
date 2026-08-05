// 工具定义与执行。
//
// 工具描述里必须写清「检索是字面匹配、没有同义扩展」并给出改写示例——这是模型学会
// 自我纠偏的关键。实测「哪里能剪头发」在六份指南里字面 0 命中，但「理发」能命中；
// 没有这段描述，模型会直接回答「指南里没有」，多轮循环的价值就没了。

import { searchGuide, listSections, getChunk, countChunks } from "./retrieve.mjs";
import { CAMPUS_SLUGS, campusName, isCampusSlug } from "./campus.mjs";

const CAMPUS_DESCRIPTION = `校区 slug，可选值：${CAMPUS_SLUGS.join("、")}。`;

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_guide",
      description: [
        "在东南大学六校区《新生实用信息简明指南》知识库中检索章节原文（含源图页码）。",
        "这是你获取一切校园事实的唯一途径：宿舍、食堂、图书馆、体育场馆、快递外卖、医疗、接驳车、地铁公交、周边商业，全部必须先检索再回答。",
        "【重要】检索是字面子串匹配，没有同义词扩展。返回为空或不相关时不要放弃，换成指南里更可能出现的书面词再检一次，例如：",
        "「剪头发」→「理发」；「洗澡」→「浴室 热水」；「网速」→「校园网 宽带」；「床帘多大」→「床铺 尺寸」；「怎么去机场」→「机场 禄口」。",
        "一次只能检索一个校区。跨校区问题请分别检索。",
      ].join("\n"),
      parameters: {
        type: "object",
        properties: {
          campus: { type: "string", enum: CAMPUS_SLUGS, description: `${CAMPUS_DESCRIPTION}用户锁定校区时必须用锁定值。` },
          query: {
            type: "string",
            description: "检索词，空格分隔 2—5 个关键词，用地点名／设施名／线路名这类名词，不要写整句问题。例：「梅园 床铺 尺寸」「兰台线 节假日 时刻」「近邻宝 快递」。",
          },
          top_k: { type: "integer", minimum: 1, maximum: 6, description: "返回章节数，默认 3；问题宽泛时可给 5—6。" },
        },
        required: ["campus", "query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_sections",
      description: "列出某校区指南的全部章节标题（不含正文）。用于两种场景：① 连续检索未命中，需要确认该校区覆盖了哪些主题；② 用户问题很宽泛（「这个校区有什么」）。拿到目录后仍需用 search_guide 或 read_section 取正文。",
      parameters: {
        type: "object",
        properties: { campus: { type: "string", enum: CAMPUS_SLUGS, description: CAMPUS_DESCRIPTION } },
        required: ["campus"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_section",
      description: "按章节 id 读取整节原文。用于 list_sections 之后精确取用，或 search_guide 的结果需要补全时。",
      parameters: {
        type: "object",
        properties: {
          section_id: { type: "string", description: "形如 jiulonghu/09/2 的章节 id，来自 search_guide 或 list_sections 的返回。" },
        },
        required: ["section_id"],
      },
    },
  },
];

/**
 * 工具参数容错。模型可能给出非法 JSON、幻觉的校区、空 query——这些都不该让整轮失败。
 */
export function safeParseArgs(raw, { campus, message }) {
  let args = {};
  const text = typeof raw === "string" ? raw : JSON.stringify(raw ?? {});
  try {
    args = JSON.parse(text || "{}");
  } catch {
    const cleaned = text.replace(/^```json\s*|\s*```$/g, "").trim();
    try {
      args = JSON.parse(cleaned);
    } catch {
      args = {};
    }
  }
  if (typeof args !== "object" || args === null) args = {};
  if (!isCampusSlug(args.campus)) args.campus = campus;
  if (typeof args.query !== "string" || !args.query.trim()) args.query = message;
  args.top_k = Math.min(Math.max(Number(args.top_k) || 3, 1), 6);
  return args;
}

/** 把检索结果渲染成给模型看的纯文本。已给过的章节只回标题，省掉重复的输入 token。 */
export function renderSearchResult(hits, { campus, query, seen }) {
  const total = countChunks(campus);
  if (!hits.length) {
    return [
      `未命中：检索词「${query}」在${campusName(campus)}指南中没有匹配到任何章节。`,
      `该校区共 ${total} 个章节，标题如下：`,
      ...listSections(campus).map((section) => `  - ${section.sectionPath}`),
      "请换用指南更可能使用的书面词再检一次（把口语换成正式名称），或改检其他校区。",
    ].join("\n");
  }
  const blocks = hits.map((hit, index) => {
    const head = `【${index + 1}】${hit.campusName} · ${hit.version} · ${hit.sectionPath} · 源图 ${hit.pages.join("、") || "无标注"} · id=${hit.id}`;
    if (seen.has(hit.id)) return `${head}\n（此节正文已在前一次检索中提供，不再重复）`;
    seen.set(hit.id, hit);
    return `${head}\n${hit.text}`;
  });
  return `${blocks.join("\n\n")}\n\n（命中 ${hits.length}/${total} 个章节；若未覆盖所需信息，请换关键词再检一次。）`;
}

/**
 * 执行一次工具调用。
 * 返回 { text, hits }：text 给模型，hits 用于服务端确定性生成 sources。
 */
export function executeTool(name, args, context) {
  const { seen, calls, budget } = context;

  // 同参数重复调用是死循环的前兆，直接劝退。
  const signature = `${name}:${JSON.stringify(args)}`;
  if (calls.has(signature)) {
    return { text: "你刚刚用完全相同的参数检索过，结果见上文。请换关键词、换校区，或直接基于已有内容作答。", hits: [] };
  }
  calls.add(signature);

  if (budget.remaining <= 0) {
    return { text: "检索内容已达上限。请基于上文已有资料作答，缺失部分说明指南未覆盖。", hits: [] };
  }

  if (name === "search_guide") {
    const hits = searchGuide({ campus: args.campus, query: args.query, topK: args.top_k });
    const text = renderSearchResult(hits, { campus: args.campus, query: args.query, seen });
    budget.remaining -= text.length;
    return { text, hits };
  }

  if (name === "list_sections") {
    const sections = listSections(args.campus);
    const text = [
      `${campusName(args.campus)}指南共 ${sections.length} 个章节：`,
      ...sections.map((section) => `  - ${section.sectionPath}（id=${section.id}，源图 ${section.pages.join("、") || "无标注"}）`),
      "用 search_guide 或 read_section 取正文。",
    ].join("\n");
    budget.remaining -= text.length;
    return { text, hits: [] };
  }

  if (name === "read_section") {
    const chunk = getChunk(String(args.section_id || ""));
    if (!chunk) {
      return { text: `没有 id 为「${args.section_id}」的章节。请先用 list_sections 或 search_guide 获取合法 id。`, hits: [] };
    }
    seen.set(chunk.id, chunk);
    const text = `${chunk.campusName} · ${chunk.version} · ${chunk.sectionPath} · 源图 ${chunk.pages.join("、") || "无标注"}\n${chunk.text}`;
    budget.remaining -= text.length;
    return { text, hits: [chunk] };
  }

  return { text: `未知工具「${name}」。可用工具：search_guide、list_sections、read_section。`, hits: [] };
}
