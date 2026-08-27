import { ProfilePage, profileCss, type ProfileView } from '@link-profile/profile-ui';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isPreviewMessage, PREVIEW_CHANNEL, type PreviewRenderMessage } from './protocol.js';

/**
 * 预览 iframe 里跑的东西。
 *
 * 它 import 的 `ProfilePage` 与 `profileCss` 与服务端直出用的是同一份 ——
 * 布局与主题改了，两边同时变，不可能漂移。
 *
 * 这个文档里只有 profile-ui 的样式，没有 Ant Design 的 reset：iframe 就是
 * 那道隔离墙。
 */
function Preview() {
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // 只收同源父窗口发来的、带我们频道标记的消息
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type === 'render') {
        setProfile((event.data as PreviewRenderMessage).profile);
      }
    };

    window.addEventListener('message', onMessage);
    window.parent.postMessage({ channel: PREVIEW_CHANNEL, type: 'ready' }, window.location.origin);

    return () => window.removeEventListener('message', onMessage);
  }, []);

  if (!profile) return null;
  return <ProfilePage profile={profile} />;
}

const style = document.createElement('style');
style.textContent = profileCss;
document.head.appendChild(style);

createRoot(document.getElementById('preview-root')!).render(
  <StrictMode>
    <Preview />
  </StrictMode>,
);
