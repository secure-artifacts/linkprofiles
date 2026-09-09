/**
 * 公开个人页上的固定文案。数量极少 —— 页面主体是用户自己填的内容，
 * 这里只有系统产出的那几条。见 ADR-0020。
 */
export const publicEn = {
  'avatar.video.unmute': 'Turn on sound',
  'avatar.video.mute': 'Turn off sound',
  'banner.alt': 'Banner image for {{name}}',
  'meta.title.fallback': 'Profile',
  'meta.description.fallback': 'Contact details and links for {{name}}',
  'notFound.title': 'Page not found',
  'notFound.body': 'There is no profile page at this address.',
} as const;
