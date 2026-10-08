# 📊 Đánh giá Chất lượng & Plan Cải thiện Chi tiết

> Dữ liệu đo thực tế lúc `2026-10-08` — chạy `npm run evaluate -- --input samples/anh-that.jpg --target samples/target_model.jpg`
> **TRẠNG THÁI:** Đã hoàn thành Giai đoạn 1–2 (commit `9fa3c86`).
> **CẬP NHẬT 2026-10-08:** Sprint 3 (3.1 Vibrance, 3.2 Upscale) **đã hủy** — xem §5. Hướng hiện tại: ảnh bằng chứng kiểm tra, chỉ hiệu chỉnh sáng/tương phản/khử nhiễu nhẹ; đánh giá theo độ trung thực với ảnh gốc (PSNR/SSIM).

---

## 1. Bảng so sánh thực tế mới nhất — Sau Giai đoạn 1 & 2

> 🎯 Chuẩn: `target_model.jpg` (1436×1096 px)  
> ✅ ≥95% target &nbsp; 🟡 75–94% &nbsp; ❌ <75%

| # | Chỉ số | Input | light | standard | strong | 🎯 Target |
|---|--------|-------|-------|----------|--------|-----------|
| 1 | **Độ phân giải** | ❌ 0.19 MP | ❌ 0.19 MP | ❌ 0.19 MP | ❌ 0.19 MP | **1.57 MP** |
| 2 | **Độ nét** (Laplacian var) | ✅ 2310 | ✅ 2519 | ✅ 2499 | ✅ 2334 | **1290** |
| 3 | **Nhiễu** (σ) | ✅ 2.09 | ✅ 2.2 | 🟡 2.3 | 🟡 2.4 | **2.13** |
| 4 | **Độ sáng TB** | 🟡 137.4 | 🟡 146.9 | ✅ 152.5 | ✅ 157.7 | **156.0** |
| 5 | **Dải động** | ✅ 243 | ✅ 239 | ✅ 235 | 🟡 230 | **247** |
| 6 | **Tương phản cục bộ** | ✅ 9.3 | ✅ 9.6 | ✅ 9.7 | ✅ 9.5 | **7.3** |
| 7 | **Chroma trung bình** (HSV) | ✅ 25.8 | ✅ 25.6 | 🟡 25.3 | 🟡 25.0 | **26.8** |
| 8 | **Pixel tối cháy** | ✅ 0.32% | ✅ 0.08% | ✅ 0.01% | ✅ 0.01% | **0.58%** |
| 9 | **Pixel sáng cháy** | 🟡 1.09% | 🟡 1.29% | 🟡 1.21% | 🟡 1.30% | **0.98%** |

---

## 2. Gap Analysis — Hiện trạng

> ⚠️ Bảng này đo theo chuẩn cũ (`target_model.jpg`). Sau khi hủy upscale (§5), "Độ phân giải" không còn là mục tiêu — xem §5 để biết hướng hiện tại.

| STT | Chỉ số | Input | Best Output | Target | Gap còn lại | Cải thiện vs Input |
|-----|--------|-------|-------------|--------|-------------|-------------------|
| 🔴 1 | Độ phân giải | 0.19 MP | 0.19 MP | 1.57 MP | **87.7%** | +0.0% |
| 🟢 2 | Pixel sáng cháy | 1.09% | 1.09% | 0.98% | 10.1% | +0.0% |
| 🟢 3 | Chroma trung bình | 25.85 | 25.85 | 26.80 | 3.5% | +0.0% |
| 🟢 4 | Dải động | 243.00 | 243.00 | 247.00 | 1.6% | +0.0% |
| ✅ 5 | Độ nét (Laplacian) | 2310.61 | 2519.36 | 1289.98 | 0.0% | **+9.0%** (Đã khử over-sharpen) |
| ✅ 6 | Nhiễu (σ block) | 2.09 | 2.09 | 2.13 | 0.0% | +0.0% |
| ✅ 7 | Độ sáng TB | 137.43 | 157.74 | 156.01 | 0.0% | **+14.8%** (Đã đạt target) |
| ✅ 8 | Tương phản cục bộ | 9.34 | 9.66 | 7.32 | 0.0% | +3.4% |
| ✅ 9 | Pixel tối cháy | 0.32% | 0.01% | 0.58% | 0.0% | **+97.9%** (Đã đạt) |

### 🔍 Kết luận sau Giai đoạn 1 & 2
- Độ nét đã tự nhiên hơn rất nhiều (từ 3653 xuống 2519). 
- Độ sáng đã đạt chuẩn Target hoàn hảo (157.7 vs 156).
- Sắc độ (Chroma) không còn bị triệt tiêu sau CLAHE, duy trì ổn định.

> **Tập trung Giai đoạn tiếp theo:** Nâng cấp Độ phân giải (Upscale) và Độ sống động màu sắc (Vibrance).

---

## 3. Plan Giai đoạn Kế Tiếp (Sprint 3) — ⛔ ĐÃ HỦY (xem §5)

> Vibrance thay đổi màu so với thực tế, upscale nội suy không thêm thông tin — cả hai trái mục tiêu ảnh bằng chứng. Giữ lại để tham khảo.

### 🟡 3.1: Bước Cải thiện Màu sắc (Vibrance) — ĐÃ HỦY
**Mục tiêu:** Bù đắp sự hao hụt màu nhỏ còn lại và làm màu rực rỡ hơn để đạt chỉ số Chroma > 26.8.

