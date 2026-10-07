# Tài liệu kỹ thuật: Image Enhancement Module

> Trạng thái: bản nháp v0.1 (giai đoạn thiết kế quy trình, chưa triển khai code)
> Ngôn ngữ: TypeScript · Thư viện xử lý ảnh đề xuất: Sharp

---

## 1. Mục tiêu

Xây dựng một **module TypeScript nhỏ gọn**, tích hợp vào dự án chính, có nhiệm vụ:

> Nhận một ảnh khảo sát khu vực/công trình có chất lượng chưa tối ưu → cải thiện chất lượng → trả về ảnh tốt hơn.

Flow cốt lõi:

```
Image In  →  Image Enhancement Module  →  Image Out
```

Module **không phải một hệ thống hoàn chỉnh**. Nó chỉ là một thành phần mà project chính gọi qua một interface rõ ràng.

## 2. Phạm vi

**Module có trách nhiệm**

- Nhận ảnh đầu vào và kiểm tra tính hợp lệ
- Tiền xử lý (giải mã, sửa chiều xoay)
- Cải thiện chất lượng: khử nhiễu, cân sáng/tương phản, làm nét
- Mã hóa và trả ảnh kết quả
- Cung cấp interface và lỗi có kiểu rõ ràng cho project chính

**Module không chịu trách nhiệm**

- Giao diện người dùng, hệ thống upload, xác thực, database
- Lưu trữ ảnh, quản lý người dùng, dashboard
- Business logic của project chính, triển khai toàn hệ thống
- Xử lý hàng loạt (project chính tự lặp qua từng ảnh)

## 3. Quyết định thiết kế đã chốt

| Hạng mục | Quyết định |
|---|---|
| Ngôn ngữ | TypeScript (đồng nhất với project chính) |
| Hướng tiếp cận | Xử lý ảnh truyền thống, **không** huấn luyện mô hình, không cần dataset lớn |
| Kích thước ảnh | **Giữ nguyên**, không phóng to, không cắt, không đổi tỉ lệ |
| Trọng tâm cải thiện | Khử nhiễu, cân sáng/tương phản, làm nét |
| Cách xử lý | Từng ảnh một, hàm không giữ trạng thái |
| Cách nhận ảnh | Ảnh truyền trực tiếp vào (`Buffer`) |
| Môi trường chạy | Máy tính cá nhân (CPU) |
| Ảnh mẫu "sau cải thiện" | Chỉ để minh họa kết quả mong muốn, **không phải ground truth** |

## 4. Input và Output

### Input

- Định dạng dự kiến: JPEG, PNG, WEBP
- Dữ liệu: `Buffer` chứa ảnh
- Định dạng chính thức và giới hạn kích thước: **chưa chốt**, cần xác nhận với project chính

### Output

- Ảnh đã cải thiện, cùng kích thước với ảnh vào
- Kèm thông tin: định dạng, chiều rộng, chiều cao

## 5. Quy trình xử lý

```
┌────────────┐   ┌──────────────────┐   ┌────────────┐   ┌──────────────┐
│ 1. Kiểm tra │ → │ 2. Giải mã +     │ → │ 3. Khử     │ → │ 4. Cân sáng/ │
│    đầu vào  │   │    sửa chiều xoay│   │    nhiễu   │   │    tương phản│
└────────────┘   └──────────────────┘   └────────────┘   └──────┬───────┘
                                                                │
                                         ┌────────────┐   ┌─────▼────────┐
                              Ảnh ra  ←  │ 6. Mã hóa  │ ← │ 5. Làm nét   │
                                         └────────────┘   └──────────────┘
```

### Lý do chọn thứ tự này

1. **Khử nhiễu trước khi làm nét.** Làm nét khuếch đại mọi thứ có tính cạnh, kể cả nhiễu. Làm nét trước rồi mới khử nhiễu sẽ cho kết quả kém.
2. **Cân sáng trước khi làm nét.** Việc kéo vùng tối lên làm lộ thêm nhiễu và thay đổi độ tương phản của cạnh. Làm nét ở cuối cho cạnh rõ nhất trên ảnh đã ổn định về độ sáng.
3. **Mã hóa ở cuối cùng** để tránh nén mất dữ liệu nhiều lần.

## 6. Chi tiết từng bước

### Bước 1. Kiểm tra đầu vào (Validation)

| Kiểm tra | Hành động khi lỗi |
|---|---|
| Có phải dữ liệu ảnh hợp lệ, không bị hỏng | Ném `InvalidImageError` |
| Định dạng có được hỗ trợ | Ném `UnsupportedFormatError` |
| Kích thước vượt giới hạn | Ném `ImageTooLargeError` |

### Bước 2. Giải mã và sửa chiều xoay

- Đọc ảnh, đọc metadata EXIF
- Xoay ảnh đúng chiều theo EXIF orientation (ảnh điện thoại hay bị xoay sai)
- Xử lý ảnh có kênh alpha và không gian màu khác sRGB (chuyển về sRGB nếu cần)

