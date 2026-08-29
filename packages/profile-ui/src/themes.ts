import type { Theme } from './types.js';

/**
 * 主题令牌的唯一来源。最初六套来自设计稿，后续常用配色与玻璃主题也在这里维护。
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
  /** 标准卡片或液态玻璃卡片。效果与颜色令牌分离，避免靠主题 id 猜行为。 */
  effect: 'standard' | 'liquid-glass';
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
    effect: 'standard',
    gradient: ['#FBD9C6', '#EBCBDD', '#D9C6EF'],
    bgend: '#D9C6EF',
    surface: '#FFFFFF',
    onSurface: '#2A2233',
    text: '#2A2233',
    muted: '#55495F',
    radius: '20px',
  },
  harbor: {
    label: 'Harbor·港',
    effect: 'standard',
    gradient: ['#0B3A46', '#0E2C43', '#12233F'],
    bgend: '#12233F',
    surface: '#F2E4CE',
    onSurface: '#0B3A46',
    text: '#EAF2F2',
    muted: '#B8CBD0',
    radius: '14px',
  },
  moss: {
    label: 'Moss·苔',
    effect: 'standard',
    gradient: ['#17301F', '#25381C', '#33401C'],
    bgend: '#33401C',
    surface: '#F0EAD6',
    onSurface: '#17301F',
    text: '#E6EDD9',
    muted: '#BEC9B2',
    radius: '8px',
  },
  ember: {
    label: 'Ember·炭',
    effect: 'standard',
    gradient: ['#3B1B33', '#65291F', '#8A3B22'],
    bgend: '#8A3B22',
    surface: '#FFF3E6',
    onSurface: '#3B1B33',
    text: '#FCE9DC',
    muted: '#F0C6B7',
    radius: '999px',
  },
  slate: {
    label: 'Slate·石',
    effect: 'standard',
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
    effect: 'standard',
    gradient: ['#0A0E27', '#070A1B', '#05060F'],
    bgend: '#05060F',
    surface: '#A9B4FF',
    onSurface: '#0A0E27',
    text: '#EDEFFF',
    muted: '#AEB5E3',
    radius: '16px',
  },
  ocean: {
    label: 'Ocean·海',
    effect: 'standard',
    gradient: ['#D9F2FF', '#B8DEFF', '#9CC8FF'],
    bgend: '#9CC8FF',
    surface: '#0D5C8C',
    onSurface: '#FFFFFF',
    text: '#12324A',
    muted: '#2C506A',
    radius: '18px',
  },
  rose: {
    label: 'Rose·玫瑰',
    effect: 'standard',
    gradient: ['#FFE2E8', '#F8C9D6', '#EAB9D1'],
    bgend: '#EAB9D1',
    surface: '#7E294A',
    onSurface: '#FFFFFF',
    text: '#3A1E2D',
    muted: '#684253',
    radius: '24px',
  },
  lavender: {
    label: 'Lavender·薰衣草',
    effect: 'standard',
    gradient: ['#EEE8FF', '#DDD3FF', '#C9BCF4'],
    bgend: '#C9BCF4',
    surface: '#4B3A7A',
    onSurface: '#FFFFFF',
    text: '#261E42',
    muted: '#51466B',
    radius: '22px',
  },
  sunset: {
    label: 'Sunset·落日',
    effect: 'standard',
    gradient: ['#FFE5C2', '#FFC9B0', '#F2A6B3'],
    bgend: '#F2A6B3',
    surface: '#7A2F29',
    onSurface: '#FFFFFF',
    text: '#402018',
    muted: '#63362C',
    radius: '28px',
  },
  mono: {
    label: 'Mono·黑白',
    effect: 'standard',
    gradient: ['#181818', '#111111', '#080808'],
    bgend: '#080808',
    surface: '#FFFFFF',
    onSurface: '#111111',
    text: '#FFFFFF',
    muted: '#C7C7C7',
    radius: '0px',
  },
  glass: {
    label: 'Glass·星雾',
    effect: 'liquid-glass',
    gradient: ['#18233F', '#263A68', '#5A3F78'],
    bgend: '#5A3F78',
    surface: '#33466F',
    onSurface: '#FFFFFF',
    text: '#FFFFFF',
    muted: '#D9DDF0',
    radius: '26px',
  },
  'glass-ocean': {
    label: 'Glass·海蓝',
    effect: 'liquid-glass',
    gradient: ['#061B30', '#08384C', '#0A5261'],
    bgend: '#0A5261',
    surface: '#0A4053',
    onSurface: '#FFFFFF',
    text: '#FFFFFF',
    muted: '#C8E6EA',
    radius: '28px',
  },
  'glass-rose': {
    label: 'Glass·玫红',
    effect: 'liquid-glass',
    gradient: ['#321426', '#53203E', '#6A2B50'],
    bgend: '#6A2B50',
    surface: '#5D2346',
    onSurface: '#FFFFFF',
    text: '#FFFFFF',
    muted: '#F1CDDF',
    radius: '30px',
  },
  'glass-aurora': {
    label: 'Glass·极光',
    effect: 'liquid-glass',
    gradient: ['#102233', '#203B50', '#315161'],
    bgend: '#315161',
    surface: '#29495A',
    onSurface: '#FFFFFF',
    text: '#FFFFFF',
    muted: '#D3E8E7',
    radius: '24px',
  },
};

/** 新账号的默认主题。 */
export const DEFAULT_THEME: Theme = 'dawn';

/** 背景图上那层遮罩的默认暗度。 */
export const DEFAULT_BACKGROUND_OVERLAY = 0.4;
