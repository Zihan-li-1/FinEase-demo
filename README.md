# FinEase

### 面向个人金融管理的 AI Banking Agent

FinEase 是一个基于大语言模型（LLM）与 Agent 技术构建的智能金融管理系统。用户可以通过自然语言与 Agent 对话，完成金融意图识别、业务查询、任务规划及受控操作。

项目旨在将自然语言交互能力与确定性的金融业务系统相结合，使用户能够通过统一的对话入口管理个人金融事务，而不必理解复杂的银行业务流程和专业术语。

FinEase 不仅是一个能够回答金融问题的聊天机器人，更是一个具备业务理解、任务编排、金融数据查询和安全操作能力的 AI Banking Agent。

---

## 1. 项目介绍

### 1.1 核心业务场景

项目围绕个人金融管理，覆盖以下六类核心业务场景：

| 业务场景 | 核心功能 |
|---|---|
| 智能转账 | 自然语言发起转账、账户与收款人识别、缺参澄清、转账预览及确认 |
| 账单分析 | 消费分类统计、账单汇总、异常信息识别、周期对比与支出分析 |
| 理财操作 | 理财产品推荐与对比、风险测评、模拟申购与赎回 |
| 卡片管理 | 卡片查询、安全检查、预算设置、交易控制、模拟冻结与解冻 |
| 订阅/代扣管理 | 自动识别订阅记录、订阅汇总、闲置订阅分析 |
| 跨场景联动 | 联合分析账单、订阅及其他金融信息，生成多步骤只读规划与业务建议 |

### 1.2 核心设计理念

FinEase 的核心设计原则是：

**通用智能能力可以灵活扩展，金融业务的规则、数据和执行权限必须保持确定。**

为此，项目将模型理解与金融业务执行分离：

- **自然语言理解：** 使用 LLM 理解用户意图、识别业务类型和必要参数。
- **确定性业务编排：** 通过 ParsedIntent、Validator、Dispatcher 和 Skill 完成业务路由。
- **金融数据管理：** 通过 Financial Context 统一数据来源、统计口径及证据。
- **安全操作控制：** 通过 Banking Core 管理操作预览、用户确认、风险验证、执行及回执。

模型不能直接决定资金操作，也不能通过聊天文字绕过服务端的业务校验。

### 1.3 系统架构

项目采用模块化 Agent 架构：

```text
                  User
                   |
             Natural Language
                   |
              Web Interface
                   |
          POST /api/banking-agent
                   |
          Conversation Routing
                   |
              TrueForge
                   |
          Intent Recognition
                   |
         ParsedIntent Validation
                   |
             Orchestrator
                   |
             Dispatcher
                   |
        +----------+----------+
        |          |          |
      Skills    Resolver    Planner
        |          |          |
        +----------+----------+
                   |
        +----------+----------+
        |                     |
 Financial Context       Banking Core
        |                     |
        +----------+----------+
                   |
          Structured Results
                   |
          UI Cards / Feedback
```

**核心组件：**

| 组件 | 主要职责 |
|---|---|
| Agent | 理解自然语言、识别意图、组织对话 |
| TrueForge | 提供 Agent Harness、模型会话及运行时支持 |
| ParsedIntent | 统一业务意图及参数结构 |
| Orchestrator / Dispatcher | 负责业务编排、校验及确定性分发 |
| Skills | 封装具体金融业务能力 |
| Financial Context | 提供可信金融数据及来源证据 |
| Banking Core | 管理金融操作的预览、确认、验证、执行与回执 |

此外，项目提供独立的确定性 Agent 任务接口 `/api/v1/agent/runs`，用于结构化多步骤任务编排，补充而不替代主要的 Banking Agent 对话链路。

