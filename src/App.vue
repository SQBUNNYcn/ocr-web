<script setup lang="ts">
import { ref, onBeforeUnmount, computed } from 'vue'
import ImageUploader from './components/ImageUploader.vue'
import ResultPanel from './components/ResultPanel.vue'
import CameraCapture from './components/CameraCapture.vue'
import { useOcr } from './composables/useOcr'

const {
  status,
  result,
  error,
  progress,
  recognize,
  terminate,
  supportedLanguages,
} = useOcr()

const selectedImage = ref<File | null>(null)
const capturedImage = ref('')
const language = ref('chi_sim+eng')
const activeTab = ref<'ocr' | 'camera'>('ocr')

// 当前标签页对应的图片（上传文件或拍照结果）
const currentImage = computed(() =>
  activeTab.value === 'ocr' ? selectedImage.value : capturedImage.value || null,
)
const hasImage = computed(() => !!currentImage.value)

async function handleSelect(image: File) {
  selectedImage.value = image
  await recognize(image, language.value)
}

async function handleCapture(image: string) {
  capturedImage.value = image
  await recognize(image, language.value)
}

async function handleLanguageChange() {
  const img = currentImage.value
  if (img) {
    await recognize(img, language.value)
  }
}

async function handleRetry() {
  const img = currentImage.value
  if (img) {
    await recognize(img, language.value)
  }
}

function handleClear() {
  selectedImage.value = null
  capturedImage.value = ''
  result.value = null
  error.value = ''
  progress.value = 0
  status.value = 'idle'
  language.value = 'chi_sim+eng'
}

onBeforeUnmount(() => {
  terminate()
})
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="header-inner">
        <div class="logo">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
          </svg>
          <span class="logo-text">扫描识别文字</span>
        </div>
        <span class="tagline">基于 Tesseract.js 的网页 OCR</span>
      </div>
    </header>

    <main class="main">
      <nav class="tabs">
        <button
          class="tab"
          :class="{ active: activeTab === 'ocr' }"
          @click="activeTab = 'ocr'"
        >
          文字识别
        </button>
        <button
          class="tab"
          :class="{ active: activeTab === 'camera' }"
          @click="activeTab = 'camera'"
        >
          拍照识别
        </button>
      </nav>

      <section class="controls">
        <div class="language-select">
          <label for="lang">识别语言</label>
          <select id="lang" v-model="language" :disabled="status === 'recognizing' || status === 'loading'" @change="handleLanguageChange">
            <option v-for="lang in supportedLanguages" :key="lang.value" :value="lang.value">
              {{ lang.label }}
            </option>
          </select>
        </div>

        <div class="action-buttons">
          <button
            v-if="hasImage && status === 'done'"
            class="btn btn-secondary"
            @click="handleRetry"
          >
            重新识别
          </button>
          <button v-if="hasImage" class="btn btn-ghost" @click="handleClear">
            清空
          </button>
        </div>
      </section>

      <p v-if="error" class="error-banner">{{ error }}</p>

      <div v-if="status === 'loading' || status === 'recognizing'" class="progress-box">
        <div class="progress-label">
          <span>{{ status === 'loading' ? '正在加载识别引擎…' : '正在识别文字…' }}</span>
          <span>{{ Math.round(progress * 100) }}%</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: `${Math.round(progress * 100)}%` }"></div>
        </div>
      </div>

      <template v-if="activeTab === 'ocr'">
        <div class="content-grid">
          <ImageUploader @select="handleSelect" />
          <ResultPanel :result="result" />
        </div>
      </template>

      <template v-else>
        <div class="content-grid">
          <CameraCapture @capture="handleCapture" />
          <ResultPanel :result="result" />
        </div>
      </template>
    </main>

    <footer class="footer">
      所有处理均在浏览器本地完成，图片不会上传到服务器。
    </footer>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 16px 0;
}

.header-inner {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--primary);
}

.logo-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--text);
}

.tagline {
  font-size: 13px;
  color: var(--text-secondary);
}

.main {
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--border);
}

.tab {
  padding: 10px 20px;
  font-size: 15px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.2s, border-color 0.2s;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
  font-weight: 600;
}

.controls {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.language-select {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.language-select label {
  font-size: 13px;
  color: var(--text-secondary);
}

.language-select select {
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  color: var(--text);
  font-size: 14px;
  cursor: pointer;
  min-width: 200px;
}

.language-select select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid var(--border);
  transition: opacity 0.2s;
}

.btn-secondary {
  background: var(--primary);
  color: #fff;
  border-color: var(--primary);
}

.btn-ghost {
  background: transparent;
  color: var(--text);
}

.btn:hover {
  opacity: 0.85;
}

.error-banner {
  background: #fdecea;
  color: #b3261e;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
  font-size: 14px;
}

.progress-box {
  margin-bottom: 16px;
  padding: 12px 16px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.progress-label {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  margin-bottom: 8px;
  color: var(--text-secondary);
}

.progress-bar {
  height: 8px;
  background: var(--bg-hover);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--primary);
  border-radius: 999px;
  transition: width 0.3s;
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.footer {
  text-align: center;
  padding: 20px 24px;
  font-size: 13px;
  color: var(--text-secondary);
  border-top: 1px solid var(--border);
}

@media (max-width: 768px) {
  .content-grid {
    grid-template-columns: 1fr;
  }
}
</style>