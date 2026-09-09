import type { ErrorMessages } from '../types.js';

export const errorsEs: ErrorMessages = {
  'code.unauthorized': 'No has iniciado sesión o la sesión ha caducado',
  'code.forbidden': 'No tienes permiso para hacer eso',
  'code.invalid_credentials': 'Cuenta o contraseña incorrecta',
  'code.account_taken': 'Esa cuenta ya está ocupada',
  'code.short_name_taken': 'Ese short_name ya está ocupado',
  'code.short_name_retired':
    'Ese short_name pertenece a una página de perfil eliminada y nunca se reasigna',
  'code.not_an_admin': 'Solo se puede asignar a un administrador',
  'code.duplicate_platform': 'Cada plataforma solo se puede activar una vez',
  'code.unknown_platform': 'Plataforma desconocida',
  'code.invalid_body': 'Hay algo incorrecto en el envío, revísalo e inténtalo de nuevo',
  'code.unknown': 'La solicitud falló ({{status}})',
  'field.displayName.required': 'El nombre visible no puede estar vacío',
  'field.title.required': 'El título no puede estar vacío',
  'field.value.required': 'El valor no puede estar vacío',
  'field.password.min': 'La contraseña debe tener al menos {{min}} caracteres',
  'field.newPassword.min': 'La nueva contraseña debe tener al menos {{min}} caracteres',
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
  'conflict.shortNameTaken': 'El short_name {{shortName}} ya está ocupado',
  'conflict.shortNameRetired':
    'El short_name {{shortName}} pertenece a una página de perfil eliminada y nunca se reasigna',
  'field.atLeastOne': 'Envía al menos un campo para actualizar',
};
