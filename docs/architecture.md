# 架构与状态机

## 两种运行形态

- 网页版：Vite + React 静态应用，直接部署到 GitHub Pages。业务数据写入网页 origin 的 IndexedDB；支持手工/批量导入、分类、摘录、对象对照和备份恢复，不读取其他站点登录态。
- 扩展版：WXT + React 的 MV3 扩展。业务数据写入扩展 origin 的 IndexedDB；在用户主动授权的当前平台标签页中运行扫描器。

两种形态复用 `src/core` 的数据模型、分类、摘录、备份格式和 URL 校验。网页入口位于 `web/`，扩展入口位于 `entrypoints/`。

## 运行边界

- `popup`：识别当前活动标签页，承载用户手势并启动同步。
- `scanner`：通过 `chrome.scripting.executeScript` 仅注入当前主 frame，读取页面已展示内容；不在平台 origin 写业务数据。
- `background`：再次校验 tab、URL、平台、runId 与随机 session token；向扩展 origin 的 IndexedDB 持久化批次。
- `dashboard`：全屏本地工作台，读取同一扩展 origin 的 IndexedDB。
- `text-processor` / `local-embeddings`：独立 Worker；前者运行基础规则，后者只从扩展内模型与 WASM 路径加载。

页面网络与扩展网络是两件事：平台页面仍正常联网；工作台 CSP 将 `connect-src` 限制为 `'self'`。跳回原平台只在用户点击时新开官方 HTTPS 地址。

## 同步状态

`starting → scanning → completed | partial | protected | failed | cancelled`

`scanning ↔ paused`。Service Worker 启动时，遗留的 `starting/scanning/paused` 任务会标记为 `interrupted_needs_restart`；不会用丢失的内存状态继续对账。

每个批次先写入 `SourceItem`、`BookmarkMembership` 和 `Observation`，再更新检查点与整理产物。去重键为 `platform + stableItemId`，跳转 URL 单独保存。账号身份无法稳定确认时，不写入账号命名空间。

## 安全对账门槛

缺失项只有同时满足以下条件才会停用：

1. 同一稳定账号和同一声明范围；
2. `completeForScope` 为真；
3. 适配器明确声明 `membershipSnapshotVerified`；
4. 终止依据为已验证结束标记、页数或空状态；
5. 没有错误；
6. 数量没有异常骤降。

当前真实网页适配器的 `membershipSnapshotVerified` 均为 `false`。测试用可信适配器覆盖了正确移除与派生数据清理，但这不等同于真实平台验收。

## 分类、对象、摘要分离

- 分类：多标签关键词规则，分数仅是启发式规则分；人工结果锁定。
- 对象：名称/别名/品牌/型号/城市/门店生成候选；型号、城市或门店冲突阻止自动合并。
- 摘要：只从已取得原文中选句并记录字段、起止位置、内容版本和算法版本。

相似主题不会自动成为同一对象，向量相似度也只用于候选发现。
