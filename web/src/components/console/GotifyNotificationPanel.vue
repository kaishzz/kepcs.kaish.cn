<script setup lang="ts">
import {
  NButton,
  NCollapseTransition,
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
import ConsoleSegmentedTabs from './ConsoleSegmentedTabs.vue'
import type { GotifyChannelItem, GotifyConfig } from '../../types'

type NotificationSubTab = 'create' | 'manage' | 'test'
type TemplateEventType = 'queued' | 'finished'

interface GotifyChannelFormItem extends GotifyChannelItem {
  localId: string
}

const props = defineProps<{
  active: boolean
  canCreate?: boolean
  canManage?: boolean
  canTest?: boolean
}>()

const emit = defineEmits<{
  updated: [config: GotifyConfig]
}>()

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testingKeys = ref<string[]>([])
const notificationSubTab = ref<NotificationSubTab>('create')
const templatePreviewEvent = ref<TemplateEventType>('finished')
const manageSelectionKeys = ref<string[]>([])
const expandedManageChannelIds = ref<string[]>([])
const form = ref<{ channels: GotifyChannelFormItem[] }>({
  channels: [],
})
const channelDraft = ref<GotifyChannelFormItem>(createChannelDraft())
const testForm = ref({
  channelKeys: [] as string[],
  title: 'KepCs',
  message: '测试文本',
  priority: 5,
})

const templateVariableRows = [
  { key: '{{ scheduleName }}', label: '任务名称', description: '定时任务名称，常用于标题。' },
  { key: '{{ scheduleSummary }}', label: '执行规则', description: '例如每 1 小时 00:00 - 23:59。' },
  { key: '{{ nodeName }}', label: '节点名称', description: '节点显示名称。' },
  { key: '{{ commandId }}', label: '命令 ID', description: '每次调度创建的命令唯一标识。' },
  { key: '{{ commandType }}', label: '命令类型', description: '例如 node.check_update。' },
  { key: '{{ commandStatus }}', label: '命令状态', description: '完成通知里可用，如 SUCCEEDED / FAILED。' },
  { key: '{{ resultMessage }}', label: '结果摘要', description: 'Agent 回传的 message 字段。' },
  { key: '{{ updated }}', label: '是否有更新', description: '检查更新 / validate 结果里的 updated 布尔值。' },
  { key: '{{ currentBuildId }}', label: '当前版本', description: '当前或更新后的 buildid。' },
  { key: '{{ latestBuildId }}', label: '最新版本', description: '远端最新 buildid。' },
  { key: '{{ errorMessage }}', label: '错误信息', description: '失败、取消或过期时的错误摘要。' },
  { key: '{{ payloadJson }}', label: '命令参数', description: '当前任务 payload 的 JSON 摘要。' },
  { key: '{{ resultJson }}', label: '执行结果', description: '命令结果 JSON 摘要。' },
]

const canCreate = computed(() => props.canCreate !== false)
const canManage = computed(() => props.canManage !== false)
const canTest = computed(() => props.canTest !== false)
const canSaveConfig = computed(() => canCreate.value || canManage.value)

const firstAvailableNotificationSubTab = computed(() => {
  if (canCreate.value) return 'create' as const
  if (canManage.value) return 'manage' as const
  return 'test' as const
})

const notificationSubTabOptions = computed(() =>
  [
    canCreate.value ? { label: '新增渠道', value: 'create' as const } : null,
    canManage.value ? { label: '渠道管理', value: 'manage' as const } : null,
    canTest.value ? { label: '发送测试', value: 'test' as const } : null,
  ].filter(Boolean) as Array<{ label: string, value: NotificationSubTab }>,
)

const channelOptions = computed(() =>
  form.value.channels
    .filter((channel) => channel.key)
    .map((channel) => ({
      label: channel.enabled ? channel.name : `${channel.name} (已停用)`,
      value: channel.key,
      disabled: channel.enabled === false,
    })),
)

const manageChannelOptions = computed(() =>
  form.value.channels
    .filter((channel) => channel.key)
    .map((channel) => ({
      label: `${channel.name}${channel.enabled ? '' : ' (已停用)'}`,
      value: channel.key,
    })),
)

const selectedManageCount = computed(() => manageSelectionKeys.value.length)

const visibleManageChannels = computed(() => {
  if (!manageSelectionKeys.value.length) {
    return form.value.channels
  }

  const selected = new Set(manageSelectionKeys.value)
  return form.value.channels.filter((channel) => selected.has(channel.key))
})

const previewChannel = computed(() => {
  const selectedKey = testForm.value.channelKeys[0]
  return form.value.channels.find((channel) => channel.key === selectedKey)
    || form.value.channels[0]
    || null
})

function stringifyTemplateValue(value: unknown) {
  if (value == null) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function resolveTemplatePath(context: Record<string, unknown>, path: string) {
  const segments = String(path || '')
    .split('.')
    .map(segment => segment.trim())
    .filter(Boolean)

  let current: unknown = context
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') {
      return ''
    }

    current = (current as Record<string, unknown>)[segment]
  }

  return stringifyTemplateValue(current)
}

