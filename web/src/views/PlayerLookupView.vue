<script setup lang="ts">
import dayjs from 'dayjs'
import { NButton, NCard, NCollapseTransition, NForm, NFormItem, NInput, NModal, NSpin, NTag } from 'naive-ui'
import { computed, onMounted, ref } from 'vue'

import AppShell from '../components/AppShell.vue'
import { http } from '../lib/api'
import { buildNavItems } from '../lib/navigation'
import { pushToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth'
import type { PlayerProfileItem } from '../types'

const auth = useAuthStore()
const authLoading = computed(() => auth.loading && !auth.loaded)
const loading = ref(false)
const player = ref<PlayerProfileItem | null>(null)
const resultModalOpen = ref(false)
const challengeExpanded = ref(false)

const form = ref({
  userId: '',
  steamId64: '',
  name: '',
})

const navItems = buildNavItems('/player')

function resolveBindingStatus(value?: string | null) {
  return value === '已绑定' ? '已绑定' : '未绑定'
}

async function queryPlayer() {
  loading.value = true

  try {
    const { data } = await http.get('/site/api/player-search', {
      params: {
        userId: form.value.userId.trim() || undefined,
        steamId64: form.value.steamId64.trim() || undefined,
        name: form.value.name.trim() || undefined,
      },
    })

    player.value = data.player || null
    challengeExpanded.value = false
    resultModalOpen.value = true
    pushToast(player.value ? '玩家信息查询完成' : '没有找到玩家信息', player.value ? 'success' : 'info')
  } catch (error) {
    player.value = null
    challengeExpanded.value = false
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

function formatJoinDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-'
}

function formatLastSeenDateTime(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function formatChallengeTime(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function formatChallengeDuration(seconds: number, mode?: string | null) {
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

function challengeModeLabel(value?: string | null) {
  return value === 'survival' ? '计时模式' : '通关模式'
}

function challengeModeTagType(value?: string | null) {
  return value === 'survival' ? 'warning' : 'success'
}

function buildChallengeTitle(mapName?: string | null, stage?: string | null) {
  const safeMapName = String(mapName || '').trim()
  const safeStage = String(stage || '').trim()

  if (safeMapName && safeStage) {
    return `${safeMapName} · ${safeStage}`
  }

  return safeMapName || safeStage || '-'
}

function formatJoinedDays(value?: string | null) {
  if (!value) {
    return '-'
  }

  const days = Math.max(dayjs().startOf('day').diff(dayjs(value).startOf('day'), 'day'), 0)
  return `${days} 天`
}

function formatLastSeenDays(value?: string | null) {
  if (!value) {
    return '-'
  }

  const days = Math.max(dayjs().startOf('day').diff(dayjs(value).startOf('day'), 'day'), 0)
  return days === 0 ? '今天在线' : `${days} 天前在线`
}

onMounted(() => {
  if (!auth.loaded) {
    void auth.fetchMe()
  }
})
</script>

<template>
  <AppShell
    title="查询玩家"
    subtitle="通过 UID、SteamID64 或玩家名称查询开水服玩家信息"
    badge="查询玩家"
    :nav-items="navItems"
  >
    <div v-if="authLoading" class="hero-note min-h-[420px]">
      <NSpin size="large" />
    </div>

    <div v-else-if="!auth.user" class="grid min-h-[calc(100vh-210px)] place-items-center">
      <div class="hero-note__inner">
        <div class="hero-note__title">需要使用 Steam 登录</div>
        <div class="hero-note__desc">点击右上角登录，或从左侧进入查询玩家时会自动弹出登录提示。</div>
      </div>
    </div>

    <template v-else>
      <div class="page-stack page-stack--narrow page-stack--relaxed page-stack--centered-form">
        <NCard class="surface-card query-panel-card">
          <div class="query-panel-header">
            <div>
              <p class="query-panel-header__eyebrow">Player Lookup</p>
              <h2 class="query-panel-header__title">查询玩家</h2>
              <p class="query-panel-header__desc">支持通过 UID、SteamID64 或玩家名称模糊匹配查询开水服玩家信息.</p>
            </div>
          </div>

          <NForm label-placement="top" class="query-panel-form">
            <div class="query-panel-form__grid">
              <NFormItem label="UID">
                <NInput v-model:value="form.userId" placeholder="123" />
              </NFormItem>
              <NFormItem label="SteamID64">
                <NInput v-model:value="form.steamId64" placeholder="7656119xxxxxxxxxx" />
              </NFormItem>
              <NFormItem label="玩家名称">
                <NInput v-model:value="form.name" placeholder="支持忽略大小写的模糊匹配" />
              </NFormItem>
            </div>
            <NButton type="primary" size="large" class="query-panel-form__submit" :loading="loading" @click="queryPlayer">
              查询玩家
            </NButton>
          </NForm>
        </NCard>
      </div>

      <NModal v-model:show="resultModalOpen" preset="card" title="玩家查询结果" class="query-result-modal query-result-modal--player">
        <div v-if="!player" class="hero-note query-result-modal__empty">
          <div class="hero-note__inner">
            <div class="hero-note__title">暂时没有玩家结果</div>
            <div class="hero-note__desc">输入 UID、SteamID64 或玩家名称后可在这里查看玩家资料</div>
          </div>
        </div>

        <div v-else class="panel-grid query-result-modal__content">
          <div class="detail-grid">
            <div class="detail-tile">
              <div class="detail-tile__label">UID</div>
              <div class="detail-tile__value number-font">{{ player.userId }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">Name</div>
              <div class="detail-tile__value">{{ player.name }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">SteamID64</div>
              <div class="detail-tile__value number-font">{{ player.steamId }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">加入时间</div>
              <div class="detail-tile__value number-font">{{ formatJoinDate(player.joinTime) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">游玩时间</div>
              <div class="detail-tile__value number-font">{{ player.totalPlayTime }} 分钟</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">最后出现时间</div>
              <div class="detail-tile__value number-font">{{ formatLastSeenDateTime(player.lastSeen) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">加入天数</div>
              <div class="detail-tile__value number-font">{{ formatJoinedDays(player.joinTime) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">QQ群官方机器人</div>
              <div class="detail-tile__value">{{ resolveBindingStatus(player.bindingStatus) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">今天游玩时间</div>
              <div class="detail-tile__value number-font">{{ player.todayPlayTime }} 分钟</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">上次在线</div>
              <div class="detail-tile__value number-font">{{ formatLastSeenDays(player.lastSeen) }}</div>
            </div>
          </div>

          <article
            class="fold-card fold-card--query-result"
            :class="{ 'fold-card--expanded': challengeExpanded }"
          >
            <button class="fold-card__trigger" type="button" @click="challengeExpanded = !challengeExpanded">
              <div class="fold-card__title">
                <strong>魔怔记录</strong>
                <span>{{ player.challengeRecords.length ? `共 ${player.challengeRecords.length} 条记录` : '暂无记录' }}</span>
              </div>

              <div class="fold-card__meta">
                <NTag :round="false" :type="player.challengeRecords.length ? 'success' : 'default'">
                  {{ player.challengeRecords.length ? '已收录' : '空' }}
                </NTag>
                <span class="fold-card__arrow" :class="{ 'is-open': challengeExpanded }">⌄</span>
              </div>
            </button>

            <NCollapseTransition :show="challengeExpanded">
              <div class="fold-card__body">
                <div v-if="player.challengeRecords.length" class="grid gap-3">
                  <article
                    v-for="record in player.challengeRecords"
                    :key="`${record.mapName}-${record.stage}-${record.mode}-${record.updatedAt || 'none'}`"
                    class="surface-card rounded-[12px] border border-[#1d2433] bg-[#0f141d] p-4"
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="grid gap-1">
                        <strong class="text-[14px] text-white">{{ buildChallengeTitle(record.mapName, record.stage) }}</strong>
                        <span class="text-[12px] text-[#8f97a8]">更新时间 {{ formatChallengeTime(record.updatedAt) }}</span>
                      </div>
                      <NTag :round="false" :type="challengeModeTagType(record.mode)">
                        {{ challengeModeLabel(record.mode) }}
                      </NTag>
                    </div>

                    <div class="detail-grid mt-4">
                      <div class="detail-tile">
                        <div class="detail-tile__label">地图</div>
                        <div class="detail-tile__value">{{ record.mapName }}</div>
                      </div>
                      <div class="detail-tile">
                        <div class="detail-tile__label">阶段</div>
                        <div class="detail-tile__value">{{ record.stage }}</div>
                      </div>
                      <div class="detail-tile">
                        <div class="detail-tile__label">模式</div>
                        <div class="detail-tile__value">{{ challengeModeLabel(record.mode) }}</div>
                      </div>
                      <div class="detail-tile">
                        <div class="detail-tile__label">存活时间</div>
                        <div class="detail-tile__value number-font">{{ formatChallengeDuration(record.duration, record.mode) }}</div>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-else class="hero-note query-result-modal__empty min-h-[180px]">
                  <div class="hero-note__inner">
                    <div class="hero-note__title">暂无魔怔记录</div>
                    <div class="hero-note__desc">该玩家当前还没有收录到 map challenge 数据</div>
                  </div>
                </div>
              </div>
            </NCollapseTransition>
          </article>
        </div>
      </NModal>
    </template>
  </AppShell>
</template>
