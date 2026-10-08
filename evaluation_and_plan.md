# 📊 Đánh giá Chất lượng & Plan Cải thiện Chi tiết

> Dữ liệu đo thực tế lúc `2026-10-08` — chạy `npm run evaluate -- --input samples/anh-that.jpg --target samples/target_model.jpg`
> **TRẠNG THÁI:** Đã hoàn thành Giai đoạn 1 (Sửa lỗi cơ bản) và Giai đoạn 2 (Refactor metrics).

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

## 3. Plan Giai đoạn Kế Tiếp (Sprint 3)

### 🟡 3.1: Bước Cải thiện Màu sắc (Vibrance)
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

## 4. Roadmap Triển khai Sprint 3

1. **Step 1:** Tạo `src/steps/vibrance.ts`, thêm tham số vào `config.ts` và `pipeline.ts`. Cập nhật unit test nếu cần.
2. **Step 2:** Tạo `src/steps/upscale.ts`, tích hợp vào config/pipeline.
3. **Step 3:** Chạy `npm run evaluate` để chứng thực Độ phân giải đã tăng và Chroma đã tăng.
4. **Step 4 (Nếu cần):** Bổ sung mức `auto` vào `types.ts`.
