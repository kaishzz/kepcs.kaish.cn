<script setup lang="ts">
import {
  NButton,
  NDropdown,
  NIcon,
  NModal,
  NSpace,
  NSpin,
} from 'naive-ui'
import {
  Badge,
  BareMetalServer02,
  ChartBar,
  Chat,
  Group,
  Search,
  Settings,
  ShoppingCart,
  UserAvatar,
} from '@vicons/carbon'
import type { DropdownOption } from 'naive-ui'
import { Comment, computed, onBeforeUnmount, onMounted, ref, useSlots, watch } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { CONSOLE_API_BASE, CONSOLE_AUTH_BASE, CONSOLE_PAGE_PATH } from '../lib/console'
import { preloadRouteView } from '../router'
import { useAuthStore } from '../stores/auth'
import type { AppNavItem } from '../types'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  badge?: string
  navItems: AppNavItem[]
  consoleMode?: boolean
  showHeaderCopy?: boolean
}>(), {
  subtitle: '',
  badge: '',
  consoleMode: false,
  showHeaderCopy: false,
})

const slots = useSlots()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const sidebarStorageKey = 'kepcs-sidebar-collapsed'
const isMobile = ref(false)
const mobileSidebarOpen = ref(false)
const authPromptOpen = ref(false)
const authPromptTarget = ref<AppNavItem | null>(null)
const authAvatarFailed = ref(false)

const effectiveSidebarCollapsed = computed(() => !isMobile.value && sidebarCollapsed.value)
const shellSidebarWidth = computed(() => {
  if (isMobile.value) {
    return '0px'
  }

  return effectiveSidebarCollapsed.value ? '86px' : '248px'
})

function readSidebarCollapsed() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(sidebarStorageKey) === '1'
  } catch {
    return false
  }
}

function writeSidebarCollapsed(value: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(sidebarStorageKey, value ? '1' : '0')
  } catch {
    // ignore storage errors in private / restricted browser contexts
  }
}

const sidebarCollapsed = ref(readSidebarCollapsed())
const noticeLinkUrl = 'https://qun.qq.com/universal-share/share?ac=1&authKey=3%2Fo67q0lgf9MvRFwVm9dIPFQxWDgQJdlDZr4FWOYzOH%2BMIjuwA6SA4SU8gsbesi%2B&busi_data=eyJncm91cENvZGUiOiI4MTk2NjA4NDMiLCJ0b2tlbiI6ImxObHFkaWQ3MFlwc1NUcEdGY3NINmd0MlFkMUxtVGtraUNCTkRHY3hsTGl3dnllcUtFTXU3bmRFbWlhWisxaGYiLCJ1aW4iOiIyNDg1NDY3MDQifQ%3D%3D&data=hdRoq8ug55ir58IjyNJFtsnHx0am0hGJzLAa6-Vxx3Ve8xr4PeF-DIM3w_wJ9zCF66mRLf-iedQkuS-pDpUGIw&svctype=4&tempid=h5_group_info'
const noticeLinkLabel = computed(() => '加入群聊')
const contactLinkUrl = 'https://qm.qq.com/q/AU4YivVhkY'
const contactLinkLabel = '联系开水'
const sidebarPrimaryNavItems = computed(() => props.navItems.filter((item) => !['admin', 'status'].includes(item.icon || '')))
const sidebarBottomNavItems = computed(() => props.navItems.filter((item) => ['admin', 'status'].includes(item.icon || '')))

