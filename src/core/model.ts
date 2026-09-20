import { browser } from 'wxt/browser';

export interface LocalModelManifest {
  model: string;
  revision: string;
  license: string;
  files: Array<{ path: string; sha256: string; bytes: number }>;
}

export async function readLocalModelManifest(): Promise<LocalModelManifest | null> {
  try {
    const extensionOrigin = new URL(browser.runtime.getURL('/dashboard.html')).origin;
    const response = await fetch(`${extensionOrigin}/models/bge-small-zh-v1.5/model-manifest.json`, { cache: 'no-store' });
    if (!response.ok) return null;
    const value = await response.json() as LocalModelManifest;
    if (!value.model || !value.revision || !Array.isArray(value.files)) return null;
    return value;
  } catch {
    return null;
  }
}
