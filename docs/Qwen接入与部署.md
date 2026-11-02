# FinEase Qwen 接入与部署说明

> 文档性质：Qwen 模型接入及旧版部署方式说明。
>
> 注意：本文描述的是 Qwen 独立模型调用链，不代表当前 FinEase TrueForge Docker 演示环境的部署方式，也不代表任何线上网址已经更新。

## 1. 适用范围

FinEase 工作区中存在不同的演示运行入口。

| 项目 | 技术路径 | 说明 |
|---|---|---|
| 旧版 Qwen 演示 | Qwen API / 本地服务 / Netlify Functions | 独立的模型接入路径 |
| 当前 TrueForge 试点 | Docker Web / TrueForge / MCP / Bridge | 当前推荐的完整本地演示路径 |

本文中的 Qwen 配置不应被直接用于部署 TrueForge。

当前 TrueForge 演示入口及启动方法见项目根目录 `README.md`。

## 2. Qwen 接入说明

旧版 Qwen 模式通过服务端调用阿里云百炼兼容接口。

原有配置：

- 模型：`qwen-plus`
- 地域：北京
- 输出：JSON 格式
- 单次最多输出：1000 Token

模型推理可以使用真实模型，但账单和资金操作仍为模拟数据。本接入不包含真实银行、支付或账户连接。

## 3. 本地运行（Qwen 独立路径）

在对应的 Qwen 项目目录执行：

```powershell
npm run dev:qwen
```

如需新建本地环境文件，先检查是否已经存在 `.env.local`。已有文件应手动补充配置，不要覆盖原有内容。

原有配置涉及：

```dotenv
DASHSCOPE_API_KEY=你的北京地域百炼密钥
QWEN_MODEL=qwen-plus
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

演示访问码使用当前代码已经定义的服务端环境变量名称，不要仅为了文档统一而自行修改变量名。

安全要求：

- `DASHSCOPE_API_KEY` 只能保存在服务端。
- 演示访问码不是模型 API Key。
- 密钥和访问码不得添加不必要的 `NEXT_PUBLIC_` 前缀。
- 不得提交 `.env.local` 或密钥到 Git。
- 演示访问码不替代正式用户身份认证。

修改环境变量后需要重新启动服务。

普通 `npm run dev` 不一定会启动完整的模型接口；应以项目实际配置的 `dev:qwen` 启动脚本为准。

## 4. Qwen 请求链路

```text
浏览器
  ↓
/api/agent
  ↓
本地开发服务 / Netlify Function
  ↓
访问码、来源、请求大小、授权及字段校验
  ↓
Qwen 服务端模型调用
  ↓
JSON 结构与业务规则校验
  ↓
前端展示回答或待确认计划
```

主要组件：

| 文件 | 职责 |
|---|---|
| `server/qwen.mjs` | 服务端模型请求处理、密钥保护及输出校验 |
| `netlify/functions/agent.mjs` | Netlify 版本的模型接口 Function |
| `scripts/dev-qwen.mjs` | 本地同源服务及相关 API |
| `src/lib/agent-client.ts` | 前端请求与响应校验 |

Qwen 模型负责理解和生成候选结果，数值校验、业务约束和用户确认仍由程序控制。

模型文字不能直接触发金融操作。

## 5. Netlify 部署（可选历史路径）

**本节只描述旧版 Qwen 接口的可选部署方式，不代表当前 Netlify 线上状态，也不是当前 TrueForge Docker 项目的部署指引。**

### 5.1 完整部署要求

旧版 Qwen 应用需要同时部署：

1. Next.js 静态构建产物 `out`。
2. `netlify/functions` 中的服务端 Functions。
3. Netlify 后台配置的服务端环境变量。

仅上传 `out` 或旧版静态 ZIP，不会自动部署模型后端。

### 5.2 Netlify 环境变量

需要在 Netlify 对应站点的 Environment variables 中配置：

- `DASHSCOPE_API_KEY`
- `QWEN_MODEL`
- `QWEN_BASE_URL`
- 项目现有的服务端演示访问码变量

变量必须对 Functions 运行时和对应部署环境生效。

本地 `.env.local` 不会自动成为线上环境变量。

### 5.3 可选部署命令

只有在明确决定重新部署旧版 Qwen 项目，并核实 Netlify 站点归属、权限、构建设置和环境变量后，才执行：

```powershell
netlify login
netlify link

npm run build

netlify deploy --prod --dir=out --functions=netlify/functions
```

`netlify link` 时必须确认绑定的是预期站点。

历史文档中出现过的站点标识只是旧站点标识，不能据此推断当前站点绑定、部署版本或线上运行状态。

执行 `--prod` 会发布生产版本，不应将其作为日常测试命令。

### 5.4 当前线上状态

本项目没有足够证据证明旧版 Qwen 路径对应的公共网址目前正在运行最新代码。

历史 Deploy Preview 的构建完成记录不能代替应用访问和业务验收。

当前 Netlify 状态请查看：

`docs/netlify-preview-report.md`

## 6. 当前 TrueForge 项目的部署边界

当前 TrueForge 演示使用另一条运行链路：

```text
Docker Web / API
  ↓
TrueForge Runtime
  ↓
Docker MCP / Bridge
  ↓
FinEase 业务能力
  ↓
合成 Banking Core
```

不能因为 Qwen 路径已经配置了 Netlify Functions，就认为 TrueForge 已经可以从 Netlify 云端访问本地 MCP、Bridge 或数据库。

远端部署还需要：

- TrueForge 远端服务。
- MCP / Bridge 远端可达地址。
- HTTPS 和服务身份认证。
- 共享会话与续接状态。
- 多实例持久化和恢复验收。
- 云端业务流程完整测试。

在这些条件满足前，使用本地 Docker 作为当前主要演示环境。

## 7. 安全与功能边界

- 模型密钥仅存在服务端。
- 模型不能直接修改真实银行数据。
- 模型回复中的“确认”不构成金融操作授权。
- 模拟业务结果不能描述为真实银行执行回执。
- 演示访问码不能替代生产身份认证。
- 单 IP 限流不能等同于全局费用预算。
- 网络超时不能被自动解释为业务操作失败或成功。

---

**文档结论：Qwen 接入与 Netlify 部署属于独立的历史模型接入路径。当前 FinEase TrueForge 演示以本地 Docker 为主，二者的部署状态和验收结果必须分别记录。**
