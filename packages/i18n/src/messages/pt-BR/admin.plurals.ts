/**
 * 单数形态。基础 key 里写的是复数形态，i18next 在传了 count 时优先取这里。
 * 没有数的屈折的语言留空，回落到基础 key。
 */
export const adminPluralsPtBR: Record<string, string> = {
  'users.pagesCount_one': '{{count}} página',
  'users.pagination_one': '{{count}} usuário, {{size}} por página',
  'users.unowned.count_one': 'Há {{count}} usuário sem responsável',
  'entries.incomplete.count_one': 'Ainda falta {{count}} entrada incompleta',
  'analytics.ranking.title_one': 'Ranking de páginas de perfil · {{count}} página',
  'analytics.accounts.title_one': 'Por conta · {{count}} conta',
  'analytics.profiles.title_one': 'Desempenho das páginas de perfil · {{count}} página',
  'analytics.scope.account_one': 'Conta {{account}} · {{count}} página de perfil',
  'country.opensCount_one': '{{count}} abertura',
  'analytics.timesCount_one': '{{count}} vez',
  'analytics.visitsCount_one': '{{count}} visita',
  'analytics.leadsCount_one': '{{count}} contato',
  'country.clicksShare_one': '{{count}} clique · {{percent}}',
  'regions.membersCount_one': '{{count}} usuário',
  'admins.regionCountValue_one': '{{count}} região',
  'users.selected_one': '{{count}} selecionado',
  'regions.unowned.count_one': '{{count}} região sem administrador responsável',
  'analytics.regions.title_one': 'Por região · {{count}} região',
};
