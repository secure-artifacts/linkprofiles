import type { ErrorMessages } from '../types.js';

export const errorsPtBR: ErrorMessages = {
  'code.unauthorized': 'Você não está conectado ou a sessão expirou',
  'code.forbidden': 'Você não tem permissão para fazer isso',
  'code.invalid_credentials': 'Conta ou senha incorreta',
  'code.account_taken': 'Essa conta já está em uso',
  'code.short_name_taken': 'Esse short_name já está em uso',
  'code.short_name_retired':
    'Esse short_name pertence a uma página de perfil excluída e nunca é reatribuído',
  'code.region_not_found': 'Essa região não existe',
  'code.invite_code_taken': 'Esse código de convite já está em uso',
  'code.region_unowned': 'Esta região ainda não tem administrador responsável; designe um antes',
  'code.registration_closed': 'O cadastro está fechado no momento',
  'code.invite_code_invalid': 'Esse código de convite não é válido',
  'code.recaptcha_failed': 'A verificação anti-robô falhou, marque a caixa de novo',
  'code.recaptcha_not_configured':
    'O cadastro ainda não está pronto, o administrador não terminou de configurar',
  'code.region_name_taken': 'Esse nome de região já está em uso',
  'code.region_not_empty': 'Esta região ainda tem {{count}} usuários. Mova-os primeiro.',
  'code.region_is_default': 'Não é possível excluir uma região padrão',
  'code.not_an_admin': 'Só pode ser atribuído a um administrador',
  'code.duplicate_platform': 'Cada plataforma só pode ser ativada uma vez',
  'code.unknown_platform': 'Plataforma desconhecida',
  'code.invalid_body': 'Há algo errado no envio, confira e tente de novo',
  'code.unknown': 'A requisição falhou ({{status}})',
  'field.inviteCode.required': 'O código de convite é obrigatório',
  'field.inviteCode.length': 'O código de convite deve ter de 8 a 10 caracteres',
  'field.inviteCode.charset': 'O código só aceita A-Z e 2-9, sem O, 0, I ou 1',
  'field.recaptcha.required': 'Marque antes a caixa "Não sou um robô"',
  'field.region.name.required': 'O nome da região não pode ficar vazio',
  'field.displayName.required': 'O nome de exibição não pode ficar vazio',
  'field.title.required': 'O título não pode ficar vazio',
  'field.value.required': 'O valor não pode ficar vazio',
  'field.password.min': 'A senha precisa ter pelo menos {{passwordMin}} caracteres',
  'field.password.max': 'A senha não pode passar de {{passwordMax}} caracteres',
  'field.newPassword.min': 'A nova senha precisa ter pelo menos {{passwordMin}} caracteres',
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

  'field.account.min': 'A conta precisa ter pelo menos {{accountMin}} caracteres',
  'field.account.max': 'A conta pode ter no máximo {{accountMax}} caracteres',
  'field.account.charset':
    'Só minúsculas, dígitos, pontos, sublinhados e hífens, começando e terminando com letra ou dígito',
  'field.account.consecutive': 'Pontos, sublinhados e hífens não podem vir seguidos',
  'field.account.invalid': 'Essa conta não está num formato válido',
  'field.shortName.required': 'O short_name não pode ficar vazio',
  'field.shortName.length':
    'O short_name precisa ter de {{shortNameMin}} a {{shortNameMax}} caracteres',
  'field.shortName.charset':
    'O short_name só aceita minúsculas, dígitos e hífens, e não pode começar nem terminar com hífen',
  'field.social.phone': 'Digite um número de 7 a 15 dígitos, opcionalmente com o código + do país',
  'field.social.instagram':
    'O usuário do Instagram não é válido (de 1 a 30 letras, dígitos, pontos ou sublinhados)',
  'field.social.messenger':
    'O usuário do Messenger não é válido (de 5 a 50 letras, dígitos ou pontos)',
  'field.social.unbuildable': 'Esse valor não vira um link que funcione',
  'media.video.format': 'O vídeo precisa ser mp4, chegou {{mimeType}}',
  'media.video.unreadable': 'Este arquivo não é um mp4 válido; não dá para ler a duração',
  'media.video.sizeLimit': 'O vídeo não pode passar de {{max}}, este arquivo tem {{size}}',
  'media.video.durationLimit':
    'O vídeo não pode passar de {{max}} segundos, este clipe tem {{seconds}}',
  'media.image.format': 'As imagens precisam ser JPEG, PNG, WebP ou AVIF, chegou {{mimeType}}',
  'media.image.sizeLimit': 'As imagens não podem passar de {{max}}, este arquivo tem {{size}}',
  'field.url.required': 'O link de destino não pode ficar vazio',
  'field.url.invalid': 'O link de destino não é um endereço válido',
  'field.url.protocol': 'Esse protocolo de link não é permitido',
  'field.account.required': 'A conta não pode ficar vazia',
  'field.password.required': 'A senha não pode ficar vazia',
  'bulk.columns':
    'Cada linha precisa de quatro colunas separadas por tabulação: nome, conta, short_name, senha',
  'field.region.name.max': 'O nome da região pode ter no máximo {{regionNameMax}} caracteres',
  'bulk.duplicateName': 'Este nome já aparece antes no mesmo lote',
};
