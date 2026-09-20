import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, pipeline } from '@huggingface/transformers';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelRoot = resolve(root, 'public/models');
const manifest = resolve(modelRoot, 'bge-small-zh-v1.5/model-manifest.json');
if (!existsSync(manifest)) throw new Error('本地模型不存在，请先运行 npm run prepare:model');
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = `${modelRoot}/`;
const extractor = await pipeline('feature-extraction', 'bge-small-zh-v1.5', { dtype: 'q8', local_files_only: true });
const output = await extractor(['广州东山口散步路线', '开放式耳机通勤体验'], { pooling: 'mean', normalize: true });
const embeddings = output.tolist();
if (!Array.isArray(embeddings) || embeddings.length !== 2 || embeddings[0].length < 100) throw new Error('本地模型输出形状异常');
console.info(`[model] local CPU inference passed: shape=${embeddings.length}x${embeddings[0].length}, remote models disabled`);
