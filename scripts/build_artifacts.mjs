import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const rootDir = path.resolve(import.meta.dirname, "..");
const inputPath = path.join(rootDir, "东南大学四牌楼新生指南.xlsx");
const outputDir = path.join(rootDir, "outputs", "campus-map-demo");
const workbookInput = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const sourcePage = {
  "宿舍信息": "04/05/06", "食堂信息": "01/04/05/06", "图书馆与学习设施": "02",
  "行政窗口": "03", "交通信息": "08", "周边餐饮": "07A", "周边商业服务": "07B",
  "运动设施": "03", "一卡通与生活服务": "03/04/05/06",
};
const objectType = {
  "宿舍信息": "建筑/宿舍", "食堂信息": "POI/食堂", "图书馆与学习设施": "室内空间/设施",
  "行政窗口": "服务/办公室", "交通信息": "交通节点/线路", "周边餐饮": "街区/餐饮POI",
  "周边商业服务": "服务POI", "运动设施": "运动设施", "一卡通与生活服务": "服务/知识",
};
const titleFields = {
  "宿舍信息": ["宿舍区", "楼栋号"], "食堂信息": ["食堂名称"], "图书馆与学习设施": ["设施名称"],
  "行政窗口": ["部门名称"], "交通信息": ["交通类型", "线路/名称", "终点"],
  "周边餐饮": ["餐厅名称", "所在区域"], "周边商业服务": ["服务类型", "名称"],
  "运动设施": ["设施名称"], "一卡通与生活服务": ["服务项目"],
};

function isMissing(value) {
  return value === null || value === undefined || value === "" || value === "-";
}

function buildTitle(sheetName, values) {
  const parts = (titleFields[sheetName] || Object.keys(values).slice(0, 2))
    .map((field) => values[field])
    .filter((value) => !isMissing(value));
  return parts.join(" · ") || `${sheetName}未命名记录`;
}

function summarize(values) {
  return Object.entries(values)
    .filter(([, value]) => !isMissing(value))
    .map(([key, value]) => `${key}=${value}`)
    .join("；");
}

function findExistingTime(values) {
  return Object.entries(values)
    .filter(([key, value]) => /时间|首末班/.test(key) && !isMissing(value))
    .map(([key, value]) => `${key}：${value}`)
    .join("；");
}

const records = [];
for (let sheetIndex = 0; sheetIndex < workbookInput.worksheets.items.length; sheetIndex += 1) {
  const sheet = workbookInput.worksheets.items[sheetIndex];
  if (sheet.name === "说明") continue;
  const used = sheet.getUsedRange();
  if (!used) continue;
  const rows = used.values;
  const headers = rows[0].map((value) => String(value ?? ""));
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = Object.fromEntries(headers.map((header, columnIndex) => [header, rows[rowIndex][columnIndex] ?? null]));
    records.push({
      id: `source-${String(sheetIndex).padStart(2, "0")}-${String(rowIndex).padStart(3, "0")}`,
      sheet: sheet.name,
      sourcePage: sourcePage[sheet.name] || "待确认",
      row: rowIndex + 1,
      title: buildTitle(sheet.name, values),
      values,
    });
  }
}

const browserData = {
  meta: { title: "东南大学新生实用信息简明指南·四牌楼篇", version: "2025.08", totalRecords: records.length, generatedAt: new Date().toISOString() },
  sheets: [...new Set(records.map((record) => record.sheet))],
  records,
};
await fs.mkdir(path.join(rootDir, "data"), { recursive: true });
await fs.writeFile(path.join(rootDir, "data", "guide-data.js"), `window.GUIDE_DATA = ${JSON.stringify(browserData, null, 2)};\n`, "utf8");

const poiRows = records.map((record) => {
  const missingFields = Object.entries(record.values).filter(([, value]) => isMissing(value)).map(([key]) => key);
  const needItems = ["经纬度/空间关联", "入口或精确位置", ...(missingFields.length ? [`缺失字段：${missingFields.join("、")}`] : [])];
  return [
    `POI-${record.id.slice(-6)}`, record.sourcePage, record.sheet, record.title, objectType[record.sheet] || "待分类",
    summarize(record.values), needItems.join("；"), null, null, "待标注", null,
    record.values["楼层"] || null, findExistingTime(record.values) || null,
    record.values["电话"] || null, `原Excel：${record.sheet}!第${record.row}行`, null, null, "待标注", null,
  ];
});

