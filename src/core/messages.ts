import type { FinishEvidence, Platform, ScannedItem } from './types';

export type ExtensionMessage =
  | { type: 'START_TAB_SYNC'; tabId: number; url: string; platform: Platform }
  | { type: 'CONTROL_RUN'; runId: string; action: 'pause' | 'resume' | 'cancel' }
  | { type: 'OPEN_DASHBOARD'; hash?: string }
  | { type: 'SCANNER_BEGIN'; runId: string; sessionToken: string; platform: Platform; scopeKey: string }
  | { type: 'SCANNER_CONTROL'; runId: string; sessionToken: string; action: 'pause' | 'resume' | 'cancel' }
  | { type: 'SCANNER_IDENTITY'; runId: string; sessionToken: string; stableAccountId: string; displayName: string | null }
  | { type: 'SCANNER_BATCH'; runId: string; sessionToken: string; items: ScannedItem[]; checkpoint: { scrollTop: number; batches: number } }
  | { type: 'SCANNER_FINISH'; runId: string; sessionToken: string; evidence: FinishEvidence }
  | { type: 'SCANNER_FAIL'; runId: string; sessionToken: string; code: string };

export interface MessageResponse {
  ok: boolean;
  error?: string;
  runId?: string;
}

export function isMessage(value: unknown): value is ExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === 'string' && [
    'START_TAB_SYNC', 'CONTROL_RUN', 'OPEN_DASHBOARD', 'SCANNER_BEGIN', 'SCANNER_CONTROL',
    'SCANNER_IDENTITY', 'SCANNER_BATCH', 'SCANNER_FINISH', 'SCANNER_FAIL',
  ].includes(type);
}
