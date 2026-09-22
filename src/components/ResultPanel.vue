<script setup lang="ts">
import { computed, ref } from 'vue'
import type { OcrResult } from '../composables/useOcr'

const props = defineProps<{
  result: OcrResult | null
}>()

const copied = ref(false)

const confidenceText = computed(() => {
  if (!props.result) return ''
  return `${Math.round(props.result.confidence)}%`
})

async function copyText() {
  if (!props.result || !props.result.text) return
  try {
    await navigator.clipboard.writeText(props.result.text)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // 降级方案：使用 textarea
    const textarea = document.createElement('textarea')
    textarea.value = props.result.text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function exportTxt() {
  if (!props.result?.text) return
  // 添加 BOM，确保 Windows 记事本正确识别 UTF-8 中文
  const blob = new Blob(['\ufeff' + props.result.text], {
    type: 'text/plain;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '识别结果.txt'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportPdf() {
  if (!props.result?.text) return
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>文字识别结果</title>
<style>
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; padding: 40px; margin: 0; color: #1e293b; }
  h1 { font-size: 20px; margin-bottom: 6px; }
  .meta { font-size: 12px; color: #64748b; margin-bottom: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 12px; }
  pre { white-space: pre-wrap; word-break: break-all; font-family: inherit; font-size: 14px; line-height: 1.9; margin: 0; }
</style>
</head>
<body>
<h1>文字识别结果</h1>
<div class="meta">识别置信度：${Math.round(props.result.confidence)}%</div>
<pre>${escapeHtml(props.result.text)}</pre>
</body>
</html>`
  const win = window.open('', '_blank', 'width=800,height=600')
  if (!win) {
    alert('请允许弹出窗口以导出 PDF')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  setTimeout(() => {
    win.focus()
    win.print()
  }, 300)
}
</script>

<template>
  <div class="result-panel">
    <div v-if="result && result.text.trim()" class="result-content">
      <div class="result-header">
        <div class="meta">
          <span class="confidence" :title="'识别置信度'">
            置信度 {{ confidenceText }}
          </span>
        </div>
        <div class="actions">
          <button class="copy-btn" @click="copyText">
            {{ copied ? '已复制 ✓' : '复制' }}
          </button>
          <button class="ghost-btn" @click="exportTxt">导出 TXT</button>
          <button class="ghost-btn" @click="exportPdf">导出 PDF</button>
        </div>
      </div>
      <pre class="result-text">{{ result.text }}</pre>
    </div>

    <div v-else class="empty-state">
      <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
      <p>识别结果将显示在这里</p>
    </div>
  </div>
</template>

<style scoped>
.result-panel {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  min-height: 260px;
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

.meta {
  display: flex;
  gap: 8px;
}

.confidence {
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

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ghost-btn {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border);
  padding: 7px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  transition: color 0.2s, border-color 0.2s;
}

.ghost-btn:hover {
  color: var(--primary);
  border-color: var(--primary);
}

.result-text {
  flex: 1;
  margin: 0;
  padding: 16px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: inherit;
  font-size: 15px;
  line-height: 1.7;
  overflow-y: auto;
  color: var(--text);
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>