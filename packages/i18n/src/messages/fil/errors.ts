import type { ErrorMessages } from '../types.js';

export const errorsFil: ErrorMessages = {
  'code.unauthorized': 'Hindi naka-sign in, o nag-expire na ang session',
  'code.forbidden': 'Wala kang pahintulot para dito',
  'code.invalid_credentials': 'Mali ang account o password',
  'code.account_taken': 'Ginagamit na ang account na iyan',
  'code.short_name_taken': 'Ginagamit na ang short_name na iyan',
  'code.short_name_retired':
    'Ang short_name na iyan ay pag-aari ng isang binurang profile page at hindi na muling ibibigay',
  'code.region_not_found': 'Wala ang rehiyong iyon',
  'code.invite_code_taken': 'Ginagamit na ang invite code na iyon',
  'code.region_unowned': 'Wala pang owning admin ang rehiyong ito; magtalaga muna',
  'code.registration_closed': 'Sarado muna ang pag-sign up',
  'code.invite_code_invalid': 'Hindi valid ang invite code na iyon',
  'code.region_name_taken': 'Ginagamit na ang pangalang ito ng rehiyon',
  'code.region_not_empty': 'May {{count}} user pa ang rehiyong ito. Ilipat muna sila.',
  'code.region_is_default': 'Hindi puwedeng burahin ang default na rehiyon',
  'code.not_an_admin': 'Sa admin lang puwedeng i-assign',
  'code.duplicate_platform': 'Isang beses lang puwedeng buksan ang bawat platform',
  'code.unknown_platform': 'Hindi kilalang platform',
  'code.invalid_body': 'May mali sa isinumite, pakisuri at subukan ulit',
  'code.unknown': 'Nabigo ang request ({{status}})',

  'field.inviteCode.required': 'Kailangan ang invite code',
  'field.inviteCode.length': 'Dapat 8 hanggang 10 karakter ang invite code',
  'field.inviteCode.charset': 'A-Z at 2-9 lang ang puwede, walang O, 0, I o 1',
  'field.region.name.required': 'Hindi puwedeng walang laman ang pangalan ng rehiyon',
  'field.displayName.required': 'Hindi puwedeng walang laman ang display name',
  'field.title.required': 'Hindi puwedeng walang laman ang pamagat',
  'field.value.required': 'Hindi puwedeng walang laman ang nilalaman',
  'field.password.min': 'Kailangang hindi bababa sa {{min}} karakter ang password',
  'field.newPassword.min': 'Kailangang hindi bababa sa {{min}} karakter ang bagong password',

  'query.exclusiveScope': 'Hindi puwedeng sabay na ibigay ang userId at profileId',
  'apiKey.expiryInPast': 'Kailangang mas huli sa kasalukuyang oras ang expiry',
  'entry.limitReached': 'Hanggang {{max}} custom link lang ang kasya sa isang page',
  'contact.invalidValue': 'Hindi tama ang format ng contact na iyan',
  'contact.unknownPlatform': 'Hindi suportado ang contact platform na iyan',
  'contact.notOnPage':
    'Wala pa sa page ang contact na iyan; ipasa ang createMissing=true para awtomatiko itong maidagdag',

  'media.invalidSlot': 'Hindi kilalang slot: {{slot}}',
  'media.missingFile': 'Walang natanggap na file',
  'media.videoOnlyOnAvatar': 'Sa avatar slot lang puwede ang video',
  'media.posterRequired':
    'Kailangang isabay ang unang frame ng video; mag-upload ng poster nang manu-mano kung hindi ito nakuha ng browser',
  'media.notMultipart': 'Isumite ito bilang multipart/form-data',
  'media.fileTooLarge':
    'Masyadong malaki ang file. Hanggang {{imageMb}} MB ang larawan, {{videoMb}} MB ang video',

  'adminDist.missing':
    'Wala ang admin build output sa {{root}}. Patakbuhin ang pnpm --filter @link-profile/admin build, tapos i-restart.',

  'conflict.accountTaken': 'Umiiral na ang account na {{account}}',
  'conflict.shortNameTaken': 'Ginagamit na ang short_name na {{shortName}}',
  'conflict.shortNameRetired':
    'Ang short_name na {{shortName}} ay pag-aari ng binurang profile page at hindi na muling ibibigay',
  'field.atLeastOne': 'Magsumite ng kahit isang field na ia-update',
};
