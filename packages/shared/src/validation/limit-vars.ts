import { ACCOUNT_MAX, ACCOUNT_MIN } from './account-name.js';
import { INVITE_CODE_MAX, INVITE_CODE_MIN } from './invite-code.js';
import { PASSWORD_MAX, PASSWORD_MIN } from './password.js';
import { SHORT_NAME_MAX, SHORT_NAME_MIN } from './short-name.js';

/**
 * 长度类文案里的上下限。
 *
 * 校验函数只返回 key，插值参数没地方带，服务端与后台都在渲染时统一补这一份，
 * 用不到的键 i18next 会忽略。
 */
export const FIELD_LIMIT_VARS = {
  accountMin: ACCOUNT_MIN,
  accountMax: ACCOUNT_MAX,
  passwordMin: PASSWORD_MIN,
  passwordMax: PASSWORD_MAX,
  shortNameMin: SHORT_NAME_MIN,
  shortNameMax: SHORT_NAME_MAX,
  inviteCodeMin: INVITE_CODE_MIN,
  inviteCodeMax: INVITE_CODE_MAX,
} as const;
