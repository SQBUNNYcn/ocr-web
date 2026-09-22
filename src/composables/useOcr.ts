import { ref } from 'vue'
import { createWorker, PSM, type Worker } from 'tesseract.js'
import { enhanceImageData } from '../utils/imageEnhance'
import { detectSkewAngleFromCanvas, rotateCanvas } from '../utils/deskew'

export type OcrStatus = 'idle' | 'loading' | 'recognizing' | 'done' | 'error'

export interface OcrResult {
  text: string
  confidence: number
}

const SUPPORTED_LANGUAGES = [
  { value: 'chi_sim+eng', label: '中文简体 + 英文' },
  { value: 'chi_tra+eng', label: '中文繁体 + 英文' },
  { value: 'eng', label: '英文' },
  { value: 'jpn', label: '日文' },
  { value: 'kor', label: '韩文' },
]

// 页面分割模式（Page Segmentation Mode）选项
const PSM_OPTIONS = [
  { value: PSM.AUTO, label: '自动检测' },
  { value: PSM.SINGLE_BLOCK, label: '整页文档' },
  { value: PSM.SINGLE_COLUMN, label: '单列文字' },
  { value: PSM.SINGLE_LINE, label: '单行文字' },
  { value: PSM.SPARSE_TEXT, label: '稀疏文字' },
]

export function useOcr() {
  const status = ref<OcrStatus>('idle')
  const result = ref<OcrResult | null>(null)
  const error = ref<string>('')
  const progress = ref(0)
  const worker = ref<Worker | null>(null)
  const loadedLanguage = ref('')

  // 倾斜校正相关状态
  const autoDeskew = ref(true) // 是否自动检测并校正文字倾斜
  const deskewAngle = ref(0) // 最近一次检测到的倾斜角度（度）
  const deskewCorrected = ref(false) // 最近一次是否执行了校正

  // 后台预加载识别引擎（worker + 语言模型）
  async function preload(language: string) {
    if (worker.value && loadedLanguage.value === language) {
      return
    }
    status.value = 'loading'
    error.value = ''
    progress.value = 0
    try {
      if (worker.value) {
        await worker.value.reinitialize(language, 1)
      } else {
        worker.value = await createWorker(language, 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              status.value = 'recognizing'
              progress.value = m.progress
            } else if (m.status === 'loading language traineddata') {
              status.value = 'loading'
              progress.value = m.progress
            }
          },
        })
      }
      loadedLanguage.value = language
      status.value = 'idle'
    } catch (err) {
      status.value = 'error'
      error.value = err instanceof Error ? err.message : '识别引擎加载失败，请重试'
    }
  }

  // 图像预处理：缩放 + 灰度化 + 对比度增强，提升 OCR 准确率
  async function preprocessImage(image: File | Blob | string): Promise<string> {
    const url = typeof image === 'string' ? image : URL.createObjectURL(image)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('图片加载失败'))
        el.src = url
      })

      let w = img.naturalWidth
      let h = img.naturalHeight

      // 缩放：限制最大宽度，避免超大图降低识别效果
      const MAX_WIDTH = 2000
      if (w > MAX_WIDTH) {
        const scale = MAX_WIDTH / w
        w = MAX_WIDTH
        h = Math.round(h * scale)
      }

      let canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      let ctx = canvas.getContext('2d')
      if (!ctx) return url

      ctx.drawImage(img, 0, 0, w, h)

      // 倾斜校正：检测文字倾斜角度并旋转回正（手抖/歪斜自动纠偏）
      deskewAngle.value = 0
      deskewCorrected.value = false
      if (autoDeskew.value) {
        try {
          // 用小图做角度检测（投影法），提升性能
          const DETECT_WIDTH = 400
          const smallScale = Math.min(1, DETECT_WIDTH / img.naturalWidth)
          const sw = Math.max(1, Math.round(img.naturalWidth * smallScale))
          const sh = Math.max(1, Math.round(img.naturalHeight * smallScale))
          const smallCanvas = document.createElement('canvas')
          smallCanvas.width = sw
          smallCanvas.height = sh
          const smallCtx = smallCanvas.getContext('2d')
          if (smallCtx) {
            smallCtx.drawImage(img, 0, 0, sw, sh)
            const detection = detectSkewAngleFromCanvas(smallCanvas)
            const angle = detection.angle
            deskewAngle.value = Math.round(angle * 10) / 10
            // 仅当检测可靠且倾斜明显时才校正，避免误判破坏正常图片
            if (detection.reliable && Math.abs(angle) >= 0.5) {
              deskewCorrected.value = true
              canvas = rotateCanvas(canvas, angle)
            } else {
              deskewCorrected.value = false
            }
          }
        } catch {
          // 倾斜检测失败则跳过校正，使用原图
          deskewAngle.value = 0
          deskewCorrected.value = false
        }
      }

      // 图像增强：灰度化 + 畸变校正 + 锐化 + 二值化
      ctx = canvas.getContext('2d')
      if (!ctx) return url
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const enhanced = enhanceImageData(imageData)
      ctx.putImageData(enhanced, 0, 0)

      // 二值化后输出 PNG（无损），避免 JPEG 压缩在黑白边界产生噪点
      return canvas.toDataURL('image/png')
    } finally {
      if (typeof image !== 'string') {
        URL.revokeObjectURL(url)
      }
    }
  }

  async function recognize(image: File | Blob | string, language: string, psm: string = PSM.AUTO) {
    if (!image) {
      error.value = '请先选择一张图片'
      return
    }

    // 若引擎未加载或语言不一致，先（后台）加载
    if (!worker.value || loadedLanguage.value !== language) {
      await preload(language)
    }
    if (!worker.value || status.value === 'error') {
      return
    }

    status.value = 'recognizing'
    error.value = ''
    progress.value = 0
    result.value = null

    try {
      // 设置页面分割模式（PSM），提升不同版面文字的识别准确率
      await worker.value.setParameters({ tessedit_pageseg_mode: psm as PSM })
      // 图像预处理（缩放 + 灰度 + 对比度）
      const processed = await preprocessImage(image)
      const { data } = await worker.value.recognize(processed)
      result.value = {
        text: data.text,
        confidence: data.confidence,
      }
      status.value = 'done'
    } catch (err) {
      status.value = 'error'
      error.value = err instanceof Error ? err.message : '识别失败，请重试'
    }
  }

  async function terminate() {
    if (worker.value) {
      await worker.value.terminate()
      worker.value = null
    }
  }

  return {
    status,
    result,
    error,
    progress,
    recognize,
    preload,
    terminate,
    autoDeskew,
    deskewAngle,
    deskewCorrected,
    supportedLanguages: SUPPORTED_LANGUAGES,
    psmOptions: PSM_OPTIONS,
  }
}