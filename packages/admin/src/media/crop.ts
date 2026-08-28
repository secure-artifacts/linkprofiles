/**
 * 客户端裁切。
 *
 * 裁好的结果直接顶替原文件上传，**原图不保留** —— 服务端的 sharp 管线与公开页
 * 的渲染层因此一行不用改（它们一直是等比缩放 + `object-fit: cover`）。代价是
 * 事后想重裁、或换一种布局后重新适配，都要重新上传一次原图。
 */
import { CROP_ASPECT } from '@link-profile/shared';

export { CROP_ASPECT };

export interface CropRect {
  /** 归一化到原图尺寸的裁切区域，取值 0–1 */
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CropSlot = keyof typeof CROP_ASPECT;

/** 导出上限。超过这个尺寸再大对移动端也没意义，只是白白撑大文件。 */
const MAX_OUTPUT_EDGE = 1600;

/** 边调边看那份预览的上限。它每帧都要重画一次，按最终尺寸导出会拖垮拖拽手感。 */
const PREVIEW_EDGE = 420;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('这张图片读不出来'));
    image.src = url;
  });
}

/**
 * 按裁切区域导出一个新文件。
 *
 * 输出格式统一走 JPEG：裁切后铺满整个画布，不存在需要保留的透明区域，而
 * PNG 在照片上体积能大出好几倍，直接顶到上传大小上限。
 */
export async function cropToFile(
  image: HTMLImageElement,
  rect: CropRect,
  fileName: string,
  maxEdge: number = MAX_OUTPUT_EDGE,
): Promise<File> {
  const sourceWidth = image.naturalWidth * rect.width;
  const sourceHeight = image.naturalHeight * rect.height;
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('浏览器不支持 canvas，无法裁切');
  ctx.drawImage(
    image,
    image.naturalWidth * rect.x,
    image.naturalHeight * rect.y,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  );
  if (!blob) throw new Error('裁切失败');

  return new File([blob], replaceExtension(fileName, 'jpg'), { type: 'image/jpeg' });
}

function replaceExtension(fileName: string, extension: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  return `${base || 'image'}.${extension}`;
}

/**
 * 边调边看用的低清版本。
 *
 * 右侧那台手机只有 375px 宽，预览画到 420 就够；按最终的 1600 导出会让
 * 拖拽掉帧。真正上传的那张仍然由 `cropToFile` 按全尺寸出。
 */
export function cropToPreviewUrl(image: HTMLImageElement, rect: CropRect): string {
  const canvas = document.createElement('canvas');
  const sourceWidth = image.naturalWidth * rect.width;
  const sourceHeight = image.naturalHeight * rect.height;
  const scale = Math.min(1, PREVIEW_EDGE / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.drawImage(
    image,
    image.naturalWidth * rect.x,
    image.naturalHeight * rect.y,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL('image/jpeg', 0.7);
}
