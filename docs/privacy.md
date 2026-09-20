# 隐私与安全边界

## 不采集、不上传

- 不读取或导出原始 Cookie、密码、验证码、浏览历史。
- 不上传正文、图片、字幕、向量、搜索词、私人标签或账号信息。
- 不包含分析、遥测、崩溃上报、云向量库或第三方模型请求。
- 不在小红书或抖音 origin 的 localStorage/IndexedDB 保存业务数据，不使用 `storage.sync`。

## 权限

Manifest 仅包含 `activeTab`、`scripting` 和 `storage`。用户点击扩展工具栏后，`activeTab` 才临时授权当前标签页；没有持久 host permission，也没有 `<all_urls>`。

消息处理会校验 schema、随机会话令牌、runId、tabId、主 frame URL 与平台。网页内容视为不可信文本，只通过 `textContent` 读取并由 React 转义；不执行平台内容中的 HTML 或指令。

## 网络

扩展页 CSP 为：

```text
script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; img-src 'self' data:; connect-src 'self';
```

增强 Worker 显式设置 `allowRemoteModels = false`，模型和 ONNX Runtime WASM 从扩展内路径加载。基础包不包含模型与 WASM，也不会静默下载。

## 本地存储不是保险箱

IndexedDB 提供 origin 隔离和离线持久化，但不是端到端加密。掌控浏览器配置或操作系统的他人可能读取数据。卸载扩展、删除浏览器配置、改变未打包扩展目录或设备损坏都可能导致数据丢失；应定期导出本地备份。
