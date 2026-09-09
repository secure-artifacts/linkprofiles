import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURRENT_VERSION, RELEASES } from './entries.js';

const repoRoot = new URL('../../../../', import.meta.url);
const read = (name: string) => readFileSync(new URL(name, repoRoot), 'utf8');

/** 取出 CHANGELOG.md 里某一版那一节，到下一个 `## ` 为止。 */
function sectionOf(changelog: string, version: string): string {
  const start = changelog.indexOf(`## v${version} — `);
  if (start === -1) return '';
  const next = changelog.indexOf('\n## ', start + 1);
  return changelog.slice(start, next === -1 ? undefined : next);
}

describe('更新日志', () => {
  it('版本号在页面、CHANGELOG、package.json 与 VERSION 四处一致', () => {
    const pkg = JSON.parse(read('package.json')) as { version: string };
    expect(CURRENT_VERSION).toBe(pkg.version);
    expect(read('VERSION').trim()).toBe(pkg.version);
    expect(sectionOf(read('CHANGELOG.md'), CURRENT_VERSION)).not.toBe('');
  });

  it('每一条正文都能在 CHANGELOG.md 的同一节里找到', () => {
    // 两处内容靠人工同步。只比版本号的话，改了正文却漏改另一处是查不出来的。
    const changelog = read('CHANGELOG.md');
    for (const release of RELEASES) {
      const section = sectionOf(changelog, release.version);
      expect(section, `CHANGELOG.md 里没有 v${release.version} 这一节`).not.toBe('');
      // 页面上正文是纯文本：markdown 的反引号与链接语法比对前先抹平
      const plain = section.replaceAll('`', '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
      expect(plain).toContain(release.title);
      expect(plain).toContain(release.summary);
      for (const group of release.groups) {
        expect(plain).toContain(group.heading);
        for (const item of group.items) expect(plain).toContain(item);
      }
    }
  });

  it('版本从新到旧排列，日期是 YYYY-MM-DD', () => {
    const dates = RELEASES.map((release) => release.date);
    for (const date of dates) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it('每个版本都写了内容，没有空分组', () => {
    for (const release of RELEASES) {
      expect(release.summary.length).toBeGreaterThan(0);
      expect(release.groups.length).toBeGreaterThan(0);
      for (const group of release.groups) expect(group.items.length).toBeGreaterThan(0);
    }
  });

  it('不出现被禁用的术语', () => {
    expect(JSON.stringify(RELEASES)).not.toContain('短链接');
  });
});
