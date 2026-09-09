/** 媒体上传的限制，server 校验与后台提示共用同一组常量。 */
import type { ErrorKey } from '@link-profile/i18n';

export const IMAGE_MAX_BYTES = 12 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export const VIDEO_MAX_BYTES = 10 * 1024 * 1024;
export const VIDEO_MAX_DURATION_MS = 15_000;
export const VIDEO_MIME_TYPES = ['video/mp4'] as const;

/**
 * 单张图落盘时的最长边上限，按用途给。手机直出的八兆原图不该原样进首屏。
 *
 * 放在 shared 而不是 server：服务端拿它压图，后台拿它在上传前如实告知用户
 * 「最终会被压到多大」—— 同一个数字，两边不该各写一份。
 */
export const IMAGE_MAX_EDGE = { avatar: 640, banner: 1440, background: 1440 } as const;

/** 裁切框的宽高比，按用途给。Banner 取公开页横幅比例，背景图按最窄手机竖屏取。 */
export const CROP_ASPECT = { avatar: 1, banner: 3, background: 375 / 812 } as const;

/** 拒绝理由带译文 key 与插值参数，文案在 i18n 包的 errors 命名空间里。 */
export interface MediaProblem {
  messageKey: ErrorKey;
  vars: Record<string, string | number>;
}

export type VideoRejection = MediaProblem & { reason: 'format' | 'size' | 'duration' };

export function mb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

/**
 * 视频只校验格式、时长与大小，不转码。
 * 拒绝时说清楚是哪一项超了、超了多少 —— 「上传失败」帮不到任何人。
 */
export function rejectVideo(input: {
  mimeType: string;
  bytes: number;
  durationMs: number | null;
}): VideoRejection | null {
  if (!(VIDEO_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return {
      reason: 'format',
      messageKey: 'media.video.format',
      vars: { mimeType: input.mimeType },
    };
  }
  if (input.durationMs === null) {
    return { reason: 'format', messageKey: 'media.video.unreadable', vars: {} };
  }
  if (input.bytes > VIDEO_MAX_BYTES) {
    return {
      reason: 'size',
      messageKey: 'media.video.sizeLimit',
      vars: { max: mb(VIDEO_MAX_BYTES), size: mb(input.bytes) },
    };
  }
  if (input.durationMs > VIDEO_MAX_DURATION_MS) {
    return {
      reason: 'duration',
      messageKey: 'media.video.durationLimit',
      vars: { max: VIDEO_MAX_DURATION_MS / 1000, seconds: (input.durationMs / 1000).toFixed(1) },
    };
  }
  return null;
}

export function rejectImage(input: { mimeType: string; bytes: number }): MediaProblem | null {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return { messageKey: 'media.image.format', vars: { mimeType: input.mimeType } };
  }
  if (input.bytes > IMAGE_MAX_BYTES) {
    return {
      messageKey: 'media.image.sizeLimit',
      vars: { max: mb(IMAGE_MAX_BYTES), size: mb(input.bytes) },
    };
  }
  return null;
}
