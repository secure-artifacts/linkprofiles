import { App as AntApp, Button, ConfigProvider, Layout, Menu, Space, Spin, Typography } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useState } from 'react';
import { request, UnauthorizedError } from './api/client.js';
import { ChangePasswordModal } from './components/ChangePasswordModal.js';
import type { Session } from './api/types.js';
import { AdminsPage } from './pages/AdminsPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { EditorPage } from './pages/EditorPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { UsersPage } from './pages/UsersPage.js';

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

  if (checking) {
    return (
      <ConfigProvider locale={zhCN}>
        <Spin fullscreen />
      </ConfigProvider>
    );
  }

  if (!session) {
    return (
      <ConfigProvider locale={zhCN}>
        <AntApp>
          <LoginPage
            onSignedIn={(me) => {
              setSession(me);
              setView(me.role === 'user' ? { name: 'editor', userId: me.id } : { name: 'users' });
            }}
          />
        </AntApp>
      </ConfigProvider>
    );
  }

  const isOperator = session.role !== 'user';

  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <Layout style={{ minHeight: '100dvh' }}>
          <Layout.Header style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Typography.Text style={{ color: '#fff', fontWeight: 600, whiteSpace: 'nowrap' }}>
              Link Profile
            </Typography.Text>

            <Menu
              theme="dark"
              mode="horizontal"
              selectedKeys={[view.name]}
              style={{ flex: 1, minWidth: 0 }}
              onClick={({ key }) => setView(navTarget(key, session))}
              items={
                isOperator
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
                    ]
              }
            />

            <Space>
              <Button size="small" onClick={() => setChangingPassword(true)}>
                修改密码
              </Button>
              <Button
                size="small"
                onClick={async () => {
                  await request('/auth/logout', { method: 'POST' });
                  setSession(null);
                }}
              >
                登出（{session.account}）
              </Button>
            </Space>
          </Layout.Header>

          <Layout.Content style={{ padding: 24 }}>
            {renderView(view, session, setView)}
          </Layout.Content>

          <ChangePasswordModal
            open={changingPassword}
            onClose={() => setChangingPassword(false)}
            onSignedOut={() => {
              setChangingPassword(false);
              setSession(null);
            }}
          />
        </Layout>
      </AntApp>
    </ConfigProvider>
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
