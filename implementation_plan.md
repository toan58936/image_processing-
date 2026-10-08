# Cải thiện bước khử nhiễu (Denoise)



## Bối cảnh



Bước khử nhiễu hiện tại ([`denoise.ts`](file:///d:/image-enhancement/src/steps/denoise.ts)) dùng **median filter + mặt nạ cạnh đơn thang**. Theo dữ liệu từ [`evaluation_and_plan.md`](file:///d:/image-enhancement/evaluation_and_plan.md):



- Ảnh mẫu hiện tại **ít nhiễu** (σ ≈ 2.1), nên denoise gần như không cải thiện gì

- Trước đây cấu hình gốc tắt denoise ở light/standard để tránh mất nét (-13% đến -25%); với cải tiến hiện tại denoise bật ở tất cả mức và tự động hạn chế trên ảnh sạch. 

- Hiện tại denoise được áp dụng ở tất cả các mức (light/standard/strong) với tham số đã tinh chỉnh.



**Nguyên nhân gốc:** thuật toán hiện tại không đủ "thông minh" — lọc quá mạnh ở vùng phẳng (mất nét) nhưng lại không hiệu quả với nhiễu Gaussian.



---



## Phân tích hạn chế hiện tại



### Hạn chế 1: Khử nhiễu đồng đều trên R, G, B



```

Hiện tại: median filter lên cả 3 kênh R,G,B cùng weight

```



Mắt người **nhạy với nhiễu trên luma** hơn nhiều so với nhiễu trên chroma. Nhưng hiện tại median lọc đồng đều cả 3 kênh → lãng phí: lọc mạnh trên luma làm mất chi tiết, trong khi có thể lọc mạnh hơn trên chroma mà mắt không nhận thấy.



### Hạn chế 2: Mặt nạ cạnh đơn thang (single-scale)



```ts

// Hiện tại: chỉ 1 mức blur để dò cạnh

const blurred = sharp(data).blur(edgeSigma);  // edgeSigma cố định

flatness = (edgeHigh - |luma - lumaBlur|) / span;

```



Chỉ dùng 1 sigma → bỏ sót cạnh mịn (vết nứt nhỏ) hoặc cạnh lớn (bóng đổ). Vết nứt có thể có nhiều scale khác nhau.



### Hạn chế 3: Không thích ứng theo mức nhiễu thực tế



Strength là **hằng số cố định** theo level, không phụ thuộc ảnh. Ảnh σ=2 và ảnh σ=15 dùng cùng strength → ảnh ít nhiễu bị lọc thừa, ảnh nhiều nhiễu bị lọc thiếu.



### Hạn chế 4: Median filter không tối ưu cho Gaussian noise



Median filter mạnh nhất với **salt-and-pepper noise** (impulse). Với **Gaussian noise** (phổ biến hơn trong ảnh điện thoại), Gaussian blur (hoặc bilateral-like) hiệu quả hơn.



### Hạn chế 5: Không có second pass cho chi tiết nhỏ



Chỉ chạy 1 lần với 1 kernel size → không thể xử lý đồng thời nhiễu mịn và nhiễu thô.



---



## Proposed Changes



### Cải tiến 1: Tách luma/chroma — lọc chroma mạnh hơn



> Đây là cải tiến **có tác động lớn nhất**, vì cho phép khử nhiễu màu mạnh mà không mất chi tiết hình dạng.



**Ý tưởng:** Tách ảnh thành luma (Y) và chroma (Cb, Cr). Lọc luma nhẹ (bảo toàn chi tiết), lọc chroma mạnh hơn (mắt ít nhạy). Gộp lại.



#### [MODIFY] [`steps/denoise.ts`](file:///d:/image-enhancement/src/steps/denoise.ts)



Thay đổi:

- Tách RGB → Y, Cb, Cr (BT.601)

- Lọc Y: median + edge mask (như hiện tại, nhưng trên 1 kênh)

- Lọc Cb, Cr: Gaussian blur mạnh hơn (sigma lớn hơn, không cần edge mask vì chroma ít chứa chi tiết cấu trúc)

- Gộp Y', Cb', Cr' → RGB



```ts

// Pseudo-code

const Y  = 0.299*R + 0.587*G + 0.114*B;

const Cb = 128 + 0.564*(B - Y);

const Cr = 128 + 0.713*(R - Y);



// Luma: median + edge mask (nhẹ)

Y'  = edgeMaskedMedian(Y, lumaStrength);

// Chroma: Gaussian blur (mạnh hơn, chromaSigma lớn hơn edgeSigma)

Cb' = gaussianBlur(Cb, chromaSigma) * chromaStrength + Cb * (1 - chromaStrength);

Cr' = gaussianBlur(Cr, chromaSigma) * chromaStrength + Cr * (1 - chromaStrength);



// Gộp lại → RGB

```



#### [MODIFY] [`config.ts`](file:///d:/image-enhancement/src/config.ts)



Thêm tham số mới cho `DenoiseParams`:



```ts

interface DenoiseParams {

  // ... giữ nguyên các field cũ ...

  /** Sigma blur cho kênh chroma (mặc định 2.0, lớn hơn edgeSigma). */

  readonly chromaSigma?: number;

  /** Cường độ lọc chroma, 0 (tắt) đến 1 (mặc định 0.7). */

  readonly chromaStrength?: number;

}

```



| Mức | `strength` (luma) | `chromaStrength` | `chromaSigma` |

|---|---|---|---|

| `light` | 0.3 | 0.5 | 2.0 |

| `standard` | 0.4 | 0.6 | 2.5 |

| `strong` | 0.5 | 0.8 | 3.0 |



---



### Cải tiến 2: Mặt nạ cạnh đa thang (multi-scale)



**Ý tưởng:** Dùng 2 mức blur (sigma nhỏ + sigma lớn) để dò cạnh ở nhiều scale. Lấy **max** của 2 edge map → bảo vệ cả cạnh mịn (vết nứt nhỏ) lẫn cạnh lớn.



#### [MODIFY] [`steps/denoise.ts`](file:///d:/image-enhancement/src/steps/denoise.ts)



```ts

// Hiện tại: 1 blur

const blurred = sharp(data).blur(edgeSigma);



// Cải tiến: 2 blurs, lấy max edge

const blurFine   = sharp(lumaChannel).blur(edgeSigma * 0.5);  // cạnh mịn

const blurCoarse = sharp(lumaChannel).blur(edgeSigma * 2.0);  // cạnh lớn



for (each pixel) {

  const edgeFine   = |luma - lumaBlurFine|;

  const edgeCoarse = |luma - lumaBlurCoarse|;

  const edge = Math.max(edgeFine, edgeCoarse);  // bảo vệ cả hai loại

  const flatness = clamp01((edgeHigh - edge) / span);

}

```



Lợi ích: bảo vệ tốt hơn vết nứt mảnh (fine scale) mà vẫn nhận diện được bóng đổ lớn (coarse scale).



---



### Cải tiến 3: Strength thích ứng theo mức nhiễu ước lượng



**Ý tưởng:** Trước khi lọc, dùng `estimateNoise()` (đã có sẵn trong `metrics/noise.ts`) để ước lượng σ của ảnh. Điều chỉnh strength thực tế:



#### [MODIFY] [`steps/denoise.ts`](file:///d:/image-enhancement/src/steps/denoise.ts)



```ts

import { estimateNoise } from "../metrics/noise.js";



// Ước lượng mức nhiễu

const noise = estimateNoise(image);



// Điều chỉnh strength: nhiều nhiễu → lọc mạnh hơn, ít nhiễu → lọc nhẹ hơn

const NOISE_LOW = 2;    // dưới mức này: ít nhiễu, giảm strength

const NOISE_HIGH = 8;   // trên mức này: nhiều nhiễu, dùng full strength

const noiseFactor = clamp01((noise - NOISE_LOW) / (NOISE_HIGH - NOISE_LOW));

const adaptiveStrength = strength * noiseFactor;

```



| Mức nhiễu | `noiseFactor` | Hành vi |

|---|---|---|

| σ < 2 (ít nhiễu) | → 0 | Gần như **không lọc** |

| σ = 5 | → 0.5 | Lọc **vừa phải** |

| σ > 8 (nhiều nhiễu) | → 1.0 | Lọc **toàn lực** |



Lợi ích: giải quyết triệt để vấn đề ảnh ít nhiễu bị lọc thừa (lý do denoise bị tắt ở light/standard). Có thể **bật lại denoise ở mọi level** vì nó sẽ tự tắt khi ảnh ít nhiễu.



---



### Cải tiến 4: Kết hợp Gaussian + Median (hybrid filter)



**Ý tưởng:** Chạy cả Gaussian blur và Median filter, trộn kết quả. Gaussian tốt cho Gaussian noise, Median tốt cho impulse noise.



#### [MODIFY] [`steps/denoise.ts`](file:///d:/image-enhancement/src/steps/denoise.ts)



```ts

// Chạy song song 3 thao tác Sharp

const [blurForEdge, medianFiltered, gaussianFiltered] = await Promise.all([

  sharp(lumaData).blur(edgeSigmaFine),

  sharp(lumaData).median(medianSize),

  sharp(lumaData).blur(gaussianSigma),

]);



// Hybrid: trộn median và gaussian theo tỉ lệ

const hybridRatio = 0.5;  // 0.5 = cân bằng

filtered = medianFiltered * hybridRatio + gaussianFiltered * (1 - hybridRatio);

```



---



## Open Questions



> [!IMPORTANT]

> **Câu 1:** Bạn muốn triển khai **tất cả 4 cải tiến** hay chọn theo thứ tự ưu tiên? Khuyến nghị:

> - **Ưu tiên cao:** Cải tiến 1 (tách luma/chroma) + Cải tiến 3 (adaptive strength) — tác động lớn nhất

> - **Ưu tiên trung bình:** Cải tiến 2 (multi-scale edge mask)  

> - **Tùy chọn:** Cải tiến 4 (hybrid filter)



> [!IMPORTANT]

> **Câu 2:** Bạn có ảnh mẫu **nhiều nhiễu** (ảnh trong nhà thiếu sáng, ảnh điện thoại cũ) trong thư mục `samples/` không? Cần ít nhất 1 ảnh σ > 5 để verify cải tiến có hiệu quả — ảnh mẫu hiện tại quá ít nhiễu (σ ≈ 2.1).



> [!NOTE]

> **Câu 3:** Sau khi cải tiến, denoise có nên được **bật lại ở light/standard** không? Với adaptive strength (Cải tiến 3), ảnh ít nhiễu sẽ tự động gần như không bị lọc, nên có thể bật lại an toàn.



---



## Verification Plan



### Automated Tests

```bash

npm test                    # Đảm bảo test cũ vẫn pass

npm run typecheck           # Kiểm tra kiểu

npm run lint                # Kiểm tra code

```



Cập nhật [`denoise.test.ts`](file:///d:/image-enhancement/tests/denoise.test.ts):

- Test tách luma/chroma: chroma bị lọc mạnh hơn luma

- Test adaptive: ảnh ít nhiễu (σ < 2) → gần như không thay đổi

- Test adaptive: ảnh nhiều nhiễu → giảm nhiễu đáng kể

- Test multi-scale edge mask: vết nứt mảnh 1px vẫn được bảo vệ

- Test backward compatibility: tham số cũ (không có chromaSigma/chromaStrength) vẫn hoạt động



### Benchmark so sánh

```bash

npm run benchmark                    # So sánh trước/sau

npm run ablate                       # Xem impact riêng denoise

npm run evaluate -- --input samples/anh-that.jpg --target samples/target_model.jpg

```



**Tiêu chí thành công:**

- PSNR/SSIM vs ảnh gốc **không giảm đáng kể** (< 0.5 dB)

- Nhiễu σ giảm trên ảnh nhiều nhiễu

- Độ nét **không giảm quá 5%** trên ảnh ít nhiễu

- Vết nứt, chữ vẫn rõ khi nhìn bằng mắt



