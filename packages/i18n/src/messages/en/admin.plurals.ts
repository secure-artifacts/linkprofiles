/**
 * 单数形态。基础 key 里写的是复数形态，i18next 在传了 count 时优先取这里。
 * 没有数的屈折的语言留空，回落到基础 key。
 */
export const adminPluralsEn: Record<string, string> = {
  'users.pagesCount_one': '{{count}} page',
  'users.pagination_one': '{{count}} user, {{size}} per page',
  'users.unowned.count_one': '{{count}} user is unassigned',
  'entries.incomplete.count_one': '{{count}} entry is still incomplete',
  'analytics.ranking.title_one': 'Profile page ranking · {{count}} page',
  'analytics.accounts.title_one': 'By account · {{count}} account',
  'analytics.profiles.title_one': 'Profile page performance · {{count}} page',
  'analytics.scope.account_one': 'Account {{account}} · {{count}} profile page',
  'country.opensCount_one': '{{count}} open',
  'analytics.timesCount_one': '{{count}} time',
  'analytics.visitsCount_one': '{{count}} visit',
  'analytics.leadsCount_one': '{{count}} contact',
  'country.clicksShare_one': '{{count}} click · {{percent}}',
  'regions.membersCount_one': '{{count}} user',
  'admins.regionCountValue_one': '{{count}} region',
  'users.selected_one': '{{count}} selected',
  'regions.unowned.count_one': '{{count}} region has no owning admin',
  'analytics.regions.title_one': 'By region · {{count}} region',
};
