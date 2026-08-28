import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { request, UnauthorizedError } from './api/client.js';
import type { Session } from './api/types.js';
import { AppShell } from './AppShell.js';
import { BreadcrumbProvider } from './nav/breadcrumb.js';
import { AdminsPage } from './pages/AdminsPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { EditorPage } from './pages/EditorPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ProfilesPage } from './pages/ProfilesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { landingPath, SessionProvider } from './session.js';
import { Spinner } from './ui/Spinner.js';
import { ToastProvider } from './ui/Toast.js';
import { TooltipProvider } from './ui/Tooltip.js';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    request<Session>('/auth/me')
      .then(setSession)
      .catch((err) => {
        if (!(err instanceof UnauthorizedError)) throw err;
      })
      .finally(() => setChecking(false));
  }, []);

  let content;
  if (checking) {
    content = <Spinner fullscreen />;
  } else if (!session) {
    content = <LoginPage onSignedIn={setSession} />;
  } else {
    const landing = landingPath(session);
    content = (
      <SessionProvider value={session}>
        {/* basename 与服务端挂载点一致（ADR-0003），后台整体在 /_admin 下 */}
        <BrowserRouter basename="/_admin">
          <BreadcrumbProvider>
            <Routes>
              <Route element={<AppShell onSignedOut={() => setSession(null)} />}>
                <Route index element={<Navigate to={landing} replace />} />
                <Route path="users" element={<UsersPage />} />
                <Route path="users/:userId/profiles" element={<ProfilesPage />} />
                <Route path="profiles/:profileId" element={<EditorPage />} />
                <Route path="admins" element={<AdminsPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="*" element={<Navigate to={landing} replace />} />
              </Route>
            </Routes>
          </BreadcrumbProvider>
        </BrowserRouter>
      </SessionProvider>
    );
  }

  return (
    <ToastProvider>
      <TooltipProvider>{content}</TooltipProvider>
    </ToastProvider>
  );
}
