import type { ProfileView } from '@link-profile/profile-ui';
import { useEffect, useRef, useState } from 'react';
import { Segmented } from '../ui/Segmented.js';
import { isPreviewMessage, PREVIEW_CHANNEL } from './protocol.js';

/**
 * 两档视口。
 *
 * 手机是设计基准（375 是必须不出问题的最小宽度）；桌面这一档要越过公开页
 * 那个 768px 断点，否则用户看不到卡片居中的样子。
 *
 * 切换只改 iframe 的 CSS 尺寸就够了 —— iframe 是独立的浏览上下文，里面的
 * 媒体查询按它自己的框求值，预览文档与协议一行都不用动。
 */
const VIEWPORTS = {
  mobile: { width: 375, height: 812, radius: 32, bezel: true, scale: 1 },
  // 桌面视口比编辑区宽得多，缩着放。注意 transform 不改变布局尺寸，
  // 外面必须再包一层按缩放后尺寸占位的盒子，否则会把整个版面撑破。
  desktop: { width: 1024, height: 720, radius: 10, bezel: false, scale: 0.42 },
} as const;

type ViewportKey = keyof typeof VIEWPORTS;

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
  const [viewport, setViewport] = useState<ViewportKey>('mobile');

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

  const box = VIEWPORTS[viewport];

  return (
    <div className="flex flex-col items-center gap-3">
      <Segmented
        value={viewport}
        onChange={(value) => setViewport(value as ViewportKey)}
        options={[
          { value: 'mobile', label: '手机' },
          { value: 'desktop', label: '桌面' },
        ]}
      />

      {/* 外层只负责占位：宽高是缩放之后的实际视觉尺寸 */}
      <div
        style={{
          width: box.width * box.scale,
          height: box.height * box.scale,
          flex: 'none',
          borderRadius: box.radius,
          overflow: 'hidden',
          boxShadow: box.bezel
            ? '0 24px 60px -24px rgba(16, 20, 28, 0.45)'
            : '0 12px 32px -16px rgba(16, 20, 28, 0.35)',
          background: box.bezel ? '#000' : 'transparent',
          // 手机那档留深色机身；桌面套一圈手机壳读起来很怪，改用细边框
          border: box.bezel ? 'none' : '1px solid var(--border)',
        }}
      >
        {/* 内层是真实视口尺寸，缩放只影响观感，iframe 里的媒体查询照 1024 算 */}
        <div
          style={{
            width: box.width,
            height: box.height,
            transform: `scale(${box.scale})`,
            transformOrigin: 'top left',
          }}
        >
          <iframe
            ref={frameRef}
            // Vite 的多入口产物；开发时同样由 dev server 提供
            src={`${import.meta.env.BASE_URL}preview.html`}
            title={viewport === 'mobile' ? '移动端预览' : '桌面端预览'}
            style={{ width: '100%', height: '100%', border: 0, display: 'block' }}
          />
        </div>
      </div>

      {/* 说明跟着档位走 —— 之前写死在编辑页里，切到桌面还说「375px」 */}
      <p className="text-[12px] text-muted">{box.width}px 实时预览 · 未保存的改动也看得到</p>
    </div>
  );
}
