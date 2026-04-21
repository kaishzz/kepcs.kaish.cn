<script setup lang="ts">
import type { DataTableColumns, DataTableRowKey } from 'naive-ui'
import {
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui'
import { computed, h, ref, watch } from 'vue'

import { http } from '../../lib/api'
import { pushToast } from '../../lib/toast'
import ConsoleMetricStrip from './ConsoleMetricStrip.vue'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleRefreshIcon from './ConsoleRefreshIcon.vue'
import ConsoleSectionBlock from './ConsoleSectionBlock.vue'
import type {
  IdleRestartMonitorConfig,
  IdleRestartMonitorRuntime,
  KepcsCatalogServerItem,
} from '../../types'

const props = defineProps<{
  active: boolean
}>()

const loading = ref(false)
const saving = ref(false)
const policySaving = ref(false)
const checkedRowKeys = ref<DataTableRowKey[]>([])
const servers = ref<KepcsCatalogServerItem[]>([])
const config = ref<IdleRestartMonitorConfig>({
  enabled: false,
  checkIntervalSeconds: 30,
  timezone: 'Asia/Shanghai',
})
const runtime = ref<IdleRestartMonitorRuntime>({
  lastCheckedAt: null,
  lastRestartAt: null,
  lastError: null,
  windowActive: false,
  lastSummary: {
    inspectedCount: 0,
    eligibleCount: 0,
    matchedCount: 0,
    queuedCount: 0,
    windowActiveCount: 0,
    trackedIdleCount: 0,
  },
  recentRestarts: [],
})

const batchForm = ref({
  applyEnabled: false,
  enabled: false,
  applyWindow: false,
  windowStart: '02:00',
  windowEnd: '08:00',
  applyIdleThreshold: false,
  idleThresholdSeconds: 300,
  applyRestartCooldown: false,
  restartCooldownSeconds: 1800,
})

const confirmState = ref({
  show: false,
  title: '',
  lines: [] as string[],
  positiveText: '确认',
  loading: false,
})

let pendingConfirmAction: (() => Promise<void>) | null = null

const policyModal = ref({
  show: false,
  id: '',
  name: '',
  endpoint: '',
  enabled: false,
  idleThresholdSeconds: 300,
  windowStart: '02:00',
  windowEnd: '08:00',
  restartCooldownSeconds: 1800,
})

const enabledServerCount = computed(() =>
  servers.value.filter((row) => row.idleRestartEnabled).length,
)

const selectedServerIds = computed(() =>
  checkedRowKeys.value.map((key) => String(key)),
)

const canSubmitBatch = computed(() =>
  selectedServerIds.value.length > 0
  && (
    batchForm.value.applyEnabled
    || batchForm.value.applyWindow
    || batchForm.value.applyIdleThreshold
    || batchForm.value.applyRestartCooldown
  ),
)

const summaryCards = computed(() => [
  { label: '总开关', value: config.value.enabled ? '已启用' : '已停用' },
  { label: '单服已启用', value: enabledServerCount.value },
  { label: '生效服务器', value: runtime.value.lastSummary?.windowActiveCount ?? 0 },
  { label: '最近下发', value: formatDateTime(runtime.value.lastRestartAt) },
])

const recentRows = computed(() => runtime.value.recentRestarts.slice(0, 6))

function formatDateTime(value?: string | null) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hour = `${date.getHours()}`.padStart(2, '0')
  const minute = `${date.getMinutes()}`.padStart(2, '0')
  const second = `${date.getSeconds()}`.padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function resolveMatchTarget(row: KepcsCatalogServerItem) {
  return row.port > 0 ? `端口 ${row.port}` : '端口未配置'
}

function formatWindow(row: KepcsCatalogServerItem) {
  return `${row.idleRestartWindowStart} - ${row.idleRestartWindowEnd}`
}

async function loadPanel() {
  loading.value = true

  try {
    const [serverResponse, statusResponse] = await Promise.all([
      http.get('/console/api/server-catalog/kepcs/idle-restart-monitor/servers'),
      http.get('/console/api/server-catalog/kepcs/idle-restart-monitor'),
    ])
    servers.value = serverResponse.data.servers || []
    config.value = statusResponse.data.config || config.value
    runtime.value = statusResponse.data.runtime || runtime.value
    checkedRowKeys.value = []
  }
  catch (error) {
    pushToast((error as Error).message, 'error')
  }
  finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true

  try {
    const { data } = await http.patch('/console/api/server-catalog/kepcs/idle-restart-monitor', {
      enabled: config.value.enabled,
      checkIntervalSeconds: config.value.checkIntervalSeconds,
    })
    config.value = data.config || config.value
    pushToast('空闲自动重启总开关已保存', 'success')
    await loadPanel()
  }
  catch (error) {
    pushToast((error as Error).message, 'error')
  }
  finally {
    saving.value = false
  }
}

async function runSweep() {
  saving.value = true

  try {
    const { data } = await http.post('/console/api/server-catalog/kepcs/idle-restart-monitor/run')
    config.value = data.config || config.value
    runtime.value = data.runtime || runtime.value
    pushToast('已执行一轮空服重启巡检', 'success')
  }
  catch (error) {
    pushToast((error as Error).message, 'error')
  }
  finally {
    saving.value = false
  }
}

function openPolicyModal(row: KepcsCatalogServerItem) {
  policyModal.value = {
    show: true,
    id: row.id,
    name: row.name,
    endpoint: `${row.host}:${row.port}`,
    enabled: row.idleRestartEnabled,
    idleThresholdSeconds: row.idleRestartThresholdSeconds,
    windowStart: row.idleRestartWindowStart,
    windowEnd: row.idleRestartWindowEnd,
    restartCooldownSeconds: row.idleRestartCooldownSeconds,
  }
}

async function savePolicy() {
  if (policySaving.value) {
    return
  }

  policySaving.value = true

  try {
    await http.patch(`/console/api/server-catalog/kepcs/${encodeURIComponent(policyModal.value.id)}/idle-restart-monitor`, {
      enabled: policyModal.value.enabled,
      windowStart: policyModal.value.windowStart,
      windowEnd: policyModal.value.windowEnd,
      idleThresholdSeconds: policyModal.value.idleThresholdSeconds,
      restartCooldownSeconds: policyModal.value.restartCooldownSeconds,
    })
    pushToast('单服重启策略已保存', 'success')
    policyModal.value.show = false
    await loadPanel()
  }
  catch (error) {
    pushToast((error as Error).message, 'error')
  }
  finally {
    policySaving.value = false
  }
}

function openConfirmDialog(title: string, lines: string[], positiveText: string, action: () => Promise<void>) {
  pendingConfirmAction = action
  confirmState.value = {
    show: true,
    title,
    lines,
    positiveText,
    loading: false,
  }
}

async function runConfirmAction() {
  if (!pendingConfirmAction || confirmState.value.loading) {
    return
  }

  confirmState.value.loading = true

  try {
    await pendingConfirmAction()
    confirmState.value.show = false
    pendingConfirmAction = null
  }
  catch {
    // Keep the modal open so the user can see the toast feedback.
  }
  finally {
    confirmState.value.loading = false
  }
}

function closeConfirmDialog() {
  confirmState.value.show = false
  confirmState.value.loading = false
  pendingConfirmAction = null
}

function selectAllServers() {
  checkedRowKeys.value = servers.value.map((row) => row.id)
}

function clearSelectedServers() {
  checkedRowKeys.value = []
}

function saveBatchPolicy() {
  if (!selectedServerIds.value.length) {
    pushToast('请先勾选需要批量修改的服务器', 'error')
    return
  }

  if (
    !batchForm.value.applyEnabled
    && !batchForm.value.applyWindow
    && !batchForm.value.applyIdleThreshold
    && !batchForm.value.applyRestartCooldown
  ) {
    pushToast('请至少选择一项批量修改内容', 'error')
    return
  }

  const lines = [
    `将批量修改 ${selectedServerIds.value.length} 台服务器的空服重启策略`,
    ...(batchForm.value.applyEnabled
      ? [`启用状态将统一设为 ${batchForm.value.enabled ? '已启用' : '未启用'}`]
      : []),
    ...(batchForm.value.applyWindow
      ? [`生效时段将统一设为 ${batchForm.value.windowStart} - ${batchForm.value.windowEnd}`]
      : []),
    ...(batchForm.value.applyIdleThreshold
      ? [`空服阈值将统一设为 ${batchForm.value.idleThresholdSeconds}s`]
      : []),
    ...(batchForm.value.applyRestartCooldown
      ? [`重启冷却将统一设为 ${batchForm.value.restartCooldownSeconds}s`]
      : []),
  ]

  openConfirmDialog('确认批量修改重启策略', lines, '确认保存', async () => {
    try {
      await http.patch('/console/api/server-catalog/kepcs/idle-restart-monitor/batch', {
        ids: selectedServerIds.value,
        ...(batchForm.value.applyEnabled ? { enabled: batchForm.value.enabled } : {}),
        ...(batchForm.value.applyWindow
          ? {
              windowStart: batchForm.value.windowStart,
              windowEnd: batchForm.value.windowEnd,
            }
          : {}),
        ...(batchForm.value.applyIdleThreshold ? { idleThresholdSeconds: batchForm.value.idleThresholdSeconds } : {}),
        ...(batchForm.value.applyRestartCooldown ? { restartCooldownSeconds: batchForm.value.restartCooldownSeconds } : {}),
      })
      pushToast('批量重启策略已保存', 'success')
      checkedRowKeys.value = []
      await loadPanel()
    }
    catch (error) {
      pushToast((error as Error).message, 'error')
      throw error
    }
  })
}

function renderStateTag(enabled: boolean) {
  return h(
    NTag,
    { bordered: false, round: false, size: 'small', type: enabled ? 'success' : 'default' },
    { default: () => (enabled ? '已启用' : '未启用') },
  )
}

function catalogRowKey(row: KepcsCatalogServerItem) {
  return row.id
}

const columns = computed<DataTableColumns<KepcsCatalogServerItem>>(() => [
  {
    type: 'selection',
    width: 48,
    fixed: 'left',
  },
  { title: 'ID', key: 'id', width: 64 },
  { title: '名称', key: 'name', width: 132, ellipsis: { tooltip: true } },
  {
    title: '地址',
    key: 'endpoint',
    width: 176,
    ellipsis: { tooltip: true },
    render: (row) => `${row.host}:${row.port}`,
  },
  {
    title: '生效时段',
    key: 'window',
    width: 132,
    render: (row) => formatWindow(row),
  },
  {
    title: '空服阈值',
    key: 'idleRestartThresholdSeconds',
    width: 96,
    render: (row) => `${row.idleRestartThresholdSeconds}s`,
  },
  {
    title: '冷却',
    key: 'idleRestartCooldownSeconds',
    width: 92,
    render: (row) => `${row.idleRestartCooldownSeconds}s`,
  },
  {
    title: '匹配目标',
    key: 'matchTarget',
    width: 120,
    render: (row) => resolveMatchTarget(row),
  },
  {
    title: '状态',
    key: 'idleRestartEnabled',
    width: 92,
    render: (row) => renderStateTag(row.idleRestartEnabled),
  },
  {
    title: '操作',
    key: 'actions',
    width: 96,
    fixed: 'right',
    render: (row) =>
      h(
        NButton,
        { secondary: true, size: 'small', onClick: () => openPolicyModal(row) },
        { default: () => '配置' },
      ),
  },
])

watch(
  () => props.active,
  (active) => {
    if (active) {
      void loadPanel()
    }
  },
  { immediate: true },
)
</script>

<template>
  <ConsolePanelCard
    title="空闲自动重启"
    description="统一管理空闲自动重启巡检、批量策略和单服策略配置。"
  >
    <template #header-extra>
      <div class="catalog-header-extra">
              <NButton secondary class="console-action-icon" title="刷新列表" @click="loadPanel">
                <ConsoleRefreshIcon />
              </NButton>
      </div>
    </template>

    <div v-if="loading" class="hero-note min-h-[320px]">
      <NSpin size="large" />
    </div>

    <template v-else>
      <ConsoleMetricStrip :items="summaryCards" />

      <ConsoleSectionBlock title="全局巡检">

        <NForm label-placement="top" class="console-field-grid cols-3">
          <NFormItem label="总开关">
            <NSwitch v-model:value="config.enabled" />
          </NFormItem>
          <NFormItem label="巡检间隔 (秒)">
            <NInputNumber v-model:value="config.checkIntervalSeconds" :min="5" :max="3600" :show-button="false" class="w-full" />
          </NFormItem>
          <NFormItem label="操作">
            <div class="catalog-toolbar-actions">
              <NButton secondary :loading="saving" @click="runSweep">立即执行</NButton>
              <NButton type="primary" :loading="saving" @click="saveConfig">保存总开关</NButton>
            </div>
          </NFormItem>
        </NForm>

        <div class="catalog-monitor-meta">
          <span>时区 {{ config.timezone || 'Asia/Shanghai' }}</span>
          <span>上次巡检 {{ formatDateTime(runtime.lastCheckedAt) }}</span>
          <span v-if="runtime.lastError">最近错误 {{ runtime.lastError }}</span>
        </div>
      </ConsoleSectionBlock>

      <ConsoleSectionBlock title="批量修改">
        <template #header-extra>
          <div class="catalog-selection-actions">
            <span class="catalog-selection-actions__label">已选 {{ selectedServerIds.length }} 台</span>
            <NButton secondary size="small" :disabled="!servers.length" @click="selectAllServers">全选</NButton>
            <NButton secondary size="small" :disabled="!selectedServerIds.length" @click="clearSelectedServers">清空</NButton>
          </div>
        </template>

        <NForm label-placement="top" class="console-field-grid cols-4">
          <NFormItem label="选中服务器">
            <div class="catalog-selection-summary">
              <strong>{{ selectedServerIds.length }}</strong>
              <span>台</span>
            </div>
          </NFormItem>
          <NFormItem label="同步状态">
            <div class="catalog-batch-field">
              <NCheckbox v-model:checked="batchForm.applyEnabled">启用状态</NCheckbox>
              <NSwitch v-model:value="batchForm.enabled" :disabled="!batchForm.applyEnabled" />
            </div>
          </NFormItem>
          <NFormItem label="同步时段">
            <div class="catalog-batch-field catalog-batch-field--stack">
              <NCheckbox v-model:checked="batchForm.applyWindow">生效时段</NCheckbox>
              <div class="catalog-window-inputs">
                <NInput v-model:value="batchForm.windowStart" :disabled="!batchForm.applyWindow" placeholder="02:00" />
                <span>至</span>
                <NInput v-model:value="batchForm.windowEnd" :disabled="!batchForm.applyWindow" placeholder="08:00" />
              </div>
            </div>
          </NFormItem>
          <NFormItem label="同步空服阈值">
            <div class="catalog-batch-field catalog-batch-field--input">
              <NCheckbox v-model:checked="batchForm.applyIdleThreshold">空服阈值</NCheckbox>
              <NInputNumber
                v-model:value="batchForm.idleThresholdSeconds"
                :min="30"
                :max="86400"
                :show-button="false"
                :disabled="!batchForm.applyIdleThreshold"
                class="w-full"
              />
            </div>
          </NFormItem>
          <NFormItem label="同步重启冷却">
            <div class="catalog-batch-field catalog-batch-field--input">
              <NCheckbox v-model:checked="batchForm.applyRestartCooldown">重启冷却</NCheckbox>
              <NInputNumber
                v-model:value="batchForm.restartCooldownSeconds"
                :min="60"
                :max="86400"
                :show-button="false"
                :disabled="!batchForm.applyRestartCooldown"
                class="w-full"
              />
            </div>
          </NFormItem>
          <NFormItem label="执行">
            <NButton type="primary" block :disabled="!canSubmitBatch" @click="saveBatchPolicy">批量保存</NButton>
          </NFormItem>
        </NForm>
      </ConsoleSectionBlock>

      <ConsoleSectionBlock title="单服配置">

        <div v-if="servers.length" class="table-shell">
          <NDataTable
            v-model:checked-row-keys="checkedRowKeys"
            :columns="columns"
            :data="servers"
            :bordered="false"
            :row-key="catalogRowKey"
            :scroll-x="1148"
          />
        </div>

        <div v-else class="hero-note min-h-[220px]">
          <div class="hero-note__inner">
            <div class="hero-note__title">暂无可配置服务器</div>
          </div>
        </div>
      </ConsoleSectionBlock>

      <ConsoleSectionBlock v-if="recentRows.length" title="最近下发">

        <div class="catalog-monitor-switches">
          <article
            v-for="item in recentRows"
            :key="`${item.serverId}-${item.restartedAt}`"
            class="catalog-monitor-switch"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.serverKey }} · {{ item.nodeName }}</span>
            <span>{{ item.endpoint }} · {{ formatDateTime(item.restartedAt) }}</span>
          </article>
        </div>
      </ConsoleSectionBlock>
    </template>

    <NModal v-model:show="policyModal.show" preset="card" title="编辑单服重启策略" class="max-w-[640px]">
      <div class="catalog-policy-summary">
        <strong>{{ policyModal.name }}</strong>
        <span>{{ policyModal.endpoint }}</span>
        <span>按端口匹配 Agent 容器</span>
      </div>

      <NForm label-placement="top" class="console-field-grid cols-2">
        <NFormItem label="启用策略">
          <NSwitch v-model:value="policyModal.enabled" />
        </NFormItem>
        <NFormItem label="空服阈值 (秒)">
          <NInputNumber v-model:value="policyModal.idleThresholdSeconds" :min="30" :max="86400" :show-button="false" class="w-full" />
        </NFormItem>
        <NFormItem label="生效时段">
          <div class="catalog-window-inputs">
            <NInput v-model:value="policyModal.windowStart" placeholder="02:00" />
            <span>至</span>
            <NInput v-model:value="policyModal.windowEnd" placeholder="08:00" />
          </div>
        </NFormItem>
        <NFormItem label="重启冷却 (秒)">
          <NInputNumber v-model:value="policyModal.restartCooldownSeconds" :min="60" :max="86400" :show-button="false" class="w-full" />
        </NFormItem>
      </NForm>

      <NSpace justify="end">
        <NButton :disabled="policySaving" @click="policyModal.show = false">取消</NButton>
        <NButton type="primary" :loading="policySaving" @click="savePolicy">保存</NButton>
      </NSpace>
    </NModal>

    <NModal v-model:show="confirmState.show" preset="card" :title="confirmState.title" class="max-w-[520px]">
      <div class="confirm-dialog-copy">
        <div v-for="line in confirmState.lines" :key="line" class="confirm-dialog-copy__line">
          {{ line }}
        </div>
      </div>

      <NSpace justify="end">
        <NButton :disabled="confirmState.loading" @click="closeConfirmDialog">取消</NButton>
        <NButton type="primary" :loading="confirmState.loading" @click="runConfirmAction">
          {{ confirmState.positiveText }}
        </NButton>
      </NSpace>
    </NModal>
  </ConsolePanelCard>
