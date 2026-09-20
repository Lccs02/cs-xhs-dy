# 平台能力矩阵与真实验证状态

核查日期：2026-09-20。这里记录“已观察到什么”，不把未检索到能力写成“绝对不存在”。

| 能力 | 小红书 | 抖音 |
| --- | --- | --- |
| 普通用户官方网页登录 | 页面能力，需用户自行完成 | 页面能力，需用户自行完成 |
| 公开开放平台中的普通用户个人收藏列表 API | 未确认；本次环境访问开放平台首页超时 | 未确认；当前 OpenAPI 列表展示个人资料、关系、内容、搜索等能力，未确认普通用户个人收藏列表接口 |
| 网页收藏与 App 全部收藏一致 | 未验证 | 未验证 |
| 全部收藏、收藏夹及成员关系 | 页面结构与结束依据未验证 | 页面结构与结束依据未验证 |
| 图文/视频类型覆盖 | 未验证 | 未验证 |
| 当前实现 | 用户点击后读取当前官方页已展示的收藏链接和卡片文字 | 用户点击后读取当前官方页已展示的收藏链接和卡片文字 |
| 适配器状态 | `未验证`，覆盖范围 `unknown` | `未验证`，覆盖范围 `unknown` |
| 自动删除缺失项 | 禁用 | 禁用 |

## 当前实现为什么仍然有价值

纵向链路已经真实存在：用户手势 → 当前标签页注入 → 稳定 ID 去重 → IndexedDB 批次写入 → 本地分类/摘录/对照。平台页面结构一旦通过用户本机脱敏验证，只需提升对应适配器版本和可靠结束条件，不需要重写数据库或工作台。

## 仍需用户本机完成的验证

不要向云端或本仓库提交真实正文、截图、DOM、HAR、Cookie 或账号标识。只记录脱敏统计：

- 浏览器版本、适配器版本、平台和页面类型；
- 首尾各 3 条仅核对稳定 ID 是否重复，不导出标题；
- 页面可见唯一数与 App 侧人工计数差异；
- 收藏夹重叠、图文/视频类型、历史边界；
- 可靠结束依据；
- 取消一条收藏后，下次完整扫描是否可确认移除。

在这些验证通过前，“全部收藏”验收保持未通过。

## 官方核查入口

- 抖音 OpenAPI 列表：https://developer.open-douyin.com/docs/resource/zh-CN/dop/develop/openapi/list
- 小红书开放平台：https://open.xiaohongshu.com/
- Chrome activeTab：https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Chrome 存储：https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- Chrome Service Worker 生命周期：https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

平台条款、网页自动化允许范围与扩大测试前的合规审查仍是开放项；本项目不声称已获得平台许可。