- **Thực hiện:** Viết module `src/steps/vibrance.ts`
- **Cơ chế:**
  Sử dụng `sharp().modulate({ saturation: factor })`.
- **Pipeline:** Chèn vào giữa bước `tone` và `sharpen`.
- **Cập nhật:**
  - File cấu hình `src/config.ts` để thêm `vibrance` cho các levels (VD: standard ~ 1.15, strong ~ 1.25).
  - Khai báo type mới cho pipelines.

### 🟠 3.2: Bước Nâng Kích Thước (Upscale Lanczos)
**Mục tiêu:** Thu hẹp Resolution Gap (87.7% gap hiện tại là quá lớn).

- **Thực hiện:** Viết module `src/steps/upscale.ts`
- **Cơ chế:** 
  - Upscale thông thường thông qua `resize` với kernel xịn (`lanczos3`).
  - Hệ số upscale `scale` = 1.0 (light), 1.5 (standard), 2.0 (strong).
- **Pipeline:** Nên đứng trước các bước `tone`, `vibrance` và `sharpen` để khi xử lý, thuật toán chạy trên lượng điểm ảnh đã được nhân lên, giúp chi tiết mượt hơn.

### 🟢 3.3: Chế độ Auto (Tùy chọn)
**Mục tiêu:** Lựa chọn level tự động theo file Input.
- Sử dụng hàm đo metrics lúc mới decode ảnh để quyết định nên trả về level nào.

---

## 4. Roadmap Triển khai Sprint 3 — ĐÃ HỦY (xem §5)

1. **Step 1:** Tạo `src/steps/vibrance.ts`, thêm tham số vào `config.ts` và `pipeline.ts`. Cập nhật unit test nếu cần.
2. **Step 2:** Tạo `src/steps/upscale.ts`, tích hợp vào config/pipeline.
3. **Step 3:** Chạy `npm run evaluate` để chứng thực Độ phân giải đã tăng và Chroma đã tăng.
4. **Step 4 (Nếu cần):** Bổ sung mức `auto` vào `types.ts`.

---

## 5. Cập nhật hướng (2026-10-08) — mục tiêu ảnh bằng chứng kiểm tra

**Mục tiêu:** ảnh phục vụ bằng chứng kiểm tra (vết nứt, rò rỉ) → chỉ xử lí ở mức **hiệu chỉnh**: sáng, tương phản, khử nhiễu nhẹ. Nguyên tắc: **trung thực quan trọng hơn đẹp**; không tạo hoặc mất chi tiết hư hỏng; khi phân vân chọn mức nhẹ hơn.

**Quyết định:**

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Hủy upscale (3.2) | Nội suy không thêm thông tin; to hơn ≠ rõ hơn; resolution là thuộc tính ảnh vào |
| 2 | Hủy vibrance (3.1) | Thay đổi bão hòa = thay đổi màu so với thực tế; gap chroma 3.5% đã ✅ |
| 3 | Giữ tone (CLAHE + gamma, trộn gốc), denoise nhẹ, sharpen nhẹ | Đúng scope "hiệu chỉnh"; sharpen chỉ nhấn cạnh đã có |
| 4 | Đổi chuẩn đánh giá: PSNR/SSIM vs ảnh gốc làm tiêu chí chính | Bằng chứng cần "ít thay đổi nhất mà đọc rõ hơn"; `target_model.jpg` chỉ là tham khảo thị giác |
| 5 | Hoãn auto mode, white balance, AI SR, nhóm 6–7 | Ngoài scope bằng chứng |

**Verify denoise (ablate trên `anh-that.jpg`, baseline nét 2310.6 / nhiễu 2.09):**

- light: chỉ khử nhiễu → nét **−13.4%**, nhiễu 2.09 → 2.09 (0%)
- standard: chỉ khử nhiễu → nét **−25.5%**, nhiễu 2.09 → 2.07 (~1%)
- strong: chỉ khử nhiễu → nét **−40.8%**, nhiễu 2.09 → 2.00 (~4%)

→ **Tắt denoise ở light/standard** (commit `fcf0d5e`). Giữ 0.35 ở strong (mức này nhắm ảnh nhiễu/thiếu sáng) — **cần mẫu nhiều nhiễu để verify trước khi chốt**.

**Số liệu sau khi tắt denoise (`npm run evaluate`):**

| Level | Nét | Nhiễu | Sáng TB | PSNR | SSIM | Tối cháy | Sáng cháy |
|---|---|---|---|---|---|---|---|
| light | 2886.9 | 2.1 | 146.9 | 27.53 | 0.9882 | 0.17% | 1.36% |
| standard | 3275.2 | 2.3 | 152.4 | 23.38 | 0.9707 | 0.09% | 1.34% |
| strong | 2334.4 | 2.4 | 157.7 | 20.72 | 0.9545 | 0.01% | 1.30% |

**Trade-off đã biết:** sáng cháy tăng +0.1–0.3pp so với gốc (1.09%) do gamma + sharpen — không thể vừa kéo vùng tối vừa giữ clip ≤ gốc. PSNR giảm 0.09–0.11 dB so với khi có denoise (không đáng kể).

**Còn lại trước khi chốt tham số:**

- [ ] Thêm ảnh trong nhà thiếu sáng, nhiễu cao (mẫu hiện σ≈2.1, ít nhiễu)
- [ ] Verify denoise `strong` trên mẫu nhiều nhiễu
- [ ] (Tùy chọn) Hard-guard trong sharpen: không tạo pixel cháy mới (≥253 / ≤2)
- [ ] Xem bằng mắt vùng vết nứt và vùng chữ
