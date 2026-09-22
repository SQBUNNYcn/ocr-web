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

  async function recognize(image: File | Blob | string, language: string) {
    if (!image) {
      error.value = '请先选择一张图片'
      return
    }

    status.value = 'loading'
    error.value = ''
    progress.value = 0
    result.value = null

    try {
      if (!worker.value) {
        worker.value = await createWorker(language, 1, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              status.value = 'recognizing'
              progress.value = m.progress
            }
          },
        })
      } else {
        await worker.value.reinitialize(language, 1)
      }

      status.value = 'recognizing'
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
    terminate,
    supportedLanguages: SUPPORTED_LANGUAGES,
  }
}