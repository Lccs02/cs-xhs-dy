# 测试与验收记录

记录日期：2026-09-20。

## 已执行

- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test`：6 个测试文件、21 项测试通过。
- `npm run build`：Chrome MV3 基础包构建通过。
- `npm run zip:enhanced`：增强包构建与 ZIP 通过。
- `npm run verify:model`：Node CPU 本地推理通过，输出 `2 × 512`。
- `npm run audit:package`：基础/增强生产目录权限、CSP、`storage.sync`、合成隐私标记与远程 HTML 脚本审计通过。
- Playwright Chromium 145（Chrome for Testing）：2 项生产扩展 E2E 通过。
- Microsoft Edge（本机安装版）：2 项生产扩展 E2E 通过。
- Google Chrome（本机安装版）：自动化加载未完成；该品牌版本未通过 `--load-extension` 暴露 Service Worker，等待人工开发者模式验收。不能写成 Chrome 实测通过。

## 单元与集成覆盖

- 重复同步去重；同一内容在其他范围仍活动时不误清理。
- 未知终止、网络错误不删除；可靠完整快照正确停用缺失项。
- 大幅异常下降进入保护；内容不可访问不等于取消收藏。
- Service Worker 中断状态持久化；人工分类锁定不被重分析覆盖。
- 同名跨城/不同门店、相似不同型号阻止自动合并。
- 只有标题时显示“正文未获取”；摘录保留原文位置与版本。
- 备份恢复保留记录、关系与人工锁定。
- 合成 DOM 适配器去重、URL 清理、账号路径和结束标记测试。

## 10,000 条压力目标

固定种子合成 10,000 条记录；Node 24.14.0 + fake-indexeddb 环境中，40 条分页查询最后一轮记录为约 10686 ms，进程堆约 175 MB。该数字不是 Chrome IndexedDB 性能，也不是对真实账号规模的承诺。生产 UI 每页最多渲染 40 条。

## 尚未执行

- 真实小红书/抖音账号全历史、收藏夹、内容类型和取消收藏人工测试。
- 本机 Google Chrome 开发者模式手工加载与交互验收。
- 增强模型在 Chrome/Edge Worker 中的内存与速度基准。
- 真实浏览器重启中途任务恢复的人工操作测试。
