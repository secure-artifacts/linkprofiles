/**
 * WCAG 相对亮度与对比度。
 *
 * 用来验证三十种「布局 × 主题」组合下文字都还看得清，不是运行时代码 ——
 * 但放在源码里而不是测试里，是因为后台的背景图遮罩也要用它算出
 * 「这张图配这套主题，遮罩至少要多深」。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb {
  const value = hex.replace('#', '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((c) => c + c)
          .join('')
      : value;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function channelLuminance(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: Rgb | string): number {
  const { r, g, b } = typeof color === 'string' ? parseHex(color) : color;
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
}

/** 两色的对比度，1:1 到 21:1。 */
export function contrastRatio(a: Rgb | string, b: Rgb | string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/** 在纯色底上叠一层黑色遮罩之后的实际颜色。 */
export function withOverlay(base: Rgb | string, overlay: number): Rgb {
  const { r, g, b } = typeof base === 'string' ? parseHex(base) : base;
  const keep = 1 - overlay;
  return { r: Math.round(r * keep), g: Math.round(g * keep), b: Math.round(b * keep) };
}

/** WCAG AA：正文 4.5:1，大号文字（≥18.66px 粗体或 ≥24px）3:1。 */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
