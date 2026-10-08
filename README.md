# image-enhancement

Module TypeScript nhỏ gọn để cải thiện chất lượng ảnh khảo sát công trình, được thiết kế để tích hợp vào dự án chính.

```
Ảnh vào (Buffer)  →  enhance()  →  Ảnh ra (Buffer)
```

> **Trạng thái hiện tại:** phần khung (kiểm tra đầu vào, giải mã, mã hóa, giao diện công khai, lỗi có kiểu, công cụ đo) đã hoàn chỉnh và có test. Ba bước xử lý ảnh (khử nhiễu, cân sáng, làm nét) chạy được nhưng **tham số vẫn đang được tinh chỉnh** trên ảnh thật. Module chưa được đóng gói và thử tích hợp vào dự án chính.
>
> **Mục tiêu sử dụng:** ảnh bằng chứng kiểm tra (vết nứt, rò rỉ) — chỉ hiệu chỉnh sáng, tương phản, khử nhiễu nhẹ. **Trung thực quan trọng hơn đẹp.** Đánh giá theo độ trung thực với ảnh gốc (PSNR/SSIM), xem `npm run evaluate`.

---

## 1. Module làm gì và không làm gì

**Có trách nhiệm**

- Nhận một ảnh (JPEG, PNG, WEBP), kiểm tra hợp lệ
- Giải mã, xoay đúng chiều theo EXIF
- Khử nhiễu, cân sáng/tương phản, làm nét
- Mã hóa và trả ảnh kết quả
- Báo lỗi bằng các lớp lỗi có kiểu

**Không chịu trách nhiệm**

- Giao diện, upload, xác thực, database, lưu trữ ảnh
- Xử lý hàng loạt (project chính tự lặp qua từng ảnh)
- Phóng to ảnh (kích thước ảnh ra luôn bằng kích thước ảnh vào)
- Tạo thêm chi tiết mới: module chỉ làm rõ những gì đã có trong ảnh

**Nguyên tắc ưu tiên:** ảnh phục vụ hồ sơ kiểm tra nên **trung thực quan trọng hơn đẹp**. Module không được làm mất hay tạo giả dấu hiệu hư hỏng (ví dụ vết nứt). Khi phân vân, chọn mức xử lý nhẹ hơn.

---

## 2. Yêu cầu môi trường

| Hạng mục | Yêu cầu |
|---|---|
| Node.js | `>=20.9.0` (đã chạy thử trên Node 24). Phiên bản dùng khi phát triển ghi trong `.nvmrc` |
| npm | đi kèm Node |
| Hệ điều hành | Windows, macOS, Linux (thư viện Sharp cài bản nhị phân theo hệ điều hành) |
| GPU / Python / Docker | **Không cần** |
| Biến môi trường | **Không cần**, mọi cấu hình đi qua tham số và `src/config.ts` |

Dự án dùng ESM (`"type": "module"`). Không cần môi trường ảo như Python: thư viện được cài trong `node_modules/` của chính dự án, phiên bản được khóa bởi `package-lock.json`.

---

## 3. Cài đặt và chạy lần đầu

```bash
git clone <địa-chỉ-repo> image-enhancement
cd image-enhancement

npm ci              # cài đúng phiên bản trong package-lock.json
npm run typecheck   # kiểm tra kiểu
npm run lint        # kiểm tra mã
npm test            # chạy toàn bộ test
```

Nếu cả ba lệnh cuối không báo lỗi thì môi trường đã sẵn sàng.

---

## 4. Các lệnh terminal

| Lệnh | Việc làm |
|---|---|
| `npm test` | Chạy toàn bộ test (Vitest) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript, không sinh file |
| `npm run lint` | Kiểm tra mã bằng ESLint |
| `npm run build` | Biên dịch `src/` sang `dist/` (JavaScript + file `.d.ts`) |
| `npm run try -- <ảnh> [tùy chọn]` | Xử lý **một ảnh**, ghi kết quả ra `output/` |
| `npm run benchmark [-- tùy chọn]` | Xử lý **cả thư mục** `samples/`, in bảng số liệu, xuất ảnh so sánh |
| `npm run ablate [-- tùy chọn]` | Chạy riêng từng bước để biết bước nào gây ra thay đổi gì |
| `npm run evaluate -- --input <ảnh> [--target <ảnh>]` | Đánh giá **một ảnh**: so sánh Input / từng level / Target, kèm PSNR/SSIM so với ảnh gốc |

