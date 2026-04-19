import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

const NAIVE_DATA_CHUNK_RE = /data-table|pagination/
const NAIVE_NAVIGATION_CHUNK_RE = /auto-complete|select|dropdown|tabs/
const NAIVE_FORM_CHUNK_RE = /date-picker|form|input-number|input|switch/
const NAIVE_FEEDBACK_CHUNK_RE = /dialog|modal|notification|message|loading-bar|spin/

function isPackageChunk(id: string, name: string) {
  return id.includes(`/node_modules/${name}/`) || id.includes(`\\node_modules\\${name}\\`)
}

function resolveNaiveChunk(id: string) {
  if (!['naive-ui', 'vueuc', 'vooks', 'seemly', 'evtd', '@css-render'].some((name) => isPackageChunk(id, name))) {
    return null
  }

  if (NAIVE_DATA_CHUNK_RE.test(id)) {
    return 'naive-data'
  }

  if (NAIVE_NAVIGATION_CHUNK_RE.test(id)) {
    return 'naive-navigation'
  }

  if (NAIVE_FORM_CHUNK_RE.test(id)) {
    return 'naive-form'
  }

  if (NAIVE_FEEDBACK_CHUNK_RE.test(id)) {
    return 'naive-feedback'
  }

  return 'naive-core'
}

export default defineConfig({
  base: '/pay/',
  plugins: [vue(), UnoCSS()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (isPackageChunk(id, 'vue') || isPackageChunk(id, 'vue-router') || isPackageChunk(id, 'pinia')) {
            return 'framework'
          }

          if (isPackageChunk(id, 'dayjs')) {
            return 'dayjs'
          }

          if (isPackageChunk(id, 'vue-echarts')) {
            return 'charts-vue'
          }

          if (isPackageChunk(id, 'zrender')) {
            return 'charts-renderer'
          }

          if (isPackageChunk(id, 'echarts')) {
            return 'charts-core'
          }

          const naiveChunk = resolveNaiveChunk(id)

          if (naiveChunk) {
            return naiveChunk
          }
        },
      },
    },
  },
})
