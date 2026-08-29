import { expect, test } from 'vitest';
import { AA_LARGE, contrastRatio } from './contrast.js';
import { BRAND_ICONS } from './generated/icons.js';
import { THEMES } from './themes.js';
import type { Theme } from './types.js';

/**
 * 关掉「图标白底」之后，品牌图形直接压在卡片或页面底色上会不会看不见。
 *
 * 品牌图形的颜色是构建期烧死的注册品牌色（`scripts/build-icons.mjs`），
 * 不跟主题走。开着白底时它们永远压在 #fff 上，怎么配都安全；关掉之后
 * 就成了「品牌色 × 主题底色」的自由组合，其中有几组必然不达标。
 *
 * 本项目对「用户主动调出低对比度」一贯不拦（背景遮罩也允许调到任意值），
 * 所以这里**不是一道会让 CI 变红的门禁**，而是把哪几组会出事记录下来：
 * 组合表变了、或者有人给某个平台换了品牌色，这份清单会跟着变，
 * 届时后台那句提示文案也该一起复核。
 */

const BLACKISH = Object.entries(BRAND_ICONS)
  .filter(([, icon]) => contrastRatio(icon.hex, '#FFFFFF') > 15)
  .map(([id]) => id);

test('确实存在几乎纯黑的品牌图形 —— 这是整件事的前提', () => {
  expect(BLACKISH).toContain('x');
  expect(BLACKISH).toContain('threads');
  expect(BLACKISH).toContain('tiktok');
});

test('白底的价值不在于达标，在于让底色可预期', () => {
  // 品牌色是各家自己定的，本来就不都满足 3:1（WhatsApp 的绿压在白上只有约 2:1），
  // 靠的是图形轮廓辨识而非对比度。白底真正的作用是把底色钉死成一个已知的浅色，
  // 让「品牌色 × 底色」不再是自由组合。
  const invisibleOnWhite = Object.entries(BRAND_ICONS)
    .filter(([, icon]) => contrastRatio(icon.hex, '#FFFFFF') < 1.5)
    .map(([id]) => id);

  // Snapchat 的黄（#FFFC00）压在白衬底上只有约 1.1:1，那枚幽灵几乎看不见。
  // 这与「图标白底」这个开关无关，是白底一直开着的时候就存在的问题；
  // 记在这里是为了别把它误当成关白底带来的新问题。
  expect(invisibleOnWhite).toEqual(['snapchat']);
});

test('关掉白底后纯黑图形是直接消失，不是差一点', () => {
  const worst = (hex: string) =>
    Math.min(
      ...Object.values(THEMES).flatMap((t) =>
        [t.surface, ...t.gradient].map((bg) => contrastRatio(hex, bg)),
      ),
    );

  for (const id of BLACKISH) {
    const hex = BRAND_ICONS[id]!.hex;
    expect(contrastRatio(hex, '#FFFFFF'), `${id} 有白底时`).toBeGreaterThan(15);
    // 掉到 1.2:1 以下等于和底色融成一片，肉眼完全看不出图形
    expect(worst(hex), `${id} 没白底、撞上最差主题时`).toBeLessThan(1.2);
  }
});

test('关掉白底后，哪些主题会让纯黑图形看不清（现状记录，不是门禁）', () => {
  const failing: string[] = [];

  for (const [theme, tokens] of Object.entries(THEMES) as [Theme, (typeof THEMES)[Theme]][]) {
    for (const id of BLACKISH) {
      const hex = BRAND_ICONS[id]!.hex;
      // 实心卡片：图形压在卡片底色上
      if (contrastRatio(hex, tokens.surface) < AA_LARGE) failing.push(`${theme}/实心/${id}`);
      // 描边行：没有卡片底色，直接压在页面渐变上，取最暗的那个色标
      const darkest = tokens.gradient.reduce((a, b) =>
        contrastRatio(hex, a) < contrastRatio(hex, b) ? a : b,
      );
      if (contrastRatio(hex, darkest) < AA_LARGE) failing.push(`${theme}/描边/${id}`);
    }
  }

  // 除 Dawn 外的主题至少有一种形态会中招，因此后台仍要保留白底提示。
  const themesHit = new Set(failing.map((f) => f.split('/')[0]));
  expect(themesHit.has('dawn')).toBe(false);
  expect(themesHit.size).toBe(Object.keys(THEMES).length - 1);
  expect(failing).toContain('slate/实心/x');
  expect(failing).toContain('nocturne/描边/x');
});
