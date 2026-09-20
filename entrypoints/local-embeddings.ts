interface EmbedRequest {
  id: string;
  type: 'EMBED';
  texts: string[];
  modelBaseUrl: string;
  runtimeBaseUrl: string;
}

export default defineUnlistedScript(() => {
  let extractorPromise: Promise<any> | null = null;
  let configuredBase = '';
  globalThis.addEventListener('message', async (event: MessageEvent<EmbedRequest>) => {
    if (event.data?.type !== 'EMBED') return;
    try {
      const { env, pipeline } = await import('@huggingface/transformers');
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = event.data.modelBaseUrl;
      env.backends.onnx.wasm!.wasmPaths = event.data.runtimeBaseUrl;
      if (!extractorPromise || configuredBase !== event.data.modelBaseUrl) {
        configuredBase = event.data.modelBaseUrl;
        extractorPromise = pipeline('feature-extraction', 'bge-small-zh-v1.5', {
          dtype: 'q8', local_files_only: true,
        });
      }
      const extractor = await extractorPromise;
      const tensor = await extractor(event.data.texts, { pooling: 'mean', normalize: true });
      globalThis.postMessage({ id: event.data.id, ok: true, embeddings: tensor.tolist() });
    } catch (error) {
      globalThis.postMessage({
        id: event.data.id,
        ok: false,
        error: error instanceof Error ? error.message : 'LOCAL_MODEL_FAILED',
        fallback: 'basic_rules',
      });
    }
  });
});
