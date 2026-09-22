// 图像倾斜检测与自动校正（deskew）
// 算法：Otsu 自动二值化 + 投影法（Projection Profile）
// 原理：文字水平时，水平投影的方差最大；通过搜索使投影方差最大的旋转角，即可估算倾斜角。

export interface DeskewResult {
  /** 检测到的倾斜角度（度），旋转该角度可使文字水平（正值=顺时针） */
  angle: number
  /** 是否检测到明显倾斜（|angle| 超过阈值） */
  corrected: boolean
  /** 校正后的图片 Data URL（PNG） */
  correctedDataUrl: string
}

/** 小于该角度（度）视为无需校正 */
const MIN_SIGNIFICANT_ANGLE = 0.5
/** 角度检测的搜索范围（度），手抖歪斜通常在 ±10° 以内 */
const SEARCH_RANGE = 10

export interface SkewDetection {
  /** 检测到的倾斜角度（度） */
  angle: number
  /** 检测是否可靠（有明显倾斜），不可靠时应跳过校正避免破坏图片 */
  reliable: boolean
}

function grayOfPixel(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = source
  })
}

/** 将图片缩放到指定最大宽度，返回 canvas */
function toCanvas(img: HTMLImageElement, maxWidth: number): HTMLCanvasElement {
  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

/** Otsu 自动阈值：分离前景（文字）与背景 */
function otsuThreshold(canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const histogram = new Float64Array(256)
  for (let i = 0; i < data.length; i += 4) {
    histogram[Math.round(grayOfPixel(data[i], data[i + 1], data[i + 2]))]++
  }

  const total = canvas.width * canvas.height
  let sum = 0
  for (let i = 0; i < 256; i++) sum += i * histogram[i]

  let sumB = 0
  let wB = 0
  let maxVariance = 0
  let threshold = 127
  for (let t = 0; t < 256; t++) {
    wB += histogram[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * histogram[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const variance = wB * wF * (mB - mF) * (mB - mF)
    if (variance > maxVariance) {
      maxVariance = variance
      threshold = t
    }
  }
  return threshold
}

/** 旋转 canvas（白色背景填充，避免边缘产生黑色伪影） */
export function rotateCanvas(source: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  const rad = (angleDeg * Math.PI) / 180
  const w = source.width
  const h = source.height
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const newW = Math.max(1, Math.ceil(w * cos + h * sin))
  const newH = Math.max(1, Math.ceil(w * sin + h * cos))
  const canvas = document.createElement('canvas')
  canvas.width = newW
  canvas.height = newH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, newW, newH)
  ctx.translate(newW / 2, newH / 2)
  ctx.rotate(rad)
  ctx.drawImage(source, -w / 2, -h / 2)
  return canvas
}

/** 计算某角度下水平投影的方差（文字越水平，方差越大） */
function projectionScore(
  canvas: HTMLCanvasElement,
  threshold: number,
  angleDeg: number,
): number {
  const rotated = rotateCanvas(canvas, angleDeg)
  const ctx = rotated.getContext('2d')!
  const imageData = ctx.getImageData(0, 0, rotated.width, rotated.height)
  const data = imageData.data
  const w = rotated.width
  const h = rotated.height

  const rowSums = new Float64Array(h)
  for (let y = 0; y < h; y++) {
    let count = 0
    let idx = y * w * 4
    for (let x = 0; x < w; x++, idx += 4) {
      if (grayOfPixel(data[idx], data[idx + 1], data[idx + 2]) < threshold) count++
    }
    rowSums[y] = count
  }

  let mean = 0
  for (let y = 0; y < h; y++) mean += rowSums[y]
  mean /= h

  let variance = 0
  for (let y = 0; y < h; y++) {
    const d = rowSums[y] - mean
    variance += d * d
  }
  return variance / h
}

/** 粗精两步搜索倾斜角度（精度 0.5°） */
function detectAngle(canvas: HTMLCanvasElement, threshold: number): number {
  let bestAngle = 0
  let bestScore = -1

  // 粗测：步长 3°
  for (let a = -SEARCH_RANGE; a <= SEARCH_RANGE; a += 3) {
    const score = projectionScore(canvas, threshold, a)
    if (score > bestScore) {
      bestScore = score
      bestAngle = a
    }
  }

  // 精测：在最佳角度 ±3° 范围内，步长 0.5°
  for (let a = bestAngle - 3; a <= bestAngle + 3; a += 0.5) {
    const score = projectionScore(canvas, threshold, a)
    if (score > bestScore) {
      bestScore = score
      bestAngle = a
    }
  }

  return bestAngle
}

/** 从 canvas 直接检测文字倾斜角度（同步，内部使用 Otsu + 投影法），并给出可靠度 */
export function detectSkewAngleFromCanvas(canvas: HTMLCanvasElement): SkewDetection {
  const threshold = otsuThreshold(canvas)
  const angle = detectAngle(canvas, threshold)

  // 可靠度判断：最佳角度 vs 0° 的投影方差对比
  const scoreZero = projectionScore(canvas, threshold, 0)
  const scoreBest = projectionScore(canvas, threshold, angle)

  // 文字极少或纯色图（投影方差接近 0）时，判定不可靠
  if (scoreZero < 1) {
    return { angle: 0, reliable: false }
  }
  // 最佳角度的方差需明显高于 0°（≥10%），否则说明没有可靠倾斜，跳过校正
  const reliable = scoreBest > scoreZero * 1.1

  return { angle, reliable }
}

/**
 * 主函数：检测图片中文字的倾斜角度并返回校正后的图片
 * @param source 图片 URL / Data URL / Blob URL
 * @param options.maxWidth 角度检测时缩放的宽度（越大越准但越慢）
 */
export async function deskewImage(
  source: string,
  options?: { maxWidth?: number },
): Promise<DeskewResult> {
  const maxWidth = options?.maxWidth ?? 400
  const img = await loadImage(source)

  // 用小图做角度检测（提升性能）
  const smallCanvas = toCanvas(img, maxWidth)
  const threshold = otsuThreshold(smallCanvas)
  const angle = detectAngle(smallCanvas, threshold)

  const corrected = Math.abs(angle) >= MIN_SIGNIFICANT_ANGLE

  // 用较高分辨率图做实际校正，保证 OCR 清晰度
  const fullCanvas = toCanvas(img, 1600)
  const outputCanvas = corrected ? rotateCanvas(fullCanvas, angle) : fullCanvas
  const correctedDataUrl = outputCanvas.toDataURL('image/png')

  return {
    angle: Math.round(angle * 10) / 10,
    corrected,
    correctedDataUrl,
  }
}

