import { Link2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { request } from '../api/client.js';
import type { Session } from '../api/types.js';
import { Button } from '../ui/Button.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';
import { useAdminT } from '../i18n/runtime.js';

export function LoginPage({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const t = useAdminT();
  const toast = useToast();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ account?: string; password?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!account) nextErrors.account = t('login.error.accountRequired');
    if (!password) nextErrors.password = t('login.error.passwordRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      onSignedIn(
        await request<Session>('/auth/login', { method: 'POST', body: { account, password } }),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh">
      <div className="relative hidden w-[420px] shrink-0 flex-col justify-between overflow-hidden bg-[oklch(0.22_0.03_155)] p-10 text-white md:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <div className="relative flex items-center gap-2 font-display text-lg font-semibold">
          <span className="flex size-7 items-center justify-center rounded-[6px] border border-white/40">
            <Link2 className="size-4" />
          </span>
          Link Profile
        </div>

        <div className="relative">
          <span className="mb-6 block h-0.5 w-10 rounded-full bg-accent" />
          <h1 className="font-display text-[34px] font-bold leading-tight">
            {t('login.hero.titleLine1')}
            <br />
            {t('login.hero.titleLine2')}
          </h1>
          <p className="mt-4 max-w-[30ch] text-[13px] text-white/70">{t('login.hero.subtitle')}</p>
        </div>

        <p className="relative text-[12px] text-white/40">{t('login.hero.footer')}</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-bg p-6">
        <form onSubmit={(e) => void submit(e)} className="w-full max-w-[380px]">
          <h2 className="font-display text-xl font-semibold text-fg">{t('login.title')}</h2>
          <p className="mt-1 text-[13px] text-muted">{t('login.subtitle')}</p>

          <div className="mt-6 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-fg">{t('login.field.account')}</label>
            <Input
              autoComplete="username"
              autoFocus
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
            {errors.account ? <p className="text-[12px] text-danger">{errors.account}</p> : null}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-fg">{t('login.field.password')}</label>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password ? <p className="text-[12px] text-danger">{errors.password}</p> : null}
          </div>

          <Button type="submit" variant="primary" loading={submitting} className="mt-6 w-full">
            {t('login.submit')}
          </Button>

          <p className="mt-6 border-t border-border pt-4 text-[12px] text-muted">
            {t('login.help')}
          </p>
        </form>
      </div>
    </div>
  );
}
