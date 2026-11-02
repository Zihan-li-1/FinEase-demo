# FinEase Netlify Deploy Preview 验收报告

- 项目：FinEase AI Banking Agent
- 验收日期：2026-10-18
- 部署平台：Netlify
- 部署类型：Deploy Preview
- 当前状态：构建完成，应用业务验收未完成

## 1. 验收结论

本次 Netlify Deploy Preview 构建完成，但访问受到 Netlify 登录保护拦截，无法进入实际应用。

因此，本次只能确认部署构建阶段完成，不能确认：

- 网页是否能够正常访问。
- Banking Agent API 是否能够正常响应。
- Netlify Functions 是否能够正常处理业务请求。
- TrueForge 是否能够从云端正常调用。
- MCP / Bridge 是否能够从云端正常访问。
- 数据库及续接状态是否能够正常工作。
- 用户是否能够完成完整的金融业务交互。

**本次结果不构成 Netlify 在线业务验收通过。**

## 2. 本次实际验证范围

| 验收项目 | 结果 | 说明 |
|---|---|---|
| Netlify 构建 | 通过 | Deploy Preview 构建完成 |
| Preview 页面访问 | 未通过验收 | 被 Netlify 登录保护拦截 |
| 前端实际交互 | 未验证 | 无法进入应用 |
| Banking Agent API | 未验证 | 未完成远端业务请求 |
| Netlify Functions | 未完成业务验收 | 构建配置不代表线上运行正常 |
| TrueForge 远端调用 | 未验证 | 未建立完整远端链路 |
| MCP / Bridge 远端调用 | 未验证 | 本地服务不能直接视为云端可达 |
| 多实例续接 | 未验证 | 当前存在进程内存状态依赖 |
| 完整业务流程 | 未通过验收 | 缺少实际在线业务验证 |

## 3. 本地 Docker 与 Netlify 的环境区别

当前本地 TrueForge 演示环境采用：

```text
浏览器
  ↓
Docker Web / API
  ↓
宿主机 TrueForge
  ↓
Docker MCP / Bridge
  ↓
合成数据库与 Banking Core
  ↓
网页结果展示
```

其中：

- Web / API 在 Docker 中运行。
- TrueForge 在宿主机运行。
- MCP / Bridge 在 Docker 中运行。
- 数据库使用本地合成数据环境。
- 服务之间通过本地网络地址通信。

Netlify 云端环境与本地环境并不共享这些网络条件。

Netlify Functions 无法直接访问：

- 开发机的 `127.0.0.1:3000`。
- 开发机的 `127.0.0.1:3333/mcp`。
- 本地 Docker 的 `host.docker.internal`。
- 仅在本地 Docker 网络中可访问的服务。
- 仅在本地运行的数据库。

因此，即使本地 Docker 已经成功调用 TrueForge，也不能据此证明 Netlify 云端可以调用同一套服务。

## 4. Netlify 完整部署的必要条件

未来如需重新启用 Netlify，需要完成以下工作。

### 4.1 前端与 API

- 部署 Next.js 静态构建产物。
- 同时部署 `netlify/functions`。
- 核对 Functions 路由映射。
- 确认服务端环境变量正确配置。
- 确认 API 鉴权、请求校验和限流正常工作。

仅上传 `out` 或静态 ZIP 不构成完整应用部署。

### 4.2 TrueForge 与 MCP

- TrueForge 必须提供云端可访问的服务地址。
- MCP / Bridge 必须提供受控的远端连接。
- 服务间通信使用 HTTPS 或其他经批准的安全网络通道。
- 配置身份认证和出站访问白名单。
- 不得将本机地址直接写入线上环境变量并假设云端可以访问。

### 4.3 会话与续接状态

必须完成：

- ConversationState 共享持久化。
- 续接 Token 的跨实例有效性。
- revision 和原子消费机制。
- 取消及重复请求状态持久化。
- MCP Bridge 别名及重复请求记录持久化。
- 多实例并发与服务重启测试。

TrueForge Session 自身可以恢复，不代表 FinEase 自己的会话关联、续接 Token 和重复请求缓存也已经持久化。

### 4.4 安全与业务验收

还需要验证：

- 用户身份隔离。
- 访问码和服务端密钥管理。
- 请求限流。
- 操作预览和确认隔离。
- 模型不能绕过 Core 直接执行。
- 异常响应与超时恢复。
- 数据库连接和故障恢复。
- 线上日志与审计记录。

## 5. 重新验收的通过标准

| 项目 | 通过标准 |
|---|---|
| Preview 访问 | 获得授权的验收人员能够进入应用 |
| 页面 | 核心页面正常加载，无关键错误 |
| API | 真实请求能够正常返回 |
| TrueForge | 能够完成实际模型调用 |
| MCP | 能够发现并调用受限工具 |
| 账单 | 能正常返回原网页账单卡片 |
| 多轮对话 | 补参、切换任务、刷新及跨实例恢复符合预期 |
| 数据库 | 操作状态和续接记录能够可靠恢复 |
| 安全 | 未授权请求和越权操作被拒绝 |
| 回退 | 远端服务失败时能够明确提示，不自动重复发起金融操作 |

Netlify 登录保护应通过授权访问方式解决，不应为了演示而直接取消必要的访问控制。

## 6. 当前部署状态

截至本报告所记录的验收结果：

- 本地 Docker 是当前主要演示环境。
- Netlify Deploy Preview 仅完成构建。
- Netlify 应用业务尚未完成验收。
- 当前公共网址不作为 FinEase TrueForge 本地 Demo 的有效入口。
- 不将 Netlify 部署配置视为生产环境已经更新。
- 未完成多实例续接和远端服务验收前，不宣称可以公开在线演示或生产部署。

**最终结论：Netlify 仍然可以作为未来可选发布平台，但当前没有足够证据证明 FinEase TrueForge 完整业务链路已经在 Netlify 云端运行。**
