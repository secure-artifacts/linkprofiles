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

/** 页面主体里的一个可点击条目。 */
export interface ButtonView {
  id: string;
  title: string;
  /** 留空则不渲染副标题那一行 */
  subtitle: string;
  url: string;
  /** 联系类渠道。决定两级视觉，也决定这次点击算不算线索。 */
  isLead: boolean;
  /** 有品牌图形时在左侧渲染一枚，取值为内置清单里的平台 id */
  platform?: string | null;
}

/** 头部的图标式入口。 */
export interface SocialIconView {
  id: string;
  platform: string;
  /** 系统按平台拼好的目标地址 */
  url: string;
  label: string;
  isLead: boolean;
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
  socialIcons: readonly SocialIconView[];
  buttons: readonly ButtonView[];
}
