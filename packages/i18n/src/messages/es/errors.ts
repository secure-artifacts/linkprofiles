import type { ErrorMessages } from '../types.js';

export const errorsEs: ErrorMessages = {
  'code.unauthorized': 'No has iniciado sesión o la sesión ha caducado',
  'code.forbidden': 'No tienes permiso para hacer eso',
  'code.invalid_credentials': 'Cuenta o contraseña incorrecta',
  'code.account_taken': 'Esa cuenta ya está ocupada',
  'code.short_name_taken': 'Esa dirección de la página ya está ocupada',
  'code.short_name_retired':
    'Esa dirección de la página pertenece a una página de perfil eliminada y nunca se reasigna',
  'code.region_not_found': 'Esa región no existe',
  'code.invite_code_taken': 'Ese código de invitación ya está en uso',
  'code.region_unowned':
    'Esta región todavía no tiene administrador responsable; asigna uno primero',
  'code.registration_closed': 'El registro está cerrado por ahora',
  'code.invite_code_invalid': 'Ese código de invitación no es válido',
  'code.recaptcha_failed': 'La verificación anti-robots falló, marca la casilla de nuevo',
  'code.recaptcha_not_configured':
    'El registro aún no está listo, el administrador no terminó de configurarlo',
  'code.region_name_taken': 'Ese nombre de región ya está en uso',
  'code.region_not_empty': 'Esta región todavía tiene {{count}} usuarios. Muévelos primero.',
  'code.region_is_default': 'No se puede eliminar una región predeterminada',
  'code.not_an_admin': 'Solo se puede asignar a un administrador',
  'code.duplicate_platform': 'Cada plataforma solo se puede activar una vez',
  'code.unknown_platform': 'Plataforma desconocida',
  'code.invalid_body': 'Hay algo incorrecto en el envío, revísalo e inténtalo de nuevo',
  'code.unknown': 'La solicitud falló ({{status}})',
  'field.inviteCode.required': 'El código de invitación es obligatorio',
  'field.inviteCode.length': 'El código de invitación debe tener entre 8 y 10 caracteres',
  'field.inviteCode.charset': 'El código solo admite A-Z y 2-9, sin O, 0, I ni 1',
  'field.recaptcha.required': 'Marca antes la casilla «No soy un robot»',
  'field.region.name.required': 'El nombre de la región no puede estar vacío',
  'field.displayName.required': 'El nombre visible no puede estar vacío',
  'field.title.required': 'El título no puede estar vacío',
  'field.value.required': 'El valor no puede estar vacío',
  'field.password.min': 'La contraseña debe tener al menos {{passwordMin}} caracteres',
  'field.password.max': 'La contraseña no puede superar los {{passwordMax}} caracteres',
  'field.newPassword.min': 'La nueva contraseña debe tener al menos {{passwordMin}} caracteres',
  'query.exclusiveScope': 'No se pueden indicar userId y profileId a la vez',
  'apiKey.expiryInPast': 'La caducidad debe ser posterior a ahora',
  'entry.limitReached': 'Una página admite como máximo {{max}} enlaces personalizados',
  'contact.invalidValue': 'Ese valor de contacto no tiene un formato válido',
  'contact.unknownPlatform': 'Esa plataforma de contacto no es compatible',
  'contact.notOnPage':
    'Ese contacto aún no está en la página; envía createMissing=true para añadirlo automáticamente',
  'media.invalidSlot': 'Espacio desconocido: {{slot}}',
  'media.missingFile': 'No se recibió ningún archivo',
  'media.videoOnlyOnAvatar': 'Solo el espacio del avatar admite vídeo',
  'media.posterRequired':
    'Un vídeo necesita su primer fotograma junto a él; sube una portada a mano si el navegador no pudo obtenerla',
  'media.notMultipart': 'Envía esto como multipart/form-data',
  'media.fileTooLarge':
    'Archivo demasiado grande. Las imágenes se limitan a {{imageMb}} MB y los vídeos a {{videoMb}} MB',
  'adminDist.missing':
    'Falta la compilación del panel en {{root}}. Ejecuta pnpm --filter @link-profile/admin build y reinicia.',
  'conflict.accountTaken': 'La cuenta {{account}} ya existe',
  'conflict.shortNameTaken': 'La dirección de la página {{shortName}} ya está ocupada',
  'conflict.shortNameRetired':
    'La dirección de la página {{shortName}} pertenece a una página de perfil eliminada y nunca se reasigna',
  'field.atLeastOne': 'Envía al menos un campo para actualizar',

  'field.account.min': 'La cuenta debe tener al menos {{accountMin}} caracteres',
  'field.account.max': 'La cuenta puede tener como máximo {{accountMax}} caracteres',
  'field.account.charset':
    'Solo minúsculas, dígitos, puntos, guiones bajos y guiones, empezando y terminando por letra o dígito',
  'field.account.consecutive': 'Los puntos, guiones bajos y guiones no pueden ir seguidos',
  'field.account.invalid': 'Esa cuenta no tiene un formato válido',
  'field.shortName.required': 'La dirección de la página no puede estar vacía',
  'field.shortName.length':
    'La dirección de la página debe tener entre {{shortNameMin}} y {{shortNameMax}} caracteres',
  'field.shortName.charset':
    'La dirección de la página solo admite minúsculas, dígitos y guiones, y no puede empezar ni terminar por guion',
  'field.social.phone': 'Escribe un número de 7 a 15 dígitos, opcionalmente con el prefijo +',
  'field.social.instagram':
    'El usuario de Instagram no es válido (de 1 a 30 letras, dígitos, puntos o guiones bajos)',
  'field.social.messenger':
    'El usuario de Messenger no es válido (de 5 a 50 letras, dígitos o puntos)',
  'field.social.unbuildable': 'Con ese valor no se puede formar un enlace que funcione',
  'media.video.format': 'El vídeo debe ser mp4, se recibió {{mimeType}}',
  'media.video.unreadable': 'Este archivo no es un mp4 válido; no se puede leer su duración',
  'media.video.sizeLimit': 'El vídeo no puede superar {{max}}, este archivo ocupa {{size}}',
  'media.video.durationLimit':
    'El vídeo no puede superar {{max}} segundos, este clip dura {{seconds}}',
  'media.image.format': 'Las imágenes deben ser JPEG, PNG, WebP o AVIF, se recibió {{mimeType}}',
  'media.image.sizeLimit': 'Las imágenes no pueden superar {{max}}, este archivo ocupa {{size}}',
  'field.url.required': 'El enlace de destino no puede estar vacío',
  'field.url.invalid': 'El enlace de destino no es una dirección válida',
  'field.url.protocol': 'Ese protocolo de enlace no está permitido',
  'field.account.required': 'La cuenta no puede estar vacía',
  'field.password.required': 'La contraseña no puede estar vacía',
  'bulk.columns':
    'Cada fila necesita cuatro columnas separadas por tabulador: nombre, cuenta, short_name, contraseña',
  'field.region.name.max':
    'El nombre de la región puede tener como máximo {{regionNameMax}} caracteres',
  'bulk.duplicateName': 'Este nombre ya aparece antes en el mismo lote',
};