### 1.4 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 16 |
| UI | React 19 |
| 开发语言 | TypeScript / JavaScript ESM |
| Agent Harness | TrueForge |
| 模型接入 | TrueForge SDK、兼容接口 |
| 数据校验 | Zod |
| 数据库 | PostgreSQL |
| 工具协议 | MCP |
| 测试 | Node.js Test Runner |
| 部署配置 | Netlify / Docker |

---

## 2. 环境要求

### 2.1 基础环境

| 软件 | 版本要求 | 用途 |
|---|---|---|
| Node.js | >= 22.12.0 | 项目运行环境 |
| npm | 随 Node.js 安装 | 依赖管理 |
| Git | 建议安装最新版 | 项目克隆与版本管理 |
| TrueForge | 本地联调基线 0.3.1 | 默认 Banking Agent 运行时 |
| PostgreSQL | 可选 | 金融操作持久化 |

推荐使用 Windows 10/11、macOS 或 Linux。

**注意：** PostgreSQL 不是本地 Mock 演示的必需条件；TrueForge 则需要在使用默认真实模型路由时单独配置并运行。

### 2.2 模型环境

FinEase 默认使用 TrueForge 作为 Banking Agent 的运行时。

需要准备：

- 可访问的 TrueForge 服务。
- 已配置的模型供应商。
- 对应的模型名称。
- 服务端访问凭据（如果 TrueForge 部署启用了认证）。

当前项目的默认模型配置示例：

```dotenv
TRUEFORGE_BASE_URL=http://localhost:8790
TRUEFORGE_MODEL=test/deepseek-v4-1-flash
```

模型名称需要与你在 TrueForge 中实际配置的模型一致。

如需使用旧版 Qwen Banking Runtime，可通过服务端配置显式切换，不会自动回退。

### 2.3 数据库环境

本地默认使用合成数据和内存 Mock，无须安装 PostgreSQL。

如需启用 PostgreSQL：

1. 配置 `DATABASE_URL`。
2. 创建数据库。
3. 执行数据库迁移。

```bash
npm run db:migrate
```

数据库配置应使用独立的演示数据，不得连接真实银行客户数据。

---

## 3. 快速启动

### 3.1 克隆项目

```bash
git clone https://github.com/Zihan-li-1/FinEase-demo.git

cd FinEase-demo
```

### 3.2 安装依赖

```bash
npm ci
```

### 3.3 配置环境变量

复制项目根目录的环境变量模板：

**Windows PowerShell：**

```powershell
if (-not (Test-Path .env.local)) {
    Copy-Item .env.example .env.local
}
```

**macOS / Linux：**

```bash
cp .env.example .env.local
```

打开 `.env.local`，配置默认 Banking Agent 所需的参数：

```dotenv
# 演示访问码，至少16位
FINEASE_ACCESS_CODE=your_private_demo_access_code

# 服务端续接凭据密钥，至少16位
CONTINUATION_TOKEN_SECRET=your_random_secret

# Banking Agent 运行时
FINEASE_BANKING_RUNTIME=trueforge

# TrueForge 服务
TRUEFORGE_BASE_URL=http://localhost:8790
TRUEFORGE_MODEL=test/deepseek-v4-1-flash

# 本地独立运行且未启用认证时可留空
TRUEFORGE_TOKEN=
```

配置说明：

- `FINEASE_ACCESS_CODE`：网页演示访问码，不是模型 API Key。
- `CONTINUATION_TOKEN_SECRET`：服务端用于保护多轮任务续接凭据的密钥。
- `FINEASE_BANKING_RUNTIME`：选择 Banking Agent 运行时，默认 `trueforge`。
- `TRUEFORGE_BASE_URL`：TrueForge 服务地址，只填写协议和主机端口，不附加 API 路径。
- `TRUEFORGE_MODEL`：TrueForge 中已经配置的模型名称。
- `TRUEFORGE_TOKEN`：仅在 TrueForge 服务需要 Bearer Token 时配置。

上述密钥只能保存在服务端环境变量中，不得添加 `NEXT_PUBLIC_` 前缀，也不得提交至 GitHub。

