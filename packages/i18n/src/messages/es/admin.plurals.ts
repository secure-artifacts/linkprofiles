/**
 * 单数形态。基础 key 里写的是复数形态，i18next 在传了 count 时优先取这里。
 * 没有数的屈折的语言留空，回落到基础 key。
 */
export const adminPluralsEs: Record<string, string> = {
  'users.pagesCount_one': '{{count}} página',
  'users.pagination_one': '{{count}} usuario, {{size}} por página',
  'users.unowned.count_one': 'Hay {{count}} usuario sin asignar',
  'entries.incomplete.count_one': 'Queda {{count}} entrada incompleta',
  'analytics.ranking.title_one': 'Ranking de páginas de perfil · {{count}} página',
  'analytics.accounts.title_one': 'Por cuenta · {{count}} cuenta',
  'analytics.profiles.title_one': 'Rendimiento de las páginas de perfil · {{count}} página',
  'analytics.scope.account_one': 'Cuenta {{account}} · {{count}} página de perfil',
  'country.opensCount_one': '{{count}} apertura',
  'analytics.timesCount_one': '{{count}} vez',
  'analytics.visitsCount_one': '{{count}} visita',
  'analytics.leadsCount_one': '{{count}} contacto',
  'country.clicksShare_one': '{{count}} clic · {{percent}}',
  'regions.membersCount_one': '{{count}} usuario',
  'admins.regionCountValue_one': '{{count}} región',
  'users.selected_one': '{{count}} seleccionado',
  'regions.unowned.count_one': '{{count}} región no tiene administrador responsable',
  'analytics.regions.title_one': 'Por región · {{count}} región',
};
