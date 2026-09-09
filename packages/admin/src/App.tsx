import { DEFAULT_LOCALE, normalizeLocale, type Locale } from '@link-profile/i18n';
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
import { applyLocale, browserLocale } from './i18n/runtime.js';
import { landingPath, SessionProvider } from './session.js';
import { Spinner } from './ui/Spinner.js';
import { ToastProvider } from './ui/Toast.js';
import { TooltipProvider } from './ui/Tooltip.js';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  // 登录前只有浏览器语言这一个线索；登录后一律以账号上的界面语言为准。
  const [locale, setLocale] = useState<Locale>(browserLocale);
  const [localeReady, setLocaleReady] = useState(false);

  useEffect(() => {
    request<Session>('/auth/me')
      .then(setSession)
      .catch((err) => {
        if (!(err instanceof UnauthorizedError)) throw err;
      })
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (session) setLocale(normalizeLocale(session.uiLanguage) ?? DEFAULT_LOCALE);
  }, [session]);

  // 等译文到位再渲染，否则非英语用户会先看到一帧英文。
  useEffect(() => {
    setLocaleReady(false);
    void applyLocale(locale).then(() => setLocaleReady(true));
  }, [locale]);

  let content;
  if (checking || !localeReady) {
    content = <Spinner fullscreen />;
  } else if (!session) {
    content = <LoginPage onSignedIn={setSession} />;
  } else {
    const landing = landingPath(session);
    content = (
      <SessionProvider value={{ ...session, uiLanguage: locale }}>
        {/* basename 与服务端挂载点一致（ADR-0003），后台整体在 /_admin 下 */}
        <BrowserRouter basename="/_admin">
          <BreadcrumbProvider>
            <Routes>
              <Route
                element={
                  <AppShell onSignedOut={() => setSession(null)} onLanguageChanged={setLocale} />
                }
              >
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