const timeRows = records.filter((record) => {
  const keys = Object.keys(record.values).join("|");
  return /时间|门禁|营业|开放|办理/.test(keys) || ["食堂信息", "行政窗口", "运动设施", "周边商业服务"].includes(record.sheet);
}).map((record, index) => [
  `TIME-${String(index + 1).padStart(3, "0")}`, record.sourcePage, record.sheet, record.title,
  findExistingTime(record.values) || "缺失", null, null, null, "待确认", null, null,
  `原Excel：${record.sheet}!第${record.row}行`, "待核验", null,
]);

const geometrySeed = [
  ["GEO-001", "01", "四牌楼校区边界", "Polygon", null, null, "校区边界", "按腾讯底图描绘；确认是否包含校西和文昌桥宿舍区", "待标注", null],
  ["GEO-002", "01", "主教学区", "Polygon", null, null, "主教学区范围", "描绘区域边界", "待标注", null],
  ["GEO-003", "01/05", "校西宿舍区", "Polygon", 118.78115, 32.05779, "进香河路西侧", "核准边界、出入口和建筑轮廓", "待标注", null],
  ["GEO-004", "01/04", "沙塘园宿舍区", "Polygon", 118.78853, 32.05536, "校园东南部", "核准边界、柱式闸机和楼栋入口", "待标注", null],
  ["GEO-005", "01/04", "成园宿舍区", "Polygon", 118.78909, 32.05602, "沙塘园东侧", "核准边界、门式闸机和楼栋入口", "待标注", null],
  ["GEO-006", "01/06", "文昌桥宿舍区", "Polygon", 118.79123, 32.05755, "太平北路东侧", "核准围合区域、各楼栋和出入口", "待标注", null],
  ["GEO-007", "01", "南门", "Point", null, null, "四牌楼南侧", "标注门中心、步行入口和车辆入口", "待标注", null],
  ["GEO-008", "01", "东门", "Point", null, null, "校园东侧", "标注门中心和通行规则", "待标注", null],
  ["GEO-009", "01", "西门", "Point", null, null, "进香河路一侧", "标注门中心和通行规则", "待标注", null],
  ["GEO-010", "01/02", "图书馆", "Polygon", 118.78672, 32.05818, "主教学区中央", "建筑轮廓、主入口、外部专用电梯", "待标注", null],
  ["GEO-011", "02", "图书馆1F功能点", "Indoor", null, null, "105/106/103/服务台", "核准房间、签到机、打印机和AED位置", "待标注", null],
  ["GEO-012", "02", "图书馆2F功能点", "Indoor", null, null, "203/209/210", "核准房间与入口关系", "待标注", null],
  ["GEO-013", "02", "图书馆3F功能点", "Indoor", null, null, "301/302/303/304", "核准房间与入口关系", "待标注", null],
  ["GEO-014", "01/03", "体育场", "Polygon", 118.78496, 32.05916, "主教学区西北侧", "轮廓、入口和打卡点", "待标注", null],
  ["GEO-015", "03", "体育馆", "Polygon", 118.78551, 32.05838, "体育场附近", "入口、1F签到处、各场地和AED", "待标注", null],
  ["GEO-016", "01/02", "中山院", "Polygon", 118.78648, 32.05695, "主教学区南部", "轮廓、南门入口、打印和饮水点", "待标注", null],
  ["GEO-017", "01/02", "东南院", "Polygon", 118.78772, 32.05704, "主教学区东南侧", "轮廓、南门入口和卫生间", "待标注", null],
  ["GEO-018", "04", "沙塘园1/2/3舍", "MultiPolygon", null, null, "沙塘园", "逐栋轮廓与入口", "待标注", null],
  ["GEO-019", "04", "成园1/2舍", "MultiPolygon", null, null, "成园", "逐栋轮廓与入口", "待标注", null],
  ["GEO-020", "05", "群英楼/荟萃楼/学府二舍", "MultiPolygon", null, null, "校西", "逐栋轮廓、电梯和入口", "待标注", null],
  ["GEO-021", "06", "文昌6-16舍", "MultiPolygon", null, null, "文昌桥", "逐栋轮廓、入口、围合门禁与外卖点", "待标注", null],
  ["GEO-022", "07A", "蓁巷餐饮街区", "Polygon", 118.78386, 32.05463, "毗邻沙塘园", "街区边界和具体商户", "待标注", null],
  ["GEO-023", "07A", "卫巷—新安里街区", "Polygon", 118.78213, 32.05985, "毗邻校西", "街区边界和具体商户", "待标注", null],
  ["GEO-024", "07A", "唱经楼—吉兆营街区", "Polygon", null, null, "校西周边", "街区边界和具体商户", "待标注", null],
  ["GEO-025", "07A", "文昌天桥下餐饮区", "Polygon", 118.79212, 32.05518, "文昌桥东侧", "街区边界和具体商户", "待标注", null],
  ["GEO-026", "08", "浮桥地铁站相关出口", "MultiPoint", 118.79020, 32.05383, "校园南侧", "核准1号/3号口及步行连接", "待标注", null],
  ["GEO-027", "08", "鸡鸣寺地铁站相关出口", "MultiPoint", 118.79051, 32.06267, "校园东北侧", "核准1号口及步行连接", "待标注", null],
  ["GEO-028", "02/04/05/06", "全部AED点位", "MultiPoint", null, null, "指南列出的九处位置", "逐点核准楼层、可达时间和标识", "待标注", null],
  ["GEO-029", "02/05", "全部打印设施", "MultiPoint", null, null, "图书馆/中山院/宿舍", "逐点核准设备、收费、纸型和开放状态", "待标注", null],
  ["GEO-030", "04/05/06", "外卖与快递取件点", "MultiPoint", null, null, "各宿舍区", "逐点核准位置、服务商和时间", "待标注", null],
];

