# FinEase 项目命名

项目名称统一为 **FinEase**。代码标识符、包名、文件路径、数据集标识、模型提示词、测试、示例配置和部署脚本同步更新。

对外接口与运行配置使用以下名称：

- 兼容计划接口：`/api/finease`；通用业务接口保持 `/api/banking`、`/api/banking-agent` 等路径。
- 访问请求头：`X-FinEase-Access`。
- 环境变量前缀：`FINEASE_`、`NEXT_PUBLIC_FINEASE_`；访问码及服务凭据值保持不变。
- 浏览器缓存：`finease.banking-chat.v1`、`finease.pending-operation.v1`；购物会话 Cookie：`finease_purchase`。
- Docker 项目：`finease-local-check`，镜像：`finease-docker-test:local`，数据库及用户：`finease_web`。
- MCP 连接器：`finease-docker-mcp`、`finease-docker-bridge`；本地更新入口：`scripts/Update-FinEase.ps1`。

部署从当前配置的 Git `origin` 获取主分支，不依赖仓库显示名。更改 GitHub 仓库名称时更新 `origin` 即可。

本次本地同步保留数据库备份，并迁移已有账务、卡片、操作和风险测评。浏览器使用新的缓存及 Cookie 名称，刷新后重新输入原访问码开始会话。

历史文档与文本报告仅统一命名，原时间、结果、提交哈希和历史截图保留；它们不代表本次重新执行的验收。当前全量测试结果与改名前一致：746 项，718 项通过，13 项既有失败，15 项跳过。构建及类型检查通过，Lint 无错误，有两项既有警告。
