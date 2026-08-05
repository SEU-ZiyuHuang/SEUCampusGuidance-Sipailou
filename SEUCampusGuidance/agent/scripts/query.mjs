// 检索层自检 CLI。这个项目没有测试框架，--suite 就是检索质量的回归基线。
//
//   node scripts/query.mjs jiulonghu "现在橘园有车去无线谷吗"
//   node scripts/query.mjs --suite
//   node scripts/query.mjs --sections jiulonghu

import { searchGuide, listSections, countChunks } from "../lib/retrieve.mjs";
import { CAMPUS_SLUGS, campusName, detectCampus, DEFAULT_CAMPUS } from "../lib/campus.mjs";

// expect 为正则时断言 top1 的 sectionPath 必须匹配；为 null 时断言应当 0 命中。
// 「剪头发」「AED」两条故意留成 0 命中——它们正是单轮检索答不了、要靠模型换词重检的场景。
const SUITE = [
  { campus: "jiulonghu", query: "现在橘园有车去无线谷吗", expect: /无线谷线/ },
  { campus: "jiulonghu", query: "梅园的床帘要买多大", expect: /宿舍|差异/ },
  { campus: "jiulonghu", query: "兰台线节假日几点有车", expect: /兰台线/ },
  { campus: "jiulonghu", query: "图书馆的插座多不多", expect: /图书馆|金智楼/ },
  { campus: "jiulonghu", query: "理发", expect: /宿舍|商业/ },
  { campus: "jiulonghu", query: "哪里能剪头发", expect: null },
  { campus: "sipailou", query: "沙塘园的快递寄到哪", expect: /快递|外卖/ },
  { campus: "sipailou", query: "图书馆几点关门", expect: /图书馆|学习|研究/ },
  { campus: "sipailou", query: "文昌11舍是几人间", expect: /宿舍/ },
  { campus: "dingjiaqiao", query: "从丁家桥去九龙湖怎么走", expect: /九龙湖|交通/ },
  { campus: "dingjiaqiao", query: "求恩4舍有独立卫浴吗", expect: /宿舍|食堂|生活/ },
  { campus: "wuxi", query: "无人小巴几点发车", expect: /无人小巴|交通/ },
  { campus: "wuxi", query: "榴园食堂供餐时间", expect: /食堂|宿舍|物流/ },
  { campus: "suzhou", query: "水电费怎么交", expect: /用水用电|宿舍|外卖/ },
  { campus: "jiangbei", query: "桃园宿舍床多大", expect: /住宿|宿舍/ },
  { campus: "jiangbei", query: "怎么去禄口机场", expect: /交通|地铁|火车/ },
];

const args = process.argv.slice(2);

function printHits(hits) {
  if (!hits.length) {
    console.log("  （0 命中）");
    return;
  }
  for (const [index, hit] of hits.entries()) {
    console.log(`  ${index + 1}. [${String(hit.score).padStart(7)}] ${hit.sectionPath}`);
    console.log(`     id=${hit.id} pages=${hit.pages.join("、") || "无"} ${hit.text.length}字`);
  }
}

if (args[0] === "--suite") {
  let passed = 0;
  const failures = [];
  for (const item of SUITE) {
    const hits = searchGuide({ campus: item.campus, query: item.query, topK: 3 });
    const top = hits[0];
    const ok = item.expect === null ? hits.length === 0 : Boolean(top && item.expect.test(top.sectionPath));
    if (ok) passed += 1;
    else failures.push({ item, top });
    const mark = ok ? "✓" : "✗";
    const summary = item.expect === null
      ? (hits.length === 0 ? "0 命中（符合预期）" : `预期 0 命中，实得 ${hits.length}：${top.sectionPath}`)
      : (top ? `${top.sectionPath}  [${top.score}]` : "0 命中");
    console.log(`${mark} ${item.campus.padEnd(12)} ${item.query.padEnd(24)} → ${summary}`);
  }
  console.log(`\n${passed}/${SUITE.length} 通过`);
  if (failures.length) {
    console.log("\n失败项的完整候选：");
    for (const { item } of failures) {
      console.log(`\n【${item.campus}】${item.query}  期望 ${item.expect || "0 命中"}`);
      printHits(searchGuide({ campus: item.campus, query: item.query, topK: 5 }));
    }
  }
  process.exit(failures.length ? 1 : 0);
}

if (args[0] === "--sections") {
  const campus = args[1] || DEFAULT_CAMPUS;
  console.log(`${campusName(campus)} 共 ${countChunks(campus)} 个章节：`);
  for (const section of listSections(campus)) {
    console.log(`  ${section.id.padEnd(20)} ${section.sectionPath}  [${section.pages.join("、") || "无页码"}]`);
  }
  process.exit(0);
}

const [maybeCampus, ...rest] = args;
if (!maybeCampus) {
  console.log("用法：node scripts/query.mjs <校区slug> \"问题\"   |   --suite   |   --sections <校区slug>");
  console.log(`校区：${CAMPUS_SLUGS.join(" / ")}`);
  process.exit(1);
}

const explicit = CAMPUS_SLUGS.includes(maybeCampus);
const query = (explicit ? rest : args).join(" ");
const campus = explicit ? maybeCampus : (detectCampus(query) || DEFAULT_CAMPUS);

console.log(`校区：${campusName(campus)}（${campus}${explicit ? "" : "，自动识别"}）  问题：${query}`);
printHits(searchGuide({ campus, query, topK: 5 }));
