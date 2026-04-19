<script setup lang="ts">
import {
  NButton,
  NCard,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui'
import { ref, watch } from 'vue'

import { http } from '../../lib/api'
import { CONSOLE_API_BASE } from '../../lib/console'
import { pushToast } from '../../lib/toast'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleSectionBlock from './ConsoleSectionBlock.vue'
import type { GotifyChannelItem, GotifyConfig } from '../../types'

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  updated: [config: GotifyConfig]
}>()

const loading = ref(false)
const saving = ref(false)
const testingKeys = ref<string[]>([])
const form = ref<GotifyConfig>({
  channels: [],
})

function createEmptyChannel(): GotifyChannelItem {
  return {
    key: '',
    name: '',
    serverUrl: 'https://gotify.kaish.cn',
    token: '',
    description: '',
    enabled: true,
    priority: 5,
  }
}

async function loadConfig(silent = false) {
  if (!silent) {
    loading.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/notifications/gotify`)
    form.value = {
      channels: Array.isArray(data.config?.channels)
        ? data.config.channels.map((channel: GotifyChannelItem) => ({
          key: channel.key || '',
          name: channel.name || '',
          serverUrl: channel.serverUrl || '',
          token: channel.token || '',
          description: channel.description || '',
          enabled: channel.enabled !== false,
          priority: Number.isFinite(Number(channel.priority)) ? Number(channel.priority) : 5,
        }))
        : [],
    }
    emit('updated', form.value)
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      loading.value = false
    }
  }
}

function addChannel() {
  form.value.channels.push(createEmptyChannel())
}

function removeChannel(index: number) {
  form.value.channels.splice(index, 1)
}

async function saveConfig() {
  saving.value = true

  try {
    const payload = {
      channels: form.value.channels.map((channel) => ({
        key: channel.key?.trim() || undefined,
        name: channel.name?.trim(),
        serverUrl: channel.serverUrl?.trim(),
        token: channel.token?.trim(),
        description: channel.description?.trim() || undefined,
        enabled: channel.enabled,
        priority: channel.priority,
      })),
    }

    const { data } = await http.patch(`${CONSOLE_API_BASE}/agent/notifications/gotify`, payload)
    form.value = {
      channels: Array.isArray(data.config?.channels) ? data.config.channels : [],
    }
    emit('updated', form.value)
    pushToast('Gotify 渠道配置已保存', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function sendChannelTest(channel: GotifyChannelItem) {
  const channelKey = String(channel.key || '').trim()
  if (!channelKey) {
    pushToast('请先保存渠道配置，再发送测试通知', 'error')
    return
  }

  testingKeys.value = Array.from(new Set([...testingKeys.value, channelKey]))

  try {
    await http.post(`${CONSOLE_API_BASE}/agent/notifications/gotify/test`, {
      channelKeys: [channelKey],
      title: `KEPCS 测试通知 · ${channel.name || channelKey}`,
      message: `渠道 ${channel.name || channelKey} 测试成功。如果你收到了这条消息，说明 Gotify App Token 可用。`,
      priority: channel.priority,
    })
    pushToast(`测试通知已发送到 ${channel.name || channelKey}`, 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    testingKeys.value = testingKeys.value.filter((item) => item !== channelKey)
  }
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      void loadConfig()
    }
  },
  { immediate: true },
)
</script>

<template>
  <ConsolePanelCard
    title="Gotify 通知渠道"
    description="统一管理多渠道 Gotify 配置，后续定时任务与命令通知都复用这里的渠道体系。"
  >
    <template #header-extra>
      <div class="gotify-panel__actions">
        <NButton secondary @click="loadConfig()">刷新</NButton>
        <NButton type="primary" @click="addChannel">新增渠道</NButton>
        <NButton type="primary" :loading="saving" @click="saveConfig">保存配置</NButton>
      </div>
    </template>

    <div class="gotify-panel">
      <ConsoleSectionBlock
        title="多渠道 Gotify"
        description="每个渠道都可以绑定一个独立的 Gotify 地址和 App Token，定时任务里可按需勾选多个渠道同时推送。"
      />

      <div v-if="loading" class="hero-note min-h-[220px]">
        <NSpin size="large" />
      </div>

      <div v-else-if="form.channels.length" class="gotify-channel-list">
        <section v-for="(channel, index) in form.channels" :key="`${channel.key || 'new'}-${index}`" class="gotify-channel-card">
          <div class="gotify-channel-card__header">
            <div class="gotify-channel-card__title">
              <strong>{{ channel.name || `渠道 ${index + 1}` }}</strong>
              <span>{{ channel.key || '未填写标识' }}</span>
            </div>
            <div class="gotify-channel-card__side">
              <NTag round :type="channel.enabled ? 'success' : 'default'">
                {{ channel.enabled ? '已启用' : '已停用' }}
              </NTag>
            </div>
          </div>

          <NForm label-placement="top" class="console-field-grid cols-2">
            <NFormItem label="渠道标识">
              <NInput v-model:value="channel.key" placeholder="ops-main" />
            </NFormItem>
            <NFormItem label="渠道名称">
              <NInput v-model:value="channel.name" placeholder="运维主群" />
            </NFormItem>
            <NFormItem label="Gotify 地址">
              <NInput v-model:value="channel.serverUrl" placeholder="https://gotify.kaish.cn" />
            </NFormItem>
            <NFormItem label="默认优先级">
              <NInputNumber v-model:value="channel.priority" :min="0" :max="10" :show-button="false" class="w-full" />
            </NFormItem>
            <NFormItem label="App Token" class="col-span-full">
              <NInput v-model:value="channel.token" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="输入 Gotify App Token" />
            </NFormItem>
            <NFormItem label="渠道说明" class="col-span-full">
              <NInput v-model:value="channel.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="比如：更新通知 / 重启通知 / 失败告警" />
            </NFormItem>
            <NFormItem label="启用状态">
              <NSwitch v-model:value="channel.enabled" />
            </NFormItem>
          </NForm>

          <div class="gotify-channel-card__actions">
            <NButton
              secondary
              :loading="testingKeys.includes(channel.key)"
              @click="sendChannelTest(channel)"
            >
              发送测试
            </NButton>
            <NButton type="error" ghost @click="removeChannel(index)">
              删除渠道
            </NButton>
          </div>
        </section>
      </div>

      <div v-else class="hero-note min-h-[220px]">
        <div class="hero-note__inner">
          <div class="hero-note__title">还没有配置 Gotify 渠道</div>
          <div class="hero-note__desc">先新增一个渠道并保存，之后定时任务就可以勾选多个 Gotify 分组推送。</div>
        </div>
      </div>
    </div>
  </ConsolePanelCard>
</template>

<style scoped>
.gotify-panel,
.gotify-channel-list {
  display: grid;
  gap: 14px;
}

.gotify-panel__actions,
.gotify-channel-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.gotify-channel-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.014);
}

.gotify-channel-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.gotify-channel-card__title {
  display: grid;
  gap: 4px;
}

.gotify-channel-card__title strong {
  font-size: 16px;
  color: var(--app-text);
}

.gotify-channel-card__title span {
  font-size: 12px;
  color: var(--app-text-muted);
}

@media (max-width: 768px) {
  .gotify-panel__actions,
  .gotify-channel-card__actions,
  .gotify-channel-card__header {
    flex-direction: column;
  }

  .gotify-panel__actions :deep(.n-button),
  .gotify-channel-card__actions :deep(.n-button) {
    width: 100%;
  }
}
</style>
