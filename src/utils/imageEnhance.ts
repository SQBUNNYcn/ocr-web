/**
 * 图像增强工具集：用于 OCR 前的图像预处理
 * 1. 灰度化
 * 2. 径向畸变校正（减轻镜头桶形/枕形畸变）
 * 3. 锐化（unsharp mask，减轻残影/模糊）
 * 4. Otsu 自适应二值化（黑更黑、白更白，提升对比度）
 */

// 灰度化：加权平均（人眼感知权重）
function grayscale(src: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h)
  for (let i = 0, j = 0; i < src.length; i += 4, j++) {
    gray[j] = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2]
  }
  return gray
}

// 双线性插值采样
function bilinearSample(
  src: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): number {
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) {
    const cx = Math.max(0, Math.min(w - 1, Math.round(x)))
    const cy = Math.max(0, Math.min(h - 1, Math.round(y)))
    return src[cy * w + cx]
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = x - x0
  const fy = y - y0

  const v00 = src[y0 * w + x0]
  const v10 = src[y0 * w + x1]
  const v01 = src[y1 * w + x0]
  const v11 = src[y1 * w + x1]

  const top = v00 + (v10 - v00) * fx
  const bottom = v01 + (v11 - v01) * fx
  return top + (bottom - top) * fy
}

// 径向畸变校正：反向映射 + 双线性插值
// k > 0 校正桶形畸变（广角镜头常见），k < 0 校正枕形畸变
function undistort(
  src: Float32Array,
  w: number,
  h: number,
  k: number,
): Float32Array {
  const dst = new Float32Array(w * h)
  const cx = (w - 1) / 2
  const cy = (h - 1) / 2
  const maxR = Math.sqrt(cx * cx + cy * cy)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / maxR
      const ny = (y - cy) / maxR
      const r2 = nx * nx + ny * ny
      // 校正映射：将畸变位置映射回理想位置
      const factor = 1 + k * r2
      const sx = cx + (x - cx) * factor
      const sy = cy + (y - cy) * factor
      dst[y * w + x] = bilinearSample(src, w, h, sx, sy)
    }
  }
  return dst
}

// 3x3 高斯模糊（unsharp mask 的中间步骤）
function gaussianBlur(src: Float32Array, w: number, h: number): Float32Array {
  const dst = new Float32Array(w * h)
  const k = [1 / 16, 2 / 16, 1 / 16, 2 / 16, 4 / 16, 2 / 16, 1 / 16, 2 / 16, 1 / 16]

  // 边界像素直接复制，避免锐化时产生白边
  for (let y = 0; y < h; y++) {
    dst[y * w] = src[y * w]
    dst[y * w + w - 1] = src[y * w + w - 1]
  }
  for (let x = 0; x < w; x++) {
    dst[x] = src[x]
    dst[(h - 1) * w + x] = src[(h - 1) * w + x]
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      dst[i] =
        src[i - w - 1] * k[0] +
        src[i - w] * k[1] +
        src[i - w + 1] * k[2] +
        src[i - 1] * k[3] +
        src[i] * k[4] +
        src[i + 1] * k[5] +
        src[i + w - 1] * k[6] +
        src[i + w] * k[7] +
        src[i + w + 1] * k[8]
    }
  }
  return dst
}

// 锐化：unsharp mask，增强边缘，减轻残影/模糊
function unsharpMask(
  src: Float32Array,
  w: number,
  h: number,
  amount: number,
): Float32Array {
  const blurred = gaussianBlur(src, w, h)
  const dst = new Float32Array(w * h)
  for (let i = 0; i < src.length; i++) {
    const v = src[i] + amount * (src[i] - blurred[i])
    dst[i] = v < 0 ? 0 : v > 255 ? 255 : v
  }
  return dst
}

// Otsu 自适应阈值二值化：黑更黑、白更白
function otsuBinarize(src: Float32Array, w: number, h: number): Float32Array {
  const hist = new Float64Array(256)
  for (let i = 0; i < src.length; i++) {
    hist[Math.max(0, Math.min(255, Math.round(src[i])))]++
  }

  const total = src.length
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * hist[i]

  let sumB = 0
  let wB = 0
  let maxVar = -1
  let threshold = 128

  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break

    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const varBetween = wB * wF * (mB - mF) * (mB - mF)

    if (varBetween > maxVar) {
      maxVar = varBetween
      threshold = t
    }
  }

  const dst = new Float32Array(w * h)
  for (let i = 0; i < src.length; i++) {
    dst[i] = src[i] > threshold ? 255 : 0
  }
  return dst
}

// 综合图像增强：灰度化 → 畸变校正 → 锐化 → 二值化
export function enhanceImageData(imageData: ImageData): ImageData {
  const w = imageData.width
  const h = imageData.height
  const src = imageData.data

  // 1. 灰度化
  const gray = grayscale(src, w, h)

  // 2. 径向畸变校正（温和系数，减轻桶形畸变）
  const corrected = undistort(gray, w, h, 0.06)

  // 3. 锐化（unsharp mask，减轻残影/模糊）
  const sharpened = unsharpMask(corrected, w, h, 1.0)

  // 4. Otsu 二值化（黑更黑、白更白，提升对比度）
  const binarized = otsuBinarize(sharpened, w, h)

  // 写回 ImageData
  const out = new ImageData(w, h)
  for (let i = 0, j = 0; i < out.data.length; i += 4, j++) {
    const v = binarized[j]
    out.data[i] = v
    out.data[i + 1] = v
    out.data[i + 2] = v
    out.data[i + 3] = 255
  }
  return out
}