function renderTemplate(template: string, context: Record<string, unknown>) {
  return String(template || '').replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key) =>
    resolveTemplatePath(context, key),
  )
}

function createTemplatePreviewContext(channel: GotifyChannelFormItem | null, event: TemplateEventType) {
  const result = {
    updated: event === 'finished',
    currentBuildId: '22880072',
    latestBuildId: '22890001',
    message: event === 'finished'
      ? 'Validated and updated to buildid 22890001'
      : 'Waiting for execution',
  }

  return {
    event,
    channel: {
      key: channel?.key || 'ops-main',
      name: channel?.name || '运维主群',
    },
    schedule: {
      name: '每小时检查更新',
      summary: '每 1 小时 00:00 - 23:59',
    },
    node: {
      name: '华东节点',
      code: 'node-east-1',
    },
    command: {
      id: 'command-preview-001',
      type: 'node.check_update',
      status: event === 'finished' ? 'SUCCEEDED' : 'PENDING',
    },
    result,
    scheduleName: '每小时检查更新',
    scheduleSummary: '每 1 小时 00:00 - 23:59',
    nodeName: '华东节点',
    nodeCode: 'node-east-1',
    commandId: 'command-preview-001',
    commandType: 'node.check_update',
    commandStatus: event === 'finished' ? 'SUCCEEDED' : 'PENDING',
    resultMessage: event === 'finished' ? 'Already latest version, skipped validate and monitor' : '',
    updated: event === 'finished',
    currentBuildId: event === 'finished' ? '22880072' : '',
    latestBuildId: event === 'finished' ? '22890001' : '',
    errorMessage: event === 'finished' ? '' : '',
    payloadJson: JSON.stringify({ startServerKeys: ['ze_xl_1', 'ze_pt_1'] }, null, 2),
    resultJson: JSON.stringify(result, null, 2),
  }
}

const renderedTemplatePreview = computed(() => {
  const channel = previewChannel.value
  const event = templatePreviewEvent.value
  const context = createTemplatePreviewContext(channel, event)
  const templates = channel?.templates || createEmptyTemplates()
  const titleTemplate = templates[event]?.title || ''
  const messageTemplate = templates[event]?.message || ''

  return {
    title: titleTemplate ? renderTemplate(titleTemplate, context) : '',
    message: messageTemplate ? renderTemplate(messageTemplate, context) : '',
  }
})

const gotifyPayloadPreview = computed(() =>
  JSON.stringify({
    title: testForm.value.title.trim() || 'KepCs',
    message: testForm.value.message.trim() || '测试文本',
    priority: Number.isFinite(Number(testForm.value.priority)) ? Number(testForm.value.priority) : 5,
  }, null, 2),
)

