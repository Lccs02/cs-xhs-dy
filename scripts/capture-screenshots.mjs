import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const extensionPath = resolve('.output/chrome-mv3-basic');
const output = resolve('docs/screenshots');
const profile = await mkdtemp(join(tmpdir(), 'shoucang-shots-'));
await mkdir(output, { recursive: true });
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium', headless: true, viewport: { width: 1440, height: 900 },
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});
try {
  let serviceWorker = context.serviceWorkers()[0];
  serviceWorker ??= await context.waitForEvent('serviceworker');
  const extensionId = new URL(serviceWorker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/welcome`);
  await page.getByRole('button', { name: '载入合成演示数据' }).click();
  await page.getByText('广州东山口散步路线：老街、书店与咖啡').waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: resolve(output, 'dashboard-demo.png'), fullPage: true });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/entities`);
  await page.getByText('东山口', { exact: true }).first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: resolve(output, 'objects-demo.png'), fullPage: true });
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
