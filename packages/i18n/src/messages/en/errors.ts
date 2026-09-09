/**
 * 报错文案。两类消费方共用一份：服务端按请求语言渲染自己产出的 message，
 * 后台把服务端返回的 error 码翻成人话。错误码本身是机器契约，不随语言变化。
 */
export const errorsEn = {
  'code.unauthorized': 'Not signed in, or the session has expired',
  'code.forbidden': 'You do not have permission to do that',
  'code.invalid_credentials': 'Wrong account or password',
  'code.account_taken': 'That account is already taken',
  'code.short_name_taken': 'That short_name is already taken',
  'code.short_name_retired':
    'That short_name belongs to a deleted profile page and is never reassigned',
  'code.region_not_found': 'That region does not exist',
  'code.invite_code_taken': 'That invite code is already in use',
  'code.region_unowned': 'This region has no owning admin yet; assign one first',
  'code.registration_closed': 'Sign-up is closed right now',
  'code.invite_code_invalid': 'That invite code is not valid',
  'code.recaptcha_failed': 'The robot check failed, please tick the box again',
  'code.recaptcha_not_configured':
    'Sign-up is not ready yet, the administrator has not finished setting it up',
  'code.region_name_taken': 'That region name is already taken',
  'code.region_not_empty': 'This region still has {{count}} users. Move them out first.',
  'code.region_is_default': 'A default region cannot be deleted',
  'code.not_an_admin': 'Can only be assigned to an admin',
  'code.duplicate_platform': 'Each platform can only be enabled once',
  'code.unknown_platform': 'Unknown platform',
  'code.invalid_body': 'Something in the submission is wrong, check it and try again',
  'code.unknown': 'Request failed ({{status}})',

  'field.inviteCode.required': 'Invite code is required',
  'field.inviteCode.length': 'Invite code must be 8 to 10 characters',
  'field.inviteCode.charset': 'Invite code may only use A-Z and 2-9, without O, 0, I or 1',
  'field.recaptcha.required': 'Tick the "I am not a robot" box first',
  'field.region.name.required': 'Region name cannot be empty',
  'field.displayName.required': 'Display name cannot be empty',
  'field.title.required': 'Title cannot be empty',
  'field.value.required': 'Value cannot be empty',
  'field.password.min': 'Password must be at least {{passwordMin}} characters',
  'field.password.max': 'Password cannot exceed {{passwordMax}} characters',
  'field.newPassword.min': 'New password must be at least {{passwordMin}} characters',

  'query.exclusiveScope': 'userId and profileId cannot both be given',
  'apiKey.expiryInPast': 'The expiry must be later than now',
  'entry.limitReached': 'A page can hold at most {{max}} custom links',
  'contact.invalidValue': 'That contact value is not in a valid format',
  'contact.unknownPlatform': 'That contact platform is not supported',
  'contact.notOnPage':
    'That contact is not on the page yet; pass createMissing=true to add it automatically',

  'media.invalidSlot': 'Unknown slot: {{slot}}',
  'media.missingFile': 'No file received',
  'media.videoOnlyOnAvatar': 'Only the avatar slot takes a video',
  'media.posterRequired':
    'A video needs its first frame submitted alongside it; upload a poster by hand if the browser could not grab one',
  'media.notMultipart': 'Submit this as multipart/form-data',
  'media.fileTooLarge':
    'File too large. Images are capped at {{imageMb}} MB, videos at {{videoMb}} MB',

  'adminDist.missing':
    'Admin build output is missing at {{root}}. Run pnpm --filter @link-profile/admin build, then restart.',

  'conflict.accountTaken': 'The account {{account}} already exists',
  'conflict.shortNameTaken': 'The short_name {{shortName}} is already taken',
  'conflict.shortNameRetired':
    'The short_name {{shortName}} belongs to a deleted profile page and is never reassigned',
  'field.atLeastOne': 'Submit at least one field to update',

  'field.account.min': 'Account must be at least {{accountMin}} characters',
  'field.account.max': 'Account can be at most {{accountMax}} characters',
  'field.account.charset':
    'Only lowercase letters, digits, dots, underscores and hyphens, starting and ending with a letter or digit',
  'field.account.consecutive': 'Dots, underscores and hyphens cannot appear back to back',
  'field.account.invalid': 'That account is not in a valid format',
  'field.shortName.required': 'short_name cannot be empty',
  'field.shortName.length': 'short_name must be {{shortNameMin}} to {{shortNameMax}} characters',
  'field.shortName.charset':
    'short_name may only use lowercase letters, digits and hyphens, and cannot start or end with a hyphen',
  'field.social.phone': 'Enter a 7 to 15 digit phone number, optionally with a + country code',
  'field.social.instagram':
    'Instagram username is not valid (1 to 30 letters, digits, dots or underscores)',
  'field.social.messenger': 'Messenger username is not valid (5 to 50 letters, digits or dots)',
  'field.social.unbuildable': 'That value cannot be turned into a working link',
  'media.video.format': 'Video must be mp4, got {{mimeType}}',
  'media.video.unreadable': 'This file is not a valid mp4; its duration cannot be read',
  'media.video.sizeLimit': 'Video cannot exceed {{max}}, this file is {{size}}',
  'media.video.durationLimit':
    'Video cannot exceed {{max}} seconds, this clip is {{seconds}} seconds',
  'media.image.format': 'Images must be JPEG, PNG, WebP or AVIF, got {{mimeType}}',
  'media.image.sizeLimit': 'Images cannot exceed {{max}}, this file is {{size}}',
  'field.url.required': 'Target link cannot be empty',
  'field.url.invalid': 'Target link is not a valid address',
  'field.url.protocol': 'That link protocol is not allowed',
  'field.account.required': 'Account cannot be empty',
  'field.password.required': 'Password cannot be empty',
  'bulk.columns': 'Each row needs four tab-separated columns: name, account, short_name, password',
} as const;