const coverageRows = [
  ["COV-000", "封面", "版本、来源、许可", "版本来源卡", "版本号、署名、CC-BY-SA许可可见", "待验收", null, null],
  ["COV-001", "01", "校区总体空间与索引", "地图点/线/面", "建筑、区域、入口、地铁与主要服务均可访问", "待验收", null, null],
  ["COV-002", "02", "图书馆与学习设施", "楼层图/设施层/知识卡", "自习、借还书、研讨、教室、设施完整", "待验收", null, null],
  ["COV-003", "03", "行政、运动、一卡通", "流程卡/时间表/地图关联", "所有部门、场馆与充值补办方式可访问", "待验收", null, null],
  ["COV-004", "04", "沙塘园与成园", "宿舍专题地图", "楼栋、生活服务、门禁和医疗内容完整", "待验收", null, null],
  ["COV-005", "05", "校西", "宿舍专题地图", "楼栋、食堂、快递、外卖、公交和门禁完整", "待验收", null, null],
  ["COV-006", "06", "文昌桥", "楼栋专题地图", "6-16舍、食堂、服务、门禁与地铁完整", "待验收", null, null],
  ["COV-007A", "07A", "周边餐饮商业", "街区面/POI/标签", "各街区、餐饮类型和建议完整", "待验收", null, null],
  ["COV-007B", "07B", "周边医疗生活", "分类图层/列表", "医疗、超市便利店与银行完整", "待验收", null, null],
  ["COV-008", "08", "交通", "节点/线路/时刻卡", "地铁、公交、骑行和点对点信息完整", "待验收", null, null],
];

const outputWorkbook = Workbook.create();
const titleFill = "#173F32";
const headerFill = "#356B55";
const lightFill = "#E4EADB";
const cream = "#F7F4E8";
const bodyFont = "Microsoft YaHei";

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function addDataSheet({ name, title, note, headers, rows, tableName, widths, statusColumn, validations = [] }) {
  const sheet = outputWorkbook.worksheets.add(name);
  const lastColumn = columnName(headers.length - 1);
  const lastRow = 4 + rows.length;
  sheet.showGridLines = false;
  sheet.getRange(`A1:${lastColumn}1`).merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange(`A2:${lastColumn}2`).merge();
  sheet.getRange("A2").values = [[note]];
  sheet.getRange(`A4:${lastColumn}${lastRow}`).values = [headers, ...rows];
  sheet.getRange(`A1:${lastColumn}1`).format = { fill: titleFill, font: { name: bodyFont, bold: true, color: "#FFFFFF", size: 16 }, rowHeight: 32, verticalAlignment: "center" };
  sheet.getRange(`A2:${lastColumn}2`).format = { fill: cream, font: { name: bodyFont, color: "#5A6E64", size: 10 }, rowHeight: 27, verticalAlignment: "center", wrapText: true };
  sheet.getRange(`A4:${lastColumn}4`).format = { fill: headerFill, font: { name: bodyFont, bold: true, color: "#FFFFFF", size: 10 }, rowHeight: 28, verticalAlignment: "center", wrapText: true };
  if (rows.length) {
    sheet.getRange(`A5:${lastColumn}${lastRow}`).format = { font: { name: bodyFont, color: "#183029", size: 9 }, verticalAlignment: "top", wrapText: true, rowHeight: 34 };
    sheet.getRange(`A4:${lastColumn}${lastRow}`).format.borders = { insideHorizontal: { style: "thin", color: "#D7E0D0" }, bottom: { style: "thin", color: "#B9C8B0" } };
    const table = sheet.tables.add(`A4:${lastColumn}${lastRow}`, true, tableName);
    table.style = "TableStyleMedium4";
    table.showBandedRows = true;
    table.showFilterButton = true;
  }
  widths.forEach((width, index) => { sheet.getRange(`${columnName(index)}4:${columnName(index)}${Math.max(5, lastRow)}`).format.columnWidth = width; });
  sheet.freezePanes.freezeRows(4);
  sheet.freezePanes.freezeColumns(3);
  validations.forEach(({ column, values }) => {
    if (rows.length) sheet.getRange(`${column}5:${column}${lastRow}`).dataValidation = { rule: { type: "list", values } };
  });
  if (statusColumn && rows.length) {
    const statusRange = sheet.getRange(`${statusColumn}5:${statusColumn}${lastRow}`);
    statusRange.conditionalFormats.add("containsText", { text: "已完成", format: { fill: "#DCEBD2", font: { color: "#245342", bold: true } } });
    statusRange.conditionalFormats.add("containsText", { text: "待", format: { fill: "#FFF0D4", font: { color: "#8B633D" } } });
  }
  return sheet;
}

