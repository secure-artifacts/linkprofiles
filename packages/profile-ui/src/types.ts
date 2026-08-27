import type { Layout, Theme } from '@link-profile/shared';

export type { Layout, Theme };

/** 一张图或一段视频在页面上的引用。尺寸用于占位，避免加载时抖动。 */
export interface MediaSource {
  src: string;
  /** AVIF 为主、WebP 兜底时的候选源，按优先级排列。 */
  sources?: { src: string; type: string }[];
  width?: number;
  height?: number;
}

/**
 * 渲染个人页所需要的全部数据。
 *
 * 这是 server 直出与后台预览共用的输入：前者由数据库查出，
 * 后者由编辑中的草稿经 postMessage 灌入（见 ADR-0004）。
 */
export interface ProfileView {
  displayName: string;
  bio: string;
  layout: Layout;
  theme: Theme;
  /** 头像位。Hero / Banner / Cutout 用它当头图。缺失时以主题渐变填充。 */
  avatar: MediaSource | null;
}
