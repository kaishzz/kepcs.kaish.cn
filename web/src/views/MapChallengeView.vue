<script setup lang="ts">
import dayjs from 'dayjs'
import type { DataTableColumns } from 'naive-ui'
import { NButton, NCard, NDataTable, NPagination, NSelect, NSpin } from 'naive-ui'
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import AppShell from '../components/AppShell.vue'
import ConsoleRefreshIcon from '../components/console/ConsoleRefreshIcon.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { capturePageSurfaceScroll, restorePageSurfaceScroll } from '../lib/pageSurface'
import { pushToast } from '../lib/toast'
import type { MapChallengeLeaderboardSnapshot, MapChallengeMode, MapChallengeRecordItem } from '../types'

const navItems = buildNavItems('/challenge')
const initialLoading = ref(true)
const refreshing = ref(false)
const isMobileView = ref(false)
const rankingPage = ref(1)
const rankingTableAnimating = ref(false)
const leaderboard = ref<MapChallengeLeaderboardSnapshot | null>(null)
const filterForm = ref<{
  mode: MapChallengeMode
  mapName: string
  stage: string
  sortDirection: 'default' | 'asc' | 'desc'
}>({
  mode: 'pass',
  mapName: 'ze_deadcore_r',
  stage: '0.6',
  sortDirection: 'default',
})
let rankingAnimationTimer: ReturnType<typeof setTimeout> | null = null

const rankingPageSize = 10
const modeOptions = [
  { label: '通关模式', value: 'pass' },
  { label: '计时模式', value: 'survival' },
] satisfies Array<{ label: string, value: MapChallengeMode }>

const sortDirectionOptions = computed(() => {
  if (filterForm.value.mode === 'pass') {
    return [
      { label: '默认排序', value: 'default' },
      { label: '通过时间越早越前', value: 'asc' },
      { label: '通过时间越晚越前', value: 'desc' },
    ]
  }

  if (filterForm.value.mode === 'survival') {
    return [
      { label: '默认排序', value: 'default' },
      { label: '存活时间越短越前', value: 'asc' },
      { label: '存活时间越长越前', value: 'desc' },
    ]
  }

  return [
    { label: '默认排序', value: 'default' },
    { label: '正序', value: 'asc' },
    { label: '倒序', value: 'desc' },
  ]
})

const mapOptions = computed(() => [
  { label: '全部地图', value: '' },
  ...(leaderboard.value?.filters.mapOptions || []).map((item) => ({
    label: item,
    value: item,
  })),
])

const stageOptions = computed(() => {
  if (!filterForm.value.mapName) {
    return []
  }

  const uniqueStages = Array.from(
    new Set(
      (leaderboard.value?.filters.stageOptions || [])
        .map((item) => String(item.stage || '').trim())
        .filter(Boolean),
    ),
  )

  return uniqueStages.map((stage) => ({
    label: stage,
    value: stage,
  }))
})

const stagePlaceholder = computed(() => (
  filterForm.value.mapName ? '全部关卡' : '请先选择地图'
))

function normalizeOptionValues(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((item) => String(item || '').trim())
        .filter(Boolean),
    ),
  )
}

function reconcileLeaderboardSelection(snapshot: MapChallengeLeaderboardSnapshot | null) {
  if (!snapshot) {
    return false
  }

  const validMaps = normalizeOptionValues(snapshot.filters.mapOptions || [])
  if (filterForm.value.mapName && validMaps.length && !validMaps.includes(filterForm.value.mapName)) {
    filterForm.value.mapName = validMaps[0]
    filterForm.value.stage = ''
    return true
  }

  if (!filterForm.value.mapName || filterForm.value.mode !== 'survival') {
    return false
  }

  const validStages = normalizeOptionValues(
    (snapshot.filters.stageOptions || [])
      .filter((item) => String(item.mapName || '').trim() === filterForm.value.mapName)
      .map((item) => item.stage),
  )

  if (!validStages.length) {
    return false
  }

  if (!filterForm.value.stage || !validStages.includes(filterForm.value.stage)) {
    filterForm.value.stage = validStages[0]
    return true
  }

  return false
}

const summaryCards = computed(() => {
  if (!leaderboard.value) {
    return []
  }

  return [
    { label: '当前记录', value: leaderboard.value.summary.recordCount, suffix: '条' },
    { label: '玩家数量', value: leaderboard.value.summary.playerCount, suffix: '人' },
    { label: '地图数量', value: leaderboard.value.summary.mapCount, suffix: '张' },
    { label: '通关模式', value: leaderboard.value.summary.passCount, suffix: '条' },
    { label: '计时模式', value: leaderboard.value.summary.survivalCount, suffix: '条' },
  ]
})