### Bước 3. Khử nhiễu

- Mục đích: giảm hạt nhiễu, nhất là ở vùng tối và ảnh trong nhà
- Công cụ trong Sharp: `median()` hoặc `blur()` với mức rất nhẹ
- Rủi ro: khử quá tay làm bề mặt như bị sáp hóa và **mất vết nứt nhỏ**

### Bước 4. Cân sáng và tương phản

- Mục đích: kéo vùng tối lên, giữ vùng sáng không bị cháy, tăng tương phản cục bộ
- Công cụ trong Sharp: `clahe()`, `normalise()`, `gamma()`, `modulate()`
- Rủi ro: tăng tương phản quá mức làm màu sai lệch hoặc làm lộ nhiễu

### Bước 5. Làm nét

- Mục đích: làm rõ cạnh (vết nứt, khe gạch, chữ)
- Công cụ trong Sharp: `sharpen()` (unsharp mask)
- Rủi ro: làm nét quá tay sinh viền sáng quanh cạnh (halo)

### Bước 6. Mã hóa

- Xuất `Buffer` theo định dạng yêu cầu (mặc định: giữ định dạng đầu vào)
- Với JPEG/WEBP: cho phép cấu hình chất lượng nén

## 7. Cấu hình mức xử lý

Tham số **không viết cứng trong code**, đặt trong cấu hình theo ba mức:

| Mức | Dùng khi | Đặc điểm |
|---|---|---|
| `light` | Ảnh đã khá tốt | Can thiệp tối thiểu |
| `standard` | Mặc định | Cân bằng giữa cải thiện và an toàn chi tiết |
| `strong` | Ảnh rất mờ, nhiễu hoặc thiếu sáng | Can thiệp mạnh, rủi ro mất chi tiết cao hơn |

Giá trị tham số cụ thể (cường độ khử nhiễu, sigma và ngưỡng của sharpen, giới hạn của CLAHE) sẽ được **xác định bằng thử nghiệm** trên bộ ảnh mẫu ở giai đoạn baseline, chưa chốt ở tài liệu này.

### Chế độ thích ứng (mở rộng)

Đo nhanh độ sáng trung bình và mức nhiễu của ảnh để tự chọn mức xử lý, vì ảnh ngoài trời nắng gắt và ảnh trong nhà thiếu sáng cần mức khác nhau.

## 8. Interface của module

```ts
type ImageFormat = 'jpeg' | 'png' | 'webp';
type EnhanceLevel = 'light' | 'standard' | 'strong';

interface ImageInput {
  data: Buffer;
  format?: ImageFormat; // tự phát hiện nếu không truyền
}

interface EnhanceOptions {
  level?: EnhanceLevel;        // mặc định: 'standard'
  outputFormat?: ImageFormat;  // mặc định: giữ định dạng đầu vào
  quality?: number;            // chất lượng nén (jpeg/webp)
}

interface ImageOutput {
  data: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
}

interface ImageEnhancementModule {
  enhance(input: ImageInput, options?: EnhanceOptions): Promise<ImageOutput>;
}
```

### Lỗi có kiểu

```ts
class InvalidImageError extends Error {}
class UnsupportedFormatError extends Error {}
class ImageTooLargeError extends Error {}
```

Project chính **không cần biết** thuật toán hay thứ tự xử lý bên trong. Nó chỉ cần: `Input → enhance() → Output`.

## 9. Cấu trúc thư mục dự kiến

```
image-enhancement/
├── src/
│   ├── index.ts          # Public interface của module
│   ├── enhancer.ts       # Điều phối pipeline
│   ├── steps/
│   │   ├── validate.ts
│   │   ├── decode.ts
│   │   ├── denoise.ts
│   │   ├── tone.ts       # cân sáng/tương phản
│   │   ├── sharpen.ts
│   │   └── encode.ts
│   ├── config.ts         # các mức light/standard/strong
│   ├── errors.ts
│   └── types.ts
├── scripts/
│   └── benchmark.ts      # chạy thử trên thư mục ảnh, xuất ảnh trước/sau
├── tests/
├── package.json
├── tsconfig.json         # strict mode
└── README.md             # hướng dẫn tích hợp
```

Mỗi bước là một hàm riêng, nhận ảnh và cấu hình, trả ảnh. Cách này giúp kiểm thử từng bước độc lập và thay đổi thứ tự hoặc bật/tắt bước dễ dàng.

## 10. Công nghệ

| Thành phần | Lựa chọn | Ghi chú |
|---|---|---|
| Ngôn ngữ | TypeScript (strict, ESM) | Đồng nhất với project chính |
| Xử lý ảnh | Sharp | Nhanh, chạy tốt trên CPU |
| Kiểm thử | Vitest | |
| Lint | ESLint | |
| Quản lý gói | npm | |

