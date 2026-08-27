/**
 * 在浏览器端用 canvas 从视频首帧抽出封面。
 *
 * 公开页要先渲染封面、视频加载完才播，**视频不得成为 LCP 元素**，
 * 所以封面必须和视频一并提交。服务端不转码（运行镜像没有 ffmpeg），
 * 抽帧这件事只能在这里做。
 *
 * 抽帧可能失败：编码不被浏览器支持、视频有 DRM、canvas 被污染。
 * 这时返回 null，由调用方降级为「请手动上传一张封面图」，而不是
 * 让用户传上去一个没有封面的视频。
 */
export async function extractFirstFrame(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;

  try {
    await once(video, 'loadeddata', 8000);

    // 有些编码在 0 秒时还没有可画的帧，往后挪一点点
    if (video.currentTime === 0 && video.duration > 0.1) {
      video.currentTime = Math.min(0.1, video.duration / 2);
      await once(video, 'seeked', 4000);
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (canvas.width === 0 || canvas.height === 0) return null;

    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;

    return new File([blob], 'poster.png', { type: 'image/png' });
  } catch {
    return null;
  } finally {
    video.src = '';
    URL.revokeObjectURL(url);
  }
}

function once(target: HTMLVideoElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`等待 ${event} 超时`));
    }, timeoutMs);

    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error(`视频加载失败`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      target.removeEventListener(event, onDone);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(event, onDone, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}
