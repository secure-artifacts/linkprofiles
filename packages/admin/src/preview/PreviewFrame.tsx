import type { ProfileView } from '@link-profile/profile-ui';
import { useEffect, useRef, useState } from 'react';
import { isPreviewMessage, PREVIEW_CHANNEL } from './protocol.js';

/** 设计基准宽度：必须不出问题的最小宽度。 */
const VIEWPORT_WIDTH = 375;
const VIEWPORT_HEIGHT = 812;

interface PreviewFrameProps {
  profile: ProfileView;
}

/**
 * 编辑页右侧那台手机。
 *
 * 用 iframe 而不是直接把组件渲染在后台文档里，是为了同时拿到两样东西：
 * 真实的 375px 移动端视口（媒体查询、`100dvh`、`max-width` 都按它算），
 * 以及 tailwind preflight 与 Ant Design reset 的样式隔离。
 *
 * 不用「iframe 直接加载真实页面 URL」那条路：那样每次编辑都要 debounce
 * 重新请求，改一个字闪一下，做不到真正实时。见 ADR-0004。
 */
export function PreviewFrame({ profile }: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.type === 'ready') setReady(true);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // 草稿一变就推过去。没有 debounce —— 改一个字那边就跟着动。
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage(
      { channel: PREVIEW_CHANNEL, type: 'render', profile },
      window.location.origin,
    );
  }, [ready, profile]);

  return (
    <div
      style={{
        width: VIEWPORT_WIDTH,
        height: VIEWPORT_HEIGHT,
        borderRadius: 32,
        overflow: 'hidden',
        boxShadow: '0 24px 60px -24px rgba(16, 20, 28, 0.45)',
        background: '#000',
        flex: 'none',
      }}
    >
      <iframe
        ref={frameRef}
        // Vite 的多入口产物；开发时同样由 dev server 提供
        src={`${import.meta.env.BASE_URL}preview.html`}
        title="移动端预览"
        style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
      />
    </div>
  );
}
