<script setup lang="ts">
import {
  NButton,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'

import { http } from '../../lib/api'
import { CONSOLE_API_BASE } from '../../lib/console'
import { pushToast } from '../../lib/toast'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleSectionBlock from './ConsoleSectionBlock.vue'
import type { GotifyChannelItem, GotifyConfig } from '../../types'

interface GotifyChannelFormItem extends GotifyChannelItem {
  localId: string
}

const props = defineProps<{
  active: boolean
}>()

const emit = defineEmits<{
  updated: [config: GotifyConfig]
}>()

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testingKeys = ref<string[]>([])
const form = ref<{ channels: GotifyChannelFormItem[] }>({
  channels: [],
})
const testForm = ref({
  channelKeys: [] as string[],
  title: 'KEPCS Gotify 测试通知',
  message: '如果你收到了这条消息，说明当前 Gotify 渠道配置可用。',
  priority: 5,
})

const channelOptions = computed(() =>
  form.value.channels
    .filter((channel) => channel.key)
    .map((channel) => ({
      label: channel.enabled ? channel.name : `${channel.name} (已停用)`,
      value: channel.key,
      disabled: channel.enabled === false,
    })),
)

const previewChannel = computed(() => {
  const selectedKey = testForm.value.channelKeys[0]
  return form.value.channels.find((channel) => channel.key === selectedKey)
    || form.value.channels[0]
    || null
})

const gotifyPayloadPreview = computed(() =>
  JSON.stringify({
    title: testForm.value.title.trim() || 'KEPCS Gotify 测试通知',
    message: testForm.value.message.trim() || '如果你收到了这条消息，说明当前 Gotify 渠道配置可用。',
    priority: Number.isFinite(Number(testForm.value.priority)) ? Number(testForm.value.priority) : 5,
  }, null, 2),
)

function syncTestFormChannels() {
  const validKeys = new Set(form.value.channels.filter((channel) => channel.key).map((channel) => channel.key))
  const nextKeys = testForm.value.channelKeys.filter((key) => validKeys.has(key))

  if (nextKeys.length) {
    testForm.value.channelKeys = nextKeys
    return
  }

  const firstEnabledKey = form.value.channels.find((channel) => channel.enabled && channel.key)?.key
  testForm.value.channelKeys = firstEnabledKey ? [firstEnabledKey] : []
}

function createLocalId() {
  return `gotify-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

function toChannelFormItem(channel?: Partial<GotifyChannelItem>): GotifyChannelFormItem {
  return {
    localId: createLocalId(),
    key: channel?.key || '',
    name: channel?.name || '',
    serverUrl: channel?.serverUrl || 'https://gotify.kaish.cn',
    token: channel?.token || '',
    description: channel?.description || '',
    enabled: channel?.enabled !== false,
    priority: Number.isFinite(Number(channel?.priority)) ? Number(channel?.priority) : 5,
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
        ? data.config.channels.map((channel: GotifyChannelItem) => toChannelFormItem(channel))
        : [],
    }
    syncTestFormChannels()
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
  form.value.channels.push(toChannelFormItem())
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
    syncTestFormChannels()
    emit('updated', form.value)
    pushToast('Gotify 渠道配置已保存', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function sendTestNotification(payload: {
  channelKeys: string[]
  title: string
  message: string
  priority?: number
}) {
  await http.post(`${CONSOLE_API_BASE}/agent/notifications/gotify/test`, payload)
}

async function sendChannelTest(channel: GotifyChannelFormItem) {
  const channelKey = String(channel.key || '').trim()
  if (!channelKey) {
    pushToast('请先保存渠道配置，再发送测试通知', 'error')
    return
  }

  testingKeys.value = Array.from(new Set([...testingKeys.value, channelKey]))

  try {
    await sendTestNotification({
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

async function sendCustomTest() {
  if (!testForm.value.channelKeys.length) {
    pushToast('请先选择至少一个通知渠道', 'error')
    return
  }

  testing.value = true

  try {
    await sendTestNotification({
      channelKeys: testForm.value.channelKeys,
      title: testForm.value.title.trim() || 'KEPCS Gotify 测试通知',
      message: testForm.value.message.trim() || '如果你收到了这条消息，说明当前 Gotify 渠道配置可用。',
      priority: Number.isFinite(Number(testForm.value.priority)) ? Number(testForm.value.priority) : 5,
    })
    pushToast(`测试通知已发送到 ${testForm.value.channelKeys.length} 个渠道`, 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    testing.value = false
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
    title="Gotify 通知管理"
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

      <section class="gotify-helper-card">
        <div class="gotify-helper-card__header">
          <strong>发送测试</strong>
          <span>测试发送基于已保存的渠道配置，建议先保存再测试。</span>
        </div>

        <NForm label-placement="top" class="console-field-grid cols-2">
          <NFormItem label="测试渠道" class="col-span-full">
            <NSelect
              v-model:value="testForm.channelKeys"
              multiple
              filterable
              clearable
              :options="channelOptions"
              placeholder="选择要测试的 Gotify 渠道"
            />
          </NFormItem>
          <NFormItem label="测试标题">
            <NInput v-model:value="testForm.title" placeholder="KEPCS Gotify 测试通知" />
          </NFormItem>
          <NFormItem label="测试优先级">
            <NInputNumber v-model:value="testForm.priority" :min="0" :max="10" :show-button="false" class="w-full" />
          </NFormItem>
          <NFormItem label="测试内容" class="col-span-full">
            <NInput
              v-model:value="testForm.message"
              type="textarea"
              :autosize="{ minRows: 3, maxRows: 6 }"
              placeholder="输入测试消息正文"
            />
          </NFormItem>
        </NForm>

        <div class="gotify-helper-card__actions">
          <NButton secondary :loading="testing" @click="sendCustomTest">
            发送测试
          </NButton>
        </div>
      </section>

      <section class="gotify-helper-card">
        <div class="gotify-helper-card__header">
          <strong>发送格式</strong>
          <span>KEPCS 会按下面的格式请求 Gotify，`token` 通过查询参数传递。</span>
        </div>

        <div class="gotify-format-card">
          <div class="gotify-format-card__endpoint">
            POST {{ previewChannel?.serverUrl || 'https://gotify.example.com' }}/message?token=&lt;AppToken&gt;
          </div>
          <pre class="gotify-format-card__payload">{{ gotifyPayloadPreview }}</pre>
        </div>
      </section>

      <div v-if="loading" class="hero-note min-h-[220px]">
        <NSpin size="large" />
      </div>

      <div v-else-if="form.channels.length" class="gotify-channel-list">
        <section v-for="(channel, index) in form.channels" :key="channel.localId" class="gotify-channel-card">
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

.gotify-helper-card,
.gotify-panel__actions,
.gotify-channel-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.gotify-helper-card {
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.014);
}

.gotify-helper-card__header {
  display: grid;
  gap: 4px;
}

.gotify-helper-card__header strong {
  font-size: 15px;
  color: var(--app-text);
}

.gotify-helper-card__header span {
  font-size: 12px;
  color: var(--app-text-muted);
}

.gotify-helper-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.gotify-format-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.02);
}

.gotify-format-card__endpoint {
  font-size: 12px;
  color: var(--app-text-muted);
  word-break: break-all;
}

.gotify-format-card__payload {
  margin: 0;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(8, 11, 16, 0.72);
  color: #dfe9f6;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
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
