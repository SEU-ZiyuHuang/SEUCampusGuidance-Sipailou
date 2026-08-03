# 东南大学四牌楼校园地图 + Agent Demo

在线测试地址：https://seu-campus-map-agent.onrender.com/

项目连接 GitHub `main` 分支与 Render 免费 Web Service。每次推送到 `main` 后，Render 会自动构建并发布；免费实例空闲后可能休眠，首次打开需要等待唤醒。

这是一期的纯 HTML/CSS/JavaScript 原型，用于先验证十张校园指南的呈现方式、地图交互和 Agent 联动。当前坐标、入口和营业状态均属于 Demo 数据，必须经过人工核验后才能作为正式信息发布。

## 直接预览

双击 `index.html` 可以查看无 Key 的校园示意图。部分浏览器会限制本地文件资源，推荐使用下面的本地服务方式。

## 本地启动

需要 Node.js 18 或更高版本：

```powershell
node server.mjs
```

浏览器打开：

```text
http://127.0.0.1:5173
```

没有任何 Key 时：

- 地图使用内置校园示意图；
- Agent 使用浏览器内置演示规则；
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

启动时临时配置地图 Key：

```powershell
$env:TENCENT_MAP_KEY="你的腾讯地图JavaScript Key"
node server.mjs
```

JavaScript 地图 Key 会随浏览器请求出现，这是 Web 地图的正常工作方式，因此必须在腾讯控制台配置域名限制。

## 配置 DeepSeek V4 Flash

官方接口使用 OpenAI-compatible 格式，模型标识为 `deepseek-v4-flash`，基础地址为 `https://api.deepseek.com`。

```powershell
$env:DEEPSEEK_API_KEY="你的DeepSeek API Key"
node server.mjs
```

DeepSeek Key 只保存在服务端环境变量中，不会发送到浏览器。Demo 的 `/api/agent/chat` 会检索本地校园数据后再调用模型，并要求模型返回地图地点 ID。

官方文档：https://api-docs.deepseek.com/zh-cn/

## 数据文件

- `data/guide-data.js`：从现有 Excel 自动导出的完整记录；
- `data/map-features.js`：第一版推测地图坐标和核心交互点；
- `data/guide-pages.js`：十张指南与网页组件的对应关系；
- `outputs/campus-map-demo/一期人工标注任务表.xlsx`：人工回填工作簿。

## 当前原型边界

- 已实现地图、主题分类、搜索、列表、详情、原指南画廊和 Agent 联动原型；
- 已保留腾讯地图运行时加载入口；
- 已保留 DeepSeek 服务端代理；
- 尚未实现正式 PostGIS 数据库、用户账号、运营后台和实时营业状态；
- 正式工程将在交互方向确认后迁移到组件化前端和结构化后端。
