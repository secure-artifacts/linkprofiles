import { ProfilePage, profileCss, type ProfileView } from '@link-profile/profile-ui';
import { TYPEWRITER_STEP_MS } from '@link-profile/shared';
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

  /*
   * 打字机在预览里也要能看见 —— 用户勾这个开关就是想看效果。
   *
   * 这段与 `server/src/render/client-script.ts` 里那段是刻意重复的两份：
   * 那边是零构建步骤的内联字符串，结构上 import 不了模块，共享只能共享一半。
   * 预览本来也没有复刻视频延迟播放与点击埋点，两条运行时路径不 DRY 是既有前提。
   */
  const bio = profile?.bio;
  const typewriter = profile?.bioTypewriter ?? false;
  useEffect(() => {
    if (!typewriter || !bio) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const el = document.querySelector<HTMLParagraphElement>('.pp-bio[data-tw]');
    if (!el) return;

    const full = el.textContent ?? '';
    el.style.minHeight = `${el.offsetHeight}px`;
    el.textContent = '';

    let i = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      el.textContent = full.slice(0, ++i);
      if (i < full.length) timer = setTimeout(tick, TYPEWRITER_STEP_MS);
    };
    tick();
    return () => clearTimeout(timer);
    // 只盯这两个：改主题、改按钮不该把动画重播一遍
  }, [bio, typewriter]);

  /*
   * 静音按钮在预览里也要能按。不接的话预览里会出现一个点了没反应的死按钮 ——
   * 用户分不清是「预览没做」还是「功能坏了」。
   *
   * 与 client-script.ts 里那段同样是刻意重复的两份，理由同打字机。
   */
  const hasVideo = profile?.video != null;
  useEffect(() => {
    if (!hasVideo) return;

    const button = document.querySelector<HTMLButtonElement>('.pp-mute');
    const video = document.querySelector<HTMLVideoElement>('.pp video');
    if (!button || !video) return;

    const onClick = () => {
      const wasMuted = video.muted;
      video.muted = !wasMuted;
      button.setAttribute('aria-pressed', wasMuted ? 'true' : 'false');
      button.setAttribute('aria-label', wasMuted ? '关闭声音' : '开启声音');
      if (wasMuted) void video.play().catch(() => {});
    };

    button.addEventListener('click', onClick);
    return () => button.removeEventListener('click', onClick);
  }, [hasVideo]);

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
