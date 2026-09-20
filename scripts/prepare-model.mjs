import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const model = 'Xenova/bge-small-zh-v1.5';
const revision = '75c43b069aac4d136ba6bc1122f995fedcfd2781';
const output = process.env.MODEL_OUTPUT_DIR
  ? resolve(process.env.MODEL_OUTPUT_DIR)
  : resolve(root, 'public/models/bge-small-zh-v1.5');
const files = [
  'config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'vocab.txt', 'onnx/model_quantized.onnx',
];

async function sha256(path) {
  const hash = createHash('sha256');
  hash.update(await readFile(path));
  return hash.digest('hex');
}

await mkdir(output, { recursive: true });
const manifestFiles = [];
for (const file of files) {
  const target = resolve(output, file);
  await mkdir(dirname(target), { recursive: true });
  const url = `https://huggingface.co/${model}/resolve/${revision}/${file}?download=true`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`下载失败 ${response.status}: ${file}`);
  const temporary = `${target}.download`;
  await rm(temporary, { force: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary));
  await rename(temporary, target);
  const info = await stat(target);
  manifestFiles.push({ path: file.replaceAll('\\', '/'), sha256: await sha256(target), bytes: info.size });
  console.info(`[model] ${file} ${info.size} bytes`);
}

const manifest = {
  model,
  localModelId: 'bge-small-zh-v1.5',
  revision,
  upstream: 'BAAI/bge-small-zh-v1.5',
  license: 'MIT',
  pooling: 'mean',
  normalize: true,
  dtype: 'q8',
  preparedAt: new Date().toISOString(),
  files: manifestFiles,
};
await writeFile(resolve(output, 'model-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.info(`[model] manifest written to ${output}`);
