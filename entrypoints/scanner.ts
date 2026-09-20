import { browser } from 'wxt/browser';
import { adapters, detectAccountIdentity, detectPageBoundary, scanVisibleItems } from '../src/adapters/shared';
import type { ExtensionMessage, MessageResponse } from '../src/core/messages';
import type { FinishEvidence } from '../src/core/types';

declare global {
  interface Window {
    __SHOUCANG_SCANNER_INSTALLED__?: boolean;
  }
}

export default defineUnlistedScript(() => {
  if (window.__SHOUCANG_SCANNER_INSTALLED__) return;
  window.__SHOUCANG_SCANNER_INSTALLED__ = true;
  let control: 'running' | 'paused' | 'cancelled' = 'running';
  let activeRun: { runId: string; sessionToken: string } | null = null;

  const delay = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

  browser.runtime.onMessage.addListener((raw: unknown): Promise<MessageResponse> | undefined => {
    const message = raw as ExtensionMessage;
    if (message.type === 'SCANNER_CONTROL') {
      if (!activeRun || activeRun.runId !== message.runId || activeRun.sessionToken !== message.sessionToken) {
        return Promise.resolve({ ok: false, error: 'SESSION_MISMATCH' });
      }
      control = message.action === 'cancel' ? 'cancelled' : message.action === 'pause' ? 'paused' : 'running';
      return Promise.resolve({ ok: true });
    }
    if (message.type !== 'SCANNER_BEGIN') return undefined;
    activeRun = { runId: message.runId, sessionToken: message.sessionToken };
    control = 'running';
    void runScan(message);
    return Promise.resolve({ ok: true });
  });

  async function runScan(message: Extract<ExtensionMessage, { type: 'SCANNER_BEGIN' }>): Promise<void> {
    const spec = adapters[message.platform];
    const identity = detectAccountIdentity(document, location.href, spec);
    if (!identity.stableAccountId) {
      await browser.runtime.sendMessage<ExtensionMessage, MessageResponse>({
        type: 'SCANNER_FAIL', runId: message.runId, sessionToken: message.sessionToken, code: 'IDENTITY_UNVERIFIED',
      });
      return;
    }
    const identityResponse = await browser.runtime.sendMessage<ExtensionMessage, MessageResponse>({
      type: 'SCANNER_IDENTITY',
      runId: message.runId,
      sessionToken: message.sessionToken,
      stableAccountId: identity.stableAccountId,
      displayName: identity.displayName,
    });
    if (!identityResponse.ok) return;

    const seen = new Set<string>();
    let batches = 0;
    let stagnantRounds = 0;
    let boundary: ReturnType<typeof detectPageBoundary> = null;
    for (let round = 0; round < 120; round += 1) {
      while (control === 'paused') await delay(250);
      if (control === 'cancelled') break;
      const visible = scanVisibleItems(document, spec);
      const fresh = visible.filter((item) => !seen.has(item.stableItemId));
      fresh.forEach((item) => seen.add(item.stableItemId));
      if (fresh.length > 0) {
        stagnantRounds = 0;
        batches += 1;
        const response = await browser.runtime.sendMessage<ExtensionMessage, MessageResponse>({
          type: 'SCANNER_BATCH',
          runId: message.runId,
          sessionToken: message.sessionToken,
          items: fresh,
          checkpoint: { scrollTop: Math.round(window.scrollY), batches },
        });
        if (!response.ok) throw new Error(response.error ?? 'BATCH_REJECTED');
      } else {
        stagnantRounds += 1;
      }
      boundary = detectPageBoundary(document, spec);
      if (boundary) break;
      window.scrollBy({ top: Math.max(640, window.innerHeight * 0.85), behavior: 'smooth' });
      await delay(700);
      if (stagnantRounds >= 10) break;
    }

    const terminationBasis: FinishEvidence['terminationBasis'] = control === 'cancelled'
      ? 'cancelled'
      : boundary === 'empty_state'
        ? 'verified_empty_state'
        : boundary === 'end_marker'
          ? 'verified_end_marker'
          : 'stagnation';
    const adapterVerified = spec.verifiedOnRealPlatform;
    await browser.runtime.sendMessage<ExtensionMessage, MessageResponse>({
      type: 'SCANNER_FINISH',
      runId: message.runId,
      sessionToken: message.sessionToken,
      evidence: {
        coverageStatus: adapterVerified && boundary ? 'complete_for_scope' : 'unknown',
        completeForScope: Boolean(adapterVerified && boundary),
        accountWideCoverageVerified: false,
        identityVerified: true,
        terminationBasis,
        membershipSnapshotVerified: spec.membershipSnapshotVerified,
        errors: adapterVerified ? [] : ['PLATFORM_ADAPTER_NOT_REAL_ACCOUNT_VERIFIED'],
      },
    });
  }
});
