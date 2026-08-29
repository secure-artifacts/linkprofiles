/**
 * 后台的 API 客户端。
 *
 * 会话走 HttpOnly cookie，因此这里不碰任何令牌，只保证每个请求都带上凭据。
 * 401 统一抛成 `UnauthorizedError`，由外层跳登录页；403 是「登录了但不该碰」，
 * 按普通错误提示，不踢下线（见 04 的说明）。
 */

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
    super(401, payload, '未登录或登录已过期');
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
  };

  if (options.formData) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
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

/** 把服务端的错误码翻成一句人话，后台直接拿去显示。 */
function describe(status: number, payload: unknown): string {
  const error = (payload as { error?: string; message?: string } | null)?.error;
  const message = (payload as { message?: string } | null)?.message;
  if (message) return message;

  switch (error) {
    case 'forbidden':
      return '没有权限执行这个操作';
    case 'account_taken':
      return '这个登录用户名已经被占用了';
    case 'short_name_taken':
      return '这个 short_name 已经被占用了';
    case 'short_name_retired':
      return '这个 short_name 属于一个已删除的用户，永不再分配';
    case 'invalid_credentials':
      return '账号或密码不对';
    case 'not_an_admin':
      return '只能指派给管理员';
    case 'duplicate_platform':
      return '同一个平台只能启用一次';
    case 'unknown_platform':
      return '不认识的平台';
    case 'invalid_body':
    case 'invalid_query':
      return '提交的内容有问题，请检查后重试';
    default:
      return `请求失败（${status}）`;
  }
}
