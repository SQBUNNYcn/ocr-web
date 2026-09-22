# 扫描识别文字（OCR）

一个基于 **Vue 3 + Vite + TypeScript** 的网页端文字识别应用，使用 [Tesseract.js](https://tesseract.projectnaptha.com/) 在浏览器本地完成 OCR 识别。

## 功能

- 📁 上传图片 / 拖拽图片进行识别
- 🌍 多语言识别：中文简体、中文繁体、英文、日文、韩文（可混合）
- ⚡ 实时识别进度条与置信度显示
- 📋 一键复制识别结果
- 🔒 完全本地处理，图片不会上传到服务器
- 🌗 自动适配浅色 / 深色主题

## 技术栈

- Vue 3（`<script setup>` 语法）
- Vite
- TypeScript
- Tesseract.js（浏览器端 OCR 引擎）

## 环境要求

- Node.js 18+（推荐 20+）
- npm

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 使用说明

1. 在页面左侧点击或拖拽上传图片（支持 JPG / PNG / WebP 等格式）。
2. 选择识别语言（默认「中文简体 + 英文」）。
3. 等待识别完成，结果会显示在右侧面板。
4. 点击「复制文字」即可复制识别结果，点击「重新识别」可再次识别。

## 说明

- 首次识别时需要从 CDN 下载对应语言的模型数据（`*.traineddata`），需要联网，之后会被浏览器缓存。
- 识别速度取决于图片大小和所选语言，多语言混合识别会比单语言稍慢。

## 目录结构

```
ocr-web/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── public/
│   └── vite.svg
└── src/
    ├── main.ts
    ├── App.vue
    ├── style.css
    ├── vite-env.d.ts
    ├── composables/
    │   └── useOcr.ts          # Tesseract.js 封装
    └── components/
        ├── ImageUploader.vue  # 图片上传/拖拽
        └── ResultPanel.vue    # 识别结果展示
```
