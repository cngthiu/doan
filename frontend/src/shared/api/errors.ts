import axios from 'axios'

const messages: Record<string, string> = {
  ROOM_CODE_EXISTS: 'Mã phòng đã tồn tại.',
  CANDIDATE_CODE_EXISTS: 'Mã thí sinh đã tồn tại.',
  SESSION_CODE_EXISTS: 'Mã phiên thi đã tồn tại.',
  SEAT_CODE_DUPLICATE: 'Mã ghế bị trùng trong phòng.',
  SEAT_OUTSIDE_FRAME: 'Vị trí ghế phải nằm hoàn toàn trong vùng hiệu chỉnh.',
  SEAT_NOT_IN_SESSION_ROOM: 'Ghế không thuộc phòng của phiên thi.',
  CANDIDATE_ALREADY_ASSIGNED: 'Một thí sinh không thể được xếp vào nhiều ghế.',
  SEAT_ALREADY_ASSIGNED: 'Một ghế không thể được xếp cho nhiều thí sinh.',
  ROOM_INACTIVE: 'Phòng đã ngừng hoạt động.',
  SEAT_INACTIVE: 'Ghế đã ngừng hoạt động.',
  SESSION_NOT_READY: 'Phiên thi chưa đủ điều kiện để chuyển sang sẵn sàng.',
  INVALID_SESSION_STATE: 'Trạng thái phiên thi không hợp lệ.',
  FORBIDDEN: 'Bạn không có quyền thực hiện thao tác này.',
  INVALID_VIDEO_EXTENSION: 'Vui lòng sử dụng tệp MP4 hợp lệ.',
  INVALID_VIDEO: 'Không thể đọc video này. Vui lòng sử dụng tệp MP4 hợp lệ.',
  INVALID_VIDEO_CONTAINER: 'Tệp tải lên không phải MP4 hợp lệ.',
  UNSUPPORTED_VIDEO_CODEC: 'Video MP4 phải sử dụng codec H.264.',
  VIDEO_EMPTY: 'Tệp video đang trống.',
  VIDEO_TOO_LARGE: 'Video vượt quá dung lượng tải lên cho phép.',
  MEDIA_SAVE_FAILED: 'Không thể lưu video. Vui lòng thử lại.',
  MEDIA_FILE_MISSING: 'Tệp video không còn khả dụng trên máy chủ.',
}

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

export function apiErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) {
    return 'Đã xảy ra lỗi. Vui lòng thử lại.'
  }
  const code = error.response?.data?.error?.code
  if (code && messages[code]) return messages[code]
  if (!error.response) return 'Không thể kết nối tới máy chủ.'
  return error.response.data?.error?.message ?? 'Yêu cầu không thể hoàn tất.'
}
