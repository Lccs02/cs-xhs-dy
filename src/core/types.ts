export type Platform = 'xiaohongshu' | 'douyin';
export type IdentityStatus = 'unverified' | 'verified' | 'changed';
export type TextStatus =
  | 'metadata_only'
  | 'text_partial'
  | 'text_available'
  | 'content_unavailable'
  | 'extraction_failed';
export type RunStatus =
  | 'starting'
  | 'scanning'
  | 'paused'
  | 'cancelled'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'protected'
  | 'interrupted_needs_restart';
export type CoverageStatus = 'unknown' | 'partial' | 'complete_for_scope';

export interface PlatformAccount {
  id: string;
  platform: Platform;
  stableAccountId: string;
  displayName: string | null;
  identityStatus: IdentityStatus;
  firstVerifiedAt: string;
  lastVerifiedAt: string;
}

export interface SourceItem {
  id: string;
  platform: Platform;
  stableItemId: string;
  canonicalUrl: string;
  navigationUrl: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  collectedAt: string | null;
  importedAt: string;
  lastSeenAt: string;
  text: string | null;
  textStatus: TextStatus;
  textScope: string | null;
  contentHash: string | null;
  metadataHash: string;
  contentVersion: number;
  adapterVersion: string;
  active: boolean;
  activeState: 'active' | 'inactive';
  searchTokens: string[];
}

export interface BookmarkMembership {
  id: string;
  accountId: string;
  scopeKey: string;
  collectionId: string | null;
  itemId: string;
  active: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  removedAt: string | null;
  removalReason: 'missing_from_verified_snapshot' | null;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  keywords: string[];
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ItemCategory {
  id: string;
  itemId: string;
  categoryId: string;
  source: 'auto' | 'user';
  score: number | null;
  evidence: string[];
  locked: boolean;
  updatedAt: string;
}

export interface Entity {
  id: string;
  name: string;
  type: 'place' | 'store' | 'product' | 'book' | 'course' | 'tool' | 'other';
  aliases: string[];
  brand: string | null;
  model: string | null;
  city: string | null;
  store: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ItemEntity {
  id: string;
  itemId: string;
  entityId: string;
  status: 'suggested' | 'auto_confirmed' | 'user_confirmed' | 'rejected';
  score: number | null;
  evidence: string[];
  locked: boolean;
  updatedAt: string;
}

export interface Excerpt {
  id: string;
  itemId: string;
  entityId: string | null;
  sourceField: 'title' | 'text';
  text: string;
  start: number;
  end: number;
  contentVersion: number;
  algorithmVersion: string;
  createdAt: string;
}

export interface UserOverride {
  id: string;
  kind: 'category' | 'entity_link' | 'entity_reject' | 'entity_split' | 'alias';
  targetId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SyncRun {
  id: string;
  sessionToken: string;
  platform: Platform;
  accountId: string | null;
  scopeKey: string;
  adapterVersion: string;
  tabId: number;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  observedCount: number;
  uniqueCount: number;
  textCount: number;
  organizedCount: number;
  errors: string[];
  terminationBasis: string | null;
  coverageStatus: CoverageStatus;
  completeForScope: boolean;
  accountWideCoverageVerified: boolean;
  identityVerified: boolean;
  checkpoint: { scrollTop: number; batches: number };
  protectionReason: string | null;
}

export interface Observation {
  id?: number;
  runId: string;
  itemId: string;
  scopeKey: string;
  observedAt: string;
}

export interface FeatureCache {
  id: string;
  itemId: string;
  kind: 'search' | 'embedding';
  inputHash: string;
  algorithmVersion: string;
  modelVersion: string | null;
  value: number[] | string[];
  updatedAt: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
}

export interface ScannedItem {
  stableItemId: string;
  canonicalUrl: string;
  navigationUrl: string;
  title: string;
  author: string | null;
  publishedAt: string | null;
  collectedAt: string | null;
  text: string | null;
  textStatus: TextStatus;
  textScope: string | null;
  collectionId: string | null;
}

export interface FinishEvidence {
  coverageStatus: CoverageStatus;
  completeForScope: boolean;
  accountWideCoverageVerified: boolean;
  identityVerified: boolean;
  terminationBasis: 'verified_end_marker' | 'verified_page_count' | 'verified_empty_state' | 'stagnation' | 'cancelled' | 'error';
  membershipSnapshotVerified: boolean;
  errors: string[];
}

export const platformLabel: Record<Platform, string> = {
  xiaohongshu: '小红书',
  douyin: '抖音',
};
