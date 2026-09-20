import type { WorkbenchDatabase } from './db';

export const BACKUP_FORMAT = 'shoucang-workbench-backup';
export const BACKUP_VERSION = 1;
const MAX_RECORDS = 500_000;

const tableNames = [
  'accounts', 'items', 'memberships', 'categories', 'itemCategories', 'entities', 'itemEntities',
  'excerpts', 'overrides', 'syncRuns', 'observations', 'featureCache', 'settings',
] as const;

export interface BackupEnvelope {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  notice: string;
  tables: Record<(typeof tableNames)[number], unknown[]>;
}

export async function exportBackup(database: WorkbenchDatabase): Promise<BackupEnvelope> {
  const entries = await Promise.all(tableNames.map(async (name) => [name, await database.table(name).toArray()] as const));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    notice: '此文件包含私人收藏与本地整理结果，请像保护浏览器资料一样妥善保管。',
    tables: Object.fromEntries(entries) as BackupEnvelope['tables'],
  };
}

export function validateBackup(value: unknown): asserts value is BackupEnvelope {
  if (!value || typeof value !== 'object') throw new Error('备份不是有效对象');
  const candidate = value as Partial<BackupEnvelope>;
  if (candidate.format !== BACKUP_FORMAT || candidate.version !== BACKUP_VERSION) throw new Error('备份格式或版本不受支持');
  if (!candidate.tables || typeof candidate.tables !== 'object') throw new Error('备份缺少数据表');
  let records = 0;
  for (const name of tableNames) {
    const rows = candidate.tables[name];
    if (!Array.isArray(rows)) throw new Error(`备份表 ${name} 无效`);
    records += rows.length;
  }
  if (records > MAX_RECORDS) throw new Error('备份记录数超过安全上限');
}

export async function restoreBackup(database: WorkbenchDatabase, value: unknown): Promise<void> {
  validateBackup(value);
  await database.transaction('rw', database.tables, async () => {
    for (const name of tableNames) await database.table(name).clear();
    for (const name of tableNames) {
      if (value.tables[name].length > 0) await database.table(name).bulkPut(value.tables[name]);
    }
  });
}
