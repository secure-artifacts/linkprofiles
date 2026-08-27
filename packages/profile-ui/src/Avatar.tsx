import type { MediaSource } from './types.js';

interface AvatarProps {
  media: MediaSource | null;
  /** 头像位是 LCP 元素，直出时标记高优先级；预览里无所谓。 */
  priority?: boolean;
  className?: string;
  alt?: string;
}

/**
 * 头像 / 头图。缺少素材时不回落到其他布局，只把该区域交给主题渐变填充，
 * 形状与占比仍由布局决定。
 */
export function Avatar({ media, priority = false, className = 'av', alt = '' }: AvatarProps) {
  if (!media) {
    return <div className={`${className} av-empty`} aria-hidden="true" />;
  }

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

  if (!media.sources?.length) {
    return <div className={className}>{img}</div>;
  }

  return (
    <div className={className}>
      <picture>
        {media.sources.map((s) => (
          <source key={s.src} srcSet={s.src} type={s.type} />
        ))}
        {img}
      </picture>
    </div>
  );
}
