import type { ProfileView } from '@link-profile/profile-ui';

/**
 * 后台 ↔ 预览 iframe 之间的消息协议。
 *
 * 预览渲染的是与公开页**同一批组件**（`@link-profile/profile-ui`），
 * 不存在第二套实现 —— 这是 ADR-0004 的核心，多种布局与主题只写一遍。
 *
 * iframe 同时解决两件事：真实的 375px 移动端视口，以及 tailwind preflight
 * 与 Ant Design reset 的样式隔离（ADR-0002）。两套 reset 在同一个文档里
 * 一定会互相渗透，隔开是唯一干净的做法。
 */

export const PREVIEW_CHANNEL = 'link-profile-preview';

/** 预览页加载完毕，可以接收草稿了。 */
export interface PreviewReadyMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'ready';
}

/** 把编辑中的草稿灌进去。未保存即可见，不需要先落库。 */
export interface PreviewRenderMessage {
  channel: typeof PREVIEW_CHANNEL;
  type: 'render';
  profile: ProfileView;
}

export type PreviewMessage = PreviewReadyMessage | PreviewRenderMessage;

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { channel?: unknown }).channel === PREVIEW_CHANNEL
  );
}