const instructions = outputWorkbook.worksheets.add("使用说明");
instructions.showGridLines = false;
instructions.getRange("A1:H1").merge();
instructions.getRange("A1").values = [["东南大学四牌楼校园地图 · 一期人工标注任务表"]];
instructions.getRange("A1:H1").format = { fill: titleFill, font: { name: bodyFont, bold: true, color: "#FFFFFF", size: 18 }, rowHeight: 36, verticalAlignment: "center" };
instructions.getRange("A3:B8").values = [
  ["工作簿用途", "回填坐标、入口、楼层、时间、来源与逐页验收结果；不要删除任务ID。"],
  ["POI任务数", null], ["几何任务数", null], ["时间任务数", null], ["已完成POI", null], ["POI完成率", null],
];
instructions.getRange("B4").formulas = [[`=COUNTA('POI与设施标注'!A5:A${4 + poiRows.length})`]];
instructions.getRange("B5").formulas = [[`=COUNTA('建筑与区域几何'!A5:A${4 + geometrySeed.length})`]];
instructions.getRange("B6").formulas = [[`=COUNTA('时间与规则核验'!A5:A${4 + timeRows.length})`]];
instructions.getRange("B7").formulas = [[`=COUNTIF('POI与设施标注'!R5:R${4 + poiRows.length},"已完成")`]];
instructions.getRange("B8").formulas = [["=IF(B4=0,0,B7/B4)"]];
instructions.getRange("B8").format.numberFormat = "0%";
instructions.getRange("A3:A8").format = { fill: lightFill, font: { name: bodyFont, bold: true, color: titleFill }, wrapText: true };
instructions.getRange("B3:B8").format = { fill: cream, font: { name: bodyFont, color: "#183029" }, wrapText: true };
instructions.getRange("A10:H10").merge();
instructions.getRange("A10").values = [["填写规则"]];
instructions.getRange("A10:H10").format = { fill: headerFill, font: { name: bodyFont, bold: true, color: "#FFFFFF" }, rowHeight: 27 };
instructions.getRange("A11:H16").merge(true);
instructions.getRange("A11:A16").values = [
  ["1. 经度、纬度统一填写腾讯地图使用的 GCJ-02 坐标；经度在前、纬度在后。"],
  ["2. Point填写中心点；Polygon/MultiPolygon需另附GeoJSON，或在备注中写明边界采集方式。"],
  ["3. 开放时间请拆成星期、开始、结束和例外规则，不要继续填写“同上”。"],
  ["4. 每次核验填写来源、日期和核验人；网页或公告请保留完整URL。"],
  ["5. 无法确认的信息保持“待核验”，不要根据印象填写。"],
  ["6. 回填完成后将工作簿原文件发回，Codex会按任务ID合并到正式数据库。"],
];
instructions.getRange("A11:H16").format = { fill: "#F7F4E8", font: { name: bodyFont, color: "#435C50", size: 10 }, rowHeight: 26, verticalAlignment: "center" };
instructions.getRange("A3:A16").format.columnWidth = 20;
instructions.getRange("B3:H16").format.columnWidth = 17;
instructions.freezePanes.freezeRows(1);