</template>

<style scoped>
.catalog-stat-grid,
.catalog-section-head,
.catalog-monitor-meta,
.catalog-monitor-switches,
.catalog-policy-summary,
.confirm-dialog-copy {
  display: grid;
  gap: 12px;
}

.catalog-stat-grid {
  gap: 0;
  border-top: 1px solid var(--app-border-soft);
  border-bottom: 1px solid var(--app-border-soft);
}

.catalog-stat-card {
  padding: 12px 10px;
  display: grid;
  align-content: center;
  justify-items: center;
  min-height: 74px;
  text-align: center;
  border-left: 1px solid var(--app-border-soft);
}

.catalog-stat-grid > .catalog-stat-card:first-child {
  border-left: 0;
}

.catalog-stat-card span,
.catalog-monitor-meta span,
.catalog-monitor-switch span,
.catalog-policy-summary span,
.catalog-selection-actions__label,
.catalog-selection-summary span,
.catalog-window-inputs span {
  font-size: 12px;
  line-height: 1.65;
  color: var(--app-text-muted);
}

.catalog-stat-card strong,
.catalog-monitor-switch strong,
.catalog-policy-summary strong,
.catalog-selection-summary strong {
  color: var(--app-text);
}

.catalog-section-head {
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--app-border-soft);
}

