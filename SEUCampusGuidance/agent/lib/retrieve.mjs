// 章节级关键词检索。
//
// 分词与打分沿用原 chat.js 的思路（中文 2—4 字滑窗 n-gram + 子串命中计分），
// 在此基础上加四件事，否则长章节会恒定压过短章节、而短章节又会被归一化捧过头：
//   1. 长词平方加权 —— 「无线谷线」比「线」有判别力得多
//   2. 标题命中 ×1.6，且标题索引含章节内部的 ### / #### 小标题 ——
//      四牌楼第 2 章叫「学习与研究」，「图书馆」只出现在它的 2.1 小标题里，
//      只看 sectionPath 的话「图书馆几点关门」根本吃不到标题加权
//   3. 词频加成（封顶 3 次）—— 通篇讲图书馆的章节应当赢过顺带提一句的章节
//   4. BM25 式的柔性长度归一 —— 开方归一太猛，会把 238 字的差异项小块捧到第一

import { CHUNKS } from "../data/knowledge.mjs";
import { getCampus } from "./campus.mjs";

const BASELINE_CHARS = 900; // 归一化基准，接近 chunk 长度中位数
const TITLE_WEIGHT = 1.6;
const LENGTH_B = 0.45; // 0=完全不归一，1=完全按长度线性归一
const MAX_TERM_HITS = 3;

const byCampus = new Map();
const byId = new Map();
for (const chunk of CHUNKS) {
  if (!byCampus.has(chunk.campus)) byCampus.set(chunk.campus, []);
  byCampus.get(chunk.campus).push(chunk);
  byId.set(chunk.id, chunk);
}

// 预算小写副本，避免每次检索都重复 toLowerCase 整个知识库。
const searchIndex = new Map(CHUNKS.map((chunk) => {
  const innerHeadings = (chunk.text.match(/^#{3,4}\s+.+$/gm) || []).join(" ");
  return [chunk.id, {
    title: `${chunk.sectionPath} ${innerHeadings}`.toLowerCase(),
    body: chunk.text.toLowerCase(),
    norm: 1 - LENGTH_B + LENGTH_B * (chunk.text.length / BASELINE_CHARS),
  }];
}));

function countOccurrences(haystack, needle) {
  let count = 0;
  let at = haystack.indexOf(needle);
  while (at >= 0 && count < MAX_TERM_HITS) {
    count += 1;
    at = haystack.indexOf(needle, at + needle.length);
  }
  return count;
}

/** 中文按 2—4 字滑窗切；英文数字整词保留。 */
export function tokenize(value) {
  const chunks = String(value).toLowerCase().match(/[\p{Script=Han}]+|[a-z0-9]+/gu) || [];
  const terms = new Set();
  for (const piece of chunks) {
    if (!/^[\p{Script=Han}]+$/u.test(piece)) {
      terms.add(piece);
      continue;
    }
    const characters = Array.from(piece);
    if (characters.length <= 4) terms.add(piece);
    for (let size = 2; size <= Math.min(4, characters.length); size += 1) {
      for (let start = 0; start <= characters.length - size; start += 1) {
        terms.add(characters.slice(start, start + size).join(""));
      }
    }
  }
  return [...terms];
}

export function scoreChunk(chunk, terms) {
  const index = searchIndex.get(chunk.id);
  if (!index) return 0;
  let score = 0;
  for (const term of terms) {
    const weight = Math.min(term.length, 4) ** 2;
    if (index.title.includes(term)) score += weight * TITLE_WEIGHT;
    const hits = countOccurrences(index.body, term);
    if (hits) score += weight * (1 + (hits - 1) * 0.35);
  }
  return score / index.norm;
}

/**
 * 在单个校区内检索章节。
 * 返回 [{...chunk, score}]，按分数降序。无命中时返回空数组——这是有意义的信号，
 * 调用方应据此提示模型换关键词，而不是硬凑结果。
 */
export function searchGuide({ campus, query, topK = 3 }) {
  const pool = byCampus.get(campus) || [];
  const terms = tokenize(query);
  if (!terms.length) return [];
  return pool
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(topK, 8)))
    .map((entry) => ({ ...entry.chunk, score: Number(entry.score.toFixed(2)) }));
}

/** 某校区的全部章节标题，供模型在连续未命中时探路。 */
export function listSections(campus) {
  return (byCampus.get(campus) || []).map((chunk) => ({
    id: chunk.id,
    sectionPath: chunk.sectionPath,
    pages: chunk.pages,
  }));
}

export function getChunk(id) {
  return byId.get(id) || null;
}

export function countChunks(campus) {
  return (byCampus.get(campus) || []).length;
}

/** 校区版本号，用于回答口径（「2025.09 版指南显示…」）。 */
export function versionOf(campus) {
  return getCampus(campus).version;
}