const hasHeaderActions = computed(() =>
  slots['header-actions']?.().some((node) => node.type !== Comment) ?? false,
)
const showHeader = computed(() => true)
const showBuiltInHeaderActions = computed(() => !hasHeaderActions.value)
const authAvatarSrc = computed(() => {
  if (!auth.user?.steamId) {
    return undefined
  }

  return `${CONSOLE_API_BASE}/auth/avatar/${auth.user.steamId}`
})
const authAvatarLabel = computed(() => auth.user?.displayName?.slice(0, 1) || 'K')
const currentProtectedNavItem = computed(() =>
  props.navItems.find((item) => item.requiresAuth && isNavActive(item)) || null,
)
const authMenuOptions = computed<DropdownOption[]>(() => {
  const options: DropdownOption[] = [
    { label: '打开主页', key: 'profile' },
  ]

  if (auth.user) {
    options.push({ label: '后台管理', key: 'console' })
  }

  options.push({ label: '退出登录', key: 'logout' })
  return options
})

const sidebarIconMap: Record<string, Component> = {
  server: BareMetalServer02,
  pay: ShoppingCart,
  query: Search,
  stats: ChartBar,
  player: UserAvatar,
  challenge: Badge,
  status: BareMetalServer02,
  admin: Settings,
}

function resolveNavIcon(item: AppNavItem) {
  return sidebarIconMap[item.icon || ''] || Badge
}

function resolveActionIcon(kind: 'contact' | 'group') {
  return kind === 'contact' ? Chat : Group
}

function normalizeNavPath(path: string) {
  return String(path || '').split('#')[0].split('?')[0] || '/'
}

function isExternalNav(item: AppNavItem) {
  return /^https?:\/\//i.test(String(item.to || '').trim())
}

function isNavActive(item: AppNavItem) {
  if (isExternalNav(item)) {
    return false
  }

  const targetPath = normalizeNavPath(item.to)
  const currentPath = normalizeNavPath(route.path)

  if (targetPath === '/') {
    return currentPath === '/'
  }

  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`)
}

function resolveAuthTarget(item?: AppNavItem | null) {
  return item?.to || route.fullPath || route.path || '/'
}

async function ensureAuthLoaded() {
  if (auth.loaded || auth.loading) {
    return
  }

  await auth.fetchMe()
}

function openAuthPrompt(item?: AppNavItem | null) {
  authPromptTarget.value = item ?? currentProtectedNavItem.value
  authPromptOpen.value = true
}

function closeAuthPrompt() {
  authPromptOpen.value = false
}

function openSteamLogin(nextTarget?: string) {
  const next = encodeURIComponent(nextTarget || resolveAuthTarget(authPromptTarget.value))
  window.location.href = `${CONSOLE_AUTH_BASE}/steam?next=${next}`
}

async function handleNavClick(item: AppNavItem) {
  closeMobileSidebar()

  if (isExternalNav(item)) {
    window.open(item.to, '_blank', 'noopener,noreferrer')
    return
  }

  if (item.requiresAuth) {
    await ensureAuthLoaded()

    if (auth.loading) {
      return
    }

    if (!auth.user) {
      openAuthPrompt(item)
      return
    }
  }

  if (!isNavActive(item)) {
    await router.push(item.to)
  }
}

function warmupNavRoute(item: AppNavItem) {
  if (isExternalNav(item)) {
    return
  }

  void preloadRouteView(item.to)
}

async function handleAuthMenuSelect(key: string | number) {
  if (key === 'profile') {
    const profileUrl = auth.user?.profileUrl || (auth.user?.steamId ? `https://steamcommunity.com/profiles/${auth.user.steamId}` : '')

    if (profileUrl) {
      window.open(profileUrl, '_blank', 'noopener,noreferrer')
    }

    return
  }

  if (key === 'console') {
    await router.push(CONSOLE_PAGE_PATH)
    return
  }

  if (key === 'logout') {
    await auth.logout()
    closeAuthPrompt()

    if (currentProtectedNavItem.value) {
      await router.push('/')
    }
  }
}

function scheduleBackgroundRouteWarmup() {
  const preload = () => {
    void Promise.all([
      preloadRouteView('/player'),
      preloadRouteView('/challenge'),
      preloadRouteView('/stats'),
      preloadRouteView(CONSOLE_PAGE_PATH),
    ])
  }

  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    ;(window as Window & { requestIdleCallback: (callback: () => void) => number }).requestIdleCallback(preload)
    return
  }

  globalThis.setTimeout(preload, 180)
}

