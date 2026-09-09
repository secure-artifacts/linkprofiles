import type { Locale } from '@link-profile/i18n';
import type { Layout, Theme } from '@link-profile/shared';

export type Role = 'superadmin' | 'admin' | 'user';

export interface Session {
  id: string;
  role: Role;
  account: string;
  uiLanguage: Locale;
}

export interface UserSummary {
  id: string;
  account: string;
  label: string;
  regionId: string | null;
  regionName: string | null;
  /** 所在区域的归属管理员。为空即无归属区域，只有超级管理员看得到。 */
  regionOwnerAdminId: string | null;
  createdAt: string;
  /** 名下个人页数量。具体是哪些要走 `/users/:id/profiles`。 */
  profileCount: number;
}

/** 个人页列表里的一行。完整可编辑内容走 `/profiles/:id`。 */
export interface ProfileSummary {
  id: string;
  shortName: string;
  displayName: string;
  layout: Layout;
  theme: Theme;
  /** 头像缩略图。没设头像时为 null，列表里回落到占位剪影。 */
  avatarUrl: string | null;
  createdAt: string;
}

/** 一次改地址的记录。拿它做回退：挑一个旧地址再改回去。 */
export interface ShortNameChange {
  id: string;
  fromShortName: string;
  toShortName: string;
  changedByLabel: string | null;
  createdAt: string;
}

export interface AdminSummary {
  id: string;
  account: string;
  label: string;
  createdAt: string;
  /** 名下区域数。管理员至少有一个默认区域。 */
  regionCount: number;
}

export type EntryKind = 'link' | 'social';

/**
 * 编辑器里的一个条目。链接与社媒入口共用这一种形状 —— 它们在页面上渲染成
 * 同一种卡片，只差地址从哪来。
 */
export interface EntryDraft {
  /** 已保存的条目有 id，新加的是本地临时 id。id 换掉会让历史点击成孤儿。 */
  id: string;
  kind: EntryKind;
  title: string;
  subtitle: string;
  /** kind='link' 用 */
  url: string;
  /** kind='social' 用 */
  platform: string;
  value: string;
  directMessage: boolean;
  message: string;
  isLead: boolean;
  passSource: boolean;
}

export interface ProfileFields {
  id: string;
  userId: string;
  shortName: string;
  displayName: string;
  bio: string;
  /** 简介逐字打出。关掉或访客设了减少动效时，全文静态显示。 */
  bioTypewriter: boolean;
  /** 页面语言。属于个人页，与账号的界面语言互不牵连，见 ADR-0020。 */
  pageLanguage: Locale;
  layout: Layout;
  theme: Theme;
  /** 条目一律实心卡片还是一律描边行。整页统一，不逐条配。 */
  solidBackground: boolean;
  /** 条目左侧品牌图形背后垫不垫那枚白色衬底。与 solidBackground 相互独立。 */
  iconPlate: boolean;
  backgroundOverlay: string;
  avatarMediaId: string | null;
  bannerMediaId: string | null;
  backgroundMediaId: string | null;
  /** 服务端解析好的可直接使用的地址，编辑器不必自己拼 variant 路径 */
  avatarUrl: string | null;
  avatarIsVideo: boolean;
  bannerUrl: string | null;
  backgroundUrl: string | null;
}

export interface EditableProfile {
  profile: ProfileFields;
  entries: (EntryDraft & { position: number })[];
}

export interface SocialPlatformInfo {
  id: string;
  label: string;
  brandHex: string;
  inputKind: 'phone' | 'email' | 'username';
  labelKey: string | null;
  inputHintKey: string;
  defaultIsLead: boolean;
}

