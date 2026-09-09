import { useAdminT } from '../i18n/runtime.js';
import { useBreadcrumb } from '../nav/breadcrumb.js';
import { CURRENT_VERSION, RELEASES } from '../changelog/entries.js';
import { Tag } from '../ui/Tag.js';

/**
 * 更新日志。
 *
 * 页面外壳跟随界面语言，条目正文固定中文（见 `changelog/entries.ts`），
 * 顶部那行说明就是讲给看不懂中文的人听的，别把它删掉。
 */
export function ChangelogPage() {
  const t = useAdminT();
  useBreadcrumb([{ label: t('changelog.title') }]);

  return (
    <div className="flex max-w-[820px] flex-col gap-4">
      <div>
        <h1 className="font-display text-xl font-semibold text-fg">{t('changelog.title')}</h1>
        <p className="mt-1 text-[13px] text-muted">
          {t('changelog.current', { version: `v${CURRENT_VERSION}` })} ·{' '}
          {t('changelog.chineseOnly')}
        </p>
      </div>

      {RELEASES.map((release) => (
        <article
          key={release.version}
          lang="zh-Hans"
          className="rounded-[var(--radius-panel)] border border-border bg-surface p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">v{release.version}</Tag>
            <h2 className="text-sm font-semibold text-fg">{release.title}</h2>
            <span className="font-mono text-[12px] text-muted">{release.date}</span>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{release.summary}</p>

          {release.groups.map((group) => (
            <section key={group.heading} className="mt-4">
              <h3 className="text-[13px] font-semibold text-fg">{group.heading}</h3>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-[13px] leading-relaxed text-fg">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </article>
      ))}
    </div>
  );
}
