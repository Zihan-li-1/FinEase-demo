# 双主题核验

基线：`72bb881`，开始时工作区干净。原页面仅有深色硬编码样式，没有主题状态、偏好存储或设置页；浅色颜色来自本地历史 `ebd3d58`，只提取颜色，没有回退文件。

- 配色：`src/app/theme-colors.css`。深色保留近黑、近白与紫粉→橙→黄渐变；浅色恢复原蓝白风格，修正测得对比度不足的次要文字颜色。原有选择器和非颜色声明不变。
- 首屏：`src/app/layout.tsx` 同步 head 脚本在绘制前设置 `html[data-theme]`，SSR 默认 dark；只对根属性使用 hydration suppression。
- 偏好：`src/lib/theme.ts`，唯一持久化键 `finease.theme`，只接受 `dark` / `light`。未保存、非法或读取失败默认深色，不读操作系统主题；初始化不覆盖存储。明确选择才写入；写入失败仍可在当前页面切换。
- 入口：`src/components/ThemeMenu.tsx`，复用助理顶部原无事件的“更多”按钮位置和尺寸，显示当前“深色/浅色”，Portal 菜单含“主题：深色 / 浅色”。支持键盘、焦点反馈和当前选择。其他页面返回助理使用此唯一入口。

## 实际结果

- 最终生产构建通过；最初沙箱基线构建因 Google Fonts 网络失败。允许构建依赖正常下载后，最终 `npm.cmd run build` 成功，未更改字体或依赖。
- 全量原测试前后均 **676 通过 / 18 失败 / 15 跳过**，失败名称一致，见 `test-results.json`；不把既有失败算成通过。
- 新主题单元测试 **7 通过 / 0 失败**；TypeScript 与定向 ESLint 通过。
- 实际 Chrome：1440×900、390×844。助理、购物、商品详情，两主题均渲染；账户概览、卡片管理按现有桌面入口验证。手机原布局隐藏侧栏，本次未增加入口。
- 无偏好且 OS 浅色时默认深色；浅/深切换、刷新、导航、新标签页及恢复存储的新浏览器上下文验证通过。非法值、存储异常、已存浅色的首帧验证通过；无 hydration 异常。
- 对比基线关键元素的计算样式与位置完全一致；深浅切换也一致。完整 CSS/相关 TSX 源码展开深色变量后与基线一致，见 `scope-report.json`。
- 未提交输入、已有消息、滚动后的聊天位置保留；隔离 Mock 卡片只读查询执行中切换，任务继续且请求仅一次。账单与卡片结果、加载、禁用、空态、错误态、主题 Portal 和键盘操作已检查。Mock 从现有 `conversation-ui-server.mjs` 复用，无真实对外发送、付款、删除或执行操作。
- `final-report.json`：无非预期浏览器/网络错误、无检测到的页面横向溢出；两次 503 为主动注入的 Mock 错误态。对比度扫描覆盖可见纯色背景正文，不等同完整 WCAG 审计，跳过渐变背景与禁用项。
- 已打开查看基线与最终深浅截图，修正浅色对比度后重新构建、渲染、截图并查看。`dark-*` / `light-*` 来自最终生产构建，`baseline-*` 为改动前。

## 复验命令

在仓库根目录运行（Node/npm 在 PATH 中；PowerShell 使用 npm.cmd）：

```powershell
npm.cmd run build
npm.cmd test
node --test --experimental-test-isolation=none tests/theme.test.mjs
npm.cmd run typecheck
node node_modules/eslint/bin/eslint.js src/components/ThemeMenu.tsx src/lib/theme.ts src/app/layout.tsx scripts/verify-themes.mjs tests/theme.test.mjs
npm.cmd run start -- --hostname 127.0.0.1 --port 3189
```

另一个终端运行浏览器核验；Playwright 是已有外部验证工具，未增加项目依赖：

```powershell
$env:PLAYWRIGHT_MODULE = 'C:/Users/25123/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
$env:THEME_TEST_URL = 'http://127.0.0.1:3189'
node scripts/verify-themes.mjs
```

不要在最终代码上使用 `--baseline` 覆盖已记录基线。

## 边界

未验证真实外部 Agent/资金服务、所有业务分支及非 Chrome 浏览器；不声称端到端真实金融接口接通。当前源码没有独立 Markdown/代码块渲染器或其他 Portal 弹窗，未创建这些组件。卡片 Mock 响应中的既有问号文本未修改。浏览器原生日期/下拉弹层由 `color-scheme` 配色，其每种操作系统实现未逐一截图。