const pagedRankingData = computed(() => {
  const rows = leaderboard.value?.records || []
  const start = (rankingPage.value - 1) * rankingPageSize
  return rows.slice(start, start + rankingPageSize)
})

const rankingPageCount = computed(() => {
  const rows = leaderboard.value?.records || []
  return Math.max(1, Math.ceil(rows.length / rankingPageSize))
})

function syncViewport() {
  if (typeof window === 'undefined') {
    return
  }

  isMobileView.value = window.innerWidth <= 768
}

function modeLabel(mode?: string | null) {
  return mode === 'survival' ? '计时模式' : '通关模式'
}

function rankingIndex(index: number) {
  return (rankingPage.value - 1) * rankingPageSize + index + 1
}

function formatDuration(seconds: number, mode?: string | null) {
  if (mode !== 'survival') {
    return '-'
  }

  const totalSeconds = Math.max(0, Number(seconds) || 0)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}小时 ${minutes}分 ${remainSeconds}秒`
  }

  if (minutes > 0) {
    return `${minutes}分 ${remainSeconds}秒`
  }

  return `${remainSeconds}秒`
}

function formatDateTime(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-'
}

function restartRankingAnimation() {
  if (rankingAnimationTimer) {
    window.clearTimeout(rankingAnimationTimer)
    rankingAnimationTimer = null
  }

  rankingTableAnimating.value = false

  requestAnimationFrame(() => {
    rankingTableAnimating.value = true
    rankingAnimationTimer = window.setTimeout(() => {
      rankingTableAnimating.value = false
      rankingAnimationTimer = null
    }, 260)
  })
}

async function handleRankingPageChange(page: number) {
  const previousScrollTop = capturePageSurfaceScroll()
  rankingPage.value = page
  restartRankingAnimation()
  await restorePageSurfaceScroll(previousScrollTop)
}

async function loadLeaderboard() {
  const isFirstLoad = !leaderboard.value && initialLoading.value

  if (isFirstLoad) {
    initialLoading.value = true
  } else {
    refreshing.value = true
  }

  try {
    const { data } = await http.get('/site/api/map-challenge-rankings', {
      params: {
        mode: filterForm.value.mode,
        mapName: filterForm.value.mapName || undefined,
        stage: filterForm.value.stage || undefined,
        sortDirection: filterForm.value.sortDirection,
      },
    })

    const nextLeaderboard = data.leaderboard || null
    leaderboard.value = nextLeaderboard

    if (reconcileLeaderboardSelection(nextLeaderboard)) {
      return
    }

    rankingPage.value = 1
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    initialLoading.value = false
    refreshing.value = false
  }
}

const rankingColumns = computed<DataTableColumns<MapChallengeRecordItem>>(() => {
  const columns: DataTableColumns<MapChallengeRecordItem> = [
    {
      title: '排名',
      key: 'ranking',
      width: 72,
      render: (_row, index) => rankingIndex(index),
    },
    {
      title: '玩家',
      key: 'name',
      render: (row) => row.name,
    },
    {
      title: 'UID',
      key: 'userId',
      width: 88,
      render: (row) => row.userId ?? '-',
    },
    {
      title: 'SteamID64',
      key: 'steamId',
      ellipsis: { tooltip: true },
      render: (row) =>
        h(
          'a',
          {
            href: `https://steamcommunity.com/profiles/${row.steamId}`,
            target: '_blank',
            rel: 'noopener noreferrer',
            class: 'stats-table-link',
          },
          row.steamId,
        ),
    },
    {
      title: '地图',
      key: 'mapName',
      ellipsis: { tooltip: true },
    },
    {
      title: '关卡',
      key: 'stage',
      ellipsis: { tooltip: true },
    },
    {
      title: '模式',
      key: 'mode',
      render: (row) => modeLabel(row.mode),
    },
  ]

  if (filterForm.value.mode === 'survival') {
    columns.push({
      title: '存活时间',
      key: 'duration',
      render: (row) => formatDuration(row.duration, row.mode),
    })
  }

  columns.push({
    title: '更新时间',
    key: 'updatedAt',
    render: (row) => formatDateTime(row.updatedAt),
  })

  return columns
})

watch(() => [filterForm.value.mode, filterForm.value.mapName] as const, () => {
  if (filterForm.value.stage) {
    filterForm.value.stage = ''
    return
  }

  void loadLeaderboard()
})

watch(() => filterForm.value.stage, () => {
  void loadLeaderboard()
})

watch(() => filterForm.value.sortDirection, () => {
  void loadLeaderboard()
})

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  void loadLeaderboard()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)

  if (rankingAnimationTimer) {
    window.clearTimeout(rankingAnimationTimer)
    rankingAnimationTimer = null
  }
})
</script>

