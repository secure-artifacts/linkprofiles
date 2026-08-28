import { Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { request, UnauthorizedError } from './api/client.js';
import { ChangePasswordModal } from './components/ChangePasswordModal.js';
import type { Session } from './api/types.js';
import { AdminsPage } from './pages/AdminsPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { EditorPage } from './pages/EditorPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { Button } from './ui/Button.js';
import { Spinner } from './ui/Spinner.js';
import { ToastProvider } from './ui/Toast.js';
import { TooltipProvider } from './ui/Tooltip.js';

type View =
  | { name: 'users' }
  | { name: 'admins' }
  | { name: 'settings' }
  | { name: 'editor'; userId: string }
  | { name: 'analytics'; userId?: string };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>({ name: 'users' });
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    request<Session>('/auth/me')
      .then((me) => {
        setSession(me);
        // 用户角色只有自己一个页面，直接落在编辑器上
        setView(me.role === 'user' ? { name: 'editor', userId: me.id } : { name: 'users' });
      })
      .catch((err) => {
        if (!(err instanceof UnauthorizedError)) throw err;
      })
      .finally(() => setChecking(false));
  }, []);

  let content: ReactNode;

  if (checking) {
    content = <Spinner fullscreen />;
  } else if (!session) {
    content = (
      <LoginPage
        onSignedIn={(me) => {
          setSession(me);
          setView(me.role === 'user' ? { name: 'editor', userId: me.id } : { name: 'users' });
        }}
      />
    );
  } else {
    const isOperator = session.role !== 'user';
    const items = isOperator
      ? [
          { key: 'users', label: '用户' },
          ...(session.role === 'superadmin'
            ? [
                { key: 'admins', label: '管理员' },
                { key: 'settings', label: '全站设置' },
              ]
            : []),
          { key: 'analytics', label: '数据分析' },
        ]
      : [
          { key: 'editor', label: '我的页面' },
          { key: 'analytics', label: '数据分析' },
        ];

    content = (
      <div className="flex min-h-dvh flex-col bg-bg">
        <header className="flex h-14 items-center gap-6 border-b border-border bg-surface px-6">
          <span className="flex items-center gap-2 whitespace-nowrap font-display text-[15px] font-semibold text-fg">
            <span className="flex size-6 items-center justify-center rounded-[6px] border border-border text-accent">
              <Link2 className="size-3.5" />
            </span>
            Link Profile
          </span>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(navTarget(item.key, session))}
                className={`relative whitespace-nowrap px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  view.name === item.key ? 'text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                {item.label}
                {view.name === item.key ? (
                  <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-accent" />
                ) : null}
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setChangingPassword(true)}>
              修改密码
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await request('/auth/logout', { method: 'POST' });
                setSession(null);
              }}
            >
              登出（{session.account}）
            </Button>
          </div>
        </header>

        <main className="flex-1 p-6">{renderView(view, session, setView)}</main>

        <ChangePasswordModal
          open={changingPassword}
          onClose={() => setChangingPassword(false)}
          onSignedOut={() => {
            setChangingPassword(false);
            setSession(null);
          }}
        />
      </div>
    );
  }

  return (
    <ToastProvider>
      <TooltipProvider>{content}</TooltipProvider>
    </ToastProvider>
  );
}

function navTarget(key: string, session: Session): View {
  switch (key) {
    case 'admins':
      return { name: 'admins' };
    case 'settings':
      return { name: 'settings' };
    case 'analytics':
      return { name: 'analytics', ...(session.role === 'user' ? { userId: session.id } : {}) };
    case 'editor':
      return { name: 'editor', userId: session.id };
    default:
      return { name: 'users' };
  }
}

function renderView(view: View, session: Session, setView: (view: View) => void) {
  switch (view.name) {
    case 'admins':
      return <AdminsPage />;
    case 'settings':
      return <SettingsPage />;
    case 'editor':
      return <EditorPage userId={view.userId} editingSelf={view.userId === session.id} />;
    case 'analytics':
      return <AnalyticsPage {...(view.userId ? { userId: view.userId } : {})} />;
    case 'users':
      return (
        <UsersPage
          session={session}
          onEdit={(userId) => setView({ name: 'editor', userId })}
          onAnalytics={(userId) => setView({ name: 'analytics', userId })}
        />
      );
  }
}
