import { Link2 } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { request } from '../api/client.js';
import type { Session } from '../api/types.js';
import { Button } from '../ui/Button.js';
import { Input, PasswordInput } from '../ui/Input.js';
import { useToast } from '../ui/Toast.js';

export function LoginPage({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const toast = useToast();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ account?: string; password?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!account) nextErrors.account = '请输入账号';
    if (!password) nextErrors.password = '请输入密码';
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
            所有链接，
            <br />
            一处掌控。
          </h1>
          <p className="mt-4 max-w-[30ch] text-[13px] text-white/70">
            管理个人页、账号与数据，让每一次访问都有清晰去向。
          </p>
        </div>

        <p className="relative text-[12px] text-white/40">Link Profile 管理工作台</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-bg p-6">
        <form onSubmit={(e) => void submit(e)} className="w-full max-w-[380px]">
          <h2 className="font-display text-xl font-semibold text-fg">Link Profile 后台</h2>
          <p className="mt-1 text-[13px] text-muted">使用管理员账号登录工作台</p>

          <div className="mt-6 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-fg">账号</label>
            <Input
              autoComplete="username"
              autoFocus
              value={account}
              onChange={(e) => setAccount(e.target.value)}
            />
            {errors.account ? <p className="text-[12px] text-danger">{errors.account}</p> : null}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-fg">密码</label>
            <PasswordInput
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {errors.password ? <p className="text-[12px] text-danger">{errors.password}</p> : null}
          </div>

          <Button type="submit" variant="primary" loading={submitting} className="mt-6 w-full">
            登录
          </Button>

          <p className="mt-6 border-t border-border pt-4 text-[12px] text-muted">
            遇到登录问题，请联系全站管理员。
          </p>
        </form>
      </div>
    </div>
  );
}