.catalog-selection-summary {
  min-height: 34px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.catalog-selection-summary strong {
  font-size: 24px;
  line-height: 1;
}

.catalog-section-head__title {
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: var(--app-text);
}

.catalog-selection-actions,
.catalog-toolbar-actions,
.catalog-batch-field {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.catalog-selection-actions {
  justify-content: flex-start;
}

.catalog-batch-field {
  justify-content: space-between;
  min-height: 34px;
}

.catalog-batch-field--input :deep(.n-input-number) {
  flex: 1;
  min-width: 132px;
}

.catalog-batch-field--stack {
  width: 100%;
  align-items: stretch;
}

.catalog-monitor-meta {
  gap: 4px;
}

.catalog-monitor-switches {
  gap: 8px;
}

.catalog-monitor-switch {
  display: grid;
  gap: 2px;
  padding: 10px 0;
  border-top: 1px solid var(--app-border-soft);
}

.catalog-policy-summary {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--app-border-soft);
}

.catalog-header-extra {
  display: flex;
  align-items: center;
  justify-content: center;
}

.catalog-window-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  width: 100%;
}

.confirm-dialog-copy__line {
  font-size: 13px;
  line-height: 1.7;
  color: var(--app-text);
}

@media (min-width: 769px) {
  .console-field-grid.cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .console-field-grid.cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .console-field-grid.cols-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .catalog-section-head {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
}

@media (min-width: 1024px) {
  .catalog-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .catalog-toolbar-actions,
  .catalog-toolbar-actions :deep(.n-button) {
    width: 100%;
  }

  .catalog-batch-field {
    align-items: flex-start;
  }
}
</style>
