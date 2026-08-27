import { BRAND_ICONS, CHEVRON_ICON } from './generated/icons.js';

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

export function hasBrandIcon(platform: string | null | undefined): boolean {
  return platform != null && platform in BRAND_ICONS;
}
