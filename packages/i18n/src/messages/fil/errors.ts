import type { ErrorMessages } from '../types.js';

export const errorsFil: ErrorMessages = {
  'code.unauthorized': 'Hindi naka-sign in, o nag-expire na ang session',
  'code.forbidden': 'Wala kang pahintulot para dito',
  'code.invalid_credentials': 'Mali ang account o password',
  'code.account_taken': 'Ginagamit na ang account na iyan',
  'code.short_name_taken': 'Ginagamit na ang address ng pahina na iyan',
  'code.short_name_retired':
    'Ang address ng pahina na iyan ay pag-aari ng isang binurang profile page at hindi na muling ibibigay',
  'code.region_not_found': 'Wala ang rehiyong iyon',
  'code.invite_code_taken': 'Ginagamit na ang invite code na iyon',
  'code.region_unowned': 'Wala pang owning admin ang rehiyong ito; magtalaga muna',
  'code.registration_closed': 'Sarado muna ang pag-sign up',
  'code.invite_code_invalid': 'Hindi valid ang invite code na iyon',
  'code.recaptcha_failed': 'Hindi pumasa ang robot check, lagyan ulit ng tsek ang kahon',
  'code.recaptcha_not_configured':
    'Hindi pa handa ang pag-sign up, hindi pa tapos i-setup ng administrator',
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
  'field.recaptcha.required': 'Lagyan muna ng tsek ang "I am not a robot"',
  'field.region.name.required': 'Hindi puwedeng walang laman ang pangalan ng rehiyon',
  'field.displayName.required': 'Hindi puwedeng walang laman ang display name',
  'field.title.required': 'Hindi puwedeng walang laman ang pamagat',
  'field.value.required': 'Hindi puwedeng walang laman ang nilalaman',
  'field.password.min': 'Kailangang hindi bababa sa {{passwordMin}} karakter ang password',
  'field.password.max': 'Hindi puwedeng lumampas sa {{passwordMax}} karakter ang password',
  'field.newPassword.min':
    'Kailangang hindi bababa sa {{passwordMin}} karakter ang bagong password',

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
  'conflict.shortNameTaken': 'Ginagamit na ang address ng pahina na {{shortName}}',
  'conflict.shortNameRetired':
    'Ang address ng pahina na {{shortName}} ay pag-aari ng binurang profile page at hindi na muling ibibigay',
  'field.atLeastOne': 'Magsumite ng kahit isang field na ia-update',

  'field.account.min': 'Kailangang hindi bababa sa {{accountMin}} karakter ang account',
  'field.account.max': 'Hanggang {{accountMax}} karakter lang ang account',
  'field.account.charset':
    'Maliliit na titik, numero, tuldok, underscore at gitling lang, at kailangang titik o numero ang simula at dulo',
  'field.account.consecutive': 'Hindi puwedeng magkasunod ang tuldok, underscore at gitling',
  'field.account.invalid': 'Hindi tama ang format ng account na iyan',
  'field.shortName.required': 'Hindi puwedeng walang laman ang address ng pahina',
  'field.shortName.length':
    'Kailangang {{shortNameMin}} hanggang {{shortNameMax}} karakter ang address ng pahina',
  'field.shortName.charset':
    'Maliliit na titik, numero at gitling lang ang puwede sa address ng pahina, at hindi ito puwedeng magsimula o magtapos sa gitling',
  'field.social.phone': 'Maglagay ng 7 hanggang 15 digit na numero, puwedeng may + country code',
  'field.social.instagram':
    'Hindi tama ang Instagram username (1 hanggang 30 titik, numero, tuldok o underscore)',
  'field.social.messenger':
    'Hindi tama ang Messenger username (5 hanggang 50 titik, numero o tuldok)',
  'field.social.unbuildable': 'Hindi magagawang gumaganang link ang halagang iyan',
  'media.video.format': 'Kailangang mp4 ang video, {{mimeType}} ang natanggap',
  'media.video.unreadable': 'Hindi wastong mp4 ang file na ito; hindi mabasa ang haba nito',
  'media.video.sizeLimit': 'Hindi puwedeng lumampas sa {{max}} ang video, {{size}} ang file na ito',
  'media.video.durationLimit':
    'Hindi puwedeng lumampas sa {{max}} segundo ang video, {{seconds}} segundo ang clip na ito',
  'media.image.format': 'Kailangang JPEG, PNG, WebP o AVIF ang larawan, {{mimeType}} ang natanggap',
  'media.image.sizeLimit':
    'Hindi puwedeng lumampas sa {{max}} ang larawan, {{size}} ang file na ito',
  'field.url.required': 'Hindi puwedeng walang laman ang target na link',
  'field.url.invalid': 'Hindi wastong address ang target na link',
  'field.url.protocol': 'Hindi pinapayagan ang protocol ng link na iyan',
  'field.account.required': 'Hindi puwedeng walang laman ang account',
  'field.password.required': 'Hindi puwedeng walang laman ang password',
  'bulk.columns':
    'Kailangan ng bawat hilera ng apat na hanay na pinaghihiwalay ng tab: pangalan, account, short_name, password',
  'field.region.name.max': 'Hanggang {{regionNameMax}} karakter lang ang pangalan ng rehiyon',
  'bulk.duplicateName': 'Lumitaw na ang pangalang ito sa mas maaga sa parehong batch',
};
