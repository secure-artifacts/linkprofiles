import { useEffect, useState } from 'react';
import { request } from '../api/client.js';
import type { AppSettings } from '../api/types.js';
import { Alert } from '../ui/Alert.js';
import { Spinner } from '../ui/Spinner.js';
import { Checkbox } from '../ui/Checkbox.js';
import { useToast } from '../ui/Toast.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { useAdminT } from '../i18n/runtime.js';

/** 全站设置。只有超级管理员进得来。 */
export function SettingsPage() {
  const t = useAdminT();
  useBreadcrumb([{ label: t('settings.title') }]);
  const toast = useToast();
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    request<AppSettings>('/settings')
      .then(setSettings)
      .catch((err: Error) => toast.error(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!settings) return <Spinner />;

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <h1 className="font-display text-xl font-semibold text-fg">{t('settings.title')}</h1>

      <div className="rounded-[var(--radius-panel)] border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg">{t('settings.passthrough')}</h2>
        <div className="flex flex-col gap-4">
          <Checkbox
            checked={settings.sourcePassthroughDefault}
            onChange={async (checked) => {
              try {
                setSettings(
                  await request<AppSettings>('/settings', {
                    method: 'PATCH',
                    body: { sourcePassthroughDefault: checked },
                  }),
                );
                toast.success(t('common.saved'));
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {t('settings.passthrough.default')}
          </Checkbox>

          <p className="text-[13px] text-muted">
            {t('settings.passthrough.explainLead')}{' '}
            <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[12px]">
              ?src=
            </code>{' '}
            {t('settings.passthrough.explainTail')}
          </p>

          <Alert
            tone="warning"
            message={t('settings.knownTradeoffs')}
            description={settings.sourcePassthroughCaveat}
          />
        </div>
      </div>
    </div>
  );
}
