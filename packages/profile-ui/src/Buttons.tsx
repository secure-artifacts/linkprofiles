import { BrandIcon, ChevronIcon, hasBrandIcon } from './Icon.js';
import type { ButtonView } from './types.js';

/**
 * 条目列表。
 *
 * 不分组、无区段标题：链接与社媒入口共处一个有序列表，可以混排。
 * 实心卡片还是描边行整页统一，由页面级的 `solidBackground` 决定，不逐条配。
 */
export function ButtonList({
  buttons,
  solidBackground,
}: {
  buttons: readonly ButtonView[];
  solidBackground: boolean;
}) {
  const Row = solidBackground ? SolidCard : OutlineRow;
  return (
    <>
      {buttons.map((button) => (
        <Row key={button.id} button={button} />
      ))}
    </>
  );
}

/**
 * 埋点用的标记，由客户端那一小段原生 JS 读取，见 12。
 *
 * `data-track` 一律是 `button`：只剩一张表，服务端拿 id 就能查出它到底是
 * 链接还是社媒，不需要客户端告诉它（也不该信）。
 */
function trackingAttrs(id: string, isLead: boolean) {
  return {
    'data-track': 'button',
    'data-track-id': id,
    'data-lead': isLead ? '1' : '0',
  };
}

/** 两种形态的内层结构完全一样，只差外层那个 <a> 的 class。 */
function CardBody({ button }: { button: ButtonView }) {
  return (
    <>
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
    </>
  );
}

function SolidCard({ button }: { button: ButtonView }) {
  return (
    <a className="pp-lead" href={button.url} {...trackingAttrs(button.id, button.isLead)}>
      <CardBody button={button} />
    </a>
  );
}

function OutlineRow({ button }: { button: ButtonView }) {
  return (
    <a className="pp-link" href={button.url} {...trackingAttrs(button.id, button.isLead)}>
      <CardBody button={button} />
    </a>
  );
}
