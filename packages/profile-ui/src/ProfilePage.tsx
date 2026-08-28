import { Avatar } from './Avatar.js';
import { ButtonList } from './Buttons.js';
import { MutedIcon, SoundIcon } from './Icon.js';
import type { ProfileView } from './types.js';

interface HeaderProps {
  profile: ProfileView;
  priority: boolean;
}

function Name({ profile }: { profile: ProfileView }) {
  return (
    <>
      <h1 className="pp-name">{profile.displayName}</h1>
      <Bio profile={profile} />
    </>
  );
}

/**
 * 简介。
 *
 * 全文无条件输出，不是先吐个空节点再靠 JS 拼出来 —— 没有 JS 时它就是今天的
 * 静态简介。打字机只是把已经在 DOM 里的字先藏起来再逐个放出，见 ADR-0012。
 *
 * banner 布局把它挪到 `.below` 里，位置不同但节点本身是同一个，所以抽出来。
 */
function Bio({ profile }: { profile: ProfileView }) {
  if (!profile.bio) return null;
  return (
    <p className="pp-bio" {...(profile.bioTypewriter ? { 'data-tw': '' } : {})}>
      {profile.bio}
    </p>
  );
}

function Header({ profile, priority }: HeaderProps) {
  const avatar = (
    <Avatar
      media={profile.avatar}
      video={profile.video}
      priority={priority}
      alt={profile.displayName}
    />
  );

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
          <Avatar media={profile.avatar} video={profile.video} priority={priority} className="bn" />
          <div className="row">
            {avatar}
            <div className="nm">
              <h1 className="pp-name">{profile.displayName}</h1>
            </div>
          </div>
          <div className="below">
            <Bio profile={profile} />
          </div>
        </div>
      );

    case 'cutout':
      return (
        <div className="hd hd-cut">
          {avatar}
          <div className="nm">
            <Name profile={profile} />
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
        </div>
      );
  }
}

export interface ProfilePageProps {
  profile: ProfileView;
  /** 服务端直出时为 true，头像位按 LCP 元素处理。 */
  priority?: boolean;
}

/**
 * 个人页主体。同一批组件服务于服务端 `renderToString` 直出与后台 iframe 预览，
 * 因此不得依赖任何浏览器专有 API（见 ADR-0004）。
 */
export function ProfilePage({ profile, priority = false }: ProfilePageProps) {
  // 背景图覆盖主题渐变；遮罩暗度由用户调，样式规则在 styles.css 的 [data-bg-image] 上。
  const backgroundProps = profile.background
    ? {
        'data-bg-image': '',
        style: {
          ['--bg-image' as string]: `url(${JSON.stringify(profile.background.src)})`,
          ['--overlay' as string]: String(profile.background.overlay),
        },
      }
    : {};

  return (
    <div
      className="pp"
      data-t={profile.theme}
      data-l={profile.layout}
      {...(profile.iconPlate ? { 'data-icon-plate': '' } : {})}
      {...backgroundProps}
    >
      <div className="pp-shell">
        {/*
          视频头像默认静音自动播放（浏览器不给未静音的视频自动播放），
          这个按钮是访客开声音的唯一入口。两枚图标都渲染出来，显示哪一枚
          由 CSS 按 aria-pressed 选；点击行为由内联脚本接上。
        */}
        {profile.video ? (
          <button className="pp-mute" type="button" aria-pressed="false" aria-label="开启声音">
            <span className="off">
              <MutedIcon />
            </span>
            <span className="on">
              <SoundIcon />
            </span>
          </button>
        ) : null}
        <Header profile={profile} priority={priority} />
        <div className="pp-body">
          <ButtonList buttons={profile.buttons} solidBackground={profile.solidBackground} />
        </div>
      </div>
    </div>
  );
}
