import { useEffect, useState } from 'react';
import { request } from '../api/client.js';
import type { AppSettings } from '../api/types.js';
import { Alert } from '../ui/Alert.js';
import { Spinner } from '../ui/Spinner.js';
import { Button } from '../ui/Button.js';
import { Checkbox } from '../ui/Checkbox.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { Tag } from '../ui/Tag.js';
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
        <h2 className="mb-4 text-sm font-semibold text-fg">{t('settings.registration.title')}</h2>
        <div className="flex flex-col gap-4">
          <Checkbox
            checked={settings.registrationEnabled}
            onChange={async (checked) => {
              try {
                setSettings(
                  await request<AppSettings>('/settings', {
                    method: 'PATCH',
                    body: { registrationEnabled: checked },
                  }),
                );
                toast.success(t('common.saved'));
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          >
            {t('settings.registration.label')}
          </Checkbox>

          <Alert
            tone="warning"
            message={t('settings.knownTradeoffs')}
            description={t('settings.registration.caveat')}
          />

          <RecaptchaKeys settings={settings} onSaved={setSettings} />
        </div>
      </div>

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

/**
 * reCAPTCHA v2 的两把密钥。去 Google 后台申请，站点密钥是公开的，私钥不是。
 *
 * 私钥填过之后不回显 —— 服务端从不回传它，这里只显示「已配置」。要换就重填。
 */
function RecaptchaKeys({
  settings,
  onSaved,
}: {
  settings: AppSettings;
  onSaved: (next: AppSettings) => void;
}) {
  const t = useAdminT();
  const toast = useToast();
  const [siteKey, setSiteKey] = useState(settings.recaptchaSiteKey);
  const [secretKey, setSecretKey] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      onSaved(
        await request<AppSettings>('/settings', {
          method: 'PATCH',
          body: {
            recaptchaSiteKey: siteKey.trim(),
            // 留空表示不动已有的私钥，避免一次改站点密钥把私钥清掉
            ...(secretKey.trim() ? { recaptchaSecretKey: secretKey.trim() } : {}),
          },
        }),
      );
      setSecretKey('');
      toast.success(t('common.saved'));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-fg">{t('settings.recaptcha.title')}</h3>
        {settings.recaptchaConfigured ? (
          <Tag tone="neutral">{t('settings.recaptcha.configured')}</Tag>
        ) : (
          <Tag tone="danger">{t('settings.recaptcha.missing')}</Tag>
        )}
      </div>
      <p className="text-[12px] text-muted">{t('settings.recaptcha.hint')}</p>

      {settings.recaptchaUsesTestKey ? (
        <Alert tone="danger" message={t('settings.recaptcha.testKey')} />
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">{t('settings.recaptcha.siteKey')}</label>
        <Input value={siteKey} onChange={(e) => setSiteKey(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-fg">
          {t('settings.recaptcha.secretKey')}
        </label>
        <PasswordInput
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          placeholder={
            settings.recaptchaConfigured ? t('settings.recaptcha.keepSecret') : undefined
          }
        />
      </div>
      <div>
        <Button variant="primary" loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>
    </div>
  );
}
