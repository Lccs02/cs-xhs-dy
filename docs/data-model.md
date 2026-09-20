# 数据模型

所有业务表位于扩展 origin 的 `ShoucangWorkbench` IndexedDB。合成演示使用独立的 `ShoucangWorkbenchDemo`。

- `PlatformAccount`：`platform + stableAccountId` 命名空间，记录身份核验状态与时间。昵称不是主键。
- `SourceItem`：`platform + stableItemId` 唯一；分别保存规范 URL、跳转 URL、元数据哈希、内容哈希、内容版本和解析状态。
- `BookmarkMembership`：账号、范围、收藏夹与条目的关系；停用原因只记录为可靠快照中缺失，不冒充“确认由用户取消”。
- `Category / ItemCategory`：多标签分类；自动分数、依据、人工来源与锁定状态分开保存。
- `Entity / ItemEntity`：具体对象及多对多来源；支持建议、自动确认、人工确认和否定关系。
- `Excerpt`：保存来源字段、起止位置、内容版本和算法版本，正文变化后重建。
- `UserOverride`：人工分类、绑定、拆分、否定与别名规则的扩展位。
- `SyncRun / Observation`：任务状态、账号、范围、适配器版本、终止依据、覆盖状态、检查点与逐条观测。
- `FeatureCache`：搜索或向量特征，包含输入哈希、算法与模型版本，只重算变化内容。

## 删除策略

范围关系停用后，如果条目还有其他活动关系，不清理正文和派生数据。最后一个活动关系被可靠对账移除时，清理非人工锁定分类、非人工锁定对象关系、摘录和特征缓存，并将正文清空，仅保留最小同步记录。

“删除全部本地数据”同时删除真实库、演示库和派生缓存。备份恢复先校验格式、版本、表结构、文件大小与总记录数，再在单个事务中替换。
