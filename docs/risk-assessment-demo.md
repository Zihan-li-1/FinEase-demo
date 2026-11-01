# 模拟风险测评闭环验收

## 根因与接口

旧的 `investment_suitability` 参数进入 `wealth-skill.mjs`，直接返回 `risk_assessment_required`，不读取测评记录。`investment` / `portfolio` 参数进入 `wealth-action-skill.mjs`，读取固定 R2 样例，且 questionnaire 指向未实现的页面。两种卡片都没有提交答案的通路。

现在所有聊天测评请求进入 Wealth Action，旧范围作为兼容别名，解析后统一为 `investment`。普通聊天的 LLM 仍然只能提供 `assessment_scope`，不能提供答案、测评 ID、结果或确认权限。

问卷复用鉴权后的 `POST /api/banking-agent`，通过独立的 `riskQuestionnaire` 字段调用确定性业务逻辑，不经过 LLM，不更改或确认任何待执行的 Core 业务：

```json
{"riskQuestionnaire":{"operation":"start"}}
{"riskQuestionnaire":{"operation":"submit","version":"demo-risk-v1","answers":{"horizon":2,"objective":2,"experience":2,"knowledge":2,"liquidity":2,"capacity":2,"loss":2}}}
{"riskQuestionnaire":{"operation":"matches"}}
```

统一响应为 `status: wealth_result`。`data.kind` 分别为 `questionnaire`、`risk_assessment`、`recommendation`，缺少有效记录时为 `questionnaire_required`；客户端校验问卷、规则版本及测评记录格式。

## 实际流程与规则

1. 请求测评，无有效记录时在聊天卡片点击“开始模拟测评”。
2. 本人回答 7 道单选题，可上一步、下一步或取消。部分作答不能提交，取消不写入记录。
3. 提交全部答案后，服务端校验题目 ID、完整性、整数选项及版本，生成测评记录。客户端和模型均不能指定风险等级或测评 ID。
4. 结果展示 R1/R2/R3、风险特征、分数及保守约束依据、可匹配风险等级、完成与到期日期；可查看匹配产品或重新测评。
5. 再次通过聊天查询从 `getRiskAssessment` 读取最新有效记录。重新测评生成新 ID，替换当前有效记录。
6. 目标式推荐和原有条件式推荐均在已配置 Wealth ports 的业务路由中受测评等级限制；只读规划也传递相同 ports。产品比较继续独立工作。

`demo-risk-v1`：每题 0–3 分，总分 0–21；0–7 分为 R1，8–14 分为 R2，15–21 分为 R3。财务承受能力、亏损容忍和流动性题任一为 0 时最多 R1，为 1 时最多 R2；不理解本金亏损时最多 R1。最终等级取总分等级和保守上限的较低值。规则见 `src/skills/wealth/risk-assessment.mjs`。

记录包含随机测评 ID、完成时间、规范范围、365 天有效期、等级、分数、依据、原始答案、规则版本及 `synthetic_demo_only: true`。读取时复算分数与等级，并检查范围、版本、时间和有效期。未提交问卷不生成结果。

## 持久化与边界

- 身份沿用项目固定演示 owner，按 owner、dataset、演示访问码和续接密钥生成存储范围；IP 和 LLM 提供的身份都不参与授权。切换凭据或数据集进入新的隔离范围。
- 数据库环境使用 `banking_demo_risk_assessments`。部署前设置 `DATABASE_URL` 并运行 `npm run db:migrate`，其中包含新迁移 `009_demo_risk_assessments.sql`。同一范围只维护一份最新有效记录，不保留未提交草稿。
- 本地环境在忽略版本控制的 `.commerce-mock/risk-assessments` 中原子写文件，重建适配器或进程后可重读；可用 `FINEASE_DEMO_DATA_DIR` 指定持久卷目录。更换数据目录即使用另一份本地数据。重置当前本地演示生命周期时可由维护者清理该子目录。
- Netlify 不使用临时文件保存测评，必须配置数据库才能提交。容器重建需挂载上述持久目录或使用数据库。
- 配置后的业务 Core 不再把固定 R2 样例当作已完成记录。固定样例仅保留在无持久化适配器的旧测试工厂中，以兼容已有注入式测试。
- 模拟测评不能成为真实银行的认证。问卷和 Wealth Action 要求合成数据环境，Core 再检查合成上下文与合成产品；有效模拟记录不能解锁真实交易。
- 模拟申购仍需经过 Core 预览、精确用户确认和执行，并在 Core 重新校验有效测评和产品风险。聊天文本和问卷提交均不具有资金操作确认权限。

## 变更文件

- 路由与合同：`server/banking-intent-parser.mjs`、`src/agent/validate-parsed-intent.mjs`、`server/banking-orchestrator.mjs`、`server/banking-agent.mjs`、`src/agent/handlers/wealth-handler.mjs`、`schemas/wealth-actions.schema.json`、`schemas/wealth-resolved-actions.schema.json`。
- 测评与存储：`src/skills/wealth/risk-assessment.mjs`（新增）、`server/risk-questionnaire.mjs`（新增）、`server/risk-assessment-store.mjs`（新增）、`src/skills/wealth/mock-ports.mjs`、`src/banking-core/postgres-store.mjs`、`migrations/009_demo_risk_assessments.sql`（新增）、`scripts/migrate-banking.mjs`。
- 业务检查：`src/skills/wealth/wealth-skill.mjs`、`src/skills/wealth/wealth-action-skill.mjs`、`src/banking-core/core.mjs`、`server/read-only-tool-gateway.mjs`。
- 界面：`src/app/BankingReadCards.tsx`、`src/app/BankingWealthCards.tsx`、`src/app/page.tsx`、`src/lib/banking-agent-client.ts`。已核查 `src/lib/use-finease.ts`：既有 `wealth_result` 分发可直接复用，无需改动 Hook。
- 验证：`tests/risk-assessment-demo.test.mjs`、`tests/risk-assessment-ui.test.cjs`（新增），`tests/wealth-action-skill.test.mjs`（将 portfolio 的旧预期更新为兼容别名），`package.json`（将新测试纳入默认测试）。

本次未修改工作区原有的储蓄卡片、Docker 等未提交变更。

## 测试结果

- 新闭环测试及 Wealth Action 回归：17 通过、0 失败、1 跳过。包含真实 React 卡片与真实 HTTP handler/client、Skill、Core 的组合交互测试，不调用外部模型。
- 覆盖首次入口、部分作答拒绝、完整评分、最新记录查询、持久化重读、产品风险过滤、越级申购拒绝、重新测评、无效/过期/伪造记录、鉴权及合成环境隔离；比较、Core 预览、未确认拒绝执行、确认后执行也有通过测试。
- 全量 `npm test`：736 项，707 通过、14 失败、15 跳过。未修改 HEAD 独立副本：726 项，698 通过、14 失败、14 跳过；失败名称集合一致，本次没有新增失败。
- 既有失败涉及旧产品名称/数量断言、旧理财预览测试、储蓄表单测试及部分运行时测试；未扩大本次修复范围修改这些历史测试或其他 Skill。
- `npm run typecheck`：通过。
- `npm run lint`：通过，0 错误；3 个既有 unused-vars 警告。
- `npm run build`：通过。
- 当前环境没有 `DATABASE_URL` / `BANKING_TEST_DATABASE_URL`，新增 PostgreSQL 集成测试跳过，数据库迁移及跨数据库实例读写尚未实测；本地文件持久化重读已实测。外部 LLM 的现场识别及真实浏览器视觉检查未进行，意图兼容路由和 React 交互已在测试中验证。