function createEmptyTemplates() {
  return {
    queued: {
      title: '',
      message: '',
    },
    finished: {
      title: '',
      message: '',
    },
  }
}

function createLocalId() {
  return `gotify-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

function toChannelFormItem(channel?: Partial<GotifyChannelItem>): GotifyChannelFormItem {
  const emptyTemplates = createEmptyTemplates()
  return {
    localId: createLocalId(),
    key: channel?.key || '',
    name: channel?.name || '',
    serverUrl: channel?.serverUrl || 'https://gotify.kaish.cn',
    token: channel?.token || '',
    description: channel?.description || '',
    enabled: channel?.enabled !== false,
    priority: Number.isFinite(Number(channel?.priority)) ? Number(channel?.priority) : 5,
    templates: {
      queued: {
        title: channel?.templates?.queued?.title || emptyTemplates.queued.title,
        message: channel?.templates?.queued?.message || emptyTemplates.queued.message,
      },
      finished: {
        title: channel?.templates?.finished?.title || emptyTemplates.finished.title,
        message: channel?.templates?.finished?.message || emptyTemplates.finished.message,
      },
    },
  }
}

function createChannelDraft() {
  return toChannelFormItem()
}

function serializeConfig(): GotifyConfig {
  return {
    channels: form.value.channels.map(({ localId: _localId, ...channel }) => ({
      ...channel,
    })),
  }
}

function replaceChannels(channels: GotifyChannelItem[]) {
  form.value = {
    channels: Array.isArray(channels) ? channels.map((channel) => toChannelFormItem(channel)) : [],
  }
  syncTestFormChannels()
  syncManageSelection()
  syncManageExpanded()
  emit('updated', serializeConfig())
}

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

function syncManageSelection() {
  const validKeys = new Set(form.value.channels.filter((channel) => channel.key).map((channel) => channel.key))
  manageSelectionKeys.value = manageSelectionKeys.value.filter((key) => validKeys.has(key))
}

function syncManageExpanded() {
  const validIds = new Set(form.value.channels.map((channel) => channel.localId))
  expandedManageChannelIds.value = expandedManageChannelIds.value.filter((id) => validIds.has(id))
}

function isManageChannelExpanded(localId: string) {
  return expandedManageChannelIds.value.includes(localId)
}

function toggleManageChannel(localId: string) {
  expandedManageChannelIds.value = expandedManageChannelIds.value.includes(localId)
    ? expandedManageChannelIds.value.filter((id) => id !== localId)
    : [...expandedManageChannelIds.value, localId]
}

function buildConfigPayload() {
  return {
    channels: form.value.channels.map((channel) => ({
      key: channel.key?.trim() || undefined,
      name: channel.name?.trim(),
      serverUrl: channel.serverUrl?.trim(),
      token: channel.token?.trim(),
      description: channel.description?.trim() || undefined,
      enabled: channel.enabled,
      priority: channel.priority,
      templates: {
        queued: {
          title: channel.templates?.queued?.title?.trim() || undefined,
          message: channel.templates?.queued?.message?.trim() || undefined,
        },
        finished: {
          title: channel.templates?.finished?.title?.trim() || undefined,
          message: channel.templates?.finished?.message?.trim() || undefined,
        },
      },
    })),
  }
}

async function loadConfig(silent = false) {
  if (!silent) {
    loading.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/notifications/gotify`)
    replaceChannels(Array.isArray(data.config?.channels) ? data.config.channels : [])
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

