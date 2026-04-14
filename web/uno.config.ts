import { defineConfig, presetIcons } from 'unocss'
import presetWind4 from '@unocss/preset-wind4'
import transformerDirectives from '@unocss/transformer-directives'
import transformerVariantGroup from '@unocss/transformer-variant-group'

export default defineConfig({
  theme: {
    colors: {
      brand: {
        1: '#63e2b6',
        2: '#7fe7c4',
        3: '#5acea7',
      },
      surface: {
        1: '#181b21',
        2: '#20242b',
        3: '#2a2f39',
      },
    },
  },
  shortcuts: {
    'glass-card': 'rounded-4 border border-white/8 bg-[rgba(24,27,33,0.92)] backdrop-blur-4 shadow-[0_16px_40px_rgba(0,0,0,0.22)]',
    'soft-panel': 'rounded-3 border border-white/6 bg-[rgba(32,36,43,0.82)]',
    'page-wrap': 'mx-auto w-full max-w-[1320px]',
  },
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.05,
      extraProperties: {
        'display': 'inline-block',
        'vertical-align': 'middle',
      },
    }),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
})
