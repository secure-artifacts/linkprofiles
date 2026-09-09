import type { adminEn } from './en/admin.js';
import type { errorsEn } from './en/errors.js';
import type { publicEn } from './en/public.js';

/**
 * 译文的形状由英文源文推导。少一条 key 或多一条 key 都在 typecheck 阶段失败，
 * 不用等对齐测试跑起来。见 ADR-0021。
 */
export type AdminMessages = Record<keyof typeof adminEn, string>;
export type PublicMessages = Record<keyof typeof publicEn, string>;
export type ErrorMessages = Record<keyof typeof errorsEn, string>;

export type AdminKey = keyof typeof adminEn;
export type PublicKey = keyof typeof publicEn;
export type ErrorKey = keyof typeof errorsEn;
