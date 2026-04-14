<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NModalProvider,
  NNotificationProvider,
  useDialog,
  useLoadingBar,
  useMessage,
  useModal,
  useNotification,
} from 'naive-ui'
import { defineComponent, h, watchEffect } from 'vue'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#63e2b6',
    primaryColorHover: '#7fe7c4',
    primaryColorPressed: '#5acea7',
    primaryColorSuppl: '#7fe7c4',
    bodyColor: '#101014',
    cardColor: '#18191f',
    modalColor: '#16171c',
    popoverColor: '#16171c',
    tableColor: '#15171c',
    borderColor: 'rgba(255,255,255,0.08)',
    dividerColor: 'rgba(255,255,255,0.06)',
    textColorBase: '#edf0f6',
    textColor1: '#edf0f6',
    textColor2: '#c7ccd6',
    textColor3: '#8a909d',
    borderRadius: '6px',
    fontFamily: '"MiSans VF", sans-serif',
    fontFamilyMono: '"TCloud Number VF", "MiSans VF", sans-serif',
  },
  Button: {
    borderRadiusTiny: '6px',
    borderRadiusSmall: '6px',
    borderRadiusMedium: '6px',
    borderRadiusLarge: '6px',
  },
  Input: {
    color: 'rgba(30,32,39,0.98)',
    colorFocus: 'rgba(30,32,39,1)',
    colorFocusWarning: 'rgba(30,32,39,1)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderHover: '1px solid rgba(255,255,255,0.12)',
    borderFocus: '1px solid rgba(99,226,182,0.36)',
    boxShadowFocus: '0 0 0 3px rgba(99,226,182,0.08)',
  },
  InputNumber: {
    border: '1px solid rgba(255,255,255,0.08)',
    borderHover: '1px solid rgba(255,255,255,0.12)',
    borderFocus: '1px solid rgba(99,226,182,0.36)',
    color: 'rgba(30,32,39,0.98)',
    colorFocus: 'rgba(30,32,39,1)',
    boxShadowFocus: '0 0 0 3px rgba(99,226,182,0.08)',
  },
  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '6px',
        color: 'rgba(30,32,39,0.98)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderHover: '1px solid rgba(255,255,255,0.12)',
        borderFocus: '1px solid rgba(99,226,182,0.36)',
        boxShadowActive: '0 0 0 3px rgba(99,226,182,0.08)',
      },
    },
  },
  Card: {
    color: '#18191f',
    colorEmbedded: '#18191f',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: '6px',
    boxShadow: 'none',
    titleTextColor: '#edf0f6',
    textColor: '#c7ccd6',
  },
  Layout: {
    siderColor: '#131419',
    colorEmbedded: '#101014',
    headerColor: 'rgba(16,16,20,0.88)',
    footerColor: 'transparent',
  },
  Tabs: {
    tabBorderRadius: '6px',
    colorSegment: 'rgba(255,255,255,0.04)',
  },
  Tag: {
    borderRadius: '999px',
  },
  DataTable: {
    thColor: 'rgba(255,255,255,0.02)',
    tdColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.06)',
    thTextColor: '#cfd4df',
  },
}

const ToolBridge = defineComponent({
  setup() {
    const message = useMessage()
    const dialog = useDialog()
    const notification = useNotification()
    const loadingBar = useLoadingBar()
    const modal = useModal()

    watchEffect(() => {
      window.$message = message
      window.$dialog = dialog
      window.$notification = notification
      window.$loadingBar = loadingBar
      window.$modal = modal
    })

    return () => h('div')
  },
})
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <NGlobalStyle />
    <NLoadingBarProvider>
      <NDialogProvider>
        <NNotificationProvider>
          <NMessageProvider placement="top-right" :max="4">
            <NModalProvider>
              <slot />
              <ToolBridge />
            </NModalProvider>
          </NMessageProvider>
        </NNotificationProvider>
      </NDialogProvider>
    </NLoadingBarProvider>
  </NConfigProvider>
</template>
