import type { Theme } from './types.js';

/**
 * 六套主题的令牌取值，来自设计稿 `docs/design/public-page.html`。
 *
 * 这是**唯一的来源**：`scripts/build-css.mjs` 从这张表生成
 * `src/generated/themes.css`，对比度测试也读这张表。改一处即处处生效，
 * 不会出现 CSS 与测试各说各话。
 *
 * 主题在实现上只是这组变量的取值，结构完全不变。
 * **圆角是主题的一部分而非全局常量。**
 */
export interface ThemeTokens {
  label: string;
  /** 背景渐变的三个色标，168deg 从上到下 */
  gradient: [string, string, string];
  /** 渐变末端色。Hero 布局的蒙版要渐隐到它 */
  bgend: string;
  /** 联系类卡片的底色 */
  surface: string;
  /** 卡片上的文字色 */
  onSurface: string;
  /** 正文色 */
  text: string;
  /** 次要文字（简介、副标题）色 */
  muted: string;
  /** 圆角 */
  radius: string;
}

export const THEMES: Record<Theme, ThemeTokens> = {
  dawn: {
    label: 'Dawn·晨',
    gradient: ['#FBD9C6', '#EBCBDD', '#D9C6EF'],
    bgend: '#D9C6EF',
    surface: '#FFFFFF',
    onSurface: '#2A2233',
    text: '#2A2233',
    muted: '#6E6478',
    radius: '20px',
  },
  harbor: {
    label: 'Harbor·港',
    gradient: ['#0B3A46', '#0E2C43', '#12233F'],
    bgend: '#12233F',
    surface: '#F2E4CE',
    onSurface: '#0B3A46',
    text: '#EAF2F2',
    muted: '#9DB6BC',
    radius: '14px',
  },
  moss: {
    label: 'Moss·苔',
    gradient: ['#17301F', '#25381C', '#33401C'],
    bgend: '#33401C',
    surface: '#F0EAD6',
    onSurface: '#17301F',
    text: '#E6EDD9',
    muted: '#9CAE8C',
    radius: '8px',
  },
  ember: {
    label: 'Ember·炭',
    gradient: ['#3B1B33', '#65291F', '#8A3B22'],
    bgend: '#8A3B22',
    surface: '#FFF3E6',
    onSurface: '#3B1B33',
    text: '#FCE9DC',
    muted: '#C79A88',
    radius: '999px',
  },
  slate: {
    label: 'Slate·石',
    gradient: ['#FAFAFA', '#F1F3F5', '#E6E9EC'],
    bgend: '#E6E9EC',
    surface: '#101418',
    onSurface: '#FFFFFF',
    text: '#101418',
    muted: '#5C666F',
    radius: '6px',
  },
  nocturne: {
    label: 'Nocturne·夜',
    gradient: ['#0A0E27', '#070A1B', '#05060F'],
    bgend: '#05060F',
    surface: '#A9B4FF',
    onSurface: '#0A0E27',
    text: '#EDEFFF',
    muted: '#7A83B8',
    radius: '16px',
  },
};

/** 新账号的默认主题。 */
export const DEFAULT_THEME: Theme = 'dawn';

/** 背景图上那层遮罩的默认暗度。 */
export const DEFAULT_BACKGROUND_OVERLAY = 0.4;