### 4.1. Thử một ảnh: `npm run try`

```bash
npm run try -- samples/anh-that.jpg
npm run try -- samples/anh-that.jpg --level strong
npm run try -- samples/anh-that.jpg --level light --format png
npm run try -- samples/anh-that.jpg --format jpeg --quality 85
```

| Tùy chọn | Giá trị | Mặc định |
|---|---|---|
| `--level` | `light`, `standard`, `strong` | `standard` |
| `--format` | `jpeg`, `png`, `webp` | giữ định dạng ảnh vào |
| `--quality` | số nguyên 1 đến 100 (chỉ jpeg, webp) | 92 |

Kết quả nằm ở `output/<tên-ảnh>-<level>.<đuôi>`. Lệnh in kích thước ảnh vào/ra, định dạng và thời gian xử lý. Nếu `--level`, `--format`, `--quality` không hợp lệ, lệnh báo `InvalidOptionsError` mà không tạo file.

### 4.2. Đo cả thư mục: `npm run benchmark`

```bash
npm run benchmark
npm run benchmark -- --levels standard,strong
npm run benchmark -- --skip-synthetic
npm run benchmark -- --input samples --out output/benchmark
```

Soi kỹ một vùng (ví dụ vết nứt, dòng chữ) bằng cách cắt và phóng to ảnh ghép:

```bash
npm run benchmark -- --skip-synthetic --crop 215,90,70,170 --zoom 4 --out output/crack
npm run benchmark -- --skip-synthetic --crop 235,345,265,30 --zoom 3 --out output/timestamp
```

| Tùy chọn | Ý nghĩa | Mặc định |
|---|---|---|
| `--input` | Thư mục chứa ảnh | `samples` |
| `--out` | Thư mục ghi kết quả | `output/benchmark` |
| `--levels` | Các mức cần chạy, cách nhau bằng dấu phẩy | cả ba mức |
| `--crop x,y,rộng,cao` | Cắt vùng (theo pixel) để ghép ảnh so sánh | không cắt |
| `--zoom` | Hệ số phóng to vùng cắt (1 đến 10) | 3 |
| `--skip-synthetic` | Bỏ phần thử trên cặp ảnh nhân tạo | chạy cả hai phần |

Đầu ra gồm:

- **Bảng ảnh thật**: độ nét, mức nhiễu, độ sáng trung bình, p1, p99, tỉ lệ pixel cháy tối/cháy sáng, thời gian xử lý (ms)
- **Bảng cặp ảnh nhân tạo**: PSNR và SSIM so với ảnh gốc (chỉ chạy khi không có `--skip-synthetic`)
- Ảnh đã xử lý cho từng mức, và `<tên>-compare.png` ghép các phiên bản cạnh nhau theo thứ tự **trái sang phải: gốc, light, standard, strong**
- `report.json` chứa toàn bộ số liệu

Cách đọc kết quả:

- `nét` tăng chưa chắc ảnh tốt hơn: nhiễu và các cạnh mạnh (chữ, lưới rào) cũng làm số này tăng. Luôn đọc kèm `nhiễu`, `sáng cháy %`, `tối cháy %` và **nhìn ảnh ghép**.
- PSNR/SSIM trên ảnh nhân tạo thiên về sự mịn, nên mức xử lý mạnh thường được điểm cao hơn dù mắt thấy mất chi tiết. Không chọn mức chỉ dựa vào con số này.
- Chỉ số nhiễu là ước lượng tương đối, chỉ nên so **giữa các dòng của cùng một ảnh**.

