<script setup lang="ts">
import dayjs from 'dayjs'
import { NButton, NCard, NSpin, NSpace, NTag } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import AppShell from '../components/AppShell.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { pushToast } from '../lib/toast'
import type { ServerListItem } from '../types'

type ServerFilterKey = 'all' | 'ze_practice' | 'ze' | 'idle'

const serverListInitialized = ref(false)
const serverListLoading = ref(false)
const serverListRequesting = ref(false)
const serverListUpdatedAt = ref('')
const serverListError = ref<string | null>(null)
const servers = ref<ServerListItem[]>([])
const activeFilter = ref<ServerFilterKey>('all')
const isMobileView = ref(false)
let refreshTimer: ReturnType<typeof setInterval> | null = null

const navItems = computed(() => buildNavItems('/'))
const totalOnlinePlayers = computed(() =>
  servers.value.reduce((sum, server) => sum + Number(server.currentPlayers || 0), 0),
)

const modeMetaMap: Record<string, string> = {
  ze_practice: '训练服',
  ze: '跑图服',
}

const filterOptions = computed(() => [
  {
    key: 'ze_practice' as const,
    label: '训练服',
    count: servers.value.filter((server) => server.mode === 'ze_practice').length,
  },
  {
    key: 'ze' as const,
    label: '跑图服',
    count: servers.value.filter((server) => server.mode === 'ze').length,
  },
  {
    key: 'idle' as const,
    label: '空闲服务器',
    count: servers.value.filter((server) => Number(server.currentPlayers || 0) === 0).length,
  },
])

const filteredServers = computed(() => {
  if (activeFilter.value === 'idle') {
    return servers.value.filter((server) => Number(server.currentPlayers || 0) === 0)
  }

  if (activeFilter.value === 'all') {
    return servers.value
  }

  return servers.value.filter((server) => server.mode === activeFilter.value)
})

const filteredSections = computed(() => {
  if (activeFilter.value === 'idle') {
    return [
      {
        key: 'idle',
        title: '空闲服务器',
        servers: [...filteredServers.value].sort((left, right) => left.port - right.port),
      },
    ]
  }

  const grouped = new Map<string, ServerListItem[]>()

  for (const server of filteredServers.value) {
    const mode = server.mode || 'unknown'
    const rows = grouped.get(mode) || []
    rows.push(server)
    grouped.set(mode, rows)
  }

  return Array.from(grouped.entries()).map(([mode, rows]) => ({
    key: mode,
    title: modeMetaMap[mode] || mode,
    servers: rows.sort((left, right) => left.port - right.port),
  }))
})

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function serverStatusType(status?: string) {
  return status === 'ok' ? 'success' : 'error'
}

function syncViewport() {
  if (typeof window === 'undefined') {
    return
  }

  isMobileView.value = window.innerWidth <= 768
}

async function loadServerList(options: { silent?: boolean } = {}) {
  const { silent = false } = options

  if (serverListRequesting.value) {
    return
  }

  serverListRequesting.value = true

  if (!silent) {
    serverListLoading.value = true
  }

  try {
    const { data } = await http.get('/site/api/server-list')
    servers.value = Array.isArray(data.servers) ? data.servers : []
    serverListUpdatedAt.value = data.updatedAt || ''
    serverListError.value = data.lastError || null
    serverListInitialized.value = true
  } catch (error) {
    serverListError.value = (error as Error).message

    if (!silent || !serverListInitialized.value) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    serverListRequesting.value = false

    if (!silent) {
      serverListLoading.value = false
    }
  }
}

async function copyConnectCommand(server: ServerListItem) {
  const command = `connect ${server.host}:${server.port}`

  try {
    await navigator.clipboard.writeText(command)
    pushToast(`已复制: ${command}`, 'success')
  } catch {
    pushToast(command, 'info')
  }
}

