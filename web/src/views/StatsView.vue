<script setup lang="ts">
import dayjs from 'dayjs'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { use } from 'echarts/core'
import type { DataTableColumns } from 'naive-ui'
import { NCard, NDataTable, NPagination, NSpin } from 'naive-ui'
import VChart from 'vue-echarts'
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'

import AppShell from '../components/AppShell.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { capturePageSurfaceScroll, restorePageSurfaceScroll } from '../lib/pageSurface'
import { pushToast } from '../lib/toast'
import type { PlayerProfileItem, PlayerStatsSnapshot, ServerTrendSnapshot } from '../types'

use([BarChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const loading = ref(true)
const stats = ref<PlayerStatsSnapshot | null>(null)
const serverTrend = ref<ServerTrendSnapshot | null>(null)
const isMobileView = ref(false)
const rankingPage = ref(1)
const rankingTableAnimating = ref(false)
let rankingAnimationTimer: ReturnType<typeof setTimeout> | null = null

const navItems = buildNavItems('/stats')
const rankingPageSize = 10

const summaryCards = computed(() => {
  if (!stats.value) {
    return []
  }

  return [
    { label: '今日上线人数', value: stats.value.todayActivePlayers, suffix: '人' },
    { label: '近七天上线人数', value: stats.value.last7DaysActivePlayers, suffix: '人' },
    { label: '今日总游玩时长', value: stats.value.todayTotalPlayTime, suffix: '分钟' },
    { label: '累计玩家数', value: stats.value.totalPlayers, suffix: '人' },
  ]
})

const pagedRankingData = computed(() => {
  const rows = stats.value?.todayRanking || []
  const start = (rankingPage.value - 1) * rankingPageSize
  return rows.slice(start, start + rankingPageSize)
})

const rankingPageCount = computed(() => {
  const rows = stats.value?.todayRanking || []
  return Math.max(1, Math.ceil(rows.length / rankingPageSize))
})

const trendChartOption = computed(() => {
  const trend = stats.value?.trend || []

  return {
    tooltip: { trigger: 'axis' },
    grid: {
      left: 28,
      right: 16,
      top: 20,
      bottom: 24,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: trend.map((item) => dayjs(item.date).format('MM-DD')),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: { color: '#8f97a8' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
      axisLabel: { color: '#8f97a8' },
    },
    series: [
      {
        name: '上线人数',
        type: 'bar',
        barWidth: 22,
        itemStyle: {
          color: '#63e2b6',
          borderRadius: [8, 8, 0, 0],
        },
        data: trend.map((item) => item.activePlayers),
      },
    ],
  }
})

const serverTrendChartOption = computed(() => {
  const points = serverTrend.value?.points || []

  return {
    tooltip: { trigger: 'axis' },
    legend: {
      top: 0,
      left: 0,
      icon: 'circle',
      itemWidth: 10,
      itemHeight: 10,
      textStyle: {
        color: '#c7ccd6',
      },
    },
    grid: {
      left: 28,
      right: 18,
      top: 48,
      bottom: 24,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((item) => dayjs(item.bucketAt).format('MM-DD HH:mm')),
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisLabel: {
        color: '#8f97a8',
        hideOverlap: true,
        formatter: (value: string) => value.slice(5),
      },
    },
    yAxis: [
      {
        type: 'value',
        name: '人数',
        axisLine: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        axisLabel: { color: '#8f97a8' },
      },
      {
        type: 'value',
        name: '服务器',
        axisLine: { show: false },
        splitLine: { show: false },
        axisLabel: { color: '#8f97a8' },
      },
    ],
    series: [
      {
        name: '在线人数',
        type: 'line',
        smooth: true,
        symbol: 'none',
        itemStyle: { color: '#63e2b6' },
        lineStyle: { width: 3, color: '#63e2b6' },
        areaStyle: { color: 'rgba(99,226,182,0.08)' },
        data: points.map((item) => item.onlinePlayers),
      },
      {
        name: '训练服总数',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbol: 'none',
        itemStyle: { color: '#58b6ff' },
        lineStyle: { width: 3, color: '#58b6ff' },
        data: points.map((item) => item.practiceTotal),
      },
      {
        name: '跑图服总数',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbol: 'none',
        itemStyle: { color: '#ffb454' },
        lineStyle: { width: 3, color: '#ffb454' },
        data: points.map((item) => item.zeTotal),
      },
      {
        name: '训练服占用',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbol: 'none',
        itemStyle: { color: '#b388ff' },
        lineStyle: { width: 3, color: '#b388ff' },
        data: points.map((item) => item.practiceOccupied),
      },
      {
        name: '跑图服占用',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbol: 'none',
        itemStyle: { color: '#ff7d66' },
        lineStyle: { width: 3, color: '#ff7d66' },
        data: points.map((item) => item.zeOccupied),
      },
    ],
  }
})

const rankingColumns: DataTableColumns<PlayerProfileItem> = [
  {
    title: '排名',
    key: 'ranking',
    width: 72,
    render: (_row, index) => (rankingPage.value - 1) * rankingPageSize + index + 1,
  },
  {
    title: 'UID',
    key: 'userId',
    width: 88,
    render: (row) => row.userId,
  },
  {
    title: '玩家',
    key: 'name',
    render: (row) => row.name,
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
    title: '今日游玩',
    key: 'todayPlayTime',
    render: (row) => `${row.todayPlayTime} 分钟`,
  },
  {
    title: '最后出现',
    key: 'lastSeen',
    render: (row) => (row.lastSeen ? dayjs(row.lastSeen).format('YYYY-MM-DD HH:mm:ss') : '-'),
  },
]

function syncViewport() {
  if (typeof window === 'undefined') {
    return
  }

  isMobileView.value = window.innerWidth <= 768
}

function rankingIndex(index: number) {
  return (rankingPage.value - 1) * rankingPageSize + index + 1
}

function formatRankingLastSeen(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
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

async function loadStats() {
  loading.value = true

  try {
    const [statsResponse, trendResponse] = await Promise.all([
      http.get('/site/api/player-stats'),
      http.get('/site/api/server-trends', { params: { hours: 48 } }),
    ])

    stats.value = statsResponse.data.stats || null
    serverTrend.value = trendResponse.data.trend || null
    rankingPage.value = 1
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  void loadStats()
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
    title="数据统计"
    subtitle="查看玩家活跃和今日游玩排行"
    badge="数据统计"
    :nav-items="navItems"
  >
    <div v-if="loading" class="hero-note min-h-[260px]">
      <NSpin size="large" />
    </div>

    <template v-else>
      <div class="stats-summary-grid">
        <div v-for="item in summaryCards" :key="item.label" class="detail-tile stats-summary-card">
          <div class="detail-tile__label">{{ item.label }}</div>
          <div class="detail-tile__value">{{ item.value }}<span class="stats-summary-card__suffix">{{ item.suffix }}</span></div>
        </div>
      </div>

      <NCard title="48小时在线趋势" class="surface-card">
        <div class="m-0 mb-4 text-[13px] text-[#8f97a8]">
          网站自动采样记录训练服总数, 跑图服总数, 训练服占用, 跑图服占用和在线人数
        </div>
        <VChart :option="serverTrendChartOption" autoresize class="h-[320px]" />
      </NCard>

      <div class="dual-grid">
        <NCard title="近七天上线趋势" class="surface-card">
          <VChart :option="trendChartOption" autoresize class="h-[320px]" />
        </NCard>

        <NCard title="今日说明" class="surface-card">
          <div class="stats-note-grid">
            <div class="detail-tile">
              <div class="detail-tile__label">统计日期</div>
              <div class="detail-tile__value">{{ stats?.todayDate || '-' }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">今日活跃玩家</div>
              <div class="detail-tile__value">{{ stats?.todayActivePlayers || 0 }} 人</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">近七天活跃玩家</div>
              <div class="detail-tile__value">{{ stats?.last7DaysActivePlayers || 0 }} 人</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">今日总游玩时长</div>
              <div class="detail-tile__value">{{ stats?.todayTotalPlayTime || 0 }} 分钟</div>
            </div>
          </div>
        </NCard>
      </div>

      <NCard title="今日游玩时长排名" class="surface-card">
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
              :key="row.steamId"
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
                  <strong>{{ row.userId }}</strong>
                </div>
                <div class="stats-ranking-card__item">
                  <span>今日游玩</span>
                  <strong>{{ row.todayPlayTime }} 分钟</strong>
                </div>
                <div class="stats-ranking-card__item">
                  <span>加入时间</span>
                  <strong>{{ row.joinTime ? dayjs(row.joinTime).format('YYYY-MM-DD') : '-' }}</strong>
                </div>
                <div class="stats-ranking-card__item">
                  <span>最后出现</span>
                  <strong>{{ formatRankingLastSeen(row.lastSeen) }}</strong>
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
    </template>
  </AppShell>
</template>
