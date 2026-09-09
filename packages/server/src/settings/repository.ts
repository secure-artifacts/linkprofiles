import { SETTINGS_ID, settings, type SettingsRow } from '@link-profile/shared/schema';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';

/** 单行表，取不到就用 schema 上的默认值，不强迫部署时先插一行。 */
export async function readSettings(
  db: Db,
): Promise<Pick<SettingsRow, 'sourcePassthroughDefault' | 'registrationEnabled'>> {
  const [row] = await db
    .select({
      sourcePassthroughDefault: settings.sourcePassthroughDefault,
      registrationEnabled: settings.registrationEnabled,
    })
    .from(settings)
    .where(eq(settings.id, SETTINGS_ID))
    .limit(1);

  // 取不到就是默认值：注册默认关着，开放是一次显式的决定。
  return row ?? { sourcePassthroughDefault: false, registrationEnabled: false };
}

export async function writeSettings(
  db: Db,
  patch: { sourcePassthroughDefault?: boolean; registrationEnabled?: boolean },
): Promise<void> {
  await db
    .insert(settings)
    .values({ id: SETTINGS_ID, ...patch })
    .onConflictDoUpdate({
      target: settings.id,
      set: { ...patch, updatedAt: new Date() },
    });
}
