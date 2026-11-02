# FinEase — AI Banking Agent

FinEase 是一个面向个人金融管理场景的 AI Banking Agent 演示项目。用户通过自然语言提出金融需求，由 Agent 理解意图、调用金融业务能力，并通过受控的业务流程返回查询结果或操作预览。

## 01. 当前演示入口

**当前推荐入口：本地 Docker + TrueForge 联调环境**

```text
http://127.0.0.1:4300/
```

该地址仅在本地 Docker 演示环境运行时可访问，不是公网服务。

当前项目状态：

| 项目 | 状态 |
|---|---|
| 本地 Docker 网页与 API | 已完成联调 |
| TrueForge 本地 Agent 调用 | 已有真实联调记录 |
| MCP / Bridge | 已完成本地联调 |
| 合成 PostgreSQL Core 持久化 | 已完成对应专项验收 |
| TrueForge 多实例续接状态 | 尚未完成持久化验收 |
| Netlify 云端业务访问 | 尚未完成验收 |
| 生产环境部署 | 未完成 |
| 真实银行账户及资金连接 | 未接入 |

所有金融数据均为演示合成数据。当前项目不连接真实银行账户，不执行真实资金交易。

## 02. 当前本地演示架构

```text
浏览器
  │
  ▼
Docker Web / Banking Agent API
127.0.0.1:4300
  │
  ▼
宿主机 TrueForge 0.3.1
127.0.0.1:8790
  │
  ▼
Docker MCP / Bridge
  │
  ▼
FinEase 业务逻辑与合成 Banking Core
  │
  ▼
原网页卡片与结果展示
```

主要服务：

| 服务 | 运行位置 | 地址 |
|---|---|---|
| Web / API | Docker | 127.0.0.1:4300 |
| MCP | Docker | 127.0.0.1:4333 |
| MCP Bridge | Docker | 127.0.0.1:4334 |
| TrueForge 0.3.1 | 宿主机 | 127.0.0.1:8790 |
| PostgreSQL | Docker 私有网络 | 不直接暴露宿主机端口 |

TrueForge 不包含在本项目 Docker 镜像中，而是在宿主机运行。Docker 内的 Web、MCP 和 Bridge 通过受控网络配置与其连接。

## 03. 本地运行

### 环境要求

- Windows + Docker Desktop
- Docker Compose
- Node.js 环境
- 已配置的 TrueForge 0.3.1
- 项目原有 `.env.local` 配置

请使用自己的本地 `.env.local`。不要提交密钥、访问码或其他敏感配置到 Git。

### 第一步：启动 TrueForge

在 PowerShell 中执行：

```powershell
$env:HOST = '127.0.0.1'
$env:OUTBOUND_URL_ALLOWED_HOSTS = '["127.0.0.1"]'
npx.cmd @truefoundry/trueforge@0.3.1 --port 8790
```

沿用本地已经配置的模型和 TrueForge 数据。

### 第二步：启动 Docker 服务

在项目根目录的另一个终端执行：

```powershell
docker compose --env-file .env.local --profile test build tests web

docker compose --env-file .env.local -f compose.yaml -f compose.postgres.yaml up -d web mcp bridge

node scripts/configure-trueforge-docker.mjs

docker compose --env-file .env.local -f compose.yaml -f compose.postgres.yaml ps
```

### 第三步：访问网页

打开：

```text
http://127.0.0.1:4300/
```

使用本地演示访问码进入页面，按照现有授权提示进行操作。

### 停止服务

```powershell
docker compose --env-file .env.local -f compose.yaml -f compose.postgres.yaml down
```

不要随意增加 `-v`，以免删除本地测试数据库卷。

## 04. 当前业务能力

FinEase 围绕六类金融业务能力构建：

1. 智能转账
2. 账单分析
3. 理财操作
4. 卡片管理
5. 订阅与代扣管理
6. 跨场景联动

当前 TrueForge 本地试点重点验证：

- 账单查询与分析。
- 转账账户、收款人澄清。
- 转账金额修改与正式预览。
- 卡片信息查询。
- 多轮对话中的任务切换和恢复。
- 模型聊天与金融操作授权的隔离。

金融写操作必须遵循独立的预览、确认和 Core 校验流程。模型聊天中的“确认”不能代替独立授权。

## 05. 部署状态说明

### 本地 Docker

本地 Docker 是当前推荐的完整 TrueForge 演示方式。

已完成本地 Web、API、TrueForge、MCP、Bridge 和合成数据环境的联调。

具体检测结果见：

- `docs/docker-test-report.md`
- `docs/trueforge-trial.md`
- `docs/p2-5-acceptance.md`

需要注意：本地单进程测试通过不代表跨实例续接已经解决。当前 TrueForge 适配相关的续接状态、会话 revision、重复请求及 Bridge 别名仍存在进程内存依赖。

### Netlify

Netlify 仅保留为历史预览及未来可选部署方式。

2026-10-18 的 Deploy Preview 虽然构建完成，但访问受到 Netlify 登录保护拦截，未能完成应用业务验收。

因此：

- 不将该 Preview 视为已验收的在线 Demo。
- 不将历史公共网址作为当前有效演示入口。
- 不宣称当前 TrueForge 已完成 Netlify 云端接入。
- 不将本地 HTTP、MCP 或 TrueForge 调用成功等同于云端调用成功。

具体情况见 `docs/netlify-preview-report.md`。

Netlify 完整部署需要同时部署静态前端和 Functions，并正确配置服务端环境变量。仅发布 `out` 不构成完整的 API 应用部署。

Netlify 云端不能直接访问开发机的 `127.0.0.1`、Docker 私有网络、`host.docker.internal` 或本地数据库。

未来重新部署前，还需要完成：

1. TrueForge 与 MCP 的远端可达性及 HTTPS 鉴权。
2. 多实例会话续接状态持久化。
3. 用户身份和会话隔离。
4. 共享状态、原子续接与重复请求处理。
5. 远端 API、数据库和业务流程的完整验收。

在上述条件完成前，不将 Netlify 作为当前正式演示入口。

## 06. 不同演示工作区的区别

当前工作区中存在不同版本的演示项目，请勿混用其部署说明。

| 项目 | 定位 | 推荐入口 |
|---|---|---|
| 当前 FinEase TrueForge 项目 | 完整本地 Agent 联调项目 | Docker |
| 独立静态客户端 Demo | 旧版客户端演示项目 | 按其自身说明运行 |

旧版项目中的 Qwen、Netlify、静态导出说明，不自动适用于当前 TrueForge Docker 演示项目。

## 07. 重要文档

| 文档 | 用途 |
|---|---|
| `docs/Banking-Agent-API.md` | Banking Agent API 接口与部署边界 |
| `docs/Banking-Core.md` | Core 数据合同、预览、确认、执行及回执 |
| `docs/trueforge-trial.md` | TrueForge / MCP 试点接入 |
| `docs/docker-test-report.md` | 本地 Docker 运行和持久化检测 |
| `docs/netlify-preview-report.md` | Netlify 历史预览验收记录 |
| `docs/Qwen接入与部署.md` | 旧版 Qwen 接入说明 |

---

**当前项目定位：基于合成金融数据的本地 AI Banking Agent 演示系统。**

FinEase 当前优先保证本地业务链路、安全边界和可复现性，不以尚未完成验收的公网部署作为项目完成依据。