addDataSheet({
  name: "POI与设施标注", title: "POI、建筑、设施与服务标注", note: "每行来自现有Excel。请优先补经纬度、入口/精确位置、楼层及缺失字段；任务ID用于自动合并。",
  headers: ["任务ID", "来源页", "来源工作表", "建议对象名称", "对象类型", "原始记录摘要", "需核对项", "经度(GCJ-02)", "纬度(GCJ-02)", "位置精度", "具体位置/入口", "楼层", "现有开放/办理时间", "联系方式", "来源链接/说明", "核验日期", "核验人", "状态", "备注"],
  rows: poiRows, tableName: "PoiAnnotationTable", widths: [15, 10, 18, 24, 18, 48, 34, 16, 16, 14, 28, 12, 28, 18, 28, 14, 12, 13, 28], statusColumn: "R",
  validations: [{ column: "J", values: ["待标注", "精确点位", "建筑中心", "街区中心", "推测位置"] }, { column: "R", values: ["待标注", "标注中", "待复核", "已完成", "不适用"] }],
});

addDataSheet({
  name: "时间与规则核验", title: "营业、开放、门禁与办理时间核验", note: "把自然语言时间拆成可计算字段；遇到考试周、节假日、临时关闭等情况写入例外规则。",
  headers: ["任务ID", "来源页", "来源工作表", "对象名称", "现有时间描述", "适用星期/日期", "开始时间", "结束时间", "例外规则", "有效期开始", "有效期结束", "来源", "状态", "备注"],
  rows: timeRows, tableName: "ScheduleAnnotationTable", widths: [14, 10, 18, 25, 35, 20, 13, 13, 30, 15, 15, 28, 13, 28], statusColumn: "M",
  validations: [{ column: "M", values: ["待核验", "核验中", "已完成", "不适用"] }],
});

addDataSheet({
  name: "建筑与区域几何", title: "建筑、区域、入口与室内几何标注", note: "Demo坐标均为推测值。请在腾讯底图上核准；复杂边界建议提供GeoJSON或在备注中说明采集文件。",
  headers: ["任务ID", "来源页", "对象名称", "几何类型", "推测经度", "推测纬度", "位置说明", "人工任务", "状态", "备注/GeoJSON文件"],
  rows: geometrySeed, tableName: "GeometryAnnotationTable", widths: [14, 10, 26, 16, 16, 16, 30, 42, 13, 34], statusColumn: "I",
  validations: [{ column: "D", values: ["Point", "MultiPoint", "LineString", "Polygon", "MultiPolygon", "Indoor"] }, { column: "I", values: ["待标注", "标注中", "待复核", "已完成", "不适用"] }],
});

addDataSheet({
  name: "图片覆盖验收", title: "十张指南图片 · 一期覆盖验收", note: "每页必须逐块对照原图。只有内容、空间和交互均满足时才能标记已验收。",
  headers: ["任务ID", "来源页", "内容范围", "网页呈现", "验收标准", "状态", "验收人", "问题记录"],
  rows: coverageRows, tableName: "CoverageAcceptanceTable", widths: [14, 10, 30, 30, 48, 13, 14, 40], statusColumn: "F",
  validations: [{ column: "F", values: ["待验收", "验收中", "有问题", "已完成"] }],
});

await fs.mkdir(outputDir, { recursive: true });
const workbookPath = path.join(outputDir, "一期人工标注任务表.xlsx");
const exported = await SpreadsheetFile.exportXlsx(outputWorkbook);
await exported.save(workbookPath);

const checks = [];
checks.push((await outputWorkbook.inspect({ kind: "table", sheetId: "使用说明", range: "A1:H16", include: "values,formulas", tableMaxRows: 20, tableMaxCols: 10, maxChars: 5000 })).ndjson);
checks.push((await outputWorkbook.inspect({ kind: "table", sheetId: "POI与设施标注", range: "A1:S12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 19, maxChars: 8000 })).ndjson);
checks.push((await outputWorkbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 100 }, summary: "final formula error scan" })).ndjson);
console.log(checks.join("\n"));

for (const sheet of outputWorkbook.worksheets.items) {
  const used = sheet.getUsedRange();
  if (!used) continue;
  const maxRows = Math.min(used.values.length, 24);
  const maxCols = Math.min(used.values[0]?.length || 1, 19);
  const previewRange = `A1:${columnName(maxCols - 1)}${maxRows}`;
  const preview = await outputWorkbook.render({ sheetName: sheet.name, range: previewRange, scale: 1, format: "png" });
  await fs.writeFile(path.join(outputDir, `.preview-${sheet.name}.png`), new Uint8Array(await preview.arrayBuffer()));
}

console.log(JSON.stringify({ browserRecords: records.length, poiTasks: poiRows.length, timeTasks: timeRows.length, geometryTasks: geometrySeed.length, workbookPath }, null, 2));

