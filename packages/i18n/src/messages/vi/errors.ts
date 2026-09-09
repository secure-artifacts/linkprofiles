import type { ErrorMessages } from '../types.js';

export const errorsVi: ErrorMessages = {
  'code.unauthorized': 'Chưa đăng nhập, hoặc phiên đã hết hạn',
  'code.forbidden': 'Bạn không có quyền làm việc đó',
  'code.invalid_credentials': 'Sai tài khoản hoặc mật khẩu',
  'code.account_taken': 'Tài khoản đó đã có người dùng',
  'code.short_name_taken': 'short_name đó đã có người dùng',
  'code.short_name_retired':
    'short_name đó thuộc về một trang hồ sơ đã xoá và không bao giờ được cấp lại',
  'code.not_an_admin': 'Chỉ có thể giao cho quản trị viên',
  'code.duplicate_platform': 'Mỗi nền tảng chỉ bật được một lần',
  'code.unknown_platform': 'Nền tảng không xác định',
  'code.invalid_body': 'Có chỗ chưa đúng trong nội dung gửi lên, kiểm tra rồi thử lại',
  'code.unknown': 'Yêu cầu thất bại ({{status}})',
  'field.displayName.required': 'Tên hiển thị không được để trống',
  'field.title.required': 'Tiêu đề không được để trống',
  'field.value.required': 'Giá trị không được để trống',
  'field.password.min': 'Mật khẩu phải có ít nhất {{min}} ký tự',
  'field.newPassword.min': 'Mật khẩu mới phải có ít nhất {{min}} ký tự',
  'query.exclusiveScope': 'Không thể đưa cả userId lẫn profileId',
  'apiKey.expiryInPast': 'Hạn dùng phải muộn hơn thời điểm hiện tại',
  'entry.limitReached': 'Một trang chứa tối đa {{max}} liên kết tự đặt',
  'contact.invalidValue': 'Giá trị liên hệ đó sai định dạng',
  'contact.unknownPlatform': 'Nền tảng liên hệ đó không được hỗ trợ',
  'contact.notOnPage': 'Liên hệ đó chưa có trên trang; gửi createMissing=true để thêm tự động',
  'media.invalidSlot': 'Vị trí không xác định: {{slot}}',
  'media.missingFile': 'Không nhận được tệp nào',
  'media.videoOnlyOnAvatar': 'Chỉ vị trí ảnh đại diện mới nhận video',
  'media.posterRequired':
    'Video cần kèm khung hình đầu tiên; hãy tự tải ảnh bìa lên nếu trình duyệt không lấy được',
  'media.notMultipart': 'Hãy gửi dưới dạng multipart/form-data',
  'media.fileTooLarge': 'Tệp quá lớn. Ảnh tối đa {{imageMb}} MB, video tối đa {{videoMb}} MB',
  'adminDist.missing':
    'Không thấy bản build của trang quản trị ở {{root}}. Chạy pnpm --filter @link-profile/admin build rồi khởi động lại.',
  'conflict.accountTaken': 'Tài khoản {{account}} đã tồn tại',
  'conflict.shortNameTaken': 'short_name {{shortName}} đã có người dùng',
  'conflict.shortNameRetired':
    'short_name {{shortName}} thuộc về một trang hồ sơ đã xoá và không bao giờ được cấp lại',
  'field.atLeastOne': 'Hãy gửi ít nhất một trường cần cập nhật',
};
