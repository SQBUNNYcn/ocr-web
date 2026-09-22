<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  select: [image: File]
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const preview = ref('')
const isDragging = ref(false)

function handleFile(file: File | undefined) {
  if (!file) return
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }
  preview.value = URL.createObjectURL(file)
  emit('select', file)
}

function onChange(e: Event) {
  const input = e.target as HTMLInputElement
  handleFile(input.files?.[0])
  input.value = ''
}

function onDrop(e: DragEvent) {
  isDragging.value = false
  handleFile(e.dataTransfer?.files?.[0])
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function onDragLeave() {
  isDragging.value = false
}

function openPicker() {
  inputRef.value?.click()
}
</script>

<template>
  <div
    class="uploader"
    :class="{ dragging: isDragging }"
    @click="openPicker"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <input ref="inputRef" type="file" accept="image/*" hidden @change="onChange" />

    <img v-if="preview" :src="preview" alt="预览图" class="preview" />
    <div v-else class="placeholder">
      <svg viewBox="0 0 24 24" width="56" height="56" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
      </svg>
      <p class="hint">点击选择图片，或将图片拖拽到此处</p>
      <p class="sub-hint">支持 JPG / PNG / WebP 等常见格式</p>
    </div>
  </div>
</template>

<style scoped>
.uploader {
  border: 2px dashed var(--border);
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  background: var(--bg-soft);
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.uploader:hover,
.uploader.dragging {
  border-color: var(--primary);
  background: var(--bg-hover);
}

.preview {
  max-width: 100%;
  max-height: 420px;
  border-radius: 8px;
  object-fit: contain;
}

.placeholder {
  text-align: center;
  color: var(--text-secondary);
}

.hint {
  margin-top: 16px;
  font-size: 15px;
  color: var(--text);
}

.sub-hint {
  margin-top: 6px;
  font-size: 13px;
}
</style>