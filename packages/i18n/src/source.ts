/**
 * 英文源文。它同时是回落语言，必须在首屏同步可用 —— 异步加载会让界面先闪
 * 一遍原始 key。其余语言按需动态加载，见 admin.ts。
 */
export { adminEn } from './messages/en/admin.js';
export { errorsEn } from './messages/en/errors.js';
export { publicEn } from './messages/en/public.js';
