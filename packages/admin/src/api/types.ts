import type { Layout, Theme } from '@link-profile/shared';

export type Role = 'superadmin' | 'admin' | 'user';

export interface Session {
  id: string;
  role: Role;
  account: string;
}

export interface UserSummary {
  id: string;
  account: string;
  label: string;
  owningAdminId: string | null;
  /** 归属管理员的显示名。服务端直接给，因为 `/admins` 清单里没有超级管理员。 */
  owningAdminLabel: string | null;
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
  inputHint: string;
  defaultIsLead: boolean;
}

export interface AnalyticsResponse {
  scope:
    | { kind: 'portfolio' }
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
  performance: {
    accounts: AccountPerformance[];
    profiles: ProfilePerformance[];
  };
}

export interface PerformanceTotals {
  pageViews: number;
  clicks: number;
  leads: number;
  ctr: number;
  leadRate: number;
}

export interface AccountPerformance extends PerformanceTotals {
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
  title: string;
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
  sourcePassthroughDefault: boolean;
  sourcePassthroughCaveat: string;
}
