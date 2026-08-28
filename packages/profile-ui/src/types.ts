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

/** 头像位放的短视频。封面先出，视频加载完才播。 */
export interface VideoSource {
  src: string;
  /** 首帧封面。浏览器端 canvas 抽出来的，或用户手动上传的。 */
  poster: string | null;
}

/** 背景图。上传后覆盖主题的背景渐变，按钮色与文字色仍生效。 */
export interface BackgroundImage {
  src: string;
  /** 遮罩暗度 0–1，默认四成，保证文字对比度。 */
  overlay: number;
}

/** 自己填地址的链接，还是从内置清单启用的社媒入口。 */
export type ButtonKind = 'link' | 'social';

/**
 * 页面主体里的一个可点击条目。
 *
 * 社媒入口不再是头部那排小图标，与普通链接渲染成同一种卡片，
 * 只差地址从哪来。见 ADR-0011。
 */
export interface ButtonView {
  id: string;
  /** 只影响埋点口径与后台表单，渲染分支不看它。 */
  kind: ButtonKind;
  title: string;
  /** 留空则不渲染副标题那一行。实心卡片与描边行都可以有。 */
  subtitle: string;
  url: string;
  /** 联系类渠道。只决定这次点击算不算线索，**不决定长相**。 */
  isLead: boolean;
  /** 有品牌图形时在左侧渲染一枚，取值为内置清单里的平台 id */
  platform?: string | null;
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
  /** 简介是否逐字打出。关掉或访客设了减少动效时，全文静态显示。 */
  bioTypewriter: boolean;
  layout: Layout;
  theme: Theme;
  /** 条目一律实心卡片，还是一律描边行。整页统一，不逐条配，见 ADR-0013。 */
  solidBackground: boolean;
  /** 条目左侧品牌图形背后垫不垫那枚白色衬底。与 solidBackground 相互独立。 */
  iconPlate: boolean;
  /** 头像位。Hero / Banner / Cutout 用它当头图。缺失时以主题渐变填充。 */
  avatar: MediaSource | null;
  /** 头像位放视频时用它，与 avatar 互斥。 */
  video: VideoSource | null;
  background: BackgroundImage | null;
  buttons: readonly ButtonView[];
}