function syncMobileState() {
  if (typeof window === 'undefined') {
    return
  }

  isMobile.value = window.innerWidth <= 768

  if (!isMobile.value) {
    mobileSidebarOpen.value = false
  }
}

function toggleMobileSidebar() {
  mobileSidebarOpen.value = !mobileSidebarOpen.value
}

function closeMobileSidebar() {
  mobileSidebarOpen.value = false
}

onMounted(() => {
  syncMobileState()
  void ensureAuthLoaded()
  scheduleBackgroundRouteWarmup()
  window.addEventListener('resize', syncMobileState)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncMobileState)
})

watch(sidebarCollapsed, (value) => {
  writeSidebarCollapsed(value)
})

watch(() => route.fullPath, () => {
  closeMobileSidebar()
})

watch(authAvatarSrc, () => {
  authAvatarFailed.value = false
}, { immediate: true })

watch(
  () => [route.fullPath, auth.loaded, auth.user?.steamId] as const,
  () => {
    if (auth.loaded && !auth.user && currentProtectedNavItem.value) {
      openAuthPrompt(currentProtectedNavItem.value)
      return
    }

    if (auth.user) {
      closeAuthPrompt()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="app-shell" :style="{ '--app-sidebar-width': shellSidebarWidth }">
    <button
      v-if="isMobile && mobileSidebarOpen"
      type="button"
      class="app-sidebar-backdrop"
      aria-label="关闭侧边栏"
      @click="closeMobileSidebar"
    />

    <aside
      class="app-sidebar flex shrink-0 flex-col border-r border-white/8 bg-[#14171c] transition-all duration-220 ease-out"
      :class="{ 'app-sidebar--mobile': isMobile, 'app-sidebar--mobile-open': isMobile && mobileSidebarOpen }"
      :style="{ width: effectiveSidebarCollapsed ? '86px' : '248px' }"
    >
      <div class="app-sidebar__content flex h-full flex-col gap-4 px-3 py-4">
        <NButton
          v-if="!isMobile"
          quaternary
          block
          class="app-sidebar__toggle-button !justify-center"
          @click="sidebarCollapsed = !sidebarCollapsed"
        >
          <span v-if="effectiveSidebarCollapsed">展开</span>
          <span v-else>收起侧边栏</span>
        </NButton>

        <div class="app-sidebar__nav grid gap-2" :class="effectiveSidebarCollapsed ? 'justify-items-center' : ''">
          <button
            v-for="item in sidebarPrimaryNavItems"
            :key="item.to"
            type="button"
            class="sidebar-nav-link"
            :class="effectiveSidebarCollapsed ? 'sidebar-nav-link--compact' : ''"
            @mouseenter="warmupNavRoute(item)"
            @focus="warmupNavRoute(item)"
            @click="handleNavClick(item)"
          >
            <NButton
              secondary
              class="nav-button !h-[48px] !justify-start !rounded-[12px]"
              :class="[{ 'is-active': isNavActive(item) }, effectiveSidebarCollapsed ? 'nav-button--compact' : 'nav-button--full']"
              :block="!effectiveSidebarCollapsed"
            >
              <span
                v-if="effectiveSidebarCollapsed"
                class="nav-button__compact-label inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-700"
              >
                <NIcon :size="18">
                  <component :is="resolveNavIcon(item)" />
                </NIcon>
              </span>
              <div v-else class="flex w-full items-center gap-3">
                <span class="nav-button__icon inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-700">
                  <NIcon :size="18">
                    <component :is="resolveNavIcon(item)" />
                  </NIcon>
                </span>
                <span class="truncate text-[14px] font-600">{{ item.label }}</span>
              </div>
            </NButton>
          </button>
        </div>

        <div class="app-sidebar__bottom mt-auto">
          <div class="grid gap-2.5" :class="effectiveSidebarCollapsed ? 'justify-items-center' : ''">
            <a
              v-if="effectiveSidebarCollapsed"
              class="sidebar-mini-tile"
              :href="contactLinkUrl"
              target="_blank"
              rel="noopener noreferrer"
              title="联系开水"
            >
              <NIcon :size="18">
                <component :is="resolveActionIcon('contact')" />
              </NIcon>
            </a>

            <NButton
              v-else
              secondary
              block
              tag="a"
              :href="contactLinkUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-button nav-button--full sidebar-action-button !h-[48px] !justify-start !rounded-[12px]"
            >
              <div class="flex w-full items-center gap-3">
                <span class="nav-button__icon inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-700">
                  <NIcon :size="18">
                    <component :is="resolveActionIcon('contact')" />
                  </NIcon>
                </span>
                <span class="truncate text-[14px] font-600">{{ contactLinkLabel }}</span>
              </div>
            </NButton>

            <a
              v-if="effectiveSidebarCollapsed"
              class="sidebar-mini-tile"
              :href="noticeLinkUrl"
              target="_blank"
              rel="noopener noreferrer"
              title="加入群聊"
            >
              <NIcon :size="18">
                <component :is="resolveActionIcon('group')" />
              </NIcon>
            </a>

            <NButton
              v-else
              secondary
              block
              tag="a"
              :href="noticeLinkUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="nav-button nav-button--full sidebar-action-button !h-[48px] !justify-start !rounded-[12px]"
            >
              <div class="flex w-full items-center gap-3">
                <span class="nav-button__icon inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-700">
                  <NIcon :size="18">
                    <component :is="resolveActionIcon('group')" />
                  </NIcon>
                </span>
                <span class="truncate text-[14px] font-600">{{ noticeLinkLabel }}</span>
              </div>
            </NButton>

            <button
              v-for="item in sidebarBottomNavItems"
              :key="item.to"
              type="button"
              class="sidebar-nav-link"
              :class="effectiveSidebarCollapsed ? 'sidebar-nav-link--compact' : ''"
              @mouseenter="warmupNavRoute(item)"
              @focus="warmupNavRoute(item)"
              @click="handleNavClick(item)"
            >
              <NButton
                secondary
                class="nav-button !h-[48px] !justify-start !rounded-[12px]"
                :class="[{ 'is-active': isNavActive(item) }, effectiveSidebarCollapsed ? 'nav-button--compact' : 'nav-button--full']"
                :block="!effectiveSidebarCollapsed"
              >
                <span
                  v-if="effectiveSidebarCollapsed"
                  class="nav-button__compact-label inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-700"
                >
                  <NIcon :size="18">
                    <component :is="resolveNavIcon(item)" />
                  </NIcon>
                </span>
                <div v-else class="flex w-full items-center gap-3">
                  <span class="nav-button__icon inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[13px] font-700">
                    <NIcon :size="18">
                      <component :is="resolveNavIcon(item)" />
                    </NIcon>
                  </span>
                  <span class="truncate text-[14px] font-600">{{ item.label }}</span>
                </div>
              </NButton>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <div class="app-main-shell">
      <div class="app-main min-w-0 flex flex-1 flex-col bg-transparent">
        <div v-if="isMobile" class="app-mobilebar">
          <button type="button" class="app-mobilebar__toggle" aria-label="展开侧边栏" @click="toggleMobileSidebar">
            ≡
          </button>
          <RouterLink to="/" class="app-mobilebar__brand" @click="closeMobileSidebar">
            KepCs 开水服
          </RouterLink>
          <div class="app-mobilebar__spacer" />
        </div>

        <header v-if="showHeader" class="app-shell__header border-b border-white/8 bg-[rgba(16,18,22,0.72)] px-6 py-2 backdrop-blur-[12px]">
          <div class="app-shell__header-inner flex items-center justify-between gap-4" :class="{ 'app-shell__header-inner--stacked': showHeaderCopy }">
            <div class="app-shell__header-leading min-w-0">
              <RouterLink v-if="!isMobile" to="/" class="app-shell__header-brand">
                KepCs 开水服
              </RouterLink>

              <div v-if="showHeaderCopy" class="app-shell__header-copy grid gap-2">
                <div v-if="badge" class="text-[12px] tracking-[0.08em] text-[#8a909d] uppercase">{{ badge }}</div>
                <div class="grid gap-1">
                  <h1 class="m-0 text-[24px] font-800 leading-[1.15] text-white">{{ title }}</h1>
                  <p v-if="subtitle" class="m-0 text-[13px] text-[#8a909d]">{{ subtitle }}</p>
                </div>
              </div>
            </div>
            <NSpace justify="end" class="ml-auto app-shell__header-actions">
              <slot v-if="hasHeaderActions" name="header-actions" />

              <template v-else-if="showBuiltInHeaderActions">
                <NButton
                  v-if="auth.loading && !auth.loaded"
                  secondary
                  disabled
                  class="app-shell__auth-button app-shell__auth-button--loading app-shell__auth-chip"
                >
                  <span class="flex items-center gap-2">
                    <NSpin :size="18" />
                    <span>检查登录状态</span>
                  </span>
                </NButton>

                <NDropdown v-else-if="auth.user" trigger="click" :options="authMenuOptions" @select="handleAuthMenuSelect">
                  <NButton secondary class="app-shell__auth-button app-shell__auth-chip">
                    <div class="flex items-center gap-2.5">
                      <div class="app-auth-avatar app-auth-avatar--sm">
                        <img
                          v-if="authAvatarSrc && !authAvatarFailed"
                          :key="authAvatarSrc"
                          :src="authAvatarSrc"
                          alt=""
                          @error="authAvatarFailed = true"
                        >
                        <span v-else>{{ authAvatarLabel }}</span>
                      </div>
                      <div class="app-shell__auth-copy">
                        <strong class="truncate text-[13px] font-700 text-white">{{ auth.user.displayName || auth.user.steamId }}</strong>
                        <span class="truncate text-[11px] text-[#8a909d]">{{ auth.user.steamId }}</span>
                      </div>
                    </div>
                  </NButton>
                </NDropdown>

                <NButton v-else type="primary" class="app-shell__auth-button app-shell__auth-login-button" @click="openSteamLogin()">
                  使用 Steam 登录
                </NButton>
              </template>
            </NSpace>
          </div>
        </header>

        <main class="page-surface">
          <div class="page-wrap">
            <div class="page-content px-6 py-5">
              <slot />
            </div>
            <footer class="app-footer">
              <div class="app-footer__inner px-6 py-3">
                <div class="footer-links">
                  <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">粤ICP备2024344962号-2</a>
                  <a href="https://beian.mps.gov.cn/" target="_blank" rel="noopener noreferrer">粤公网安备44040202001858号</a>
                </div>
              </div>
            </footer>
          </div>
        </main>
      </div>
    </div>

    <NModal
      v-model:show="authPromptOpen"
      preset="card"
      title="需要先登录"
      class="app-auth-modal"
      :mask-closable="true"
    >
      <div class="app-auth-modal__copy">
        <div class="app-auth-modal__title">需要使用 Steam 登录后继续</div>
        <div class="app-auth-modal__desc">
          登录后会继续进入对应页面, 不需要再重复点击一次.
        </div>
      </div>
      <NSpace justify="end">
        <NButton secondary @click="closeAuthPrompt">暂不登录</NButton>
        <NButton type="primary" @click="openSteamLogin()">
          使用 Steam 登录
        </NButton>
      </NSpace>
    </NModal>
  </div>
</template>
