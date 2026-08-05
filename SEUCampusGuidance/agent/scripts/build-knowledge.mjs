// 把 原校区指南-md文档整理/ 下的六份校区指南切块，生成 Agent 检索用的知识数据。
//
//   node scripts/build-knowledge.mjs
//
// 产出（均提交进仓库，线上不跑构建）：
//   data/knowledge.mjs          CAMPUSES + CHUNKS，ESM 具名导出
//   data/knowledge.report.json  构建报告，供人工 review
//   data/map-features.mjs       从 ../../data/map-features.js 转存，让 agent/ 自包含

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const agentDir = path.resolve(scriptDir, "..");
const repoDir = path.resolve(agentDir, "..");
const sourceDir = path.join(repoDir, "原校区指南-md文档整理");
const outputDir = path.join(agentDir, "data");

// 整章保留的上限：超过就按 ### 拆。定在 1800 字符时，恰好只有五个交通类长章节被拆开。
const MAX_CHUNK_CHARS = 1800;
const MIN_CHUNK_CHARS = 40;

const CAMPUS_TABLE = [
  { slug: "jiulonghu", key: "九龙湖", name: "九龙湖校区", aliases: ["九龙湖", "江宁校区"] },
  { slug: "sipailou", key: "四牌楼", name: "四牌楼校区", aliases: ["四牌楼", "本部", "老校区"] },
  { slug: "dingjiaqiao", key: "丁家桥", name: "丁家桥校区", aliases: ["丁家桥", "丁桥"] },
  { slug: "suzhou", key: "苏州", name: "苏州校区", aliases: ["苏州"] },
  { slug: "jiangbei", key: "江北", name: "江北校区", aliases: ["江北", "浦口", "成贤学院"] },
  { slug: "wuxi", key: "无锡", name: "无锡校区", aliases: ["无锡", "滨湖"] },
];

// 不进检索块的章节。「已识别的差异」必须保留——它是「差异项并列呈现」这条回答规范的唯一事实来源。
const EXCLUDE_SECTION = /^目录$|Agent\s*使用建议/;
const EXCLUDE_SUB = /来源页对应关系|版权与署名|关于原发布方/;

// chunkKey 的英文词根 → 中文命中词。只用于把 md 里「建议的知识分块」列表对齐到章节，不参与检索打分。
const KEY_LEXICON = {
  map: ["地图", "空间", "概览"], gate: ["校门", "出入口"], gates: ["校门", "出入口"],
  campus: ["校区", "校园"], dorm: ["宿舍", "住宿"], dormitory: ["宿舍", "住宿"],
  dormitories: ["宿舍", "住宿"], lantai: ["兰台"], west: ["校西"], wenchang: ["文昌"],
  shatangyuan: ["沙塘园"], chengyuan: ["成园"], canteen: ["食堂", "餐"], canteens: ["食堂", "餐"],
  meal: ["餐期", "就餐"], medical: ["医疗", "医院", "校医"], library: ["图书馆"],
  study: ["自习", "学习"], spaces: ["空间"], printing: ["打印"], classroom: ["教室", "教学"],
  classrooms: ["教室", "教学"], card: ["校园卡", "一卡通"], delivery: ["快递", "外卖"],
  parcel: ["快递"], courier: ["快递"], takeout: ["外卖"], post: ["邮政", "邮局"],
  laundry: ["洗衣"], hot: ["热水"], water: ["热水", "饮水"], utilities: ["水电"],
  sports: ["体育", "场馆", "运动"], pool: ["游泳"], booking: ["预约"], facilities: ["设施"],
  shuttle: ["接驳", "校车"], metro: ["地铁", "轨道"], bus: ["公交"], bike: ["自行车", "骑行"],
  cycling: ["骑行"], ebikes: ["电单车"], autonomous: ["无人小巴"], airport: ["机场"],
  station: ["车站", "枢纽"], stations: ["车站", "枢纽"], rail: ["铁路", "火车"],
  intercampus: ["跨校区", "其他校区"], transport: ["交通", "出行"], routes: ["路线", "线路"],
  nearby: ["周边"], around: ["周边"], food: ["餐饮", "美食"], night: ["夜市"], market: ["夜市"],
  shopping: ["商业", "商圈", "购物"], business: ["商圈", "商业"], districts: ["商圈"],
  sights: ["景点"], bank: ["银行"], banks: ["银行"], shop: ["商店", "超市"],
  shops: ["商店", "超市"], stores: ["商店", "超市"], repair: ["报修"], contacts: ["联系"],
  access: ["门禁", "出入"], parking: ["停车"], administrative: ["职能", "行政", "办事"],
  services: ["服务"], service: ["服务"], hours: ["时间"], safety: ["安全"],
  hospital: ["医院"], hospitals: ["医院"], convenience: ["便民"], payment: ["支付", "缴费"],
  source: ["来源", "差异"], conflicts: ["差异"], caveats: ["差异"], freshness: ["时效"],
  copyright: ["版权"], teaching: ["教学"], research: ["科研"], buildings: ["楼宇", "建筑"],
  centre: ["中心"], eae: ["金智楼"], wireless: ["无线谷"], valley: ["无线谷"],
  line: ["线路"], charging: ["充电"], commercial: ["商业"], data: ["数据"],
};