async function saveConfig(successText = 'Gotify 渠道配置已保存') {
  if (!canSaveConfig.value) {
    return
  }

  saving.value = true

  try {
    const { data } = await http.patch(`${CONSOLE_API_BASE}/agent/notifications/gotify`, buildConfigPayload())
    replaceChannels(Array.isArray(data.config?.channels) ? data.config.channels : [])
    pushToast(successText, 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
    throw error
  } finally {
    saving.value = false
  }
}

function normalizeDraftChannel() {
  const draft = {
    ...channelDraft.value,
    key: channelDraft.value.key.trim(),
    name: channelDraft.value.name.trim(),
    serverUrl: channelDraft.value.serverUrl.trim(),
    token: channelDraft.value.token?.trim() || '',
    description: channelDraft.value.description?.trim() || '',
    templates: {
      queued: {
        title: channelDraft.value.templates?.queued?.title?.trim() || '',
        message: channelDraft.value.templates?.queued?.message?.trim() || '',
      },
      finished: {
        title: channelDraft.value.templates?.finished?.title?.trim() || '',
        message: channelDraft.value.templates?.finished?.message?.trim() || '',
      },
    },
  }

  if (!draft.name) {
    throw new Error('请填写渠道名称')
  }

  if (!draft.serverUrl) {
    throw new Error('请填写 Gotify 地址')
  }

  if (!draft.token) {
    throw new Error('请填写 App Token')
  }

  if (!draft.key) {
    throw new Error('请填写渠道标识')
  }

  if (form.value.channels.some((channel) => channel.key === draft.key)) {
    throw new Error('渠道标识不能重复')
  }

  return {
    ...draft,
    localId: createLocalId(),
  }
}

function resetChannelDraft() {
  channelDraft.value = createChannelDraft()
}

function addDraftChannelToForm() {
  if (!canCreate.value) {
    return
  }

  const draft = normalizeDraftChannel()

  form.value.channels = [...form.value.channels, draft]
  manageSelectionKeys.value = Array.from(new Set([...manageSelectionKeys.value, draft.key]))
  expandedManageChannelIds.value = Array.from(new Set([...expandedManageChannelIds.value, draft.localId]))
  syncTestFormChannels()
  notificationSubTab.value = 'manage'
  resetChannelDraft()
  pushToast('渠道已加入待保存列表', 'success')
}

async function createChannelAndSave() {
  try {
    addDraftChannelToForm()
  } catch (error) {
    pushToast((error as Error).message, 'error')
    return
  }

  try {
    await saveConfig('Gotify 渠道已创建')
  } catch {
    // saveConfig already shows toast feedback
  }
}

function handleSaveConfig() {
  if (!canSaveConfig.value) {
    return
  }

  void saveConfig().catch(() => {
    // saveConfig already shows toast feedback
  })
}

function handleAddDraftChannelToForm() {
  try {
    addDraftChannelToForm()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

function handleCreateChannelAndSave() {
  void createChannelAndSave()
}

function selectAllChannelsForManage() {
  manageSelectionKeys.value = form.value.channels
    .map((channel) => channel.key)
    .filter(Boolean)
}

function clearManageSelection() {
  manageSelectionKeys.value = []
}

async function applyBulkEnabled(nextEnabled: boolean) {
  if (!canManage.value) {
    return
  }

  if (!manageSelectionKeys.value.length) {
    pushToast('请先选择至少一个渠道', 'error')
    return
  }

  const selected = new Set(manageSelectionKeys.value)
  const previous = form.value.channels.map((channel) => ({ ...channel }))

  form.value.channels = form.value.channels.map((channel) =>
    selected.has(channel.key)
      ? {
          ...channel,
          enabled: nextEnabled,
        }
      : channel,
  )

  try {
    await saveConfig(nextEnabled ? '已批量启用所选渠道' : '已批量停用所选渠道')
  } catch {
    form.value = { channels: previous }
    syncTestFormChannels()
    syncManageSelection()
  }
}

function removeChannelFromForm(localId: string) {
  if (!canManage.value) {
    return
  }

  form.value.channels = form.value.channels.filter((channel) => channel.localId !== localId)
  syncTestFormChannels()
  syncManageSelection()
  syncManageExpanded()
  pushToast('渠道已从待保存列表移除，记得保存配置', 'success')
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
  if (!canTest.value) {
    return
  }

  const channelKey = String(channel.key || '').trim()
  if (!channelKey) {
    pushToast('请先保存渠道配置，再发送测试通知', 'error')
    return
  }

  testingKeys.value = Array.from(new Set([...testingKeys.value, channelKey]))

  try {
    await sendTestNotification({
      channelKeys: [channelKey],
      title: `KepCs · ${channel.name || channelKey}`,
      message: '测试文本',
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
  if (!canTest.value) {
    return
  }

  if (!testForm.value.channelKeys.length) {
    pushToast('请先选择至少一个通知渠道', 'error')
    return
  }

  testing.value = true

  try {
    await sendTestNotification({
      channelKeys: testForm.value.channelKeys,
      title: testForm.value.title.trim() || 'KepCs',
      message: testForm.value.message.trim() || '测试文本',
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
  () => [canCreate.value, canManage.value, canTest.value, notificationSubTab.value] as const,
  () => {
    const current = notificationSubTab.value
    const allowed =
      (current === 'create' && canCreate.value)
      || (current === 'manage' && canManage.value)
      || (current === 'test' && canTest.value)

    if (!allowed) {
      notificationSubTab.value = firstAvailableNotificationSubTab.value
    }
  },
  { immediate: true },
)

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
    description="把新增渠道、渠道管理和发送测试拆开，定时任务里勾选的通知渠道都复用这里。"
  >
    <template #header-extra>
      <div class="gotify-panel__actions">
        <NButton secondary class="console-button-tone--neutral-strong" @click="loadConfig()">刷新</NButton>
        <NButton v-if="canSaveConfig" secondary class="console-button-tone--neutral-strong" :loading="saving" @click="handleSaveConfig">保存配置</NButton>
      </div>
    </template>

    <div class="gotify-panel">
      <ConsoleSegmentedTabs v-model="notificationSubTab" :options="notificationSubTabOptions" />

      <div v-if="loading" class="hero-note min-h-[240px]">
        <NSpin size="large" />
      </div>

      <Transition v-else name="console-panel-switch" mode="out-in">
        <div :key="notificationSubTab" class="gotify-panel__body">
          <section class="gotify-helper-card">
            <div class="gotify-helper-card__header">
              <strong>模板变量</strong>
              <span>渠道模板支持 `&#123;&#123; 变量名 &#125;&#125;` 和 `&#123;&#123; result.message &#125;&#125;` 这种点路径；留空时会回退到系统默认文案。</span>
            </div>

            <div class="gotify-template-list">
              <div v-for="item in templateVariableRows" :key="item.key" class="gotify-template-item">
                <strong>{{ item.key }}</strong>
                <span>{{ item.label }} · {{ item.description }}</span>
              </div>
            </div>
          </section>

          <template v-if="notificationSubTab === 'create' && canCreate">
            <section class="gotify-helper-card">
              <div class="gotify-helper-card__header">
                <strong>新增渠道</strong>
                <span>先填写一个 Gotify 渠道，再决定是仅加入待保存列表，还是直接创建并保存。</span>
              </div>

              <NForm label-placement="top" class="console-field-grid cols-2">
                <NFormItem label="渠道标识">
                  <NInput v-model:value="channelDraft.key" placeholder="ops-main" />
                </NFormItem>
                <NFormItem label="渠道名称">
                  <NInput v-model:value="channelDraft.name" placeholder="运维主群" />
                </NFormItem>
                <NFormItem label="Gotify 地址">
                  <NInput v-model:value="channelDraft.serverUrl" placeholder="https://gotify.kaish.cn" />
                </NFormItem>
                <NFormItem label="默认优先级">
                  <NInputNumber v-model:value="channelDraft.priority" :min="0" :max="10" :show-button="false" class="w-full" />
                </NFormItem>
                <NFormItem label="App Token" class="col-span-full">
                  <NInput v-model:value="channelDraft.token" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="输入 Gotify App Token" />
                </NFormItem>
                <NFormItem label="渠道说明" class="col-span-full">
                  <NInput v-model:value="channelDraft.description" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="比如：更新通知 / 重启通知 / 失败告警" />
                </NFormItem>
                <NFormItem label="触发通知标题模板">
                  <NInput v-model:value="channelDraft.templates.queued.title" placeholder="例如：定时任务已触发 · {{ scheduleName }}" />
                </NFormItem>
                <NFormItem label="完成通知标题模板">
                  <NInput v-model:value="channelDraft.templates.finished.title" placeholder="例如：{{ updated }} · {{ scheduleName }}" />
                </NFormItem>
                <NFormItem label="触发通知正文模板" class="col-span-full">
                  <NInput
                    v-model:value="channelDraft.templates.queued.message"
                    type="textarea"
                    :autosize="{ minRows: 3, maxRows: 6 }"
                    placeholder="例如：节点: {{ nodeName }}&#10;规则: {{ scheduleSummary }}&#10;命令 ID: {{ commandId }}"
                  />
                </NFormItem>
                <NFormItem label="完成通知正文模板" class="col-span-full">
                  <NInput
                    v-model:value="channelDraft.templates.finished.message"
                    type="textarea"
                    :autosize="{ minRows: 4, maxRows: 8 }"
                    placeholder="例如：状态: {{ commandStatus }}&#10;结果: {{ resultMessage }}&#10;版本: {{ currentBuildId }} -> {{ latestBuildId }}"
                  />
                </NFormItem>
                <NFormItem label="启用状态">
                  <NSwitch v-model:value="channelDraft.enabled" />
                </NFormItem>
              </NForm>

              <div class="gotify-helper-card__actions">
                <NButton secondary class="console-button-tone--neutral-strong" @click="handleAddDraftChannelToForm">
                  加入渠道列表
                </NButton>
                <NButton secondary class="console-button-tone--neutral-strong" :loading="saving" @click="handleCreateChannelAndSave">
                  创建并保存
                </NButton>
                <NButton secondary class="console-button-tone--neutral-strong" @click="resetChannelDraft">
                  清空表单
                </NButton>
              </div>
            </section>
          </template>

          <template v-else-if="notificationSubTab === 'manage' && canManage">
            <div v-if="form.channels.length" class="gotify-manage-stack">
              <section class="gotify-helper-card">
                <div class="gotify-helper-card__header">
                  <strong>渠道管理</strong>
                  <span>可多选渠道后统一启用或停用，不选时默认展示全部渠道。</span>
                </div>

                <NForm label-placement="top" class="console-field-grid cols-2">
                  <NFormItem label="渠道筛选" class="col-span-full">
                    <NSelect
                      v-model:value="manageSelectionKeys"
                      multiple
                      clearable
                      filterable
                      max-tag-count="responsive"
                      :options="manageChannelOptions"
                      placeholder="选择要批量管理的渠道"
                    />
                  </NFormItem>
                  <NFormItem label="已选数量">
                    <div class="gotify-summary-box">
                      <strong>{{ selectedManageCount || form.channels.length }}</strong>
                      <span>{{ selectedManageCount ? '当前多选渠道' : '当前显示全部渠道' }}</span>
                    </div>
                  </NFormItem>
                  <NFormItem label="批量操作">
                    <div class="console-inline-actions">
                      <NButton secondary class="console-button-tone--neutral-strong" @click="selectAllChannelsForManage">
                        全选全部
                      </NButton>
                      <NButton secondary class="console-button-tone--neutral-strong" @click="clearManageSelection">
                        清空选择
                      </NButton>
                      <NButton secondary class="console-button-tone--neutral-strong" :loading="saving" @click="applyBulkEnabled(true)">
                        批量启用
                      </NButton>
                      <NButton secondary class="console-button-tone--neutral-strong" :loading="saving" @click="applyBulkEnabled(false)">
                        批量停用
                      </NButton>
                    </div>
                  </NFormItem>
                </NForm>
              </section>

              <div class="gotify-channel-list">
                <section v-for="channel in visibleManageChannels" :key="channel.localId" class="gotify-channel-card">
                  <button type="button" class="gotify-channel-card__trigger" @click="toggleManageChannel(channel.localId)">
                    <div class="gotify-channel-card__header">
                      <div class="gotify-channel-card__title">
                        <strong>{{ channel.name || '未命名渠道' }}</strong>
                        <span>{{ channel.key || '未填写标识' }}</span>
                      </div>
                      <div class="gotify-channel-card__side">
                        <NTag round :type="channel.enabled ? 'success' : 'default'">
                          {{ channel.enabled ? '已启用' : '已停用' }}
                        </NTag>
                        <span class="gotify-channel-card__arrow" :class="{ 'is-open': isManageChannelExpanded(channel.localId) }">⌄</span>
                      </div>
                    </div>
                  </button>

                  <NCollapseTransition :show="isManageChannelExpanded(channel.localId)">
                    <div class="gotify-channel-card__body">
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
                        <NFormItem label="触发通知标题模板">
                          <NInput v-model:value="channel.templates.queued.title" placeholder="例如：定时任务已触发 · {{ scheduleName }}" />
                        </NFormItem>
                        <NFormItem label="完成通知标题模板">
                          <NInput v-model:value="channel.templates.finished.title" placeholder="例如：{{ commandStatus }} · {{ scheduleName }}" />
                        </NFormItem>
                        <NFormItem label="触发通知正文模板" class="col-span-full">
                          <NInput
                            v-model:value="channel.templates.queued.message"
                            type="textarea"
                            :autosize="{ minRows: 3, maxRows: 6 }"
                            placeholder="例如：节点: {{ nodeName }}&#10;规则: {{ scheduleSummary }}&#10;命令 ID: {{ commandId }}"
                          />
                        </NFormItem>
                        <NFormItem label="完成通知正文模板" class="col-span-full">
                          <NInput
                            v-model:value="channel.templates.finished.message"
                            type="textarea"
                            :autosize="{ minRows: 4, maxRows: 8 }"
                            placeholder="例如：状态: {{ commandStatus }}&#10;结果: {{ resultMessage }}&#10;版本: {{ currentBuildId }} -> {{ latestBuildId }}"
                          />
                        </NFormItem>
                        <NFormItem label="启用状态">
                          <NSwitch v-model:value="channel.enabled" />
                        </NFormItem>
                      </NForm>

                      <div class="gotify-channel-card__actions">
                        <NButton
                          secondary
                          class="console-button-tone--neutral-strong"
                          :loading="testingKeys.includes(channel.key)"
                          @click="sendChannelTest(channel)"
                        >
                          发送测试
                        </NButton>
                        <NButton secondary class="console-button-tone--neutral-strong" @click="removeChannelFromForm(channel.localId)">
                          从配置移除
                        </NButton>
                      </div>
                    </div>
                  </NCollapseTransition>
                </section>
              </div>
            </div>

            <div v-else class="hero-note min-h-[220px]">
              <div class="hero-note__inner">
                <div class="hero-note__title">还没有配置 Gotify 渠道</div>
                <div class="hero-note__desc">先到“新增渠道”里创建一个渠道，之后这里才能批量管理。</div>
              </div>
            </div>
          </template>

          <template v-else>
            <div v-if="form.channels.length" class="gotify-test-stack">
              <section class="gotify-helper-card">
                <div class="gotify-helper-card__header">
                  <strong>发送测试</strong>
                  <span>测试发送基于已保存的渠道配置，建议修改后先点右上角保存配置。</span>
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
                    <NInput v-model:value="testForm.title" placeholder="KepCs" />
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
                  <NButton secondary class="console-button-tone--neutral-strong" :loading="testing" @click="sendCustomTest">
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

              <section class="gotify-helper-card">
                <div class="gotify-helper-card__header">
                  <strong>模板预览</strong>
                  <span>下面会用模拟的调度数据预览当前渠道模板，不会真实发送消息。</span>
                </div>

                <NForm label-placement="top" class="console-field-grid cols-2">
                  <NFormItem label="预览事件">
                    <NSelect
                      v-model:value="templatePreviewEvent"
                      :options="[
                        { label: '任务触发', value: 'queued' },
                        { label: '任务完成', value: 'finished' },
                      ]"
                    />
                  </NFormItem>
                  <NFormItem label="预览渠道">
                    <div class="gotify-summary-box">
                      <strong>{{ previewChannel?.name || '未选择渠道' }}</strong>
                      <span>{{ previewChannel?.key || '请先选择测试渠道' }}</span>
                    </div>
                  </NFormItem>
                </NForm>

                <div class="gotify-format-card">
                  <div class="gotify-format-card__endpoint">
                    标题预览
                  </div>
                  <pre class="gotify-format-card__payload">{{ renderedTemplatePreview.title || '当前事件未配置标题模板，将使用系统默认标题。' }}</pre>
                </div>

                <div class="gotify-format-card">
                  <div class="gotify-format-card__endpoint">
                    正文预览
                  </div>
                  <pre class="gotify-format-card__payload">{{ renderedTemplatePreview.message || '当前事件未配置正文模板，将使用系统默认正文。' }}</pre>
                </div>
              </section>
            </div>

            <div v-else class="hero-note min-h-[220px]">
              <div class="hero-note__inner">
                <div class="hero-note__title">还没有配置 Gotify 渠道</div>
                <div class="hero-note__desc">先新增一个渠道并保存，之后这里才能发送测试通知。</div>
              </div>
            </div>
          </template>
        </div>
      </Transition>
    </div>
  </ConsolePanelCard>
</template>

<style scoped>
.gotify-panel,
.gotify-panel__body,
.gotify-manage-stack,
.gotify-test-stack,
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

.gotify-helper-card__actions,
.gotify-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.gotify-summary-box {
  display: grid;
  gap: 4px;
  width: 100%;
  min-height: 40px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.02);
}

.gotify-summary-box strong {
  font-size: 16px;
  color: var(--app-text);
}

.gotify-summary-box span {
  font-size: 12px;
  color: var(--app-text-muted);
}

.gotify-template-list {
  display: grid;
  gap: 10px;
}

.gotify-template-item {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.02);
}

.gotify-template-item strong {
  font-size: 12px;
  color: #dfe9f6;
  font-family: var(--app-font-number);
}

.gotify-template-item span {
  font-size: 12px;
  color: var(--app-text-muted);
  line-height: 1.7;
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
  gap: 0;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.014);
  overflow: hidden;
}

.gotify-channel-card__trigger {
  width: 100%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.gotify-channel-card__body {
  display: grid;
  gap: 14px;
  padding: 0 16px 16px;
}

.gotify-channel-card__side {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.gotify-channel-card__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  color: var(--app-text-muted);
  font-size: 14px;
  transition: transform 180ms ease, color 180ms ease;
}

.gotify-channel-card__arrow.is-open {
  transform: rotate(180deg);
  color: var(--app-text);
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
  .gotify-channel-card__header,
  .gotify-channel-card__trigger,
  .gotify-helper-card__actions {
    flex-direction: column;
  }

  .gotify-panel__actions :deep(.n-button),
  .gotify-channel-card__actions :deep(.n-button),
  .gotify-helper-card__actions :deep(.n-button) {
    width: 100%;
  }
}
</style>
