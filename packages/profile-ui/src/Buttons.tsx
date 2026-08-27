import { BrandIcon, ChevronIcon, hasBrandIcon } from './Icon.js';
import type { ButtonView, SocialIconView } from './types.js';

/**
 * 按钮列表。
 *
 * 不分组、无区段标题：全部按钮共处一个有序列表，联系类与内容类可以混排。
 * 两级视觉只由 `isLead` 决定 —— 联系类是实心卡片，内容类是描边行。
 * 分级靠样式，不靠位置。
 */
export function ButtonList({ buttons }: { buttons: readonly ButtonView[] }) {
  return (
    <>
      {buttons.map((button) =>
        button.isLead ? (
          <LeadCard key={button.id} button={button} />
        ) : (
          <LinkRow key={button.id} button={button} />
        ),
      )}
    </>
  );
}

/** 埋点用的标记，由客户端那一小段原生 JS 读取，见 12。 */
function trackingAttrs(kind: 'button' | 'social', id: string, isLead: boolean) {
  return {
    'data-track': kind,
    'data-track-id': id,
    'data-lead': isLead ? '1' : '0',
  };
}

function LeadCard({ button }: { button: ButtonView }) {
  return (
    <a className="pp-lead" href={button.url} {...trackingAttrs('button', button.id, true)}>
      {button.platform && hasBrandIcon(button.platform) ? (
        <span className="ic">
          <BrandIcon platform={button.platform} />
        </span>
      ) : null}
      <span className="tx">
        <b>{button.title}</b>
        {/* 副标题留空时不渲染这一行 */}
        {button.subtitle ? <span>{button.subtitle}</span> : null}
      </span>
      <span className="go">
        <ChevronIcon />
      </span>
    </a>
  );
}

function LinkRow({ button }: { button: ButtonView }) {
  return (
    <a className="pp-link" href={button.url} {...trackingAttrs('button', button.id, false)}>
      {button.platform && hasBrandIcon(button.platform) ? (
        <span className="ic">
          <BrandIcon platform={button.platform} />
        </span>
      ) : null}
      <span className="lb">{button.title}</span>
      <span className="go">
        <ChevronIcon />
      </span>
    </a>
  );
}

/** 头部的图标式入口。与按钮的区别在展现形式和位置，不在行为。 */
export function SocialIcons({ icons }: { icons: readonly SocialIconView[] }) {
  if (icons.length === 0) return null;

  return (
    <div className="pp-soc">
      {icons.map((icon) => (
        <a
          key={icon.id}
          href={icon.url}
          aria-label={icon.label}
          {...trackingAttrs('social', icon.id, icon.isLead)}
        >
          <BrandIcon platform={icon.platform} />
        </a>
      ))}
    </div>
  );
}
