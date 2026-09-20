import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const roots = process.argv.slice(2);
if (roots.length === 0) throw new Error('请提供至少一个生产扩展目录');
const privacyMarker = 'PRIVATE_MARKER_9f4f75f4_SYNTHETIC_DO_NOT_SHIP';
const forbiddenPermissions = new Set(['<all_urls>', 'cookies', 'debugger', 'history', 'webRequest', 'unlimitedStorage']);

async function filesUnder(root) {
  const result = [];
  for (const entry of await readdir(root)) {
    const path = resolve(root, entry);
    if ((await stat(path)).isDirectory()) result.push(...await filesUnder(path));
    else result.push(path);
  }
  return result;
}

for (const relative of roots) {
  const root = resolve(relative);
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  const permissions = [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])];
  const forbidden = permissions.filter((permission) => forbiddenPermissions.has(permission));
  if (forbidden.length) throw new Error(`${relative}: 包含禁止权限 ${forbidden.join(', ')}`);
  const csp = manifest.content_security_policy?.extension_pages ?? '';
  if (!csp.includes("connect-src 'self'")) throw new Error(`${relative}: CSP 未把连接限制为 self`);
  if (!csp.includes("script-src 'self'")) throw new Error(`${relative}: CSP 未把脚本限制为 self`);

  const files = await filesUnder(root);
  for (const file of files.filter((path) => /\.(?:js|html|css|json|txt|md)$/i.test(path))) {
    const text = await readFile(file, 'utf8');
    if (text.includes(privacyMarker)) throw new Error(`${relative}: 合成隐私标记泄漏到 ${file}`);
    if (/storage\s*\.\s*sync/.test(text)) throw new Error(`${relative}: 检测到 storage.sync 写入能力`);
    if (/<script[^>]+src=["']https?:/i.test(text)) throw new Error(`${relative}: HTML 引用了远程脚本`);
  }
  console.info(`[audit] ${relative}: permissions=${permissions.join(',') || 'none'}, CSP self-only, no storage.sync, no marker, no remote HTML scripts`);
}
