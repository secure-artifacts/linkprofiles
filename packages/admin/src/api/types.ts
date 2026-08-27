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
  shortName: string | null;
  displayName: string;
  owningAdminId: string | null;
  createdAt: string;
}

export interface AdminSummary {
  id: string;
  account: string;
  label: string;
  createdAt: string;
}

export interface ButtonDraft {
  /** 已保存的按钮有 id，新加的没有。整份列表提交时 id 只用于 React 的 key。 */
  id: string;
  title: string;
  subtitle: string;
  url: string;
  isLead: boolean;
  passSource: boolean;
}

export interface SocialIconDraft {
  id: string;
  platform: string;
  value: string;
  isLead: boolean;
  passSource: boolean;
}

export interface ProfileFields {
  id: string;
  shortName: string | null;
  displayName: string;
  bio: string;
  layout: Layout;
  theme: Theme;
  backgroundOverlay: string;
  avatarMediaId: string | null;
  backgroundMediaId: string | null;
  /** 服务端解析好的可直接使用的地址，编辑器不必自己拼 variant 路径 */
  avatarUrl: string | null;
  avatarIsVideo: boolean;
  backgroundUrl: string | null;
}

export interface EditableProfile {
  profile: ProfileFields;
  buttons: (ButtonDraft & { position: number })[];
  socialIcons: (SocialIconDraft & { position: number })[];
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
  range: { from: string; to: string; timeZone: string; granularity: 'hour' | 'day' };
  totals: { pageViews: number; clicks: number; leads: number; ctr: number };
  trend: { bucket: string; pageViews: number; clicks: number; leads: number }[];
  hourlyLeads: number[];
  buttons: { id: string; title: string; isLead: boolean; clicks: number; ctr: number }[];
  dimensions: {
    countries: DimensionRow[];
    cities: DimensionRow[];
    devices: DimensionRow[];
    operatingSystems: DimensionRow[];
    sources: DimensionRow[];
  };
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
