<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  type IScannerControls,
} from '@zxing/browser'

interface ScanResult {
  text: string
  format: string
}

const FORMAT_LABELS: Record<number, string> = {
  [BarcodeFormat.AZTEC]: 'Aztec 二维码',
  [BarcodeFormat.CODABAR]: 'Codabar 条形码',
  [BarcodeFormat.CODE_39]: 'Code 39 条形码',
  [BarcodeFormat.CODE_93]: 'Code 93 条形码',
  [BarcodeFormat.CODE_128]: 'Code 128 条形码',
  [BarcodeFormat.DATA_MATRIX]: 'Data Matrix 二维码',
  [BarcodeFormat.EAN_8]: 'EAN-8 条形码',
  [BarcodeFormat.EAN_13]: 'EAN-13 条形码',
  [BarcodeFormat.ITF]: 'ITF 条形码',
  [BarcodeFormat.MAXICODE]: 'MaxiCode 二维码',
  [BarcodeFormat.PDF_417]: 'PDF417 二维码',
  [BarcodeFormat.QR_CODE]: '二维码',
  [BarcodeFormat.RSS_14]: 'RSS-14 条形码',
  [BarcodeFormat.RSS_EXPANDED]: 'RSS Expanded 条形码',
  [BarcodeFormat.UPC_A]: 'UPC-A 条形码',
  [BarcodeFormat.UPC_E]: 'UPC-E 条形码',
  [BarcodeFormat.UPC_EAN_EXTENSION]: 'UPC/EAN 扩展',
  [BarcodeFormat.MICRO_QR_CODE]: 'Micro QR 二维码',
}

function formatLabel(format: BarcodeFormat): string {
  return FORMAT_LABELS[format] ?? BarcodeFormat[format] ?? '未知格式'
}

const reader = new BrowserMultiFormatReader()

const videoRef = ref<HTMLVideoElement | null>(null)
const scanning = ref(false)
const result = ref<ScanResult | null>(null)
const devices = ref<MediaDeviceInfo[]>([])
const currentDeviceId = ref<string | undefined>(undefined)
const error = ref('')
const copied = ref(false)
const imageDecoding = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

let controls: IScannerControls | null = null

// 手电筒
const hasTorch = ref(false)
const torchOn = ref(false)

// 扫码历史记录
interface HistoryItem {
  id: number
  text: string
  format: string
  time: string
}

const STORAGE_KEY = 'barcode-scan-history'
const history = ref<HistoryItem[]>([])

function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    history.value = raw ? (JSON.parse(raw) as HistoryItem[]) : []
  } catch {
    history.value = []
  }
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.value))
  } catch {
    // 忽略存储失败
  }
}

function addHistory(text: string, format: string) {
  if (!text) return
  // 与最近一条相同则去重
  if (history.value[0]?.text === text) return
  history.value.unshift({
    id: Date.now(),
    text,
    format,
    time: new Date().toLocaleString(),
  })
  if (history.value.length > 50) history.value = history.value.slice(0, 50)
  saveHistory()
}

function clearHistory() {
  history.value = []
  saveHistory()
}

