import type { ReactNode } from 'react';
import { Avatar } from './Avatar.js';
import type { Layout, ProfileView } from './types.js';

/**
 * 社媒图标在哪一层渲染，因布局而异（依据设计稿）：
 * Classic / Banner / Cutout 放在头部内，Hero / Shape 放在头部之下。
 */
const SOCIALS_IN_HEADER: Record<Layout, boolean> = {
  classic: true,
  hero: false,
  banner: true,
  cutout: true,
  shape: false,
};

interface HeaderProps {
  profile: ProfileView;
  socials: ReactNode;
  priority: boolean;
}

function Name({ profile }: { profile: ProfileView }) {
  return (
    <>
      <h1 className="pp-name">{profile.displayName}</h1>
      {profile.bio ? <p className="pp-bio">{profile.bio}</p> : null}
    </>
  );
}

function Header({ profile, socials, priority }: HeaderProps) {
  const avatar = <Avatar media={profile.avatar} priority={priority} alt={profile.displayName} />;

  switch (profile.layout) {
    case 'hero':
      return (
        <div className="hd hd-hero">
          {avatar}
          <div className="veil" />
          <div className="cap">
            <Name profile={profile} />
          </div>
        </div>
      );

    case 'banner':
      return (
        <div className="hd hd-ban">
          <Avatar media={profile.avatar} priority={priority} className="bn" />
          <div className="row">
            {avatar}
            <div className="nm">
              <h1 className="pp-name">{profile.displayName}</h1>
            </div>
          </div>
          <div className="below">
            {profile.bio ? <p className="pp-bio">{profile.bio}</p> : null}
            {socials}
          </div>
        </div>
      );

    case 'cutout':
      return (
        <div className="hd hd-cut">
          {avatar}
          <div className="nm">
            <Name profile={profile} />
            {socials}
          </div>
        </div>
      );

    case 'shape':
      return (
        <div className="hd hd-shp">
          {avatar}
          <div>
            <Name profile={profile} />
          </div>
        </div>
      );

    case 'classic':
    default:
      return (
        <div className="hd hd-cls">
          {avatar}
          <Name profile={profile} />
          {socials}
        </div>
      );
  }
}

export interface ProfilePageProps {
  profile: ProfileView;
  /** 服务端直出时为 true，头像位按 LCP 元素处理。 */
  priority?: boolean;
  socials?: ReactNode;
  children?: ReactNode;
}

/**
 * 个人页主体。同一批组件服务于服务端 `renderToString` 直出与后台 iframe 预览，
 * 因此不得依赖任何浏览器专有 API（见 ADR-0004）。
 */
export function ProfilePage({ profile, priority = false, socials, children }: ProfilePageProps) {
  const inHeader = SOCIALS_IN_HEADER[profile.layout] ?? true;

  return (
    <div className="pp" data-t={profile.theme} data-l={profile.layout}>
      <div className="pp-shell">
        <Header profile={profile} priority={priority} socials={inHeader ? socials : null} />
        {!inHeader && socials ? <div className="hd">{socials}</div> : null}
        <div className="pp-body">{children}</div>
      </div>
    </div>
  );
}
