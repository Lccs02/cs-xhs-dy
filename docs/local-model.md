# 本地语义增强

基础包无需模型即可完成搜索、分类、摘录和对象人工关联。增强包包含：

- 转换仓库：`Xenova/bge-small-zh-v1.5`
- 固定提交：`75c43b069aac4d136ba6bc1122f995fedcfd2781`
- 上游：`BAAI/bge-small-zh-v1.5`
- 许可证：MIT
- ONNX：`model_quantized.onnx`，运行配置 `q8`
- 池化/归一化：mean pooling + L2 normalize
- Transformers.js：3.7.6

`npm run prepare:model` 从固定提交下载 6 个文件并在 `model-manifest.json` 写入逐文件 SHA-256 与字节数。当前实跑模型文件 SHA-256 为：

```text
onnx/model_quantized.onnx
15b717c382bcb518ba457b93ea6850ede7f4f1cd8937454aa06972366cd19bcc
```

2026-09-20 已在 Windows、Node 24.14.0、CPU ONNX 后端、远程模型禁用的条件下用两条合成中文文本完成推理，输出 `2 × 512`。浏览器 Worker 与模型包已构建，但 Chrome/Edge 中的增强推理按钮仍需在目标内测设备上做一次人工性能验证；不要据此承诺所有设备速度。

模型缺失、损坏、内存不足或 Worker 失败时，界面明确回退基础规则；不会调用云 API。
