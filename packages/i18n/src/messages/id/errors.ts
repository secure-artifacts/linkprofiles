import type { ErrorMessages } from '../types.js';

export const errorsId: ErrorMessages = {
  'code.unauthorized': 'Belum masuk, atau sesi sudah kedaluwarsa',
  'code.forbidden': 'Kamu tidak punya izin untuk melakukan itu',
  'code.invalid_credentials': 'Akun atau kata sandi salah',
  'code.account_taken': 'Akun itu sudah dipakai',
  'code.short_name_taken': 'short_name itu sudah dipakai',
  'code.short_name_retired':
    'short_name itu milik halaman profil yang sudah dihapus dan tidak pernah dipakai lagi',
  'code.not_an_admin': 'Hanya bisa ditugaskan ke admin',
  'code.duplicate_platform': 'Setiap platform hanya bisa diaktifkan sekali',
  'code.unknown_platform': 'Platform tidak dikenal',
  'code.invalid_body': 'Ada yang salah pada kiriman, periksa lalu coba lagi',
  'code.unknown': 'Permintaan gagal ({{status}})',
  'field.displayName.required': 'Nama tampilan tidak boleh kosong',
  'field.title.required': 'Judul tidak boleh kosong',
  'field.value.required': 'Isian tidak boleh kosong',
  'field.password.min': 'Kata sandi minimal {{min}} karakter',
  'field.newPassword.min': 'Kata sandi baru minimal {{min}} karakter',
  'query.exclusiveScope': 'userId dan profileId tidak boleh diberikan bersamaan',
  'apiKey.expiryInPast': 'Masa berlaku harus lebih baru dari sekarang',
  'entry.limitReached': 'Satu halaman menampung maksimal {{max}} tautan khusus',
  'contact.invalidValue': 'Format nilai kontak itu tidak valid',
  'contact.unknownPlatform': 'Platform kontak itu tidak didukung',
  'contact.notOnPage':
    'Kontak itu belum ada di halaman; kirim createMissing=true agar ditambahkan otomatis',
  'media.invalidSlot': 'Slot tidak dikenal: {{slot}}',
  'media.missingFile': 'Tidak ada berkas yang diterima',
  'media.videoOnlyOnAvatar': 'Hanya slot avatar yang menerima video',
  'media.posterRequired':
    'Video perlu disertai bingkai pertamanya; unggah sampul secara manual jika peramban gagal mengambilnya',
  'media.notMultipart': 'Kirim ini sebagai multipart/form-data',
  'media.fileTooLarge':
    'Berkas terlalu besar. Gambar dibatasi {{imageMb}} MB, video {{videoMb}} MB',
  'adminDist.missing':
    'Hasil build panel tidak ada di {{root}}. Jalankan pnpm --filter @link-profile/admin build lalu mulai ulang.',
  'conflict.accountTaken': 'Akun {{account}} sudah ada',
  'conflict.shortNameTaken': 'short_name {{shortName}} sudah dipakai',
  'conflict.shortNameRetired':
    'short_name {{shortName}} milik halaman profil yang sudah dihapus dan tidak pernah dipakai lagi',
  'field.atLeastOne': 'Kirim setidaknya satu kolom untuk diperbarui',
};
