import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

function isPackageChunk(id: string, name: string) {
  return id.includes(`/node_modules/${name}/`) || id.includes(`\\node_modules\\${name}\\`)
}

function resolveNaiveChunk(id: string) {
  if (!['naive-ui', 'vueuc', 'vooks', 'seemly', 'evtd', '@css-render'].some((name) => isPackageChunk(id, name))) {
    return null
  }

  if (/(data-table|pagination)/.test(id)) {
    return 'naive-data'
  }

  if (/(auto-complete|select|dropdown|tabs)/.test(id)) {
    return 'naive-navigation'
  }

  if (/(date-picker|form|input-number|input|switch)/.test(id)) {
    return 'naive-form'
  }

  if (/(dialog|modal|notification|message|loading-bar|spin)/.test(id)) {
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
