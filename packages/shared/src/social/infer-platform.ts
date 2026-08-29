import type { SocialPlatformId } from './platforms.js';

/**
 * 从按钮的目标地址认出它指向哪个平台，用来在按钮左侧渲染品牌图形。
 *
 * 用户不需要为此多填一个字段：他填了 `wa.me/1555...`，页面上自然就该
 * 出现 WhatsApp 的图形。认不出来就不渲染图形，按钮照常可用。
 */
const HOST_RULES: readonly [RegExp, SocialPlatformId][] = [
  [/(^|\.)wa\.me$/, 'whatsapp'],
  [/(^|\.)whatsapp\.com$/, 'whatsapp'],
  [/(^|\.)m\.me$/, 'messenger'],
  [/(^|\.)messenger\.com$/, 'messenger'],
  [/(^|\.)t\.me$/, 'telegram'],
  [/(^|\.)telegram\.(me|org)$/, 'telegram'],
  [/(^|\.)signal\.me$/, 'signal'],
  [/(^|\.)instagram\.com$/, 'instagram'],
  [/(^|\.)facebook\.com$/, 'facebook'],
  [/(^|\.)fb\.com$/, 'facebook'],
  [/(^|\.)youtube\.com$/, 'youtube'],
  [/(^|\.)youtu\.be$/, 'youtube'],
  [/(^|\.)tiktok\.com$/, 'tiktok'],
  [/(^|\.)(x|twitter)\.com$/, 'x'],
  [/(^|\.)threads\.(net|com)$/, 'threads'],
  [/(^|\.)snapchat\.com$/, 'snapchat'],
  [/(^|\.)pinterest\.(com|[a-z]{2})$/, 'pinterest'],
  [/(^|\.)linkedin\.com$/, 'linkedin'],
  [/(^|\.)lnkd\.in$/, 'linkedin'],
];

export function inferPlatformFromUrl(url: string): SocialPlatformId | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol === 'mailto:') return 'email';
  if (parsed.protocol === 'sms:') return 'sms';
  if (parsed.protocol === 'tel:') return 'phone';
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  for (const [pattern, id] of HOST_RULES) {
    if (pattern.test(host)) return id;
  }
  return null;
}