### 3.4 启动服务

确认 TrueForge 服务已经启动，并且模型配置正常。

在项目根目录执行：

```bash
npm run dev:qwen
```

该命令会同时启动：

- Next.js 前端。
- Banking Agent HTTP 接口。
- 原有业务 API。
- 本地模型服务接口。

<text>注意：</text> `dev:qwen` 是历史脚本名称。当前 Banking Agent 默认使用 TrueForge，而不是因为脚本名称就使用 Qwen。

普通的 `npm run dev` 只启动 Next.js 开发服务器，不提供完整的自定义 Banking API 服务，因此完整本地联调应使用 `npm run dev:qwen`。

### 3.5 访问系统

启动成功后，打开：

**http://127.0.0.1:3000**

输入配置好的演示访问码，即可开始体验。

可尝试以下指令：

```text
查询2026年8月的账单。

给张三转500元。

查询我的信用卡信息。

推荐适合我的理财产品。

找出我的闲置订阅。

分析8月账单支出与闲置订阅，
给出可以减少支出的建议。
```

系统会根据具体请求进入对应的业务处理流程。信息不足时会进行澄清；涉及金融操作时会生成相应预览及确认流程。

---

## 4. 测试与验证

项目提供自动化测试、类型检查、代码规范检查及生产构建命令。

### 4.1 基础测试

```bash
# 运行项目测试
npm test

# TypeScript 类型检查
npm run typecheck

# ESLint 检查
npm run lint

# Next.js 生产构建
npm run build
```

### 4.2 专项测试

```bash
# Banking Core 模拟演示
npm run demo:banking

# 统一对话路由测试
npm run test:conversation-routing

# TrueForge 真实模型路由验证
npm run verify:conversation-routing:live
```

真实模型测试需要配置可用的 TrueForge 服务及模型，可能产生模型调用费用。

测试所使用的金融数据仍为合成数据，不会调用真实银行资金接口。

---

## 5. 安全性与使用边界

FinEase 将模型理解、业务校验和金融操作权限分离，主要安全机制包括：

- 模型输出必须通过 ParsedIntent Schema 和业务参数校验。
- 模型不能自行提供可信账户 ID、操作编号或执行授权。
- 金融写操作需要经过业务预览和相应的用户确认、风险验证。
- 普通聊天中的“确认”等文字不能直接触发资金执行。
- 业务结果以结构化数据和可信业务回执为准，不从模型自然语言中提取金融操作结果。
- 系统根据实际 Repository、Core 和运行配置动态判断能力是否可用。

**当前项目属于金融业务模拟演示系统，并非真实银行服务。**

具体限制：

1. 账单、账户、卡片及理财产品数据均为合成演示数据。
2. 转账、卡片管理、理财申购与赎回均不涉及真实资金。
3. 订阅支持查询和闲置分析，不提供真实第三方会员取消授权。
4. 购物规划不等于实际下单，预算建议不等于真实资金冻结。
5. 部分会话和续接状态仍依赖进程内存，尚未完成完整的多实例及重启恢复验收。
6. 当前实现不等同于真实银行身份认证、支付授权或监管合规认证。

---

## 6. 项目文档

更多技术细节及开发约定：

| 文档 | 内容 |
|---|---|
| [Agent Architecture](AGENT_ARCHITECTURE.md) | 确定性 Agent 框架及任务编排 |
| [Banking Agent API](docs/Banking-Agent-API.md) | Banking Agent 接口与回复合同 |
| [Banking Core](docs/Banking-Core.md) | 金融操作底座与安全机制 |
| [Unified Conversation Routing](docs/Unified-Conversation-Routing.md) | 自然语言路由、任务恢复与能力目录 |
| [Financial Analysis Context](docs/financial-analysis-context.md) | 金融数据来源与可信度管理 |

项目仓库：

https://github.com/Zihan-li-1/FinEase-demo

