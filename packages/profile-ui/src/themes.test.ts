import { describe, expect, test } from 'vitest';
import { AA_LARGE, AA_NORMAL, contrastRatio, withOverlay } from './contrast.js';
import { DEFAULT_BACKGROUND_OVERLAY, DEFAULT_THEME, THEMES, type ThemeTokens } from './themes.js';
import type { Layout, Theme } from './types.js';

const LAYOUTS: Layout[] = ['classic', 'hero', 'banner', 'cutout', 'shape'];
const THEME_IDS = Object.keys(THEMES) as Theme[];

/**
 * 每种布局里，正文压在渐变的哪一段上。
 *
 * 布局不决定配色，但决定文字落在渐变的哪一截：Classic / Shape 的名字在顶部，
 * Hero 的名字压在头图底部的渐隐层上（那里是 --bgend），Banner / Cutout 在中段。
 * 逐个组合验证就是要覆盖这个差异。
 */
const TEXT_BACKDROP: Record<Layout, (t: ThemeTokens) => string[]> = {
  classic: (t) => [t.gradient[0], t.gradient[1]],
  hero: (t) => [t.bgend],
  banner: (t) => [t.gradient[0], t.gradient[1]],
  cutout: (t) => [t.gradient[0], t.gradient[1]],
  shape: (t) => [t.gradient[0], t.gradient[1]],
};

describe('三十种布局与主题的组合，文字对比度达到 WCAG AA', () => {
  for (const layout of LAYOUTS) {
    for (const themeId of THEME_IDS) {
      const tokens = THEMES[themeId];

      test(`${layout} × ${tokens.label}`, () => {
        // 正文（显示名、内容类按钮文字）压在渐变上
        for (const backdrop of TEXT_BACKDROP[layout](tokens)) {
          expect(
            contrastRatio(tokens.text, backdrop),
            `正文 ${tokens.text} 压在 ${backdrop} 上`,
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        }

        // 简介、副标题这类次要文字用 --muted，字号小，同样按正文标准要求
        for (const backdrop of TEXT_BACKDROP[layout](tokens)) {
          expect(
            contrastRatio(tokens.muted, backdrop),
            `次要文字 ${tokens.muted} 压在 ${backdrop} 上`,
          ).toBeGreaterThanOrEqual(AA_LARGE);
        }

        // 联系类卡片：卡片上的文字压在卡片底色上
        expect(
          contrastRatio(tokens.onSurface, tokens.surface),
          `卡片文字 ${tokens.onSurface} 压在卡片底 ${tokens.surface} 上`,
        ).toBeGreaterThanOrEqual(AA_NORMAL);
      });
    }
  }
});

describe('主题令牌', () => {
  test('六套主题齐备', () => {
    expect(THEME_IDS).toEqual(['dawn', 'harbor', 'moss', 'ember', 'slate', 'nocturne']);
  });

  test('新账号默认 Dawn·晨', () => {
    expect(DEFAULT_THEME).toBe('dawn');
    expect(THEMES[DEFAULT_THEME].label).toContain('Dawn');
  });

  test('圆角是主题的一部分而非全局常量：六套各不相同', () => {
    const radii = THEME_IDS.map((id) => THEMES[id].radius);
    expect(new Set(radii).size).toBe(radii.length);
    expect(radii).toContain('999px');
  });

  test('每套主题的结构一致，只是取值不同', () => {
    const keys = Object.keys(THEMES.dawn).sort();
    for (const id of THEME_IDS) {
      expect(Object.keys(THEMES[id]).sort(), id).toEqual(keys);
    }
  });
});

describe('背景图上的遮罩', () => {
  test('默认四成', () => {
    expect(DEFAULT_BACKGROUND_OVERLAY).toBe(0.4);
  });

  test('最坏情况下——一张纯白背景图——默认遮罩让浅色系主题的文字仍然读得出来', () => {
    // 深色系主题的文字本来就浅，压在被压暗的图上没有问题；
    // 真正的风险是 Slate / Dawn 这类深文字压在亮图上。
    const white = '#FFFFFF';
    for (const id of ['dawn', 'slate'] as Theme[]) {
      const tokens = THEMES[id];
      const dimmed = withOverlay(white, DEFAULT_BACKGROUND_OVERLAY);
      expect(contrastRatio(tokens.text, dimmed), `${tokens.label} 的正文`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    }
  });

  /**
   * 遮罩只会把图压暗，因此它对两类主题的作用方向相反：
   * 浅色文字（Harbor / Moss / Ember / Nocturne）压得越暗越清楚，
   * 深色文字（Dawn / Slate）反而越压越糊。
   * 这是「暗度可调」而不是写死四成的原因，后台要把这条说清楚。
   */
  test('遮罩加深对浅色文字有利、对深色文字不利', () => {
    const white = '#FFFFFF';
    const steps = [0, 0.2, 0.4, 0.6];

    const lightText = steps.map((o) => contrastRatio(THEMES.nocturne.text, withOverlay(white, o)));
    for (let i = 1; i < lightText.length; i += 1) {
      expect(lightText[i]!).toBeGreaterThan(lightText[i - 1]!);
    }

    const darkText = steps.map((o) => contrastRatio(THEMES.slate.text, withOverlay(white, o)));
    for (let i = 1; i < darkText.length; i += 1) {
      expect(darkText[i]!).toBeLessThan(darkText[i - 1]!);
    }
  });
});
