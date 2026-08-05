# 东南大学校区指南

这是 SEUGA-VibeCoding 的子项目，位于仓库 `SEUCampusGuidance/` 目录下，包含两个各自独立部署、并行迭代的应用：

```
SEUCampusGuidance/
├── agent/                    ← 六校区问答 Agent（自带网页 + 知识库 + API）
├── web/                      ← 四牌楼校园地图应用（静态站点 + 本地服务）
├── docs/                     ← 产品需求文档
├── 原校区指南-md文档整理/      ← 六校区 2025 版指南的结构化 md（Agent 知识源）
├── 原校区指南/                ← 十张原版指南图片
├── data/                     ← 四牌楼地图数据（guide-data / map-features / guide-pages）
└── outputs/                  ← 人工标注工作簿等生成物（不纳入版本控制）
```

**[agent/](agent/README.md) 是当前主线**：六校区（九龙湖、四牌楼、丁家桥、苏州、江北、无锡）的生活信息问答，多轮工具调用 + SSE 流式，自成一体不依赖 `web/`。

**[web/](#本地启动)** 是先前的四牌楼地图原型，保持现状。它的 Agent 抽屉通过 `POST /api/agent/chat` 代理到 Agent 服务（默认 `http://127.0.0.1:5174`）；该接口的契约已冻结，Agent 侧改动不会影响它。

产品需求文档与整体路线图见 [docs/PRD-校区指南Agent.md](docs/PRD-校区指南Agent.md)。

## 本地启动

需要 Node.js 20.19 或更高版本。两个应用都是零第三方依赖，不需要 `npm install`。

### 只跑问答 Agent（推荐，一个终端就够）

```bash
cd SEUCampusGuidance/agent
export DEEPSEEK_API_KEY="你的DeepSeek API Key"
npm start
```

打开 `http://127.0.0.1:5174` 即是六校区问答页。没有 Key 也能启动，页面正常但提问返回 503。
完整说明（知识库重建、自检命令、API 契约、Vercel 部署）见 [agent/README.md](agent/README.md)。

### 跑地图应用（需要两个终端）

地图应用的 Agent 抽屉依赖上面的 Agent 服务，所以先按上一节把它起在 5174。

#### 启动 Web 应用（终端二）

```powershell
cd SEUCampusGuidance/web
$env:TENCENT_MAP_KEY="你的腾讯地图JavaScript Key"
npm start
```

浏览器打开：

```text
http://127.0.0.1:5173
```

Web 会按环境变量 `AGENT_SERVICE_URL`（默认 `http://127.0.0.1:5174`）转发 Agent 请求。

没有任何 Key 时：

- 地图使用内置校园示意图；
- Agent 调用会返回未配置提示；
- 搜索和指南数据仍可正常浏览。

## 配置腾讯地图

腾讯位置服务的账号注册、实名认证和申请 Key 必须由项目所有者本人完成：

1. 访问 https://lbs.qq.com/ 并登录；
2. 进入控制台的“应用管理 / 我的应用”；
3. 创建一个 Web 应用；
4. 创建 JavaScript API GL Key；
5. 同时创建或开通 WebService API Key，供后续地点搜索和路线服务使用；
6. 为正式域名设置白名单。本地调试时按控制台规则添加 localhost 或开发域名；
7. 不要把 WebService 服务端密钥直接写入前端源码。

JavaScript 地图 Key 会随浏览器请求出现，这是 Web 地图的正常工作方式，因此必须在腾讯控制台配置域名限制。

## 配置 DeepSeek V4 Flash

官方接口使用 OpenAI-compatible 格式，模型标识为 `deepseek-v4-flash`，基础地址为 `https://api.deepseek.com`。

DeepSeek Key 只保存在 Agent 服务端环境变量中，不会发送到浏览器。

官方文档：https://api-docs.deepseek.com/zh-cn/

## 部署

两个应用各建一个 Vercel 项目，互不影响。

### Agent（主线）

Root Directory = `SEUCampusGuidance/agent`，环境变量 `DEEPSEEK_API_KEY`，零配置模式。
部署后的验证清单见 [agent/README.md](agent/README.md#部署vercel)。

### Web 地图（Vercel 或 Render）

- **Vercel**：Root Directory = `SEUCampusGuidance/web`，环境变量 `TENCENT_MAP_KEY`。`/runtime-config.js` 由 `vercel.json` 重写到 Function；
- **Render**：BluePrint 位于 `SEUCampusGuidance/web/render.yaml`，Root Directory 同上；
- Agent 抽屉的线上地址：在 `web/vercel.json` 的 `rewrites` 里把 `/api/agent/chat` 重写到 Agent 项目的公网地址（Vercel 支持外部 destination）。

## 数据文件

- `原校区指南-md文档整理/`：六校区 2025 版指南的结构化 md 文档，约 7.5 万字，是 Agent 的知识源；
- `agent/data/knowledge.mjs`：由上述 md 切块生成的 76 个章节块（`npm run build:knowledge` 重建）；
- `data/guide-data.js`：四牌楼指南从 Excel 导出的完整记录，供地图应用使用；
- `data/map-features.js`：四牌楼地图坐标与核心交互点；
- `data/guide-pages.js`：十张指南与网页组件的对应关系；
- `outputs/campus-map-demo/一期人工标注任务表.xlsx`：人工回填工作簿（由 `web/scripts/build_artifacts.mjs` 生成）。

## 当前边界

**Agent**：六校区问答、多轮工具调用、SSE 流式、来源溯源均已实现；尚未接入地图联动、用户账号、实时信息（校车 / 营业状态）和浏览器定位。

**Web 地图**：已实现地图、主题分类、搜索、列表、详情、原指南画廊和 Agent 抽屉；仅覆盖四牌楼校区；尚未实现正式空间数据库、运营后台和实时营业状态。

> 已知问题：`web/index.html` 引用的 `../data/*.js` 跳出了 `web/` 根目录，经 `npm start` 访问时会被路径穿越检查拦成 403，导致地图数据加载失败（直接双击 `index.html` 以 `file://` 打开则正常）。该问题早于 Agent 重构，尚未修复。