<template>
  <AppShell
    title="魔怔排行榜"
    subtitle="按模式和地图查看通关与计时记录"
    badge="魔怔排行榜"
    :nav-items="navItems"
  >
    <div v-if="initialLoading && !leaderboard" class="hero-note min-h-[260px]">
      <NSpin size="large" />
    </div>

    <template v-else>
      <NCard class="surface-card">
        <div class="query-panel-header">
          <div>
            <p class="query-panel-header__eyebrow">Map Challenge</p>
            <h2 class="query-panel-header__title">魔怔排行榜</h2>
            <p class="query-panel-header__desc">支持按模式和地图筛选, 查看开水服当前魔怔挑战记录.</p>
          </div>
        </div>

        <div class="query-panel-form__grid">
          <div class="console-field-grid">
            <label class="detail-tile__label">模式筛选</label>
            <NSelect v-model:value="filterForm.mode" :options="modeOptions" />
          </div>
          <div class="console-field-grid">
            <label class="detail-tile__label">地图筛选</label>
            <NSelect v-model:value="filterForm.mapName" :options="mapOptions" />
          </div>
          <div class="console-field-grid">
            <label class="detail-tile__label">关卡筛选</label>
            <NSelect
              v-model:value="filterForm.stage"
              :options="stageOptions"
              :disabled="!filterForm.mapName"
              :placeholder="stagePlaceholder"
              clearable
            />
          </div>
          <div class="console-field-grid">
            <label class="detail-tile__label">排序方式</label>
            <div class="query-panel-inline-control">
              <NSelect v-model:value="filterForm.sortDirection" :options="sortDirectionOptions" />
              <NButton
                secondary
                class="console-action-icon"
                title="刷新列表"
                :loading="refreshing"
                @click="loadLeaderboard"
              >
                <ConsoleRefreshIcon />
              </NButton>
            </div>
          </div>
        </div>
      </NCard>

      <NSpin :show="refreshing">
        <div class="page-stack">
          <div class="stats-summary-grid">
            <div v-for="item in summaryCards" :key="item.label" class="detail-tile stats-summary-card">
              <div class="detail-tile__label">{{ item.label }}</div>
              <div class="detail-tile__value">{{ item.value }}<span class="stats-summary-card__suffix">{{ item.suffix }}</span></div>
            </div>
          </div>

          <NCard title="排行榜" class="surface-card">
            <div class="stats-ranking-shell">
              <div
                v-if="!isMobileView"
                class="table-shell table-shell--stable table-shell--ranking-stable stats-ranking-table"
                :class="{ 'is-animating': rankingTableAnimating }"
              >
                <NDataTable
                  :columns="rankingColumns"
                  :data="pagedRankingData"
                  :bordered="false"
                />
              </div>

              <div
                v-else
                class="stats-ranking-mobile"
                :class="{ 'is-animating': rankingTableAnimating }"
              >
                <article
                  v-for="(row, index) in pagedRankingData"
                  :key="`${row.steamId}-${row.mapName}-${row.stage}-${row.mode}`"
                  class="stats-ranking-card"
                >
                  <div class="stats-ranking-card__top">
                    <div class="stats-ranking-card__rank">
                      #{{ rankingIndex(index) }}
                    </div>
                    <a
                      :href="`https://steamcommunity.com/profiles/${row.steamId}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="stats-ranking-card__steam"
                    >
                      {{ row.steamId }}
                    </a>
                  </div>

                  <div class="stats-ranking-card__name">
                    {{ row.name }}
                  </div>

                  <div class="stats-ranking-card__grid">
                    <div class="stats-ranking-card__item">
                      <span>UID</span>
                      <strong>{{ row.userId ?? '-' }}</strong>
                    </div>
                    <div class="stats-ranking-card__item">
                      <span>地图</span>
                      <strong>{{ row.mapName }}</strong>
                    </div>
                    <div class="stats-ranking-card__item">
                      <span>关卡</span>
                      <strong>{{ row.stage }}</strong>
                    </div>
                    <div class="stats-ranking-card__item">
                      <span>模式</span>
                      <strong>{{ modeLabel(row.mode) }}</strong>
                    </div>
                    <div v-if="filterForm.mode === 'survival'" class="stats-ranking-card__item">
                      <span>存活时间</span>
                      <strong>{{ formatDuration(row.duration, row.mode) }}</strong>
                    </div>
                    <div class="stats-ranking-card__item">
                      <span>更新时间</span>
                      <strong>{{ formatDateTime(row.updatedAt) }}</strong>
                    </div>
                  </div>
                </article>
              </div>

              <div v-if="rankingPageCount > 1" class="stats-ranking-pagination">
                <NPagination
                  :page="rankingPage"
                  :page-count="rankingPageCount"
                  :page-slot="7"
                  @update:page="handleRankingPageChange"
                />
              </div>
            </div>
          </NCard>
        </div>
      </NSpin>
    </template>
  </AppShell>
</template>
