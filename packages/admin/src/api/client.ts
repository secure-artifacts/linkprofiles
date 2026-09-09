/**
 * 后台的 API 客户端。
 *
 * 会话走 HttpOnly cookie，因此这里不碰任何令牌，只保证每个请求都带上凭据。
 * 401 统一抛成 `UnauthorizedError`，由外层跳登录页；403 是「登录了但不该碰」，
 * 按普通错误提示，不踢下线（见 04 的说明）。
 */

import { currentLocale, translateError } from '../i18n/runtime.js';
import type { ErrorKey } from '@link-profile/i18n';

const BASE = '/_api';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(payload: unknown) {
    super(401, payload, translateError('code.unauthorized'));
    this.name = 'UnauthorizedError';
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** 直接提交 FormData（媒体上传），不设置 content-type 让浏览器带 boundary */
  formData?: FormData;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    // 服务端据此翻自己产出的 message；错误码本身不随语言变化。
    headers: { 'accept-language': currentLocale() },
  };

  if (options.formData) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    init.headers = { ...init.headers, 'content-type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE}${path}`, init);

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (res.status === 401) throw new UnauthorizedError(payload);
  if (!res.ok) {
    throw new ApiError(res.status, payload, describe(res.status, payload));
  }

  return payload as T;
}

/**
 * 把服务端的错误码翻成一句人话。
 *
 * 在这一侧翻而不是让服务端返回成品文案，是为了切语言瞬时生效：不必重拉
 * 一遍接口，也不必把这些文案打进服务端产物。服务端确实带了 `message` 时
 * 优先用它 —— 那是它才知道的细节，例如具体是哪个字段、超了多少。
 */
const ERROR_CODE_KEYS: Record<string, ErrorKey> = {
  forbidden: 'code.forbidden',
  account_taken: 'code.account_taken',
  short_name_taken: 'code.short_name_taken',
  short_name_retired: 'code.short_name_retired',
  invalid_credentials: 'code.invalid_credentials',
  not_an_admin: 'code.not_an_admin',
  region_name_taken: 'code.region_name_taken',
  invite_code_taken: 'code.invite_code_taken',
  region_unowned: 'code.region_unowned',
  registration_closed: 'code.registration_closed',
  invite_code_invalid: 'code.invite_code_invalid',
  recaptcha_failed: 'code.recaptcha_failed',
  recaptcha_not_configured: 'code.recaptcha_not_configured',
  region_not_empty: 'code.region_not_empty',
  region_is_default: 'code.region_is_default',
  region_not_found: 'code.region_not_found',
  duplicate_platform: 'code.duplicate_platform',
  unknown_platform: 'code.unknown_platform',
  invalid_body: 'code.invalid_body',
  invalid_query: 'code.invalid_body',
};

function describe(status: number, payload: unknown): string {
  const error = (payload as { error?: string; message?: string } | null)?.error;
  const message = (payload as { message?: string } | null)?.message;
  if (message) return message;

  const key = error ? ERROR_CODE_KEYS[error] : undefined;
  return key ? translateError(key) : translateError('code.unknown', { status });
}