### 4.3. Tách từng bước: `npm run ablate`

```bash
npm run ablate
npm run ablate -- --level strong
npm run ablate -- --input samples
```

Mỗi ảnh cho một bảng gồm 10 dòng: mốc "tắt hết", từng bước chạy riêng, "đầy đủ", và "đầy đủ nhưng bỏ một bước". Cột `Δnét %` là mức thay đổi so với mốc. Công cụ này giúp trả lời câu hỏi "bước nào gây ra thay đổi này".

### 4.4. Đánh giá một ảnh: `npm run evaluate`

```bash
npm run evaluate -- --input samples/anh-that.jpg --target samples/target_model.jpg
```

| Tùy chọn | Ý nghĩa | Mặc định |
|---|---|---|
| `--input` | Ảnh cần đánh giá (bắt buộc) | — |
| `--target` | Ảnh tham khảo (tùy chọn) | dùng output `strong` làm chuẩn |
| `--out` | Thư mục ghi kết quả | `output/evaluate` |

Đầu ra:

- **Bảng so sánh**: độ nét, nhiễu, sáng, dải động, tương phản cục bộ, chroma, tỉ lệ pixel cháy tối/sáng của Input, từng level và Target, xếp ✅ ≥95% / 🟡 75–94% / ❌ <75% so với target (kích thước ảnh chỉ là thông tin, không xếp loại)
- **🛡️ Độ trung thực với ảnh gốc**: PSNR (dB) và SSIM của từng level so với ảnh vào — **tiêu chí chính cho ảnh bằng chứng**, càng cao càng ít thay đổi
- **Gap analysis**: xếp các chỉ số theo khoảng cách với target
- Ảnh PNG từng level và `eval-report.json`

Cách đọc: với ảnh bằng chứng, ưu tiên PSNR/SSIM cao (can thiệp vừa phải) trong khi các chỉ số khác không suy thoái so với ảnh vào. `target` chỉ là tham khảo thị giác, không phải chuẩn cần đạt.

---

## 5. Dùng module trong code

Giao diện công khai nằm ở `src/index.ts`.

```ts
import { readFile, writeFile } from "node:fs/promises";
import { enhance, ImageEnhancementError } from "image-enhancement";

const data = await readFile("anh-vao.jpg");

try {
  const out = await enhance({ data }, { level: "standard" });
  await writeFile("anh-ra.jpg", out.data);
  console.log(out.format, out.width, out.height);
} catch (error) {
  if (error instanceof ImageEnhancementError) {
    console.error(`${error.name}: ${error.message}`);
  } else {
    throw error;
  }
}
```

### Kiểu dữ liệu

```ts
interface ImageInput {
  data: Buffer;
  format?: "jpeg" | "png" | "webp"; // bỏ trống để tự phát hiện
}

interface EnhanceOptions {
  level?: "light" | "standard" | "strong"; // mặc định "standard"
  outputFormat?: "jpeg" | "png" | "webp";  // mặc định: giữ định dạng ảnh vào
  quality?: number;                        // 1-100, chỉ jpeg/webp, mặc định 92
}

interface ImageOutput {
  data: Buffer;
  format: "jpeg" | "png" | "webp";
  width: number;
  height: number;
}

function enhance(input: ImageInput, options?: EnhanceOptions): Promise<ImageOutput>;
```

### Lỗi

Mọi lỗi của module đều là lớp con của `ImageEnhancementError`, nên có thể bắt chung hoặc phân biệt từng loại.

| Lỗi | Khi nào |
|---|---|
| `InvalidImageError` | Dữ liệu rỗng, không phải ảnh, ảnh hỏng hoặc bị cắt cụt, khai báo `format` không khớp ảnh thật |
| `UnsupportedFormatError` | Ảnh không phải JPEG, PNG hay WEBP (ví dụ GIF, TIFF) |
| `ImageTooLargeError` | Vượt giới hạn dung lượng hoặc số pixel |
| `InvalidOptionsError` | `level`, `outputFormat`, `quality` không hợp lệ (được kiểm tra **trước** khi xử lý ảnh) |

