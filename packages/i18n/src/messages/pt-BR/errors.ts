import type { ErrorMessages } from '../types.js';

export const errorsPtBR: ErrorMessages = {
  'code.unauthorized': 'Você não está conectado ou a sessão expirou',
  'code.forbidden': 'Você não tem permissão para fazer isso',
  'code.invalid_credentials': 'Conta ou senha incorreta',
  'code.account_taken': 'Essa conta já está em uso',
  'code.short_name_taken': 'Esse short_name já está em uso',
  'code.short_name_retired':
    'Esse short_name pertence a uma página de perfil excluída e nunca é reatribuído',
  'code.not_an_admin': 'Só pode ser atribuído a um administrador',
  'code.duplicate_platform': 'Cada plataforma só pode ser ativada uma vez',
  'code.unknown_platform': 'Plataforma desconhecida',
  'code.invalid_body': 'Há algo errado no envio, confira e tente de novo',
  'code.unknown': 'A requisição falhou ({{status}})',
  'field.displayName.required': 'O nome de exibição não pode ficar vazio',
  'field.title.required': 'O título não pode ficar vazio',
  'field.value.required': 'O valor não pode ficar vazio',
  'field.password.min': 'A senha precisa ter pelo menos {{min}} caracteres',
  'field.newPassword.min': 'A nova senha precisa ter pelo menos {{min}} caracteres',
  'query.exclusiveScope': 'Não dá para informar userId e profileId ao mesmo tempo',
  'apiKey.expiryInPast': 'A validade precisa ser posterior a agora',
  'entry.limitReached': 'Uma página comporta no máximo {{max}} links personalizados',
  'contact.invalidValue': 'Esse valor de contato não está num formato válido',
  'contact.unknownPlatform': 'Essa plataforma de contato não é suportada',
  'contact.notOnPage':
    'Esse contato ainda não está na página; envie createMissing=true para adicioná-lo automaticamente',
  'media.invalidSlot': 'Espaço desconhecido: {{slot}}',
  'media.missingFile': 'Nenhum arquivo recebido',
  'media.videoOnlyOnAvatar': 'Só o espaço do avatar aceita vídeo',
  'media.posterRequired':
    'Um vídeo precisa do primeiro quadro junto; envie uma capa manualmente se o navegador não conseguiu extrair',
  'media.notMultipart': 'Envie isto como multipart/form-data',
  'media.fileTooLarge':
    'Arquivo grande demais. Imagens vão até {{imageMb}} MB e vídeos até {{videoMb}} MB',
  'adminDist.missing':
    'A build do painel não está em {{root}}. Rode pnpm --filter @link-profile/admin build e reinicie.',
  'conflict.accountTaken': 'A conta {{account}} já existe',
  'conflict.shortNameTaken': 'O short_name {{shortName}} já está em uso',
  'conflict.shortNameRetired':
    'O short_name {{shortName}} pertence a uma página de perfil excluída e nunca é reatribuído',
  'field.atLeastOne': 'Envie pelo menos um campo para atualizar',
};