export interface AnalyticsResponse {
  scope:
    | { kind: 'portfolio' }
    | { kind: 'region'; regionId: string; regionName: string }
    | { kind: 'account'; userId: string; account: string; label: string }
    | {
        kind: 'profile';
        profileId: string;
        userId: string;
        shortName: string;
        displayName: string;
        account: string;
        label: string;
      };
  range: { from: string; to: string; timeZone: string; granularity: 'hour' | 'day' };
  comparison: {
    range: { from: string; to: string };
    totals: { pageViews: number; clicks: number; leads: number; ctr: number };
    profiles: ProfilePerformance[];
  };
  totals: { pageViews: number; clicks: number; leads: number; ctr: number };
  trend: { bucket: string; pageViews: number; clicks: number; leads: number }[];
  hourlyLeads: number[];
  buttons: {
    id: string;
    kind: EntryKind;
    title: string;
    isLead: boolean;
    clicks: number;
    ctr: number;
  }[];
  dimensions: {
    countries: DimensionRow[];
    cities: DimensionRow[];
    devices: DimensionRow[];
    operatingSystems: DimensionRow[];
    sources: DimensionRow[];
  };
  crossBreakdowns: {
    sources: SourceBreakdown[];
    countries: CountryBreakdown[];
    targets: TargetBreakdown[];
  };
  countryDaily: CountryDailyBreakdown[];
  activityHeatmap: {
    day: number;
    hour: number;
    pageViews: number;
    leads: number;
  }[];
  profileHighlights: ProfileHighlight[];
  performance: {
    accounts: AccountPerformance[];
    profiles: ProfilePerformance[];
    regions: RegionPerformance[];
  };
  /** 区域筛选器的可选项。用户角色拿到空数组。 */
  regions: { id: string; name: string }[];
}

export interface RegionPerformance {
  id: string | null;
  name: string | null;
  pageViews: number;
  clicks: number;
  leads: number;
  ctr: number;
  leadRate: number;
  accountCount: number;
  profileCount: number;
}

export interface CountryDailyBreakdown {
  day: string;
  country: string;
  pageViews: number;
  clicks: number;
  leads: number;
  platforms: { key: string; clicks: number; leads: number }[];
}

export interface ProfileHighlightMetric {
  key: string;
  pageViews: number;
  leads: number;
}

export interface ProfileHighlight {
  profileId: string;
  topSource: ProfileHighlightMetric | null;
  topCountry: ProfileHighlightMetric | null;
  topTarget: { id: string; title: string | null; platform: string; leads: number } | null;
}

export interface PerformanceTotals {
  pageViews: number;
  clicks: number;
  leads: number;
  ctr: number;
  leadRate: number;
}

export interface AccountPerformance extends PerformanceTotals {
  regionId: string | null;
  regionName: string | null;
  id: string;
  account: string;
  label: string;
  profileCount: number;
}

export interface ProfilePerformance extends PerformanceTotals {
  id: string;
  userId: string;
  shortName: string;
  displayName: string;
  account: string;
  accountLabel: string;
}

export interface CrossMetrics {
  pageViews: number;
  clicks: number;
  leads: number;
  clickRate: number;
  leadRate: number;
}

export interface ContactTarget {
  id: string;
  /** 条目已被删除时为 null，占位文案由界面按当前语言渲染。 */
  title: string | null;
  platform: string;
  isLead: boolean;
  clicks: number;
  leads: number;
}

export interface SourceBreakdown extends CrossMetrics {
  key: string;
  targets: ContactTarget[];
}

export interface CountrySourceBreakdown extends SourceBreakdown {}

export interface CountryBreakdown extends CrossMetrics {
  key: string;
  sources: CountrySourceBreakdown[];
}

export interface TargetBreakdown extends ContactTarget {
  sources: { key: string; clicks: number; leads: number }[];
}

export interface DimensionRow {
  key: string;
  pageViews: number;
  clicks: number;
  leads: number;
}

export interface AppSettings {
  /** 自助注册总闸。关掉只挡新注册，不影响已有用户。 */
  registrationEnabled: boolean;
  /** reCAPTCHA 站点密钥。公开值，注册页要拿它渲染控件。 */
  recaptchaSiteKey: string;
  /** 站点密钥与私钥都填齐了没有。私钥本身任何接口都不回传。 */
  recaptchaConfigured: boolean;
  /** 两把密钥里有没有 Google 的公开测试密钥。私钥那把只有服务端判得了。 */
  recaptchaUsesTestKey: boolean;
  sourcePassthroughDefault: boolean;
}

/** 区域列表里的一行。归属管理员由区域推导，见 ADR-0017。 */
export interface RegionSummary {
  id: string;
  name: string;
  ownerAdminId: string | null;
  ownerAdminLabel: string | null;
  ownerAdminAccount: string | null;
  isDefault: boolean;
  createdAt: string;
  memberCount: number;
  /** 当前有效的那一个邀请码。区域先于邀请码表存在时为 null。 */
  inviteCode: string | null;
}