### Hành vi cần biết

- **Giữ nguyên kích thước ảnh.** Không phóng to, không cắt.
- **Hàm không giữ trạng thái:** cùng ảnh vào và cùng tùy chọn cho cùng kết quả, không sửa Buffer đầu vào.
- **Ảnh được xoay đúng chiều theo EXIF** và **toàn bộ siêu dữ liệu (EXIF, GPS) bị loại khỏi ảnh đầu ra**. Nếu project chính cần giữ EXIF thì cần thay đổi module.
- **Ảnh có kênh trong suốt** được trải lên nền trắng. Ảnh xám được ép thành 3 kênh RGB.
- **JPEG đầu ra dùng chroma 4:4:4** để giữ màu ở cạnh và nét chữ; đổi lại file lớn hơn mức mặc định của JPEG. Mức nén mặc định 92 có thể làm file JPEG ra **lớn hơn** file vào dù đã xử lý.
- **Đồng thời:** mỗi ảnh đang xử lý giữ vài bản pixel thô trong RAM (ảnh 12 megapixel RGB khoảng 36 MB mỗi bản). Project chính nên giới hạn số ảnh xử lý đồng thời.

### Giới hạn mặc định (chưa xác nhận với project chính)

| Giới hạn | Giá trị | Nơi chỉnh |
|---|---|---|
| Dung lượng ảnh vào | 50 MB | `src/config.ts` (`DEFAULT_INPUT_LIMITS`) |
| Số pixel tối đa | 100 megapixel | `src/config.ts` (`DEFAULT_INPUT_LIMITS`) |
| Chất lượng nén mặc định | 92 | `src/config.ts` (`DEFAULT_QUALITY`) |

---

## 6. Quy trình xử lý bên trong

```
Ảnh vào → validate → decode → khử nhiễu → cân sáng → làm nét → encode → Ảnh ra
```

| Bước | File | Việc làm |
|---|---|---|
| Kiểm tra | `steps/validate.ts` | Kiểm tra rẻ qua metadata: Buffer rỗng, dung lượng, định dạng, số pixel, khai báo `format` |
| Giải mã | `steps/decode.ts` | Giải mã **một lần** thành pixel thô RGB; xoay theo EXIF, làm phẳng alpha, về sRGB |
| Khử nhiễu | `steps/denoise.ts` | Median **có mặt nạ cạnh**: chỉ lọc vùng phẳng (|luma − blur| thấp), cạnh và vết nứt giữ nguyên pixel gốc; trộn theo `strength` để vết nứt mảnh không bị xóa hẳn |
| Cân sáng | `steps/tone.ts` | CLAHE (trộn với ảnh gốc theo `strength`) rồi gamma kéo sáng vùng tối |
| Làm nét | `steps/sharpen.ts` | Unsharp mask **trên độ sáng**; bỏ qua chênh lệch nhỏ (`threshold`), chặn mức cộng theo "chỗ trống" tới 255 và tới 0 để không tạo thêm pixel cháy |
| Mã hóa | `steps/encode.ts` | Nén **một lần** ra Buffer theo định dạng yêu cầu |

Nguyên tắc thiết kế:

- **Giải mã một lần, mã hóa một lần:** các bước xử lý truyền pixel thô cho nhau, không nén lại giữa chừng.
- **Thứ tự cố định** khử nhiễu → cân sáng → làm nét, vì làm nét trước khi khử nhiễu sẽ khuếch đại nhiễu.
- Mỗi bước là một hàm nhận ảnh thô và trả ảnh thô, bước nào có `strength` hoặc `amount` bằng 0 thì bị bỏ qua.

### Các mức xử lý

Tham số nằm ở `src/config.ts` (`LEVEL_PARAMS`), **đó là nguồn chính xác nhất**. Bảng dưới là giá trị khởi điểm tại thời điểm viết tài liệu, **chưa được tinh chỉnh xong**.

