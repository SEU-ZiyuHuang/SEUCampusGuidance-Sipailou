# 校区指南 Agent

东南大学六校区新生生活信息问答。自成一体的 Node 应用：自带对话网页、知识库和 API，与同级的 `web/`（四牌楼地图应用）互不依赖，各自部署、并行迭代。

产品需求与路线图见 [../docs/PRD-校区指南Agent.md](../docs/PRD-校区指南Agent.md)。

## 它做什么

- 六校区（九龙湖 / 四牌楼 / 丁家桥 / 苏州 / 江北 / 无锡）覆盖，知识来自地理协会 2025 版《新生实用信息简明指南》
- **多轮工具调用**：模型自己决定查哪个校区、用什么关键词、要不要换个词重检。口语提问（「哪里能剪头发」）在指南里字面 0 命中时，能改写成「理发」再检一次
- 跨校区问题分别检索两个校区后综合回答
- SSE 流式：先显示检索轨迹，再逐字吐答案
- 每条回答带版本口径和来源章节 + 源图页码
- 紧急问题（晕倒 / 火灾 / 受伤）确定性前置 120／119／110 指引；库外问题明确回答「指南未覆盖」

本版**不含**地图联动、用户账号、实时信息接入和浏览器定位（`placeIds` 与定位按钮已占位，见 PRD 的 P2／M3）。

## 本地启动

需要 Node ≥ 20.19。零第三方依赖，不用 `npm install`。

```bash
export DEEPSEEK_API_KEY="你的 DeepSeek API Key"
npm start
```

打开 http://127.0.0.1:5174 。没有 Key 也能启动，页面正常但提问返回 503。

## 目录

```
agent/
├── public/       对话网页（Vercel 零配置下只有这个目录对外可见）
├── api/          Vercel Function：chat（SSE）/ health / agent/chat（旧契约）
├── lib/          纯逻辑，无 HTTP 依赖
├── data/         构建生成物，提交进仓库
├── scripts/      构建与自检 CLI
└── server.mjs    本地开发服务器（线上不用，见下方警告）
```

## 知识库

六份 md 在构建期切成 76 个章节块，产出 `data/knowledge.mjs`（ESM 具名导出，约 170 KB）。

```bash
npm run build:knowledge     # 重新生成 data/knowledge.mjs 与 knowledge.report.json
```

**指南 md 改动后必须重跑这个命令并提交生成物。** 线上不跑构建——Vercel 的 Root Directory 是 `agent/`，读不到 `../原校区指南-md文档整理/`。

生成物用 `.mjs` 而不是 `.json` 或 `window` 全局，是因为只有静态 `import` 才能被 Vercel 的依赖追踪必然打包；运行时 `fs.readFile` 拼路径在线上有 ENOENT 风险。

`data/knowledge.report.json` 记录切块统计与未对齐的 chunkKey，改完 md 后应 review 它的 diff。

## 自检

没有测试框架，靠这三个命令：

```bash
npm run check                 # 全部文件 node --check 语法检查
npm run suite                 # 检索回归基线，16 条 query 断言 top1 章节，应 16/16
DEEPSEEK_API_KEY=xxx npm run loop -- --suite     # 四条必测行为，人工判读
```

`scripts/query.mjs` 还支持单条调试与查看目录：

```bash
node scripts/query.mjs jiulonghu "现在橘园有车去无线谷吗"
node scripts/query.mjs --sections wuxi
```

`scripts/loop-demo.mjs` 会把每一轮模型实际发出的检索词打出来——调工具描述措辞主要靠它。

## API

### `POST /api/chat` — SSE 流式问答

```jsonc
{
  "message": "梅园的床帘要买多大",   // 必填，≤500 字
  "campus": "jiulonghu",           // 可选；null 或省略表示由服务端自动判断
  "history": [                     // 可选，最多 6 条
    { "role": "user", "content": "…" },
    { "role": "assistant", "content": "…" }
  ]
}
```

校区 slug：`jiulonghu` `sipailou` `dingjiaqiao` `suzhou` `jiangbei` `wuxi`。

响应是 `text/event-stream`：

| event | data | 说明 |
| --- | --- | --- |
| `meta` | `{campus, campusName, version, locked}` | 首帧 |
| `tool_call` | `{round, name, args}` | 模型发起了一次检索 |
| `tool_result` | `{round, name, count, sections, tookMs, auto?}` | `auto:true` 是进循环前的确定性预检索 |
| `token` | `{t}` | 回答增量 |
| `sources` | `{sources: [{id, campus, campusName, section, pages, version}]}` | 由服务端确定性生成 |
| `done` | `{campus, rounds, tookMs, placeIds}` | 结束 |
| `error` | `{code, message, retryable}` | `code ∈ upstream_error / timeout` |

开流前的错误用状态码：`405` 非 POST、`400` 参数非法、`429` 频控、`503` 未配置 Key。**开流之后的错误一律走 `error` 事件**——Response 已返回就改不了状态码了。

小程序端按本节对接。契约变更需在群里周知并同步更新 PRD 7.2 节。

### `POST /api/agent/chat` — 旧契约（勿动）

`{message}` → `{message, placeIds}`。`web/` 的地图抽屉依赖这个形态，`web/server.mjs:41-56` 正往这里代理。字段和状态码已冻结，新功能一律走 `/api/chat`。

### `GET /api/health`

返回服务状态、是否配置了 Key、知识库版本与构建时间。不泄露 Key 本身。

## 部署（Vercel）

新建 Vercel 项目，**Root Directory 设为 `SEUCampusGuidance/agent`**，环境变量配 `DEEPSEEK_API_KEY`。零配置模式，无需构建命令。

部署后验证：

```bash
curl -s https://<你的域名>/api/health
curl -sI https://<你的域名>/lib/prompt.mjs        # 必须 404
curl -N -X POST https://<你的域名>/api/chat -H 'Content-Type: application/json' -d '{"message":"梅园床帘多大"}'
```

第二条是安全检查：Vercel 零配置下如果没有 `public/` 目录，会把 Root Directory 下**所有文件**当静态资源暴露，`lib/` 和 `data/` 会被公网直接下载。本项目静态文件全在 `public/`，所以其余目录应当 404。

第三条要确认事件**逐条到达**而不是最后一次性刷屏。若是后者，检查响应头的 `X-Accel-Buffering: no` 是否还在。

> **`.vercelignore` 里的 `server.mjs` 那行不能删。** Vercel 的 Node 运行时会自动探测项目根的 `server.mjs`，只要它调用了 `listen()` 就会被捕获成接管全部路由的 Function，与 `api/` 下的 Function 冲突。

## 成本护栏

单次提问典型开销为 2 次 API 调用、输入约 4—6k token。已内置：输入 ≤500 字、history ≤6 条、工具返回正文总预算 9000 字符、决策轮 `max_tokens` 500、已检索过的章节不重复回正文、最多 4 轮工具调用、按 IP 每分钟 10 次频控。

注意频控是**单实例内存**实现，serverless 下每个实例独立计数，只能挡住无脑循环，不是严格的全局配额。真要控成本得上 KV，会引入依赖，留到 M1 决策。

## 版权

知识来源为东南大学地理协会（@东奔南走）的《东南大学新生实用信息简明指南》系列，CC BY-SA 4.0。本应用为衍生使用，须保留原作者署名、许可信息与版本日期，并遵循相同方式共享。产品页脚与「关于」弹窗已包含非官方声明与署名。
