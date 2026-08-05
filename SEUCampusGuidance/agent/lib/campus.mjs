// 校区标识、别名识别与元数据查询。

import { CAMPUSES } from "../data/knowledge.mjs";

export const CAMPUS_SLUGS = CAMPUSES.map((campus) => campus.slug);

// 问题里认不出校区时的落点。九龙湖在校人数最多、指南也最全。
export const DEFAULT_CAMPUS = "jiulonghu";

const bySlug = new Map(CAMPUSES.map((campus) => [campus.slug, campus]));

export function getCampus(slug) {
  return bySlug.get(slug) || bySlug.get(DEFAULT_CAMPUS);
}

export function isCampusSlug(value) {
  return bySlug.has(value);
}

export function campusName(slug) {
  return getCampus(slug).name;
}

// 别名表按长度倒序，避免短别名先命中（"苏州" 不该抢在 "苏州校区" 前面）。
const aliasIndex = CAMPUSES
  .flatMap((campus) => [campus.name, ...campus.aliases].map((alias) => ({ alias, slug: campus.slug })))
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * 从自然语言里识别校区。按出现位置取最靠前的一个——「从丁家桥去九龙湖」这类跨校区问题
 * 落到出发地，因为「往返 X 校区」的路线信息写在出发地那份指南里。
 * 认不出返回 null，由调用方决定回退策略。
 */
export function detectCampus(text) {
  const haystack = String(text || "");
  let best = null;
  for (const { alias, slug } of aliasIndex) {
    const at = haystack.indexOf(alias);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && alias.length > best.length)) {
      best = { slug, at, length: alias.length };
    }
  }
  return best ? best.slug : null;
}

/** 问题里提到的全部校区，按出现顺序去重。用于判断是不是跨校区问题。 */
export function detectAllCampuses(text) {
  const haystack = String(text || "");
  const hits = [];
  for (const { alias, slug } of aliasIndex) {
    const at = haystack.indexOf(alias);
    if (at >= 0) hits.push({ slug, at });
  }
  hits.sort((a, b) => a.at - b.at);
  return [...new Set(hits.map((hit) => hit.slug))];
}