| Mức | Khử nhiễu (`medianSize`, `strength`) | Cân sáng (`strength`, `maxSlope`, `gamma`) | Làm nét (`sigma`, `amount`, `threshold`) |
|---|---|---|---|
| `light` | 3, 0.4 | 0.4, 3, 1.15 | 1.2, 0.2, 5 |
| `standard` | 5, 0.5 | 0.55, 4, 1.25 | 1.5, 0.3, 4 |
| `strong` | 5, 0.6 (edgeSigma 2) | 0.75, 5, 1.35 | 1.5, 0.4, 3 |

Khử nhiễu dùng **mặt nạ cạnh**: trọng số lọc = `strength × flatness`, `flatness` giảm từ 1 về 0 khi |luma gốc − luma sau blur| tăng từ `edgeLow` (4) tới `edgeHigh` (16). Thử nghiệm `scripts/exp-denoise.ts` (2 mẫu) so median toàn cục: giảm nhiễu nhiều hơn (mẫu nhiều nhiễu −33% ở standard, −40% ở strong) mà chỉ mất 1–2% độ nét; median toàn cục mất 13–25% nét để giảm ~0–4%. Ảnh mẫu ít nhiễu (σ≈2.1) cải thiện ít hơn vì ít nhiễu để lọc — cần thêm mẫu nhiều nhiễu để chốt tham số.

---

## 7. Cấu trúc thư mục

```
image-enhancement/
├── src/
│   ├── index.ts            # Giao diện công khai duy nhất
│   ├── enhancer.ts         # Điều phối: enhance() và enhanceWithParams() (nội bộ)
│   ├── pipeline.ts         # Danh sách và thứ tự các bước
│   ├── config.ts           # Giới hạn, mức xử lý, tham số
│   ├── errors.ts           # Các lỗi có kiểu
│   ├── types.ts            # Kiểu công khai
│   ├── internal-types.ts   # Kiểu nội bộ (RawImage, EnhanceStep, ImageInfo)
│   ├── steps/              # validate, decode, denoise, tone, sharpen, encode
│   ├── metrics/            # luma, sharpness, noise, brightness, measure, fidelity (PSNR, SSIM)
│   └── utils/              # random.ts (RNG có hạt giống)
├── scripts/
│   ├── try.ts              # Thử một ảnh
│   ├── benchmark.ts        # Đo cả thư mục
│   ├── ablate.ts           # Tách từng bước
│   ├── evaluate.ts         # Đánh giá 1 ảnh: input/levels/target + PSNR/SSIM vs gốc
│   ├── exp-denoise.ts      # Thử nghiệm chiến lược khử nhiễu (median toàn cục vs mặt nạ cạnh)
│   └── lib/                # degrade.ts (làm xấu ảnh), crop.ts (cắt vùng)
├── tests/                  # Test (Vitest) và helpers.ts sinh ảnh thử
├── samples/                # Ảnh thật để thử (KHÔNG commit)
├── output/                 # Kết quả sinh ra (KHÔNG commit)
├── package.json
├── tsconfig.json           # strict mode
├── tsconfig.build.json
├── eslint.config.js
└── vitest.config.ts
```

`enhanceWithParams()` trong `enhancer.ts` chỉ dùng nội bộ cho `ablate`, **không** được export qua `index.ts`; có test canh để giao diện công khai không bị lộ thêm.

---

## 8. Quy ước làm việc

- **Mỗi thay đổi đều phải qua ba lệnh:** `npm run typecheck`, `npm run lint`, `npm test`.
- **Commit nhỏ**, mỗi bước một commit.
- **Ảnh công trình là dữ liệu nhạy cảm:** `samples/` và `output/` đã nằm trong `.gitignore`, không đưa lên repo.
- **Import nội bộ phải ghi đuôi `.js`** (ví dụ `import { x } from "./config.js"` dù file nguồn là `.ts`). Đây là quy ước của ESM với `NodeNext`.
- Giá trị trong `config.ts` đều là khởi điểm; mọi thay đổi tham số nên có số liệu từ `ablate` hoặc `benchmark` kèm xem ảnh bằng mắt, đặc biệt vùng vết nứt và vùng chữ.

