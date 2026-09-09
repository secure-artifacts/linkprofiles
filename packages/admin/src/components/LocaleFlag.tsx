import type { Locale } from '@link-profile/i18n';
import type { ReactNode } from 'react';

/**
 * 语言旁边的国旗。
 *
 * 画成内联 SVG 而不是用 emoji：Windows 的 Chrome / Edge 至今不带旗帜字形，
 * emoji 在那里会退化成「US」「PH」这样的字母对，等于没加。
 *
 * 西班牙与巴西的纹章、美国的五十颗星在 16px 下糊成一团，一概省掉。
 */

const STAR =
  'M0 -1L0.225 -0.309L0.951 -0.309L0.364 0.118L0.588 0.809L0 0.382L-0.588 0.809L-0.364 0.118L-0.951 -0.309L-0.225 -0.309Z';

const star = (key: string, x: number, y: number, size: number, fill: string, rotate = 0) => (
  <path
    key={key}
    d={STAR}
    fill={fill}
    transform={`translate(${x} ${y})rotate(${rotate})scale(${size})`}
  />
);

const FLAGS: Record<Locale, ReactNode> = {
  en: (
    <>
      <rect width="20" height="14" fill="#fff" />
      <rect y="0" width="20" height="2" fill="#B22234" />
      <rect y="4" width="20" height="2" fill="#B22234" />
      <rect y="8" width="20" height="2" fill="#B22234" />
      <rect y="12" width="20" height="2" fill="#B22234" />
      <rect width="9" height="6" fill="#3C3B6E" />
      {star('a', 2.2, 1.8, 0.9, '#fff')}
      {star('b', 5.2, 1.8, 0.9, '#fff')}
      {star('c', 6.8, 4.2, 0.9, '#fff')}
      {star('d', 3.7, 4.2, 0.9, '#fff')}
    </>
  ),
  'zh-Hans': (
    <>
      <rect width="20" height="14" fill="#DE2910" />
      {star('big', 3.6, 3.8, 2.2, '#FFDE00')}
      {star('s1', 7.4, 1.5, 0.8, '#FFDE00', 20)}
      {star('s2', 8.9, 3.1, 0.8, '#FFDE00', 40)}
      {star('s3', 8.9, 5.2, 0.8, '#FFDE00', -20)}
      {star('s4', 7.4, 6.7, 0.8, '#FFDE00')}
    </>
  ),
  fil: (
    <>
      <rect width="20" height="7" fill="#0038A8" />
      <rect y="7" width="20" height="7" fill="#CE1126" />
      <path d="M0 0L8.5 7L0 14Z" fill="#fff" />
      <circle cx="2.9" cy="7" r="1.5" fill="#FCD116" />
      {star('t', 1, 1.4, 0.7, '#FCD116')}
      {star('b', 1, 12.6, 0.7, '#FCD116')}
      {star('r', 6.6, 7, 0.7, '#FCD116')}
    </>
  ),
  es: (
    <>
      <rect width="20" height="14" fill="#AA151B" />
      <rect y="3.5" width="20" height="7" fill="#F1BF00" />
    </>
  ),
  'pt-BR': (
    <>
      <rect width="20" height="14" fill="#009B3A" />
      <path d="M10 1.3L18.4 7L10 12.7L1.6 7Z" fill="#FEDF00" />
      <circle cx="10" cy="7" r="3.1" fill="#002776" />
      <path d="M7 6.2A6 6 0 0 1 12.9 6.1A3.1 3.1 0 0 0 7 6.2Z" fill="#fff" />
    </>
  ),
  id: (
    <>
      <rect width="20" height="7" fill="#CE1126" />
      <rect y="7" width="20" height="7" fill="#fff" />
    </>
  ),
  vi: (
    <>
      <rect width="20" height="14" fill="#DA251D" />
      {star('c', 10, 7, 4, '#FFFF00')}
    </>
  ),
};

export function LocaleFlag({ locale }: { locale: Locale }) {
  return (
    <svg
      viewBox="0 0 20 14"
      className="h-3.5 w-5 shrink-0 rounded-[2px]"
      aria-hidden
      focusable="false"
    >
      {FLAGS[locale]}
      <rect width="20" height="14" fill="none" stroke="rgba(0,0,0,0.14)" strokeWidth="1" />
    </svg>
  );
}