onMounted(() => {
  syncViewport()
  void loadServerList()
  window.addEventListener('resize', syncViewport)
  refreshTimer = window.setInterval(() => {
    void loadServerList({ silent: true })
  }, 1000)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <AppShell
    title="开水服服务器列表"
    subtitle="首页先看服务器状态, 再按需进入购买商品, 查询订单, 数据统计或后台管理."
    badge="首页"
    :nav-items="navItems"
  >
    <section class="section-block">
      <div class="section-block__header">
        <div>
          <p class="section-block__eyebrow">Server List</p>
          <h2 class="section-block__title">服务器列表</h2>
        </div>
        <NSpace>
          <NTag :round="false" type="default">更新时间 {{ formatDate(serverListUpdatedAt) }}</NTag>
        </NSpace>
      </div>

      <div class="server-filter-grid" :class="{ 'server-filter-grid--mobile': isMobileView }">
        <button
          type="button"
          class="server-filter-chip"
          :class="{ 'is-active': activeFilter === 'all' }"
          @click="activeFilter = 'all'"
        >
          <span class="server-filter-chip__label">全部服务器</span>
          <strong class="server-filter-chip__value">{{ servers.length }}</strong>
        </button>

        <button
          v-for="item in filterOptions"
          :key="item.key"
          type="button"
          class="server-filter-chip"
          :class="{ 'is-active': activeFilter === item.key }"
          @click="activeFilter = item.key"
        >
          <span class="server-filter-chip__label">{{ item.label }}</span>
          <strong class="server-filter-chip__value">{{ item.count }}</strong>
        </button>

        <div class="server-filter-chip server-filter-chip--static">
          <span class="server-filter-chip__label">在线人数</span>
          <strong class="server-filter-chip__value">{{ totalOnlinePlayers }}</strong>
        </div>
      </div>

      <div v-if="!serverListInitialized && serverListLoading" class="hero-note min-h-[220px]">
        <NSpin size="large" />
      </div>

      <NCard v-else class="surface-card">
        <div v-if="!filteredSections.length" class="hero-note min-h-[220px]">
          <div class="hero-note__inner">
            <div class="hero-note__title text-[24px]">暂无服务器数据</div>
            <div class="hero-note__desc">当前没有拿到服务器状态信息, 请稍后重试.</div>
          </div>
        </div>

        <div v-else class="server-mode-grid">
          <section v-for="group in filteredSections" :key="group.key" class="panel-grid">
            <div class="flex items-center gap-3">
              <h3 class="m-0 text-[20px] font-800">{{ group.title }}</h3>
              <span class="text-[12px] text-[#8a909d]">{{ group.servers.length }} 台</span>
            </div>

            <div class="server-grid">
              <article
                v-for="server in group.servers"
                :key="server.id"
                class="server-row"
                :class="{ 'server-row--mobile': isMobileView }"
              >
                <div class="server-row__name">
                  <div class="server-row__title-wrap">
                    <NTag :round="false" size="small" :type="serverStatusType(server.status)">
                      {{ server.status === 'ok' ? '在线' : '异常' }}
                    </NTag>
                    <div class="server-row__title">{{ server.serverName || server.name }}</div>
                  </div>
                </div>

                <div class="server-row__metric server-row__metric--map">
                  <div class="server-row__metric-label">当前地图</div>
                  <div class="server-row__metric-value" :title="server.map || '-'">{{ server.map || '-' }}</div>
                </div>

                <div class="server-row__metric server-row__metric--players">
                  <div class="server-row__metric-label">在线人数</div>
                  <div class="server-row__metric-value number-font">{{ server.currentPlayers }}/{{ server.maxPlayers }}</div>
                </div>

                <div v-if="!isMobileView" class="server-row__actions">
                  <NButton
                    v-if="server.connectUrl"
                    type="primary"
                    secondary
                    class="server-row__action-button"
                    tag="a"
                    :href="server.connectUrl"
                  >
                    Steam 连接
                  </NButton>
                  <NButton secondary class="server-row__action-button" @click="copyConnectCommand(server)">复制指令</NButton>
                </div>
              </article>
            </div>
          </section>
        </div>

        <p v-if="serverListError" class="m-0 mt-4 text-[13px] text-[#8a909d]">
          远端接口提示: {{ serverListError }}
        </p>
      </NCard>
    </section>
  </AppShell>
</template>
