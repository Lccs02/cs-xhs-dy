import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

let context: BrowserContext;
let profile: string;
let extensionId: string;

test.beforeAll(async () => {
  const extensionPath = resolve('.output/chrome-mv3-basic');
  profile = await mkdtemp(join(tmpdir(), 'shoucang-e2e-'));
  const executablePath = process.env.E2E_EXECUTABLE;
  context = await chromium.launchPersistentContext(profile, {
    ...(executablePath ? { executablePath } : { channel: 'chromium' as const }),
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  let serviceWorker = context.serviceWorkers()[0];
  serviceWorker ??= await context.waitForEvent('serviceworker');
  extensionId = new URL(serviceWorker.url()).host;
});

test.afterAll(async () => {
  await context.close();
  await rm(profile, { recursive: true, force: true });
});

test('生产扩展可打开工作台并加载隔离的合成演示库', async () => {
  const remoteRequests: string[] = [];
  context.on('request', (request) => {
    if (/^https?:/i.test(request.url())) remoteRequests.push(request.url());
  });
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/welcome`);
  await expect(page.getByRole('heading', { name: /把散落的平台收藏/ })).toBeVisible();
  await page.getByRole('button', { name: '载入合成演示数据' }).click();
  await expect(page.getByText('合成演示库', { exact: true })).toBeVisible();
  await expect(page.getByText('广州东山口散步路线：老街、书店与咖啡')).toBeVisible();
  await expect(page.getByText('8 条')).toBeVisible();
  expect(remoteRequests).toEqual([]);
});

test('对象工作台并列显示两个平台且保留来源操作', async () => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/entities`);
  await expect(page.getByText('东山口', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('小红书').last()).toBeVisible();
  await expect(page.getByLabel('抖音').last()).toBeVisible();
  await expect(page.getByRole('button', { name: /查看来源/ }).first()).toBeVisible();
});