async function copyHistoryItem(item: HistoryItem) {
  try {
    await navigator.clipboard.writeText(item.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // 忽略复制失败
  }
}

function detectTorch() {
  const video = videoRef.value
  const stream = video?.srcObject as MediaStream | null
  const track = stream?.getVideoTracks()[0]
  const caps = track?.getCapabilities?.() as
    | { torch?: boolean }
    | undefined
  hasTorch.value = !!caps?.torch
}

async function toggleTorch() {
  const video = videoRef.value
  const stream = video?.srcObject as MediaStream | null
  const track = stream?.getVideoTracks()[0]
  if (!track) return
  const next = !torchOn.value
  try {
    const constraints = {
      advanced: [{ torch: next }],
    } as unknown as MediaTrackConstraints
    await track.applyConstraints(constraints)
    torchOn.value = next
  } catch {
    hasTorch.value = false
    torchOn.value = false
  }
}

async function loadDevices() {
  try {
    devices.value = await BrowserMultiFormatReader.listVideoInputDevices()
    if (devices.value.length > 0) {
      // 优先选择后置摄像头（environment facing）
      const back = devices.value.find((d) => /back|environment/i.test(d.label))
      currentDeviceId.value = (back ?? devices.value[0]).deviceId
    }
  } catch {
    devices.value = []
  }
}

async function start() {
  error.value = ''
  try {
    const video = videoRef.value
    if (!video) return
    controls = await reader.decodeFromVideoDevice(
      currentDeviceId.value,
      video,
      (res) => {
        if (res) {
          const text = res.getText()
          const format = formatLabel(res.getBarcodeFormat())
          result.value = { text, format }
          addHistory(text, format)
        }
      },
    )
    scanning.value = true
    detectTorch()
  } catch {
    error.value = '无法访问摄像头，请检查浏览器权限设置。'
    scanning.value = false
  }
}

function stop() {
  controls?.stop()
  controls = null
  scanning.value = false
  torchOn.value = false
  hasTorch.value = false
}

async function switchCamera() {
  if (devices.value.length < 2) return
  const idx = devices.value.findIndex((d) => d.deviceId === currentDeviceId.value)
  const next = devices.value[(idx + 1) % devices.value.length]
  currentDeviceId.value = next.deviceId
  stop()
  await start()
}

async function copyResult() {
  if (!result.value?.text) return
  try {
    await navigator.clipboard.writeText(result.value.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = result.value.text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
}

function openImagePicker() {
  fileInputRef.value?.click()
}

async function handleImage(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const url = URL.createObjectURL(file)
  imageDecoding.value = true
  error.value = ''
  try {
    const res = await reader.decodeFromImageUrl(url)
    result.value = {
      text: res.getText(),
      format: formatLabel(res.getBarcodeFormat()),
    }
  } catch {
    error.value = '未在图片中检测到二维码/条码，请换一张更清晰的图片。'
  } finally {
    URL.revokeObjectURL(url)
    imageDecoding.value = false
  }
}

loadDevices()
loadHistory()

onBeforeUnmount(() => {
  stop()
})
</script>

<template>
  <div class="scanner">
    <div class="scanner-grid">
      <!-- 摄像头预览 -->
      <div class="camera-panel">
        <div class="video-wrap">
          <video ref="videoRef" class="video" playsinline muted></video>

          <!-- 未开启时的占位 -->
          <div v-if="!scanning" class="video-overlay">
            <svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="currentColor" stroke-width="1.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.5a.75.75 0 01.75-.75h3.75a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75H4.5a.75.75 0 01-.75-.75V4.5zM3.75 12a.75.75 0 01.75-.75h3.75a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75H4.5a.75.75 0 01-.75-.75V12zM11.25 4.5a.75.75 0 01.75-.75h3.75a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75H12a.75.75 0 01-.75-.75V4.5zM11.25 12a.75.75 0 01.75-.75h3.75a.75.75 0 01.75.75v3.75a.75.75 0 01-.75.75H12a.75.75 0 01-.75-.75V12z" />
            </svg>
            <button class="btn btn-secondary" @click="start">开启摄像头扫码</button>
            <p class="overlay-tip">需要摄像头权限，扫描二维码或条形码</p>
          </div>

          <!-- 扫描框动画 -->
          <div v-if="scanning" class="scan-frame">
            <span class="scan-line"></span>
          </div>
        </div>

        <div class="camera-actions">
          <button class="btn btn-ghost" :disabled="!scanning" @click="stop">停止</button>
          <button
            class="btn btn-ghost"
            :disabled="devices.length < 2"
            @click="switchCamera"
          >
            切换摄像头
          </button>
          <button
            v-if="hasTorch"
            class="btn btn-ghost"
            :disabled="!scanning"
            @click="toggleTorch"
          >
            {{ torchOn ? '关闭手电筒' : '开启手电筒' }}
          </button>
        </div>

        <p v-if="error" class="error-banner">{{ error }}</p>

        <div class="image-scan">
          <button class="btn btn-ghost" :disabled="imageDecoding" @click="openImagePicker">
            {{ imageDecoding ? '识别中…' : '上传含二维码/条码的图片' }}
          </button>
          <input ref="fileInputRef" type="file" accept="image/*" hidden @change="handleImage" />
        </div>
      </div>

      <!-- 扫描结果 -->
      <div class="result-panel">
        <div v-if="result && result.text" class="result-content">
          <div class="result-header">
            <span class="format-tag">{{ result.format }}</span>
            <button class="copy-btn" @click="copyResult">
              {{ copied ? '已复制 ✓' : '复制内容' }}
            </button>
          </div>
          <div class="result-text">{{ result.text }}</div>
          <a
            v-if="/^https?:\/\//i.test(result.text)"
            class="open-link"
            :href="result.text"
            target="_blank"
            rel="noopener noreferrer"
          >
            打开链接 ↗
          </a>
        </div>

        <div v-else class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 4.5h3.75v3.75H3.75V4.5zM16.5 4.5h3.75v3.75H16.5V4.5zM3.75 15.75h3.75v3.75H3.75v-3.75zM16.5 15.75h3.75v3.75H16.5v-3.75z" />
          </svg>
          <p>扫描结果将显示在这里</p>
          <p class="sub-tip">支持二维码及各类条形码</p>
        </div>
      </div>
    </div>

    <!-- 扫码历史记录 -->
    <div v-if="history.length" class="history-panel">
      <div class="history-header">
        <span>扫码历史（{{ history.length }}）</span>
        <button class="clear-btn" @click="clearHistory">清空历史</button>
      </div>
      <ul class="history-list">
        <li v-for="item in history" :key="item.id" class="history-item">
          <span class="history-format">{{ item.format }}</span>
          <span class="history-text" :title="item.text">{{ item.text }}</span>
          <span class="history-time">{{ item.time }}</span>
          <button class="history-copy" @click="copyHistoryItem(item)">复制</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.scanner-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.video-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.video-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #fff;
  background: rgba(15, 23, 42, 0.85);
  text-align: center;
  padding: 20px;
}

.overlay-tip {
  font-size: 13px;
  color: #cbd5e1;
  margin: 0;
}

.scan-frame {
  position: absolute;
  inset: 12%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-radius: 12px;
  pointer-events: none;
  overflow: hidden;
}

.scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 3px;
  background: #3b82f6;
  box-shadow: 0 0 8px 2px rgba(59, 130, 246, 0.7);
  animation: scan 2.2s ease-in-out infinite;
}

@keyframes scan {
  0%,
  100% {
    top: 2%;
  }
  50% {
    top: 96%;
  }
}

.camera-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.image-scan {
  margin-top: 14px;
}

.error-banner {
  background: #fdecea;
  color: #b3261e;
  padding: 10px 14px;
  border-radius: 8px;
  margin-top: 14px;
  font-size: 13px;
}

.result-panel {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  min-height: 320px;
  display: flex;
  flex-direction: column;
}

.result-content {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.format-tag {
  font-size: 13px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
}

.copy-btn {
  background: var(--primary);
  color: #fff;
  border: none;
  padding: 7px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: opacity 0.2s;
}

.copy-btn:hover {
  opacity: 0.9;
}

.result-text {
  flex: 1;
  margin: 0;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 15px;
  line-height: 1.7;
  overflow-y: auto;
  color: var(--text);
}

.open-link {
  display: inline-block;
  margin: 0 16px 16px;
  color: var(--primary);
  text-decoration: none;
  font-size: 14px;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 14px;
  padding: 20px;
  text-align: center;
}

.sub-tip {
  font-size: 12px;
  margin: 0;
}

.btn {
  padding: 10px 18px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid var(--border);
  transition: opacity 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.btn:hover:not(:disabled) {
  opacity: 0.85;
}

.history-panel {
  margin-top: 20px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.clear-btn:hover {
  color: #b3261e;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 320px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
}

.history-item:last-child {
  border-bottom: none;
}

.history-format {
  flex-shrink: 0;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--primary);
}

.history-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.history-copy {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.history-copy:hover {
  color: var(--primary);
  border-color: var(--primary);
}

@media (max-width: 768px) {
  .scanner-grid {
    grid-template-columns: 1fr;
  }

  .history-time {
    display: none;
  }
}
</style>
