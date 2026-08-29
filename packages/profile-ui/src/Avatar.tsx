import { AvatarPlaceholder } from './Icon.js';
import type { MediaSource, VideoSource } from './types.js';

interface AvatarProps {
  media: MediaSource | null;
  video?: VideoSource | null;
  /** 头像位是 LCP 元素，直出时标记高优先级；预览里无所谓。 */
  priority?: boolean;
  className?: string;
  alt?: string;
}

interface MediaImageProps {
  media: MediaSource;
  priority?: boolean;
  className: string;
  alt?: string;
}

/** 不带头像占位图语义的普通图片槽，供独立 Banner 图复用 picture/source 管线。 */
export function MediaImage({
  media,
  priority = false,
  className,
  alt = '',
}: MediaImageProps) {
  const img = (
    <img
      src={media.src}
      alt={alt}
      {...(media.width ? { width: media.width } : {})}
      {...(media.height ? { height: media.height } : {})}
      decoding={priority ? 'sync' : 'async'}
      {...(priority ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
    />
  );

  return (
    <div className={className}>
      {media.sources?.length ? (
        <picture>
          {media.sources.map((source) => (
            <source key={source.src} srcSet={source.src} type={source.type} />
          ))}
          {img}
        </picture>
      ) : (
        img
      )}
    </div>
  );
}

/**
 * 头像 / 头图。缺少素材时不回落到其他布局，只把该区域交给主题渐变填充，
 * 形状与占比仍由布局决定。
 *
 * 放视频时封面图先渲染、视频加载完成才播放：**视频不得成为 LCP 元素**。
 * 靠 `poster` + `preload="none"` + 客户端那一小段脚本在 canplay 后才 play 实现，
 * 见 12 的埋点脚本同处一段。
 */
export function Avatar({
  media,
  video = null,
  priority = false,
  className = 'av',
  alt = '',
}: AvatarProps) {
  if (video) {
    return (
      <div className={className}>
        <video
          src={video.src}
          poster={video.poster ?? undefined}
          muted
          loop
          playsInline
          // 不自动开始下载，也不 autoplay：先把封面画出来
          preload="none"
          data-autoplay="1"
          aria-label={alt}
        />
      </div>
    );
  }

  if (!media) {
    return (
      <div className={`${className} av-empty`} aria-hidden="true">
        <AvatarPlaceholder />
      </div>
    );
  }

  return <MediaImage media={media} priority={priority} className={className} alt={alt} />;
}
