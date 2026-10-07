/** Mọi lỗi của module đều kế thừa lớp này để project chính dễ bắt (catch). */
export class ImageEnhancementError extends Error {
  override readonly name: string = "ImageEnhancementError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

/** Dữ liệu không phải ảnh hợp lệ hoặc ảnh bị hỏng. */
export class InvalidImageError extends ImageEnhancementError {
  override readonly name: string = "InvalidImageError";
}

/** Định dạng ảnh không được hỗ trợ. */
export class UnsupportedFormatError extends ImageEnhancementError {
  override readonly name: string = "UnsupportedFormatError";
}

/** Ảnh vượt giới hạn dung lượng hoặc số pixel cho phép. */
export class ImageTooLargeError extends ImageEnhancementError {
  override readonly name: string = "ImageTooLargeError";
}
