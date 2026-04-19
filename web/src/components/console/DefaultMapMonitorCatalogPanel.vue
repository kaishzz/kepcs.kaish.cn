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
import ConsoleSectionBlock from './ConsoleSectionBlock.vue'
import type {
  DefaultMapMonitorConfig,
  DefaultMapMonitorRuntime,
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
const config = ref<DefaultMapMonitorConfig>({
  enabled: false,
  checkIntervalSeconds: 10,
})
const runtime = ref<DefaultMapMonitorRuntime>({
  lastCheckedAt: null,
  lastSwitchAt: null,
  lastError: null,
  lastSummary: {
    inspectedCount: 0,
    eligibleCount: 0,
    switchedCount: 0,
    trackedIdleCount: 0,
  },
  recentSwitches: [],
})

const batchForm = ref({
  applyEnabled: false,
  enabled: false,
  applyIdleThreshold: false,
  idleThresholdSeconds: 300,
  applyDefaultMap: false,
  defaultMap: '',
  applyDefaultMapId: false,
  defaultMapId: '',
  applyRconPassword: false,
  rconPassword: '',
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
  defaultMap: '',
  defaultMapId: '',
  hasRconPassword: false,
  rconPassword: '',
  enabled: false,
  idleThresholdSeconds: 300,
})

const enabledServerCount = computed(() =>
  servers.value.filter((row) => row.defaultMapMonitorEnabled).length,
)

const selectedServerIds = computed(() =>
  checkedRowKeys.value.map((key) => String(key)),
)

const canSubmitBatch = computed(() =>
  selectedServerIds.value.length > 0
  && (
    batchForm.value.applyEnabled
    || batchForm.value.applyIdleThreshold
    || batchForm.value.applyDefaultMap
    || batchForm.value.applyDefaultMapId
    || batchForm.value.applyRconPassword
  ),
)

const summaryCards = computed(() => [
  { label: '总开关', value: config.value.enabled ? '已启用' : '已停用' },
  { label: '单服已启用', value: enabledServerCount.value },
  { label: '可切图服务器', value: runtime.value.lastSummary?.eligibleCount ?? 0 },
  { label: '最近切图', value: formatDateTime(runtime.value.lastSwitchAt) },
])

const recentSwitchRows = computed(() => runtime.value.recentSwitches.slice(0, 6))

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

function resolveReadiness(row: KepcsCatalogServerItem) {
  const missing: string[] = []

  if (!String(row.defaultMap || '').trim()) {
    missing.push('默认图')
  }

  if (!String(row.defaultMapId || '').trim()) {
    missing.push('WorkshopID')
  }

  if (!row.hasRconPassword) {
    missing.push('RCON')
  }

  return missing.length ? `缺少 ${missing.join(' / ')}` : '已完整'
}

async function loadPanel() {
  loading.value = true

  try {
    const [serverResponse, statusResponse] = await Promise.all([
      http.get('/console/api/server-catalog/kepcs/default-map-monitor/servers'),
      http.get('/console/api/server-catalog/kepcs/default-map-monitor'),
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
    const { data } = await http.patch('/console/api/server-catalog/kepcs/default-map-monitor', {
      enabled: config.value.enabled,
      checkIntervalSeconds: config.value.checkIntervalSeconds,
    })
    config.value = data.config || config.value
    pushToast('空闲自动换图总开关已保存', 'success')
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
    const { data } = await http.post('/console/api/server-catalog/kepcs/default-map-monitor/run')
    config.value = data.config || config.value
    runtime.value = data.runtime || runtime.value
    pushToast('已执行一轮空服换图巡检', 'success')
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
    defaultMap: row.defaultMap,
    defaultMapId: row.defaultMapId,
    hasRconPassword: row.hasRconPassword,
    rconPassword: '',
    enabled: row.defaultMapMonitorEnabled,
    idleThresholdSeconds: row.defaultMapIdleThresholdSeconds,
  }
}

async function savePolicy() {
  if (policySaving.value) {
    return
  }

  policySaving.value = true

  try {
    await http.patch(`/console/api/server-catalog/kepcs/${encodeURIComponent(policyModal.value.id)}/default-map-monitor`, {
      enabled: policyModal.value.enabled,
      idleThresholdSeconds: policyModal.value.idleThresholdSeconds,
      defaultMap: policyModal.value.defaultMap.trim(),
      defaultMapId: policyModal.value.defaultMapId.trim(),
      ...(policyModal.value.rconPassword.trim()
        ? { rconPassword: policyModal.value.rconPassword.trim() }
        : {}),
    })
    pushToast('单服换图策略已保存', 'success')
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
    && !batchForm.value.applyIdleThreshold
    && !batchForm.value.applyDefaultMap
    && !batchForm.value.applyDefaultMapId
    && !batchForm.value.applyRconPassword
  ) {
    pushToast('请至少选择一项批量修改内容', 'error')
    return
  }

  if (batchForm.value.applyDefaultMap && !batchForm.value.defaultMap.trim()) {
    pushToast('请输入默认地图', 'error')
    return
  }

  if (batchForm.value.applyDefaultMapId && !batchForm.value.defaultMapId.trim()) {
    pushToast('请输入 WorkshopID', 'error')
    return
  }

  if (batchForm.value.applyRconPassword && !batchForm.value.rconPassword.trim()) {
    pushToast('请输入 RCON 密码', 'error')
    return
  }

  const lines = [
    `将批量修改 ${selectedServerIds.value.length} 台服务器的换图策略`,
    ...(batchForm.value.applyEnabled
      ? [`启用状态将统一设为 ${batchForm.value.enabled ? '已启用' : '未启用'}`]
      : []),
    ...(batchForm.value.applyIdleThreshold
      ? [`空服阈值将统一设为 ${batchForm.value.idleThresholdSeconds}s`]
      : []),
    ...(batchForm.value.applyDefaultMap
      ? [`默认地图将统一设为 ${batchForm.value.defaultMap.trim()}`]
      : []),
    ...(batchForm.value.applyDefaultMapId
      ? [`WorkshopID 将统一设为 ${batchForm.value.defaultMapId.trim()}`]
      : []),
    ...(batchForm.value.applyRconPassword
      ? ['RCON 密码将统一批量更新']
      : []),
  ]

  openConfirmDialog('确认批量修改换图策略', lines, '确认保存', async () => {
    try {
      await http.patch('/console/api/server-catalog/kepcs/default-map-monitor/batch', {
        ids: selectedServerIds.value,
        ...(batchForm.value.applyEnabled ? { enabled: batchForm.value.enabled } : {}),
        ...(batchForm.value.applyIdleThreshold ? { idleThresholdSeconds: batchForm.value.idleThresholdSeconds } : {}),
        ...(batchForm.value.applyDefaultMap ? { defaultMap: batchForm.value.defaultMap.trim() } : {}),
        ...(batchForm.value.applyDefaultMapId ? { defaultMapId: batchForm.value.defaultMapId.trim() } : {}),
        ...(batchForm.value.applyRconPassword ? { rconPassword: batchForm.value.rconPassword.trim() } : {}),
      })
      pushToast('批量换图策略已保存', 'success')
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
  { title: '默认地图', key: 'defaultMap', width: 156, ellipsis: { tooltip: true } },
  {
    title: '空服阈值',
    key: 'defaultMapIdleThresholdSeconds',
    width: 96,
    render: (row) => `${row.defaultMapIdleThresholdSeconds}s`,
  },
  {
    title: '前置配置',
    key: 'readiness',
    width: 148,
    ellipsis: { tooltip: true },
    render: (row) => resolveReadiness(row),
  },
  {
    title: '状态',
    key: 'defaultMapMonitorEnabled',
    width: 92,
    render: (row) => renderStateTag(row.defaultMapMonitorEnabled),
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
    title="空闲自动换图"
    description="统一管理空闲自动换图巡检、批量策略和单服策略配置。"
  >
    <template #header-extra>
      <div class="catalog-header-extra">
        <NButton secondary class="console-action-icon" title="刷新列表" @click="loadPanel">↻</NButton>
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
          <NFormItem label="同步默认地图">
            <div class="catalog-batch-field catalog-batch-field--input">
              <NCheckbox v-model:checked="batchForm.applyDefaultMap">默认地图</NCheckbox>
              <NInput
                v-model:value="batchForm.defaultMap"
                :disabled="!batchForm.applyDefaultMap"
                class="w-full"
              />
            </div>
          </NFormItem>
          <NFormItem label="同步 WorkshopID">
            <div class="catalog-batch-field catalog-batch-field--input">
              <NCheckbox v-model:checked="batchForm.applyDefaultMapId">WorkshopID</NCheckbox>
              <NInput
                v-model:value="batchForm.defaultMapId"
                :disabled="!batchForm.applyDefaultMapId"
                class="w-full"
              />
            </div>
          </NFormItem>
          <NFormItem label="同步 RCON 密码">
            <div class="catalog-batch-field catalog-batch-field--input">
              <NCheckbox v-model:checked="batchForm.applyRconPassword">RCON 密码</NCheckbox>
              <NInput
                v-model:value="batchForm.rconPassword"
                type="password"
                :disabled="!batchForm.applyRconPassword"
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
            :scroll-x="1008"
          />
        </div>

        <div v-else class="hero-note min-h-[220px]">
          <div class="hero-note__inner">
            <div class="hero-note__title">暂无可配置服务器</div>
          </div>
        </div>
      </ConsoleSectionBlock>

      <ConsoleSectionBlock v-if="recentSwitchRows.length" title="最近切图">

        <div class="catalog-monitor-switches">
          <article
            v-for="item in recentSwitchRows"
            :key="`${item.serverId}-${item.switchedAt}`"
            class="catalog-monitor-switch"
          >
            <strong>{{ item.name }}</strong>
            <span>{{ item.previousMap || '-' }} → {{ item.targetMap || '-' }}</span>
            <span>{{ item.endpoint }} · {{ formatDateTime(item.switchedAt) }}</span>
          </article>
        </div>
      </ConsoleSectionBlock>
    </template>

    <NModal v-model:show="policyModal.show" preset="card" title="编辑单服换图策略" class="max-w-[640px]">
      <div class="catalog-policy-summary">
        <strong>{{ policyModal.name }}</strong>
        <span>{{ policyModal.endpoint }}</span>
        <span>默认图 {{ policyModal.defaultMap || '-' }} · WorkshopID {{ policyModal.defaultMapId || '-' }} · {{ policyModal.hasRconPassword ? 'RCON 已配置' : 'RCON 未配置' }}</span>
      </div>

      <NForm label-placement="top" class="console-field-grid cols-2">
        <NFormItem label="启用策略">
          <NSwitch v-model:value="policyModal.enabled" />
        </NFormItem>
        <NFormItem label="空服阈值 (秒)">
          <NInputNumber v-model:value="policyModal.idleThresholdSeconds" :min="30" :max="86400" :show-button="false" class="w-full" />
        </NFormItem>
        <NFormItem label="默认地图">
          <NInput v-model:value="policyModal.defaultMap" />
        </NFormItem>
        <NFormItem label="WorkshopID">
          <NInput v-model:value="policyModal.defaultMapId" />
        </NFormItem>
        <NFormItem label="RCON 密码" class="col-span-full">
          <NInput
            v-model:value="policyModal.rconPassword"
            type="password"
            :placeholder="policyModal.hasRconPassword ? '已配置则留空不修改' : ''"
          />
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
.catalog-selection-summary span {
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

.catalog-batch-field--input :deep(.n-input),
.catalog-batch-field--input :deep(.n-input__wrapper) {
  width: 100%;
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
