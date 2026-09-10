import { DEFAULT_LOCALE, normalizeLocale, type Locale } from '@link-profile/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { request, UnauthorizedError } from './api/client.js';
import type { Session } from './api/types.js';
import { AppShell } from './AppShell.js';
import { BreadcrumbProvider } from './nav/breadcrumb.js';
import { AdminsPage } from './pages/AdminsPage.js';
import { RegisterPage } from './pages/RegisterPage.js';
import { RegionsPage } from './pages/RegionsPage.js';
import { AnalyticsPage } from './pages/AnalyticsPage.js';
import { ChangelogPage } from './pages/ChangelogPage.js';
import { EditorPage } from './pages/EditorPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { ProfilesPage } from './pages/ProfilesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { UsersPage } from './pages/UsersPage.js';
import { applyLocale, preferredLocale, rememberLocale } from './i18n/runtime.js';
import { landingPath, SessionProvider } from './session.js';
import { canOpen, type Section } from './nav/sections.js';
import { Spinner } from './ui/Spinner.js';
import { ToastProvider } from './ui/Toast.js';
import { TooltipProvider } from './ui/Tooltip.js';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [authView, setAuthView] = useState<'login' | 'register'>(
    location.pathname.endsWith('/register') ? 'register' : 'login',
  );
  // 登录前用这台设备上次选的语言；登录后一律以账号上的界面语言为准。
  const [locale, setLocale] = useState<Locale>(preferredLocale);
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

  // 换语言的地方有三处：登录页、注册页、顶栏。都记到设备上，下次开局就对。
  const pickLocale = (next: Locale) => {
    rememberLocale(next);
    setLocale(next);
  };

  // 等译文到位再渲染，否则非英语用户会先看到一帧英文。
  useEffect(() => {
    setLocaleReady(false);
    void applyLocale(locale).then(() => setLocaleReady(true));
  }, [locale]);

  let content;

  if (checking || !localeReady) {
    content = <Spinner fullscreen />;
  } else if (!session) {
    // 未登录时没有 router，注册页靠路径切换。地址栏跟着变，链接才发得出去。
    const goto = (view: 'login' | 'register') => {
      history.pushState(null, '', view === 'register' ? '/_admin/register' : '/_admin/login');
      setAuthView(view);
    };
    content =
      authView === 'register' ? (
        <RegisterPage
          locale={locale}
          onLocaleChange={pickLocale}
          onBackToLogin={() => goto('login')}
        />
      ) : (
        <LoginPage
          locale={locale}
          onLocaleChange={pickLocale}
          onSignedIn={setSession}
          onRegister={() => goto('register')}
        />
      );
  } else {
    const landing = landingPath(session);
    const allow = (section: Section, element: ReactNode) =>
      canOpen(session.role, section) ? element : <Navigate to={landing} replace />;
    content = (
      <SessionProvider value={{ ...session, uiLanguage: locale }}>
        {/* basename 与服务端挂载点一致（ADR-0003），后台整体在 /_admin 下 */}
        <BrowserRouter basename="/_admin">
          <BreadcrumbProvider>
            <Routes>
              <Route
                element={
                  <AppShell onSignedOut={() => setSession(null)} onLanguageChanged={pickLocale} />
                }
              >
                <Route index element={<Navigate to={landing} replace />} />
                <Route path="users" element={allow('users', <UsersPage />)} />
                <Route path="users/:userId/profiles" element={<ProfilesPage />} />
                <Route path="profiles/:profileId" element={<EditorPage />} />
                <Route path="regions" element={allow('regions', <RegionsPage />)} />
                <Route path="admins" element={allow('admins', <AdminsPage />)} />
                <Route path="settings" element={allow('settings', <SettingsPage />)} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="changelog" element={<ChangelogPage />} />
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
