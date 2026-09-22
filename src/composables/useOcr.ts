import { ref } from 'vue'
import { createWorker, type Worker } from 'tesseract.js'

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

export function useOcr() {
  const status = ref<OcrStatus>('idle')
  const result = ref<OcrResult | null>(null)
  const error = ref<string>('')
  const progress = ref(0)
  const worker = ref<Worker | null>(null)
  const loadedLanguage = ref('')

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

  async function recognize(image: File | Blob | string, language: string) {
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
      const { data } = await worker.value.recognize(image)
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
    supportedLanguages: SUPPORTED_LANGUAGES,
  }
}