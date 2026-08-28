import { useEffect, useState } from 'react';
import { request } from '../api/client.js';
import type { AppSettings } from '../api/types.js';
import { Alert } from '../ui/Alert.js';
import { Spinner } from '../ui/Spinner.js';
import { Switch } from '../ui/Switch.js';
import { useToast } from '../ui/Toast.js';

/** 全站设置。只有超级管理员进得来。 */
export function SettingsPage() {
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
      <h1 className="font-display text-xl font-semibold text-fg">全站设置</h1>

      <div className="rounded-[var(--radius-panel)] border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-fg">来源透传</h2>
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-3">
            <Switch
              checked={settings.sourcePassthroughDefault}
              onChange={async (checked) => {
                try {
                  setSettings(
                    await request<AppSettings>('/settings', {
                      method: 'PATCH',
                      body: { sourcePassthroughDefault: checked },
                    }),
                  );
                  toast.success('已保存');
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
            <span className="text-[13px] text-fg">默认对所有按钮开启来源透传</span>
          </label>

          <p className="text-[13px] text-muted">
            按钮可以逐条覆盖这个默认值。开启后，访客带{' '}
            <code className="rounded bg-surface-hover px-1 py-0.5 font-mono text-[12px]">
              ?src=
            </code>{' '}
            访问个人页时，跳转目标的地址上会带上同一个来源。
          </p>

          <Alert tone="warning" message="已知取舍" description={settings.sourcePassthroughCaveat} />
        </div>
      </div>
    </div>
  );
}
