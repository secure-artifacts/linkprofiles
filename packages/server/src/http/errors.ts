import { DEFAULT_LOCALE, negotiateLocale, type ErrorKey, type Locale } from '@link-profile/i18n';
import { FIELD_LIMIT_VARS } from '@link-profile/shared';
import { errorT } from '@link-profile/i18n/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * 失败响应的唯一出口。
 *
 * 错误码是机器契约，外部调用方按它判断失败原因，任何时候都不随语言变化；
 * `message` 是给人读的补充，语言在这里统一决定，调用点只给 key。
 *
 * 401 表示「没登录」，403 表示「登录了但不该碰」，区分理由见 auth/guards。
 */
export interface FailExtra {
  /** 逐字段的失败明细。其中的 message 若是一个 key，会被一并翻译。 */
  issues?: unknown;
  /** 给人读的补充说明，取译文目录里的 key。 */
  messageKey?: ErrorKey;
  messageVars?: Record<string, unknown>;
  /** 覆盖请求协商出来的语言。外部 API 用它固定英语。 */
  locale?: Locale;
  [key: string]: unknown;
}

/** 拿不到有效语言时一律英语，覆盖未登录与外部调用两种情形。 */
export function localeOf(req: FastifyRequest | undefined): Locale {
  return negotiateLocale(req?.headers['accept-language']);
}

interface ZodLikeIssue {
  message?: unknown;
  [key: string]: unknown;
}

function translateIssues(
  issues: unknown,
  translate: (key: ErrorKey, vars?: Record<string, unknown>) => string,
): unknown {
  if (!Array.isArray(issues)) return issues;
  return issues.map((issue: ZodLikeIssue) =>
    typeof issue?.message === 'string'
      ? { ...issue, message: translate(issue.message as ErrorKey, FIELD_LIMIT_VARS) }
      : issue,
  );
}

export function fail(
  reply: FastifyReply,
  status: number,
  error: string,
  extra: FailExtra = {},
): FastifyReply {
  const { messageKey, messageVars, locale, issues, ...rest } = extra;
  const translate = errorT(locale ?? localeOf(reply.request));

  return reply.code(status).send({
    error,
    ...rest,
    ...(messageKey
      ? { message: translate(messageKey, { ...FIELD_LIMIT_VARS, ...messageVars }) }
      : {}),
    ...(issues === undefined ? {} : { issues: translateIssues(issues, translate) }),
  });
}

export function unauthorized(reply: FastifyReply): FastifyReply {
  return fail(reply, 401, 'unauthorized');
}

export function forbidden(reply: FastifyReply): FastifyReply {
  return fail(reply, 403, 'forbidden');
}

/** 外部调用方拿到的报错固定英语，见 ADR-0021。 */
export const EXTERNAL_LOCALE: Locale = DEFAULT_LOCALE;
