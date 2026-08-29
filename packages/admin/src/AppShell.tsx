import { ChevronDown, ChevronRight, KeyRound, Link2, LogOut, UserRoundPen } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { request } from './api/client.js';
import { ChangePasswordModal } from './components/ChangePasswordModal.js';
import { ChangeAccountModal } from './components/ChangeAccountModal.js';
import { useBreadcrumbTrail } from './nav/breadcrumb.js';
import { ROLE_LABELS, useSession } from './session.js';
import { DropdownMenu } from './ui/DropdownMenu.js';

export function AppShell({ onSignedOut }: { onSignedOut: () => void }) {
  const session = useSession();
  const [changingPassword, setChangingPassword] = useState(false);
  const [changingAccount, setChangingAccount] = useState(false);
  const trail = useBreadcrumbTrail();
  const { pathname } = useLocation();

  // 编辑器的地址是 /profiles/:id，不在任何一个入口的路径底下，光靠 NavLink
  // 自己匹配会一个都不高亮。它是从页面列表点进去的，就跟着列表那一项亮。
  const inEditor = pathname.startsWith('/profiles/');
  const profilesPath = `/users/${session.id}/profiles`;

  const items =
    session.role === 'user'
      ? [
          { to: profilesPath, label: '我的页面', alsoActive: inEditor },
          { to: '/analytics', label: '数据分析', alsoActive: false },
        ]
      : [
          { to: '/users', label: '用户', alsoActive: inEditor },
          ...(session.role === 'superadmin'
            ? [
                { to: '/admins', label: '管理员', alsoActive: false },
                { to: '/settings', label: '全站设置', alsoActive: false },
              ]
            : []),
          { to: '/analytics', label: '数据分析', alsoActive: false },
        ];

  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <div className="sticky top-0 z-50 bg-surface shadow-[0_1px_0_var(--border)]">
        <header className="flex h-14 items-center gap-6 border-b border-border bg-surface px-6">
          <span className="flex items-center gap-2 whitespace-nowrap font-display text-[15px] font-semibold text-fg">
            <span className="flex size-6 items-center justify-center rounded-[6px] border border-border text-accent">
              <Link2 className="size-3.5" />
            </span>
            Link Profile
          </span>

          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative whitespace-nowrap px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    isActive || item.alsoActive ? 'text-fg' : 'text-muted hover:text-fg'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive || item.alsoActive ? (
                      <span className="absolute inset-x-3 -bottom-[1px] h-0.5 rounded-full bg-accent" />
                    ) : null}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-3">
            <DropdownMenu
              trigger={
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1 text-[13px]
                  transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2
                  focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="rounded-full border border-accent-soft bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent">
                    {ROLE_LABELS[session.role]}
                  </span>
                  <span className="font-medium text-fg">{session.account}</span>
                  <ChevronDown className="size-3.5 text-muted" />
                </button>
              }
              items={[
                {
                  key: 'account',
                  label: '修改登录用户名',
                  icon: <UserRoundPen className="size-3.5" />,
                  onSelect: () => setChangingAccount(true),
                },
                {
                  key: 'password',
                  label: '修改密码',
                  icon: <KeyRound className="size-3.5" />,
                  onSelect: () => setChangingPassword(true),
                },
                {
                  key: 'logout',
                  label: '登出',
                  icon: <LogOut className="size-3.5" />,
                  danger: true,
                  onSelect: () => {
                    void request('/auth/logout', { method: 'POST' }).then(onSignedOut);
                  },
                },
              ]}
            />
          </div>
        </header>

        {trail.length > 0 ? (
          <nav
            aria-label="面包屑"
            className="flex items-center gap-1 border-b border-border bg-surface px-6 py-2 text-[13px]"
          >
            {trail.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3.5 text-border" /> : null}
                {crumb.to ? (
                  <Link to={crumb.to} className="text-muted transition-colors hover:text-fg">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-fg">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
      </div>

      <main className="flex-1 p-6">
        <Outlet />
      </main>

      <ChangePasswordModal
        open={changingPassword}
        onClose={() => setChangingPassword(false)}
        onSignedOut={() => {
          setChangingPassword(false);
          onSignedOut();
        }}
      />
      <ChangeAccountModal
        open={changingAccount}
        currentAccount={session.account}
        onClose={() => setChangingAccount(false)}
        onSignedOut={() => {
          setChangingAccount(false);
          onSignedOut();
        }}
      />
    </div>
  );
}
