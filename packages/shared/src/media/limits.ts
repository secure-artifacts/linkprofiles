/** 媒体上传的限制，server 校验与后台提示共用同一组常量。 */

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
export const IMAGE_MAX_EDGE = { avatar: 640, background: 1440 } as const;

/** 裁切框的宽高比，按用途给。背景图按最窄的手机竖屏取。 */
export const CROP_ASPECT = { avatar: 1, background: 375 / 812 } as const;

export type VideoRejection =
  | { reason: 'format'; message: string }
  | { reason: 'size'; message: string }
  | { reason: 'duration'; message: string };

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
    return { reason: 'format', message: `视频只支持 mp4，收到的是 ${input.mimeType}` };
  }
  if (input.durationMs === null) {
    return { reason: 'format', message: '这个文件不是有效的 mp4，读不出时长' };
  }
  if (input.bytes > VIDEO_MAX_BYTES) {
    return {
      reason: 'size',
      message: `视频不能超过 ${mb(VIDEO_MAX_BYTES)}，这个文件有 ${mb(input.bytes)}`,
    };
  }
  if (input.durationMs > VIDEO_MAX_DURATION_MS) {
    return {
      reason: 'duration',
      message: `视频不能超过 ${VIDEO_MAX_DURATION_MS / 1000} 秒，这段有 ${(
        input.durationMs / 1000
      ).toFixed(1)} 秒`,
    };
  }
  return null;
}

export function rejectImage(input: { mimeType: string; bytes: number }): string | null {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(input.mimeType)) {
    return `图片只支持 JPEG、PNG、WebP、AVIF，收到的是 ${input.mimeType}`;
  }
  if (input.bytes > IMAGE_MAX_BYTES) {
    return `图片不能超过 ${mb(IMAGE_MAX_BYTES)}，这个文件有 ${mb(input.bytes)}`;
  }
  return null;
}
