# 东南大学四牌楼校园地图 + Agent

这是 SEUGA-VibeCoding 的子项目，位于仓库 `SEUCampusGuidance/` 目录下，拆分为独立的 Web 与 Agent 两个子模块：

```
SEUCampusGuidance/
├── web/            ← 校园地图网页应用（静态站点 + 本地服务）
├── agent/          ← 校园指南 Agent 服务（DeepSeek 独立服务）
├── data/           ← Web 与 Agent 共享的校园数据（guide-data / map-features / guide-pages）
├── 原校区指南/      ← 十张原版指南图片
└── outputs/        ← 人工标注工作簿等生成物（不纳入版本控制）
```

Web 通过 `POST /api/agent/chat` 转发到 Agent 服务（默认 `http://127.0.0.1:5174`），两者共享 `data/` 下的校园数据。

## 本地启动

需要 Node.js 20 或更高版本。

### 1. 启动 Agent 服务（终端一）

```powershell
cd SEUCampusGuidance/agent
$env:DEEPSEEK_API_KEY="你的DeepSeek API Key"
npm start
```

服务地址：`http://127.0.0.1:5174`，接口 `POST /api/agent/chat`（健康检查 `GET /health`）。

没有配置 Key 时 Agent 返回 503，此时 Web 侧会显示服务未配置的提示。

### 2. 启动 Web 应用（终端二）

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

DeepSeek Key 只保存在 Agent 服务端环境变量中，不会发送到浏览器。Agent 会先检索本地校园数据（`data/`）再调用模型，并要求模型返回地图地点 ID。

官方文档：https://api-docs.deepseek.com/zh-cn/

## 部署

### Web（Vercel 或 Render）

- **Vercel**：导入仓库后设置 **Root Directory = `SEUCampusGuidance/web`**，环境变量配置 `TENCENT_MAP_KEY`。`/runtime-config.js` 由 `vercel.json` 重写到 Function；
- **Render**：BluePrint 位于 `SEUCampusGuidance/web/render.yaml`，导入时设置 Root Directory 为 `SEUCampusGuidance/web`，环境变量同上；
- Agent 接口的线上地址：在 `SEUCampusGuidance/web/vercel.json` 的 `rewrites` 中把 `/api/agent/chat` 重写到 Agent 服务的公网地址（Vercel 支持外部 destination）。

### Agent（独立部署）

`SEUCampusGuidance/agent/` 是独立 Node 服务，可部署到 Render Web Service（`npm start`）或作为 Vercel 项目（Root Directory = `SEUCampusGuidance/agent`，`chat.js` 是 Vercel Function 格式）。环境变量：`DEEPSEEK_API_KEY`。

## 数据文件

- `data/guide-data.js`：从现有 Excel 自动导出的完整记录；
- `data/map-features.js`：第一版推测地图坐标和核心交互点；
- `data/guide-pages.js`：十张指南与网页组件的对应关系；
- `outputs/campus-map-demo/一期人工标注任务表.xlsx`：人工回填工作簿（由 `web/scripts/build_artifacts.mjs` 生成）。

## 当前原型边界

- 已实现地图、主题分类、搜索、列表、详情、原指南画廊和 Agent 联动原型；
- 已保留腾讯地图运行时加载入口；
- 已保留 DeepSeek 服务端代理（位于 Agent 服务）；
- 尚未实现正式 PostGIS 数据库、用户账号、运营后台和实时营业状态；
- 正式工程将在交互方向确认后迁移到组件化前端和结构化后端。
