<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

const emit = defineEmits<{
  capture: [image: string]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const streaming = ref(false)
const error = ref('')
const capturedImage = ref('')
const devices = ref<MediaDeviceInfo[]>([])
const currentDeviceId = ref<string | undefined>(undefined)

let stream: MediaStream | null = null

async function loadDevices() {
  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    devices.value = list.filter((d) => d.kind === 'videoinput')
    if (devices.value.length > 0 && !currentDeviceId.value) {
      // 优先选择后置摄像头
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
    const constraints: MediaStreamConstraints = {
      video: currentDeviceId.value
        ? { deviceId: { exact: currentDeviceId.value } }
        : { facingMode: 'environment' },
      audio: false,
    }
    stream = await navigator.mediaDevices.getUserMedia(constraints)
    video.srcObject = stream
    await video.play()
    streaming.value = true
    // 授权后重新枚举设备，此时 label 可用
    loadDevices()
  } catch {
    error.value = '无法访问摄像头，请检查浏览器权限设置。'
    streaming.value = false
  }
}

function stop() {
  stream?.getTracks().forEach((t) => t.stop())
  stream = null
  streaming.value = false
}

async function switchCamera() {
  if (devices.value.length < 2) return
  const idx = devices.value.findIndex((d) => d.deviceId === currentDeviceId.value)
  const next = devices.value[(idx + 1) % devices.value.length]
  currentDeviceId.value = next.deviceId
  stop()
  await start()
}

function capture() {
  const video = videoRef.value
  if (!video) return

  const vw = video.videoWidth
  const vh = video.videoHeight

  if (!vw || !vh) {
    error.value = '视频未就绪，请稍后再拍'
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = vw
  canvas.height = vh
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // 明确指定源与目标尺寸，避免移动端浏览器 drawImage 尺寸异常导致偏移
  ctx.drawImage(video, 0, 0, vw, vh)
  capturedImage.value = canvas.toDataURL('image/jpeg', 0.95)
  stop()
  emit('capture', capturedImage.value)
}

function retake() {
  capturedImage.value = ''
  start()
}

loadDevices()

onBeforeUnmount(stop)
</script>

<template>
  <div class="camera">
    <div class="video-wrap">
      <video
        ref="videoRef"
        v-show="!capturedImage"
        class="video"
        playsinline
        muted
      ></video>

      <!-- 拍照后的静态预览 -->
      <img
        v-show="capturedImage"
        :src="capturedImage"
        alt="拍照预览"
        class="captured"
      />

      <!-- 未开启摄像头时的占位 -->
      <div v-if="!streaming && !capturedImage" class="video-overlay">
        <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
          <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
        </svg>
        <button class="btn btn-secondary" @click="start">开启摄像头</button>
        <p class="overlay-tip">需要摄像头权限，对准文字后点击拍照</p>
      </div>

      <!-- 取景框 -->
      <div v-if="streaming" class="frame">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
      </div>
    </div>

    <div class="camera-actions">
      <template v-if="!capturedImage">
        <button v-if="streaming" class="btn btn-secondary" @click="capture">📷 拍照</button>
        <button v-if="streaming" class="btn btn-ghost" @click="stop">停止</button>
        <button
          class="btn btn-ghost"
          :disabled="devices.length < 2"
          @click="switchCamera"
        >
          切换摄像头
        </button>
      </template>
      <template v-else>
        <button class="btn btn-secondary" @click="retake">重拍</button>
      </template>
    </div>

    <p v-if="error" class="error-banner">{{ error }}</p>
  </div>
</template>

<style scoped>
.video-wrap {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: #000;
  border-radius: 12px;
  overflow: hidden;
}

.video,
.captured {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain; /* 完整显示画面，避免预览与截图不一致导致偏移 */
  object-position: center;
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

.frame {
  position: absolute;
  inset: 8%;
  pointer-events: none;
}

.corner {
  position: absolute;
  width: 28px;
  height: 28px;
  border: 3px solid #3b82f6;
}

.corner.tl {
  top: 0;
  left: 0;
  border-right: none;
  border-bottom: none;
  border-top-left-radius: 8px;
}

.corner.tr {
  top: 0;
  right: 0;
  border-left: none;
  border-bottom: none;
  border-top-right-radius: 8px;
}

.corner.bl {
  bottom: 0;
  left: 0;
  border-right: none;
  border-top: none;
  border-bottom-left-radius: 8px;
}

.corner.br {
  bottom: 0;
  right: 0;
  border-left: none;
  border-top: none;
  border-bottom-right-radius: 8px;
}

.camera-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.error-banner {
  background: #fdecea;
  color: #b3261e;
  padding: 10px 14px;
  border-radius: 8px;
  margin-top: 14px;
  font-size: 13px;
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
</style>
