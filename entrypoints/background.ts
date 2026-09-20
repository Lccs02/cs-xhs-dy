import { browser } from 'wxt/browser';
import { detectPlatform } from '../src/adapters/shared';
import { db } from '../src/core/db';
import { isMessage, type ExtensionMessage, type MessageResponse } from '../src/core/messages';
import { applyObservationBatch, bindSyncAccount, finishSyncRun, markInterruptedRuns, startSyncRun } from '../src/core/sync';

export default defineBackground(() => {
  void markInterruptedRuns(db);

  browser.runtime.onInstalled.addListener(({ reason }) => {
    if (reason === 'install') void browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html#/welcome') });
  });

  browser.runtime.onMessage.addListener((raw: unknown, sender): Promise<MessageResponse> | undefined => {
    if (!isMessage(raw)) return undefined;
    return handleMessage(raw, sender);
  });
});

async function verifyRunMessage(
  message: Extract<ExtensionMessage, { sessionToken: string }>,
  sender: Browser.runtime.MessageSender,
) {
  const run = await db.syncRuns.where('sessionToken').equals(message.sessionToken).first();
  if (!run || run.id !== message.runId) throw new Error('SESSION_MISMATCH');
  if (!sender.tab?.id || sender.tab.id !== run.tabId) throw new Error('TAB_MISMATCH');
  if (!sender.url || detectPlatform(sender.url) !== run.platform) throw new Error('PLATFORM_MISMATCH');
  return run;
}

async function handleMessage(message: ExtensionMessage, sender: Browser.runtime.MessageSender): Promise<MessageResponse> {
  try {
    if (message.type === 'OPEN_DASHBOARD') {
      await browser.tabs.create({ url: browser.runtime.getURL(`/dashboard.html${message.hash ?? ''}`) });
      return { ok: true };
    }
    if (message.type === 'START_TAB_SYNC') {
      const tab = await browser.tabs.get(message.tabId);
      if (!tab.url || tab.url !== message.url || detectPlatform(tab.url) !== message.platform) throw new Error('ACTIVE_TAB_CHANGED');
      const run = await startSyncRun(db, { platform: message.platform, tabId: message.tabId });
      await browser.scripting.executeScript({ target: { tabId: message.tabId, frameIds: [0] }, files: ['/scanner.js'] });
      const response = await browser.tabs.sendMessage<ExtensionMessage, MessageResponse>(message.tabId, {
        type: 'SCANNER_BEGIN', runId: run.id, sessionToken: run.sessionToken, platform: run.platform, scopeKey: run.scopeKey,
      });
      if (!response.ok) throw new Error(response.error ?? 'SCANNER_NOT_READY');
      return { ok: true, runId: run.id };
    }
    if (message.type === 'CONTROL_RUN') {
      const run = await db.syncRuns.get(message.runId);
      if (!run) throw new Error('RUN_NOT_FOUND');
      await browser.tabs.sendMessage<ExtensionMessage, MessageResponse>(run.tabId, {
        type: 'SCANNER_CONTROL', runId: run.id, sessionToken: run.sessionToken, action: message.action,
      });
      await db.syncRuns.update(run.id, { status: message.action === 'pause' ? 'paused' : message.action === 'cancel' ? 'cancelled' : 'scanning' });
      return { ok: true };
    }
    if (message.type === 'SCANNER_IDENTITY') {
      const run = await verifyRunMessage(message, sender);
      await bindSyncAccount(db, run.id, message.stableAccountId, message.displayName);
      return { ok: true };
    }
    if (message.type === 'SCANNER_BATCH') {
      const run = await verifyRunMessage(message, sender);
      await applyObservationBatch(db, run.id, message.items, message.checkpoint);
      return { ok: true };
    }
    if (message.type === 'SCANNER_FINISH') {
      const run = await verifyRunMessage(message, sender);
      await finishSyncRun(db, run.id, message.evidence);
      return { ok: true };
    }
    if (message.type === 'SCANNER_FAIL') {
      const run = await verifyRunMessage(message, sender);
      await db.syncRuns.update(run.id, { status: 'failed', finishedAt: new Date().toISOString(), errors: [...run.errors, message.code] });
      return { ok: true };
    }
    return { ok: false, error: 'UNSUPPORTED_MESSAGE' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'UNKNOWN_ERROR' };
  }
}
