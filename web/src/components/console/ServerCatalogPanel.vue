<script setup lang="ts">
import type { DataTableColumns } from 'naive-ui'
import {
  NButton,
  NCard,
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

import ConsoleMetricStrip from './ConsoleMetricStrip.vue'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleSectionBlock from './ConsoleSectionBlock.vue'
import ConsoleSegmentedTabs from './ConsoleSegmentedTabs.vue'
import DefaultMapMonitorCatalogPanel from './DefaultMapMonitorCatalogPanel.vue'
import IdleRestartMonitorCatalogPanel from './IdleRestartMonitorCatalogPanel.vue'
import { http } from '../../lib/api'
import { pushToast } from '../../lib/toast'
import type {
  CommunityCatalogServerItem,
  DefaultMapMonitorConfig,
  DefaultMapMonitorRuntime,
  IdleRestartMonitorConfig,
  IdleRestartMonitorRuntime,
  KepcsCatalogServerItem,
} from '../../types'

type CatalogTab = 'kepcs' | 'default-map-monitor' | 'idle-restart-monitor' | 'community'

interface KepcsCatalogFormState {
  shotId: string
  mode: string
  name: string
  host: string
  port: number
  defaultMap: string
  defaultMapId: string
  rconPassword: string
  isActive: boolean
}

interface CommunityCatalogFormState {
  community: string
  name: string
  host: string
  port: number
  sortOrder: number
  isActive: boolean
}

interface EditModalState {
  show: boolean
  scope: CatalogTab
  id: string
  shotId: string
  mode: string
  community: string
  name: string
  host: string
  port: number
  defaultMap: string
  defaultMapId: string
  hasRconPassword: boolean
  rconPassword: string
  sortOrder: number
  isActive: boolean
}

const props = withDefaults(defineProps<{
  active: boolean
  canViewKepcs?: boolean
  canViewDefaultMapMonitor?: boolean
  canViewIdleRestartMonitor?: boolean
  canViewCommunity?: boolean
}>(), {
  canViewKepcs: true,
  canViewDefaultMapMonitor: true,
  canViewIdleRestartMonitor: true,
  canViewCommunity: true,
})

function canAccessTab(tab: CatalogTab) {
  if (tab === 'kepcs') {
    return props.canViewKepcs
  }

  if (tab === 'default-map-monitor') {
    return props.canViewDefaultMapMonitor
  }

  if (tab === 'idle-restart-monitor') {
    return props.canViewIdleRestartMonitor
  }

  return props.canViewCommunity
}

function resolveAvailableTab(): CatalogTab {
  const order: CatalogTab[] = ['kepcs', 'community', 'default-map-monitor', 'idle-restart-monitor']
  return order.find((tab) => canAccessTab(tab)) || 'kepcs'
}

const activeTab = ref<CatalogTab>(resolveAvailableTab())
const loading = ref(false)
const saving = ref(false)
const monitorSaving = ref(false)
const restartMonitorSaving = ref(false)
const kepcsServers = ref<KepcsCatalogServerItem[]>([])
const communityServers = ref<CommunityCatalogServerItem[]>([])
const monitorConfig = ref<DefaultMapMonitorConfig>({
  enabled: false,
  checkIntervalSeconds: 10,
})
const monitorRuntime = ref<DefaultMapMonitorRuntime>({
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
const idleRestartConfig = ref<IdleRestartMonitorConfig>({
  enabled: false,
  checkIntervalSeconds: 30,
  timezone: 'Asia/Shanghai',
})
const idleRestartRuntime = ref<IdleRestartMonitorRuntime>({
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

function createEmptyKepcsForm(): KepcsCatalogFormState {
  return {
    shotId: '',
    mode: '',
    name: '',
    host: '',
    port: 27015,
    defaultMap: '',
    defaultMapId: '',
    rconPassword: '',
    isActive: true,
  }
}

function createEmptyCommunityForm(): CommunityCatalogFormState {
  return {
    community: '',
    name: '',
    host: '',
    port: 27015,
    sortOrder: 0,
    isActive: true,
  }
}

function createEmptyEditModal(): EditModalState {
  return {
    show: false,
    scope: 'kepcs',
    id: '',
    shotId: '',
    mode: '',
    community: '',
    name: '',
    host: '',
    port: 27015,
    defaultMap: '',
    defaultMapId: '',
    hasRconPassword: false,
    rconPassword: '',
    sortOrder: 0,
    isActive: true,
  }
}

const kepcsForm = ref<KepcsCatalogFormState>(createEmptyKepcsForm())

const communityForm = ref<CommunityCatalogFormState>(createEmptyCommunityForm())

const editModal = ref<EditModalState>(createEmptyEditModal())

const confirmState = ref({
  show: false,
  title: '',
  lines: [] as string[],
  positiveText: '确认',
  loading: false,
})

let pendingConfirmAction: (() => Promise<void>) | null = null

const recentSwitchRows = computed(() => monitorRuntime.value.recentSwitches.slice(0, 6))
const recentRestartRows = computed(() => idleRestartRuntime.value.recentRestarts.slice(0, 6))

const tabOptions = computed(() => {
  const items: Array<{ value: CatalogTab, label: string }> = []

  if (props.canViewKepcs) {
    items.push({ value: 'kepcs', label: '开水服列表' })
  }

  if (props.canViewCommunity) {
    items.push({ value: 'community', label: '社区服列表' })
  }

  if (props.canViewDefaultMapMonitor) {
    items.push({ value: 'default-map-monitor', label: '空闲自动换图' })
  }

  if (props.canViewIdleRestartMonitor) {
    items.push({ value: 'idle-restart-monitor', label: '空闲自动重启' })
  }

  return items
})

const currentRows = computed(() =>
  activeTab.value === 'kepcs' ? kepcsServers.value : communityServers.value,
)

const listStats = computed(() => {
  const rows = currentRows.value
  const activeCount = rows.filter((row) => row.isActive).length

  return [
    { label: '总数', value: rows.length },
    { label: '已上架', value: activeCount },
    { label: '未上架', value: rows.length - activeCount },
  ]
})

const monitorSummaryCards = computed(() => [
  { label: '巡检状态', value: monitorConfig.value.enabled ? '已启用' : '已停用' },
  { label: '可切图服务器', value: monitorRuntime.value.lastSummary?.eligibleCount ?? 0 },
  { label: '已追踪空服', value: monitorRuntime.value.lastSummary?.trackedIdleCount ?? 0 },
  { label: '最近切图', value: formatDateTime(monitorRuntime.value.lastSwitchAt) },
])

const idleRestartSummaryCards = computed(() => [
  { label: '巡检状态', value: idleRestartConfig.value.enabled ? '已启用' : '已停用' },
  { label: '当前时段', value: idleRestartRuntime.value.windowActive ? '生效中' : '未生效' },
  { label: '已匹配节点', value: idleRestartRuntime.value.lastSummary?.matchedCount ?? 0 },
  { label: '最近下发', value: formatDateTime(idleRestartRuntime.value.lastRestartAt) },
])

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
  } catch {
    // Keep modal open for toast feedback.
  } finally {
    confirmState.value.loading = false
  }
}

function closeConfirmDialog() {
  confirmState.value.show = false
  confirmState.value.loading = false
  pendingConfirmAction = null
}

async function loadCurrentTab() {
  if (!canAccessTab(activeTab.value)) {
    return
  }

  if (activeTab.value === 'default-map-monitor' || activeTab.value === 'idle-restart-monitor') {
    return
  }

  loading.value = true

  try {
    if (activeTab.value === 'kepcs') {
      const [serverResponse] = await Promise.all([
        http.get('/console/api/server-catalog/kepcs'),
      ])
      kepcsServers.value = serverResponse.data.servers || []
      return
    }

    const { data } = await http.get('/console/api/server-catalog/community')
    communityServers.value = data.servers || []
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    loading.value = false
  }
}

async function loadDefaultMapMonitorStatus() {
  const { data } = await http.get('/console/api/server-catalog/kepcs/default-map-monitor')
  monitorConfig.value = data.config || monitorConfig.value
  monitorRuntime.value = data.runtime || monitorRuntime.value
}

async function loadIdleRestartMonitorStatus() {
  const { data } = await http.get('/console/api/server-catalog/kepcs/idle-restart-monitor')
  idleRestartConfig.value = data.config || idleRestartConfig.value
  idleRestartRuntime.value = data.runtime || idleRestartRuntime.value
}

function resetKepcsForm() {
  kepcsForm.value = createEmptyKepcsForm()
}

function resetCommunityForm() {
  communityForm.value = createEmptyCommunityForm()
}

async function createKepcsServer() {
  saving.value = true

  try {
    await http.post('/console/api/server-catalog/kepcs', {
      shotId: kepcsForm.value.shotId.trim(),
      mode: kepcsForm.value.mode.trim(),
      name: kepcsForm.value.name.trim(),
      host: kepcsForm.value.host.trim(),
      port: kepcsForm.value.port,
      defaultMap: kepcsForm.value.defaultMap.trim(),
      defaultMapId: kepcsForm.value.defaultMapId.trim(),
      rconPassword: kepcsForm.value.rconPassword.trim(),
      isActive: kepcsForm.value.isActive,
    })
    pushToast('开水服服务器已新增', 'success')
    resetKepcsForm()
    await loadCurrentTab()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function createCommunityServer() {
  saving.value = true

  try {
    await http.post('/console/api/server-catalog/community', {
      community: communityForm.value.community.trim(),
      name: communityForm.value.name.trim(),
      host: communityForm.value.host.trim(),
      port: communityForm.value.port,
      sortOrder: communityForm.value.sortOrder,
      isActive: communityForm.value.isActive,
    })
    pushToast('社区服已新增', 'success')
    resetCommunityForm()
    await loadCurrentTab()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

function openKepcsEditor(row: KepcsCatalogServerItem) {
  editModal.value = {
    show: true,
    scope: 'kepcs',
    id: row.id,
    shotId: row.shotId,
    mode: row.mode,
    community: '',
    name: row.name,
    host: row.host,
    port: row.port,
    defaultMap: row.defaultMap,
    defaultMapId: row.defaultMapId,
    hasRconPassword: row.hasRconPassword,
    rconPassword: '',
    sortOrder: 0,
    isActive: row.isActive,
  }
}

function openCommunityEditor(row: CommunityCatalogServerItem) {
  editModal.value = {
    show: true,
    scope: 'community',
    id: row.id,
    shotId: '',
    mode: '',
    community: row.community,
    name: row.name,
    host: row.host,
    port: row.port,
    defaultMap: '',
    defaultMapId: '',
    hasRconPassword: false,
    rconPassword: '',
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  }
}

async function saveEditor() {
  saving.value = true

  try {
    if (editModal.value.scope === 'kepcs') {
      await http.patch(`/console/api/server-catalog/kepcs/${encodeURIComponent(editModal.value.id)}`, {
        shotId: editModal.value.shotId.trim(),
        mode: editModal.value.mode.trim(),
        name: editModal.value.name.trim(),
        host: editModal.value.host.trim(),
        port: editModal.value.port,
        defaultMap: editModal.value.defaultMap.trim(),
        defaultMapId: editModal.value.defaultMapId.trim(),
        ...(editModal.value.rconPassword.trim()
          ? { rconPassword: editModal.value.rconPassword.trim() }
          : {}),
        isActive: editModal.value.isActive,
      })
      pushToast('开水服服务器已更新', 'success')
    } else {
      await http.patch(`/console/api/server-catalog/community/${encodeURIComponent(editModal.value.id)}`, {
        community: editModal.value.community.trim(),
        name: editModal.value.name.trim(),
        host: editModal.value.host.trim(),
        port: editModal.value.port,
        sortOrder: editModal.value.sortOrder,
        isActive: editModal.value.isActive,
      })
      pushToast('社区服已更新', 'success')
    }

    editModal.value.show = false
    await loadCurrentTab()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    saving.value = false
  }
}

async function saveMonitorConfig() {
  monitorSaving.value = true

  try {
    const { data } = await http.patch('/console/api/server-catalog/kepcs/default-map-monitor', {
      enabled: monitorConfig.value.enabled,
      checkIntervalSeconds: monitorConfig.value.checkIntervalSeconds,
    })
    monitorConfig.value = data.config || monitorConfig.value
    pushToast('空闲自动换图配置已保存', 'success')
    await loadDefaultMapMonitorStatus()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    monitorSaving.value = false
  }
}

async function runMonitorSweep() {
  monitorSaving.value = true

  try {
    const { data } = await http.post('/console/api/server-catalog/kepcs/default-map-monitor/run')
    monitorConfig.value = data.config || monitorConfig.value
    monitorRuntime.value = data.runtime || monitorRuntime.value
    pushToast('已执行一轮空服巡检', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    monitorSaving.value = false
  }
}

async function saveIdleRestartConfig() {
  restartMonitorSaving.value = true

  try {
    const { data } = await http.patch('/console/api/server-catalog/kepcs/idle-restart-monitor', {
      enabled: idleRestartConfig.value.enabled,
      checkIntervalSeconds: idleRestartConfig.value.checkIntervalSeconds,
    })
    idleRestartConfig.value = data.config || idleRestartConfig.value
    pushToast('空服定时重启配置已保存', 'success')
    await loadIdleRestartMonitorStatus()
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    restartMonitorSaving.value = false
  }
}

async function runIdleRestartSweep() {
  restartMonitorSaving.value = true

  try {
    const { data } = await http.post('/console/api/server-catalog/kepcs/idle-restart-monitor/run')
    idleRestartConfig.value = data.config || idleRestartConfig.value
    idleRestartRuntime.value = data.runtime || idleRestartRuntime.value
    pushToast('已执行一轮空服重启巡检', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    restartMonitorSaving.value = false
  }
}

function confirmDeleteKepcs(row: KepcsCatalogServerItem) {
  openConfirmDialog(
    '确认删除服务器',
    ['删除后会从开水服目录中移除该服务器', `${row.name} · ${row.host}:${row.port}`],
    '确认删除',
    async () => {
      await http.delete(`/console/api/server-catalog/kepcs/${encodeURIComponent(row.id)}`)
      pushToast('开水服服务器已删除', 'success')
      await loadCurrentTab()
    },
  )
}

function confirmDeleteCommunity(row: CommunityCatalogServerItem) {
  openConfirmDialog(
    '确认删除社区服',
    ['删除后会从社区服目录中移除该服务器', `${row.name} · ${row.host}:${row.port}`],
    '确认删除',
    async () => {
      await http.delete(`/console/api/server-catalog/community/${encodeURIComponent(row.id)}`)
      pushToast('社区服已删除', 'success')
      await loadCurrentTab()
    },
  )
}

const kepcsColumns = computed<DataTableColumns<KepcsCatalogServerItem>>(() => [
  { title: 'ID', key: 'id', width: 64 },
  { title: 'ShotID', key: 'shotId', width: 88, ellipsis: { tooltip: true } },
  { title: '模式', key: 'mode', width: 92, ellipsis: { tooltip: true } },
  { title: '名称', key: 'name', width: 108, ellipsis: { tooltip: true } },
  {
    title: '地址',
    key: 'endpoint',
    width: 168,
    ellipsis: { tooltip: true },
    render: (row) => `${row.host}:${row.port}`,
  },
  { title: '默认地图', key: 'defaultMap', width: 146, ellipsis: { tooltip: true } },
  { title: 'WorkshopID', key: 'defaultMapId', width: 132, ellipsis: { tooltip: true } },
  {
    title: 'RCON',
    key: 'hasRconPassword',
    width: 78,
    render: (row) => (row.hasRconPassword ? '已配置' : '未配置'),
  },
  {
    title: '上架',
    key: 'isActive',
    width: 72,
    render: (row) => (row.isActive ? '是' : '否'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 134,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 'small', wrap: false, justify: 'end', class: 'catalog-action-group' }, {
        default: () => [
          h(
            NButton,
            { type: 'warning', size: 'small', onClick: () => openKepcsEditor(row) },
            { default: () => '编辑' },
          ),
          h(
            NButton,
            { type: 'error', ghost: true, size: 'small', onClick: () => confirmDeleteKepcs(row) },
            { default: () => '删除' },
          ),
        ],
      }),
  },
])

const communityColumns = computed<DataTableColumns<CommunityCatalogServerItem>>(() => [
  { title: 'ID', key: 'id', width: 64 },
  { title: '社区', key: 'community', width: 80, ellipsis: { tooltip: true } },
  { title: '名称', key: 'name', width: 128, ellipsis: { tooltip: true } },
  {
    title: '地址',
    key: 'endpoint',
    width: 194,
    ellipsis: { tooltip: true },
    render: (row) => `${row.host}:${row.port}`,
  },
  { title: '排序', key: 'sortOrder', width: 72 },
  {
    title: '上架',
    key: 'isActive',
    width: 72,
    render: (row) => (row.isActive ? '是' : '否'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 134,
    fixed: 'right',
    render: (row) =>
      h(NSpace, { size: 'small', wrap: false, justify: 'end', class: 'catalog-action-group' }, {
        default: () => [
          h(
            NButton,
            { type: 'warning', size: 'small', onClick: () => openCommunityEditor(row) },
            { default: () => '编辑' },
          ),
          h(
            NButton,
            { type: 'error', ghost: true, size: 'small', onClick: () => confirmDeleteCommunity(row) },
            { default: () => '删除' },
          ),
        ],
      }),
  },
])

function entryListForKepcs(row: KepcsCatalogServerItem) {
  return [
    { label: 'ShotID', value: row.shotId || '-' },
    { label: '模式', value: row.mode || '-' },
    { label: '主机', value: row.host || '-' },
    { label: '端口', value: String(row.port || '-') },
    { label: '默认地图', value: row.defaultMap || '-' },
    { label: 'WorkshopID', value: row.defaultMapId || '-' },
    { label: 'RCON', value: row.hasRconPassword ? '已配置' : '未配置' },
  ]
}

function entryListForCommunity(row: CommunityCatalogServerItem) {
  return [
    { label: '社区', value: row.community || '-' },
    { label: '排序', value: String(row.sortOrder ?? '-') },
    { label: '主机', value: row.host || '-' },
    { label: '端口', value: String(row.port || '-') },
  ]
}

watch(
  () => props.active,
  (active) => {
    if (active) {
      void loadCurrentTab()
    }
  },
  { immediate: true },
)

watch(
  () => activeTab.value,
  () => {
    if (props.active) {
      void loadCurrentTab()
    }
  },
)

watch(
  () => [props.canViewKepcs, props.canViewDefaultMapMonitor, props.canViewIdleRestartMonitor, props.canViewCommunity] as const,
  () => {
    if (!canAccessTab(activeTab.value)) {
      activeTab.value = resolveAvailableTab()
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="console-wrap">
    <ConsoleSegmentedTabs v-model="activeTab" :options="tabOptions" />

    <Transition name="console-panel-switch" mode="out-in">
      <div :key="activeTab" class="catalog-stack">
        <DefaultMapMonitorCatalogPanel
          v-if="activeTab === 'default-map-monitor'"
          :active="active"
        />

        <IdleRestartMonitorCatalogPanel
          v-else-if="activeTab === 'idle-restart-monitor'"
          :active="active"
        />

        <ConsolePanelCard
          v-else
          :title="activeTab === 'kepcs' ? '开水服列表' : '社区服列表'"
          :description="activeTab === 'kepcs'
            ? '统一维护开水服服务器目录、基础信息和上架状态。'
            : '统一维护社区服目录、基础信息和展示顺序。'"
        >
          <template #header-extra>
            <div class="catalog-header-extra">
              <NButton secondary class="console-action-icon" title="刷新列表" @click="loadCurrentTab">↻</NButton>
            </div>
          </template>

          <ConsoleMetricStrip :items="listStats" />

          <ConsoleSectionBlock :title="activeTab === 'kepcs' ? '新增开水服服务器' : '新增社区服'">
            <NForm v-if="activeTab === 'kepcs'" label-placement="top" class="console-field-grid cols-2">
              <NFormItem label="ShotID">
                <NInput v-model:value="kepcsForm.shotId" />
              </NFormItem>
              <NFormItem label="模式">
                <NInput v-model:value="kepcsForm.mode" />
              </NFormItem>
              <NFormItem label="名称">
                <NInput v-model:value="kepcsForm.name" />
              </NFormItem>
              <NFormItem label="主机地址">
                <NInput v-model:value="kepcsForm.host" />
              </NFormItem>
              <NFormItem label="端口">
                <NInputNumber v-model:value="kepcsForm.port" :min="1" :max="65535" :show-button="false" class="w-full" />
              </NFormItem>
              <NFormItem label="默认地图">
                <NInput v-model:value="kepcsForm.defaultMap" />
              </NFormItem>
              <NFormItem label="WorkshopID">
                <NInput v-model:value="kepcsForm.defaultMapId" />
              </NFormItem>
              <NFormItem label="RCON 密码">
                <NInput v-model:value="kepcsForm.rconPassword" type="password" />
              </NFormItem>
              <NFormItem label="上架">
                <NSwitch v-model:value="kepcsForm.isActive" />
              </NFormItem>
            </NForm>

            <NForm v-else label-placement="top" class="console-field-grid cols-2">
              <NFormItem label="社区标识">
                <NInput v-model:value="communityForm.community" />
              </NFormItem>
              <NFormItem label="名称">
                <NInput v-model:value="communityForm.name" />
              </NFormItem>
              <NFormItem label="主机地址">
                <NInput v-model:value="communityForm.host" />
              </NFormItem>
              <NFormItem label="端口">
                <NInputNumber v-model:value="communityForm.port" :min="1" :max="65535" :show-button="false" class="w-full" />
              </NFormItem>
              <NFormItem label="排序">
                <NInputNumber v-model:value="communityForm.sortOrder" :min="0" :max="9999" :show-button="false" class="w-full" />
              </NFormItem>
              <NFormItem label="上架">
                <NSwitch v-model:value="communityForm.isActive" />
              </NFormItem>
            </NForm>

            <div class="catalog-section-actions">
              <NButton
                type="primary"
                :loading="saving"
                @click="activeTab === 'kepcs' ? createKepcsServer() : createCommunityServer()"
              >
                {{ activeTab === 'kepcs' ? '新增服务器' : '新增社区服' }}
              </NButton>
            </div>
          </ConsoleSectionBlock>

          <ConsoleSectionBlock :title="activeTab === 'kepcs' ? '开水服数据源' : '社区服数据源'">

            <div v-if="loading" class="hero-note min-h-[240px]">
              <NSpin size="large" />
            </div>

            <div v-else-if="currentRows.length" class="catalog-list-shell">
              <div class="catalog-mobile-list">
                <article
                  v-for="row in currentRows"
                  :key="row.id"
                  class="catalog-mobile-card"
                >
                  <div class="catalog-mobile-card__top">
                    <div class="catalog-mobile-card__title">
                      <strong>{{ row.name }}</strong>
                      <span>{{ row.host }}:{{ row.port }}</span>
                    </div>
                    <NTag round :type="row.isActive ? 'success' : 'default'">
                      {{ row.isActive ? '已上架' : '未上架' }}
                    </NTag>
                  </div>

                  <div class="catalog-mobile-card__grid">
                    <div
                      v-for="entry in activeTab === 'kepcs'
                        ? entryListForKepcs(row as KepcsCatalogServerItem)
                        : entryListForCommunity(row as CommunityCatalogServerItem)"
                      :key="`${row.id}-${entry.label}`"
                      class="catalog-mobile-card__item"
                    >
                      <span>{{ entry.label }}</span>
                      <strong>{{ entry.value }}</strong>
                    </div>
                  </div>

                  <div class="catalog-mobile-card__actions">
                    <NButton
                      type="warning"
                      block
                      @click="activeTab === 'kepcs'
                        ? openKepcsEditor(row as KepcsCatalogServerItem)
                        : openCommunityEditor(row as CommunityCatalogServerItem)"
                    >
                      编辑
                    </NButton>
                    <NButton
                      type="error"
                      ghost
                      block
                      @click="activeTab === 'kepcs'
                        ? confirmDeleteKepcs(row as KepcsCatalogServerItem)
                        : confirmDeleteCommunity(row as CommunityCatalogServerItem)"
                    >
                      删除
                    </NButton>
                  </div>
                </article>
              </div>

              <div class="table-shell catalog-table">
                <NDataTable
                  :columns="activeTab === 'kepcs' ? kepcsColumns : communityColumns"
                  :data="currentRows"
                  :bordered="false"
                  :scroll-x="activeTab === 'kepcs' ? 1080 : 744"
                />
              </div>
            </div>

            <div v-else class="hero-note min-h-[240px]">
              <div class="hero-note__inner">
                <div class="hero-note__title">暂无数据</div>
              </div>
            </div>
          </ConsoleSectionBlock>
        </ConsolePanelCard>
      </div>
    </Transition>

    <NModal
      v-model:show="editModal.show"
      preset="card"
      :title="editModal.scope === 'kepcs' ? '编辑开水服服务器' : '编辑社区服'"
      class="max-w-[640px]"
    >
      <NForm label-placement="top" class="console-field-grid cols-2">
        <template v-if="editModal.scope === 'kepcs'">
          <NFormItem label="ShotID">
            <NInput v-model:value="editModal.shotId" />
          </NFormItem>
          <NFormItem label="模式">
            <NInput v-model:value="editModal.mode" />
          </NFormItem>
        </template>
        <template v-else>
          <NFormItem label="社区标识">
            <NInput v-model:value="editModal.community" />
          </NFormItem>
          <NFormItem label="排序">
            <NInputNumber v-model:value="editModal.sortOrder" :min="0" :max="9999" :show-button="false" class="w-full" />
          </NFormItem>
        </template>

        <NFormItem label="名称">
          <NInput v-model:value="editModal.name" />
        </NFormItem>
        <NFormItem label="主机地址">
          <NInput v-model:value="editModal.host" />
        </NFormItem>
        <NFormItem label="端口">
          <NInputNumber v-model:value="editModal.port" :min="1" :max="65535" :show-button="false" class="w-full" />
        </NFormItem>
        <template v-if="editModal.scope === 'kepcs'">
          <NFormItem label="默认地图">
            <NInput v-model:value="editModal.defaultMap" />
          </NFormItem>
          <NFormItem label="WorkshopID">
            <NInput v-model:value="editModal.defaultMapId" />
          </NFormItem>
          <NFormItem label="RCON 密码" class="col-span-full">
            <NInput
              v-model:value="editModal.rconPassword"
              type="password"
              :placeholder="editModal.hasRconPassword ? '已配置则留空不修改' : ''"
            />
          </NFormItem>
        </template>
        <NFormItem label="上架">
          <NSwitch v-model:value="editModal.isActive" />
        </NFormItem>
      </NForm>

      <NSpace justify="end">
        <NButton @click="editModal.show = false">取消</NButton>
        <NButton type="primary" :loading="saving" @click="saveEditor">保存</NButton>
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
  </div>
</template>

<style scoped>
.catalog-stack,
.catalog-stat-grid,
.catalog-list-shell,
.catalog-mobile-list,
.catalog-mobile-card__grid,
.catalog-section-head,
.catalog-monitor-meta,
.catalog-monitor-switches {
  display: grid;
  gap: 12px;
}

.catalog-section-head {
  gap: 6px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--app-border-soft);
}

.catalog-section-head__title {
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: var(--app-text);
}

.catalog-stat-grid {
  gap: 0;
  border-top: 1px solid var(--app-border-soft);
  border-bottom: 1px solid var(--app-border-soft);
}

.catalog-stat-grid--monitor {
  margin-top: 6px;
}

.catalog-stat-card {
  padding: 12px 10px;
  display: grid;
  align-content: center;
  justify-items: center;
  min-height: 74px;
  text-align: center;
  border: 0;
  border-left: 1px solid var(--app-border-soft);
  border-radius: 0;
  background: transparent;
}

.catalog-stat-grid > .catalog-stat-card:first-child {
  border-left: 0;
}

.catalog-stat-card span,
.catalog-mobile-card__item span,
.hero-note__desc,
.confirm-dialog-copy__line {
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.65;
}

.catalog-stat-card strong,
.catalog-mobile-card__item strong {
  display: block;
  margin-top: 4px;
  font-size: 17px;
  color: var(--app-text);
}

.catalog-monitor-meta {
  gap: 4px;
}

.catalog-monitor-meta span {
  font-size: 12px;
  line-height: 1.65;
  color: var(--app-text-muted);
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

.catalog-monitor-switch strong {
  font-size: 13px;
  color: var(--app-text);
}

.catalog-monitor-switch span {
  font-size: 12px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.catalog-window-inputs {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.catalog-window-inputs span {
  font-size: 12px;
  color: var(--app-text-muted);
}

.catalog-mobile-card {
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: var(--app-panel-bg-soft);
  padding: 14px;
}

.catalog-mobile-card__top,
.catalog-mobile-card__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.catalog-mobile-card__title {
  display: grid;
  gap: 4px;
}

.catalog-mobile-card__title strong {
  font-size: 14px;
  color: var(--app-text);
}

.catalog-mobile-card__title span {
  font-size: 11px;
  color: var(--app-text-muted);
  word-break: break-word;
}

.catalog-mobile-card__actions {
  margin-top: 10px;
}

.catalog-list-shell {
  gap: 12px;
}

.catalog-section-actions {
  display: flex;
  justify-content: flex-end;
}

.catalog-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.catalog-header-extra {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
}

.catalog-header-extra :deep(.n-button) {
  align-self: center;
}

.catalog-stack :deep(.n-card-header),
.catalog-stack :deep(.n-card-header__extra) {
  align-items: center;
}

.catalog-table :deep(.n-data-table) {
  min-width: 100%;
}

.catalog-action-group :deep(.n-button) {
  min-width: 56px;
}

:deep(.n-modal .n-card-header) {
  padding: 14px 16px 6px;
}

:deep(.n-modal .n-card__content) {
  padding: 10px 16px 16px;
}

@media (min-width: 1024px) {
  .catalog-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .catalog-mobile-list {
    display: none;
  }
}

@media (min-width: 769px) {
  .console-field-grid.cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .col-span-full {
    grid-column: 1 / -1;
  }
}

@media (max-width: 1023px) {
  .catalog-table {
    display: none;
  }

  .catalog-stat-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .catalog-stat-grid,
  .catalog-mobile-card__grid,
  .catalog-mobile-card__actions {
    grid-template-columns: minmax(0, 1fr);
  }

  .catalog-stack {
    gap: 10px;
  }

  .catalog-stat-card {
    border-left: 0;
    border-top: 1px solid var(--app-border-soft);
    min-height: 68px;
    padding: 10px 8px;
  }

  .catalog-stat-grid > .catalog-stat-card:first-child {
    border-top: 0;
  }

  .catalog-mobile-card {
    padding: 12px;
  }

  .catalog-mobile-card__top {
    flex-direction: column;
  }

  .catalog-section-actions {
    justify-content: stretch;
  }

  .catalog-section-actions :deep(.n-button) {
    width: 100%;
  }

  .catalog-toolbar-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .catalog-window-inputs {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