---

## 9. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân và cách xử lý |
|---|---|
| `npm test` báo `Cannot find native binding` (rolldown) | Lỗi cài đặt gói tùy chọn của npm. Chạy `rm -rf node_modules package-lock.json` rồi `npm install` |
| `Cannot find name 'Buffer'` khi typecheck | Thiếu `"types": ["node"]` trong `tsconfig.json` (bắt buộc với TypeScript 6) |
| `npm run lint` báo `No tsconfigRootDir was set` cho các file trong thư mục lạ | Một công cụ editor/AI đã tạo bản sao dự án (ví dụ `.kilo/`). Thêm thư mục đó vào `ignores` của `eslint.config.js` và `.gitignore` |
| `Cannot redeclare block-scoped variable` trong `config.ts` | Một khối mã đã bị dán hai lần. Xóa khối trùng |
| `ENOENT` khi chạy `npm run try` | Đường dẫn ảnh sai; đây là lỗi đọc file của Node, không phải lỗi của module |
| Git cảnh báo `LF will be replaced by CRLF` | Chỉ là cảnh báo của Git trên Windows, có thể bỏ qua |
| Cài Sharp lỗi | Chạy `npm install` trên chính máy sẽ dùng; **không** sao chép `node_modules` giữa các hệ điều hành |

---

## 10. Việc còn lại

**Chất lượng ảnh (đang làm)**

- [x] Quyết định giữ hay bỏ khử nhiễu: median toàn cục bị bỏ (ablate, commit `fcf0d5e`); thay bằng **median có mặt nạ cạnh** — giảm nhiễu 12–33% chỉ mất 1–2% nét (exp-denoise, commit tiếp theo)
- [ ] Thêm ảnh trong nhà thiếu sáng và ảnh nhiều nhiễu (mẫu hiện ít nhiễu, σ≈2.1) — cần để chốt tham số `strength`/`edgeLow`/`edgeHigh` của mặt nạ cạnh
- [ ] Xem bằng mắt vùng vết nứt và vùng chữ ở ảnh so sánh; chốt mức nào bắt đầu quá tay
- [ ] (Tùy chọn) Hard-guard trong `sharpen`: không tạo pixel cháy mới (≥253 / ≤2)
- [ ] Cân nhắc chọn mức xử lý thích ứng theo độ nhiễu và độ sáng đo được của từng ảnh
- [ ] Xem lại `DEFAULT_QUALITY` (hiện làm JPEG ra lớn hơn ảnh vào)

**Đóng gói và tích hợp (chưa làm)**

- [ ] Chạy `npm run build`, thử `npm pack` và cài vào một dự án trống để kiểm tra `exports` và file `.d.ts`
- [ ] Hỏi project chính: dùng ESM hay CommonJS, Node phiên bản nào, giới hạn kích thước ảnh thực tế, có cần giữ EXIF không
- [ ] Nếu project chính cũng dùng Sharp, cân nhắc khai báo Sharp là `peerDependency`
- [ ] Quyết định cách xử lý riêng vùng chữ (timestamp, logo) nếu cần; hiện xử lý đồng đều cả ảnh
- [ ] Nếu phương pháp truyền thống chưa đủ, mới xem xét hướng AI (hiện **không** nằm trong phạm vi)

---

## 11. Giới hạn đã biết

- Xử lý ảnh truyền thống **không tạo được chi tiết mới**: kết quả rõ hơn nhưng không thể bằng một ảnh chụp nét từ đầu.
- Chữ timestamp và logo bị mờ nặng chỉ cải thiện được một phần.
- Các chỉ số đo chưa phản ánh trực tiếp độ rõ của vết nứt; phải kiểm tra bằng mắt.
- Chưa đo hiệu năng trên ảnh lớn (cỡ 12 megapixel trở lên); thời gian đo được mới là cỡ trăm mili giây trên ảnh 504x384.