Hướng AI (ví dụ model upscale/enhance dạng ONNX qua `onnxruntime-node`) **không nằm trong phạm vi hiện tại**, chỉ được xem xét nếu baseline không đáp ứng yêu cầu.

## 11. Đánh giá chất lượng

Vì không có ảnh chuẩn (ground truth) cho ảnh thật, dùng nhiều lớp đánh giá:

### 11.1. Số liệu trên ảnh thật (không cần ground truth)

| Chỉ số | Cách đo | Kỳ vọng |
|---|---|---|
| Độ sắc nét | Phương sai Laplacian | Tăng so với ảnh gốc |
| Mức nhiễu | Độ lệch chuẩn ở vùng phẳng (ví dụ mảng tường) | Giảm hoặc không tăng |
| Phân bố sáng | Histogram | Phân bố đều hơn, không cháy sáng/mất bóng |

### 11.2. Số liệu trên cặp ảnh nhân tạo (có ground truth)

1. Lấy ảnh nét
2. Cố ý làm xấu (làm mờ, thêm nhiễu, giảm sáng)
3. Chạy qua module
4. So với ảnh nét ban đầu bằng **PSNR** và **SSIM**

### 11.3. Đánh giá bằng mắt

Cắt riêng các vùng quan trọng, đặt cạnh nhau (gốc / đã xử lý):

- Vùng vết nứt
- Vùng khe gạch, bề mặt tường
- Vùng chữ (timestamp, mã vị trí, logo)

### 11.4. Kỹ thuật

- Thời gian xử lý mỗi ảnh
- Mức dùng RAM
- Không làm sập project chính khi gặp ảnh lỗi

## 12. Rủi ro và giới hạn

| Rủi ro / Giới hạn | Mô tả | Giảm thiểu |
|---|---|---|
| Không tạo được chi tiết mới | Xử lý truyền thống chỉ làm rõ cái đã có trong ảnh. Kết quả sẽ rõ hơn nhưng không bằng ảnh chụp nét từ đầu | Thống nhất kỳ vọng với người giao việc từ sớm |
| Mất chi tiết thật | Khử nhiễu quá tay xóa vết nứt nhỏ | Mức xử lý vừa phải, kiểm tra bằng mắt vùng vết nứt |
| Halo khi làm nét | Viền sáng quanh cạnh | Giới hạn cường độ sharpen |
| Chữ đã quá mờ | Timestamp/logo mờ nặng không khôi phục hoàn toàn được | Chấp nhận giới hạn; làm nét đồng đều ở giai đoạn baseline |
| Ảnh quá lớn | Tốn RAM, chậm | Giới hạn kích thước đầu vào, ném `ImageTooLargeError` |
| Ảnh đa dạng | Ảnh ngoài trời và trong nhà cần mức khác nhau | Ba mức cấu hình; chế độ thích ứng về sau |

**Nguyên tắc ưu tiên:** với ảnh phục vụ hồ sơ khảo sát, **trung thực quan trọng hơn đẹp**. Module không được làm mất hoặc tạo giả các dấu hiệu hư hỏng. Khi phân vân, chọn mức xử lý nhẹ hơn.

## 13. Lộ trình triển khai

| Giai đoạn | Nội dung |
|---|---|
| 1 | Dựng khung project: TypeScript strict, Vitest, ESLint, cấu trúc thư mục |
| 2 | Định nghĩa types, interface, lỗi có kiểu |
| 3 | Cài đặt các bước: validate, decode (EXIF), encode |
| 4 | Cài đặt khử nhiễu, cân sáng, làm nét theo ba mức cấu hình |
| 5 | Viết script benchmark: chạy trên thư mục ảnh, xuất ảnh trước/sau cạnh nhau |
| 6 | Tinh chỉnh tham số bằng bộ ảnh mẫu (cả ngoài trời và trong nhà), đo số liệu |
| 7 | Viết README tích hợp, kiểm thử tích hợp với project chính |
| 8 | (Tùy chọn) Đánh giá lại: baseline đã đủ chưa, có cần xem xét hướng AI không |

## 14. Các điểm chưa chốt

| Vấn đề | Trạng thái |
|---|---|
| Định dạng input/output chính thức | Chưa chốt, cần xác nhận với project chính |
| Giới hạn kích thước ảnh | Chưa chốt |
| Giá trị tham số cụ thể của từng mức | Xác định bằng thử nghiệm ở giai đoạn 6 |
| Yêu cầu hiệu năng (thời gian, RAM) | Chưa chốt |
| Cách project chính gọi module (import trực tiếp hay đóng gói riêng) | Chưa chốt |
| Xử lý riêng vùng chữ (timestamp/logo) | Hoãn, hiện xử lý đồng đều cả ảnh |
| Có cần hướng AI hay không | Quyết định sau khi có kết quả baseline |
