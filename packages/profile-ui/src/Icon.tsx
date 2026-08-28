import {
  AVATAR_PLACEHOLDER_ICON,
  BRAND_ICONS,
  CHEVRON_ICON,
  MUTED_ICON,
  SOUND_ICON,
} from './generated/icons.js';

/**
 * 品牌图形与箭头。
 *
 * 图形数据是构建期从 Simple Icons 抽出来的静态字符串，因此这里用
 * `dangerouslySetInnerHTML` 注入是安全的 —— 它不接受任何用户输入。
 */
export function BrandIcon({ platform }: { platform: string }) {
  const icon = BRAND_ICONS[platform];
  if (!icon) return null;

  // viewBox 逐个来源不同（Simple Icons 是 0 0 24 24，ant-design 是 64 64 896 896）
  return (
    <svg
      viewBox={icon.viewBox}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}

export function ChevronIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: CHEVRON_ICON }}
    />
  );
}

/**
 * 没传头像时的占位剪影。
 *
 * `preserveAspectRatio` 保持默认（等比居中），配合 CSS 里给它的百分比尺寸，
 * 在圆形、方形、抠像异形几种头像框里都是居中的一枚徽章，而不是被拉变形。
 */
export function AvatarPlaceholder() {
  return (
    <svg
      viewBox="0 0 96 96"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: AVATAR_PLACEHOLDER_ICON }}
    />
  );
}

/**
 * 静音开关的两态。两枚都会 SSR 出来，显示哪一枚由 CSS 按 aria-pressed 选 ——
 * 公开页没有 React runtime，图标不能靠 JS 换。
 */
export function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MUTED_ICON }} />
  );
}

export function SoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: SOUND_ICON }} />
  );
}

export function hasBrandIcon(platform: string | null | undefined): boolean {
  return platform != null && platform in BRAND_ICONS;
}