// 自动对齐兜不住的，写在这里。key = chunk id，value = chunkKey。
const CHUNK_KEY_OVERRIDES = {};

const report = {
  generatedAt: new Date().toISOString(),
  campuses: [],
  unmatchedKeys: [],
  chunksWithoutPages: [],
  oversizedChunks: [],
};

function parseFrontmatter(source, file) {
  const matched = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(source);
  if (!matched) throw new Error(`${file}: 缺少 YAML frontmatter`);
  const meta = {};
  for (const line of matched[1].split(/\r?\n/)) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    meta[line.slice(0, at).trim()] = line.slice(at + 1).trim().replace(/^["']|["']$/g, "");
  }
  for (const field of ["title", "campus", "source_version", "license", "source_author"]) {
    if (!meta[field]) throw new Error(`${file}: frontmatter 缺字段 ${field}`);
  }
  return [meta, source.slice(matched[0].length)];
}

// 2025.09 → 2025.09 版；25版（附件标题标注…） → 25版；2025（原图称"25版"） → 2025 版
function versionLabel(raw) {
  const head = String(raw).split(/[（(]/)[0].trim();
  return /版$/.test(head) ? head : `${head} 版`;
}

function findCampus(meta, file) {
  const found = CAMPUS_TABLE.find((entry) => String(meta.campus).includes(entry.key));
  if (!found) throw new Error(`${file}: 无法从 campus="${meta.campus}" 识别校区`);
  return found;
}

// 正文开头、目录之前的引用块，是原文的时效提醒，整段注入 system prompt。
function extractNotice(body) {
  const lines = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^##\s/.test(line)) break;
    if (/^>\s?/.test(line)) lines.push(line.replace(/^>\s?/, "").trim());
  }
  return lines.filter(Boolean).join("\n").trim();
}

function splitHeadings(body) {
  const nodes = [];
  let current = null;
  for (const line of body.split(/\r?\n/)) {
    const matched = /^(#{2,4})\s+(.+)$/.exec(line);
    if (matched) {
      current = { level: matched[1].length, title: matched[2].trim(), lines: [] };
      nodes.push(current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  const sections = [];
  for (const node of nodes) {
    if (node.level === 2) sections.push({ title: node.title, own: node.lines, subs: [] });
    else if (sections.length) sections.at(-1).subs.push(node);
  }
  return sections;
}

// 「Agent 使用建议」章不进检索，抽成校区元数据：回答规则、分块 key 列表、回答模板。
function parseAgentSection(section) {
  if (!section) return { answerRules: "", chunkKeys: [], templates: "" };
  const keysNode = section.subs.find((sub) => /建议的知识分块/.test(sub.title));
  const chunkKeys = (keysNode ? keysNode.lines.join("\n").match(/`([a-z0-9_]+)`/g) || [] : [])
    .map((token) => token.replace(/`/g, ""));
  // 四牌楼没有「推荐回答模板」小节，所以只能按标题筛，不能按「切到模板为止」来切。
  const templateNodes = section.subs.filter((sub) => /推荐回答模板/.test(sub.title) || sub.level === 4);
  return {
    answerRules: section.own.join("\n").trim(),
    chunkKeys,
    templates: templateNodes
      .map((sub) => `${"#".repeat(sub.level)} ${sub.title}\n${sub.lines.join("\n")}`)
      .join("\n").trim(),
  };
}

function extractCredits(sections) {
  const lines = [];
  for (const section of sections) {
    for (const sub of section.subs) {
      if (/版权与署名|关于原发布方/.test(sub.title)) lines.push(sub.lines.join("\n").trim());
    }
  }
  return lines.filter(Boolean).join("\n\n").trim();
}

// [源图 P03] / [源图 P02、P04] / [源图 P02—P03] 三种真实形态，外加字面占位 [源图 Pxx]（要过滤掉）。
function extractPages(text) {
  const pages = new Set();
  for (const marker of text.matchAll(/\[源图\s*([^\]]+)\]/g)) {
    for (const part of marker[1].split(/[、,，/]/)) {
      const range = /P(\d{1,2})\s*[—–\-~至到]\s*P?(\d{1,2})/.exec(part);
      if (range) {
        for (let page = Number(range[1]); page <= Number(range[2]); page += 1) {
          pages.add(`P${String(page).padStart(2, "0")}`);
        }
        continue;
      }
      const single = /P(\d{1,2})(?!\d)/.exec(part);
      if (single) pages.add(`P${String(Number(single[1])).padStart(2, "0")}`);
    }
  }
  // 差异项章节写的是裸「P02 总览页」，没有 [源图 ] 包裹。
  if (pages.size === 0) {
    for (const bare of text.matchAll(/(?:^|[^A-Za-z])P(\d{2})(?!\d)/g)) pages.add(`P${bare[1]}`);
  }
  return [...pages].sort();
}

function sectionNumber(title) {
  const matched = /^(\d+)/.exec(title);
  return matched ? String(matched[1]).padStart(2, "0") : "xx";
}

function tidy(text) {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function pushChunk(chunks, context, sectionPath, suffix, text) {
  const body = tidy(text);
  if (body.length < MIN_CHUNK_CHARS) return;
  const id = `${context.slug}/${context.number}${suffix}`;
  chunks.push({
    id,
    campus: context.slug,
    campusName: context.name,
    version: context.version,
    sectionPath,
    chunkKey: "",
    pages: extractPages(body),
    text: body,
  });
  if (body.length > MAX_CHUNK_CHARS) report.oversizedChunks.push({ id, chars: body.length });
}

// 最后一层兜底：单个 ### 仍然过长时按空行切，且不切断 markdown 表格。
function splitLongText(text, limit) {
  const blocks = [];
  let buffer = [];
  let isTable = false;
  for (const line of text.split(/\r?\n/)) {
    const tableLine = /^\s*\|/.test(line);
    if (!tableLine && isTable) {
      blocks.push(buffer.join("\n"));
      buffer = [];
    }
    isTable = tableLine;
    buffer.push(line);
    if (!tableLine && line.trim() === "" && buffer.join("\n").length > limit) {
      blocks.push(buffer.join("\n"));
      buffer = [];
    }
  }
  if (buffer.length) blocks.push(buffer.join("\n"));

  const merged = [];
  for (const block of blocks) {
    const last = merged.at(-1);
    if (last && (last + "\n" + block).length <= limit) merged[merged.length - 1] = last + "\n" + block;
    else merged.push(block);
  }
  return merged.map(tidy).filter(Boolean);
}

function emitSection(section, context, chunks) {
  const subText = section.subs
    .map((sub) => `${"#".repeat(sub.level)} ${sub.title}\n${sub.lines.join("\n")}`)
    .join("\n");
  const fullText = tidy(`${section.own.join("\n")}\n${subText}`);
  const hasExcludedSub = section.subs.some((sub) => sub.level === 3 && EXCLUDE_SUB.test(sub.title));

  // 整章够短且没有需要剔除的子节 → 整章一块，保住表格和上下文。
  if (fullText.length <= MAX_CHUNK_CHARS && !hasExcludedSub) {
    pushChunk(chunks, context, section.title, "", fullText);
    return;
  }

  const lead = tidy(section.own.join("\n"));
  if (lead.length > 120) pushChunk(chunks, context, `${section.title} > 概述`, "/0", lead);

  for (let index = 0; index < section.subs.length; index += 1) {
    const sub = section.subs[index];
    if (sub.level !== 3 || EXCLUDE_SUB.test(sub.title)) continue;
    // #### 并入所属的 ###，让「工作日时刻 / 节假日时刻」这类成对内容留在一起。
    let text = sub.lines.join("\n");
    for (let next = index + 1; next < section.subs.length && section.subs[next].level > 3; next += 1) {
      text += `\n#### ${section.subs[next].title}\n${section.subs[next].lines.join("\n")}`;
    }
    const subNumber = (/^\d+\.(\d+)/.exec(sub.title) || [, String(index + 1)])[1];
    const sectionPath = `${section.title} > ${sub.title}`;
    const tidied = tidy(text);
    if (tidied.length <= MAX_CHUNK_CHARS) {
      pushChunk(chunks, context, sectionPath, `/${subNumber}`, tidied);
      continue;
    }
    const parts = splitLongText(tidied, Math.round(MAX_CHUNK_CHARS * 0.78));
    parts.forEach((part, partIndex) => {
      const path = parts.length > 1 ? `${sectionPath}（${partIndex + 1}/${parts.length}）` : sectionPath;
      pushChunk(chunks, context, path, `/${subNumber}-${partIndex + 1}`, part);
    });
  }
}

// key 与 chunk 都按文档顺序排列，所以用单调贪心对齐：游标只前进，不回退。
function assignChunkKeys(keys, chunks, slug) {
  let cursor = 0;
  for (const key of keys) {
    const words = key.split("_").flatMap((word) => KEY_LEXICON[word] || []);
    if (!words.length) {
      report.unmatchedKeys.push({ campus: slug, key, reason: "词典无此词根" });
      continue;
    }
    let best = -1;
    let bestScore = 0;
    for (let index = cursor; index < chunks.length; index += 1) {
      const haystack = chunks[index].sectionPath + chunks[index].text.slice(0, 300);
      const score = words.reduce((sum, word) => sum + (haystack.includes(word) ? word.length : 0), 0)
        - (index - cursor) * 0.4;
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
    if (best >= 0 && bestScore >= 2) {
      if (!chunks[best].chunkKey) chunks[best].chunkKey = key;
      cursor = best;
    } else {
      report.unmatchedKeys.push({ campus: slug, key, reason: "无足够相似章节" });
    }
  }
}

async function buildCampus(file) {
  const source = await fs.readFile(path.join(sourceDir, file), "utf8");
  const [meta, body] = parseFrontmatter(source, file);
  const campus = findCampus(meta, file);
  const version = versionLabel(meta.source_version);
  const sections = splitHeadings(body);

  const agentSection = sections.find((section) => /Agent\s*使用建议/.test(section.title));
  const { answerRules, chunkKeys, templates } = parseAgentSection(agentSection);

  const chunks = [];
  for (const section of sections) {
    if (EXCLUDE_SECTION.test(section.title)) continue;
    emitSection(section, { slug: campus.slug, name: campus.name, version, number: sectionNumber(section.title) }, chunks);
  }
  assignChunkKeys(chunkKeys, chunks, campus.slug);

  for (const chunk of chunks) {
    if (!chunk.pages.length) report.chunksWithoutPages.push(chunk.id);
  }
  report.campuses.push({
    slug: campus.slug,
    file,
    sourceChars: [...source].length,
    chunks: chunks.length,
    chunkChars: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
    declaredKeys: chunkKeys.length,
  });

  return {
    campus: {
      slug: campus.slug,
      name: campus.name,
      fullName: meta.campus,
      aliases: campus.aliases,
      version,
      license: meta.license,
      author: meta.source_author,
      notice: extractNotice(body),
      answerRules,
      templates,
      chunkKeys,
      credits: extractCredits(sections),
    },
    chunks,
  };
}

async function buildMapFeatures() {
  const source = await fs.readFile(path.join(repoDir, "data", "map-features.js"), "utf8");
  const sandbox = { window: {} };
  const { runInNewContext } = await import("node:vm");
  runInNewContext(source, sandbox, { timeout: 2000 });
  const features = sandbox.window.MAP_FEATURES || [];
  await fs.writeFile(
    path.join(outputDir, "map-features.mjs"),
    `// AUTO-GENERATED by scripts/build-knowledge.mjs —— 请勿手工编辑\n`
      + `// 源文件：../../data/map-features.js（四牌楼地图点位，供旧 /api/agent/chat 契约使用）\n`
      + `export const MAP_FEATURES = ${JSON.stringify(features, null, 2)};\n`,
    "utf8",
  );
  return features.length;
}

const files = (await fs.readdir(sourceDir)).filter((file) => file.endsWith(".md")).sort();
if (files.length === 0) throw new Error(`${sourceDir} 下没有 md 文件`);

const campuses = [];
const chunks = [];
for (const file of files) {
  const built = await buildCampus(file);
  campuses.push(built.campus);
  chunks.push(...built.chunks);
}

// 输出顺序按 CAMPUS_TABLE，不按文件名排序，让「自动判断」的默认校区排在最前。
campuses.sort((a, b) => CAMPUS_TABLE.findIndex((x) => x.slug === a.slug) - CAMPUS_TABLE.findIndex((x) => x.slug === b.slug));

await fs.mkdir(outputDir, { recursive: true });

const build = {
  generatedAt: report.generatedAt,
  campusCount: campuses.length,
  chunkCount: chunks.length,
  chunkChars: chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
};

await fs.writeFile(
  path.join(outputDir, "knowledge.mjs"),
  `// AUTO-GENERATED by scripts/build-knowledge.mjs —— 请勿手工编辑\n`
    + `// 源文件：../../原校区指南-md文档整理/*.md（CC BY-SA 4.0 · 东南大学地理协会 @东奔南走）\n`
    + `// 重新生成：node scripts/build-knowledge.mjs\n\n`
    + `export const KNOWLEDGE_BUILD = ${JSON.stringify(build, null, 2)};\n\n`
    + `export const CAMPUSES = ${JSON.stringify(campuses, null, 2)};\n\n`
    + `export const CHUNKS = ${JSON.stringify(chunks, null, 2)};\n`,
  "utf8",
);

const featureCount = await buildMapFeatures();

await fs.writeFile(
  path.join(outputDir, "knowledge.report.json"),
  JSON.stringify({ ...report, build, mapFeatures: featureCount }, null, 2) + "\n",
  "utf8",
);

const sizes = await Promise.all(["knowledge.mjs", "map-features.mjs"].map(async (name) => {
  const stat = await fs.stat(path.join(outputDir, name));
  return `${name} ${(stat.size / 1024).toFixed(0)} KB`;
}));

console.log(`校区 ${campuses.length} 个 · chunk ${chunks.length} 个 · 正文 ${build.chunkChars} 字符`);
for (const entry of report.campuses) {
  console.log(`  ${entry.slug.padEnd(12)} chunk ${String(entry.chunks).padStart(2)} · 正文 ${String(entry.chunkChars).padStart(5)} 字符 · 声明 key ${entry.declaredKeys}`);
}
console.log(`无源图页码的 chunk：${report.chunksWithoutPages.length ? report.chunksWithoutPages.join("、") : "无"}`);
console.log(`超长 chunk：${report.oversizedChunks.length ? report.oversizedChunks.map((x) => `${x.id}(${x.chars})`).join("、") : "无"}`);
console.log(`未对齐的 chunkKey：${report.unmatchedKeys.length} 个（详见 data/knowledge.report.json）`);
console.log(`地图点位 ${featureCount} 个 · ${sizes.join(" · ")}`);
