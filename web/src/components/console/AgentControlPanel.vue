<script setup lang="ts">
import dayjs from 'dayjs'
import {
  NButton,
  NCheckbox,
  NDatePicker,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTag,
} from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

import { http } from '../../lib/api'
import { CONSOLE_API_BASE } from '../../lib/console'
import { pushToast } from '../../lib/toast'
import GotifyNotificationPanel from './GotifyNotificationPanel.vue'
import ConsoleMetricStrip from './ConsoleMetricStrip.vue'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleRefreshIcon from './ConsoleRefreshIcon.vue'
import ConsoleSegmentedTabs from './ConsoleSegmentedTabs.vue'
import type {
  GotifyChannelItem,
  GotifyConfig,
  ManagedNodeHeartbeatServerItem,
  ManagedNodeItem,
  NodeCommandItem,
  NodeCommandLogItem,
  NodeScheduleConfig,
  NodeCommandScheduleItem,
  NodeCommandStatus,
} from '../../types'

const props = withDefaults(defineProps<{
  active: boolean
  canViewNodeList?: boolean
  canManageNodes?: boolean
  canViewControlGroups?: boolean
  canViewControlServers?: boolean
  canViewCommandActions?: boolean
  canViewRunningCommands?: boolean
  canViewRcon?: boolean
  canEditSchedules?: boolean
  canViewScheduleList?: boolean
  canCreateNotifications?: boolean
  canManageNotifications?: boolean
  canTestNotifications?: boolean
  canViewLogHistory?: boolean
  canViewLogDetails?: boolean
}>(), {
  canViewNodeList: true,
  canManageNodes: true,
  canViewControlGroups: true,
  canViewControlServers: true,
  canViewCommandActions: true,
  canViewRunningCommands: true,
  canViewRcon: true,
  canEditSchedules: true,
  canViewScheduleList: true,
  canCreateNotifications: true,
  canManageNotifications: true,
  canTestNotifications: true,
  canViewLogHistory: true,
  canViewLogDetails: true,
})

type NodeFormMode = 'create' | 'edit'
type CommandStatusFilter = 'ALL' | NodeCommandStatus
type RconTargetMode = 'group' | 'servers'
type ScheduleMode = 'interval_minutes' | 'daily' | 'every_n_days' | 'every_n_hours'
interface CommandGroupResultRow extends Record<string, unknown> {
  changed?: boolean
  message?: string
  server?: Partial<ManagedNodeHeartbeatServerItem> & Record<string, unknown>
}
type NodeActionType =
  | 'agent.ping'
  | 'docker.list_servers'
  | 'docker.start_group'
  | 'docker.stop_group'
  | 'docker.restart_group'
  | 'docker.start_server'
  | 'docker.stop_server'
  | 'docker.restart_server'
  | 'docker.remove_server'
  | 'node.kill_all'
  | 'node.rcon_command'
  | 'node.check_update'
  | 'node.check_validate'
  | 'node.get_oldver'
  | 'node.get_nowver'
  | 'node.monitor_check'
  | 'node.monitor_start'

type MaintenanceCommandType =
  | 'node.check_update'
  | 'node.monitor_check'
  | 'node.monitor_start'

interface ScheduleFormState {
  id: string
  name: string
  nodeId: string
  commandType: NodeActionType
  scheduleMode: ScheduleMode
  scheduleIntervalMinutes: number
  scheduleTime: string
  scheduleIntervalDays: number
  scheduleAnchorDate: number
  scheduleIntervalHours: number
  scheduleWindowStart: string
  scheduleWindowEnd: string
  isActive: boolean
  notificationChannelKeys: string[]
  monitorServerKey: string
  startServerKeys: string[]
  rconGroup: string
  rconCommand: string
}

const commandStatusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '待领取', value: 'PENDING' },
  { label: '已领取', value: 'CLAIMED' },
  { label: '运行中', value: 'RUNNING' },
  { label: '已成功', value: 'SUCCEEDED' },
  { label: '已失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELLED' },
  { label: '已过期', value: 'EXPIRED' },
]

const nodes = ref<ManagedNodeItem[]>([])
const commands = ref<NodeCommandItem[]>([])
const activeCommands = ref<NodeCommandItem[]>([])
const commandLogs = ref<NodeCommandLogItem[]>([])
const schedules = ref<NodeCommandScheduleItem[]>([])
const loadingNodes = ref(false)
const loadingCommands = ref(false)
const loadingActiveCommands = ref(false)
const loadingLogs = ref(false)
const loadingSchedules = ref(false)
const savingNode = ref(false)
const savingSchedule = ref(false)
const agentPanelTab = ref<'nodes' | 'control' | 'commands' | 'schedules' | 'notifications' | 'logs'>('nodes')
const commandSubTab = ref<'actions' | 'rcon' | 'running'>('actions')
const scheduleSubTab = ref<'edit' | 'list'>('edit')
const selectedControlNodeId = ref('')
const selectedCommandNodeId = ref('')
const selectedScheduleNodeId = ref('')
const selectedGroup = ref('ALL')
const selectedServerKeys = ref<string[]>([])
const selectedActiveCommandIds = ref<string[]>([])
const selectedCommandStatus = ref<CommandStatusFilter>('ALL')
const commandLimit = ref(20)
const commandPage = ref(1)
const expandedCommandIds = ref<string[]>([])
const scheduleExpandedIds = ref<string[]>([])
const COMMANDS_PER_PAGE = 8

const nodeCommandForm = ref({
  rconTargetMode: 'group' as RconTargetMode,
  rconGroup: 'ALL',
  rconServerKeys: [] as string[],
  rconCommand: '',
})

const maintenanceCommandForm = ref({
  monitorServerKey: '',
  startServerKeys: [] as string[],
})

const gotifyChannels = ref<GotifyChannelItem[]>([])

const scheduleForm = ref<ScheduleFormState>(createScheduleForm())

const nodeModal = ref({
  show: false,
  mode: 'create' as NodeFormMode,
  id: '',
  code: '',
  name: '',
  host: '',
  note: '',
  isActive: true,
})

const issuedKeyModal = ref({
  show: false,
  title: '节点令牌',
  nodeName: '',
  apiKey: '',
})

const commandDetailModal = ref({
  show: false,
  command: null as NodeCommandItem | null,
})

const logModal = ref({
  show: false,
  command: null as NodeCommandItem | null,
})

const confirmState = ref({
  show: false,
  title: '',
  lines: [] as string[],
  positiveText: '确认',
  loading: false,
})

let pendingConfirmAction: (() => Promise<void>) | null = null
let pendingConfirmBehavior: {
  closeOnConfirm?: boolean
  backgroundNotice?: string
} | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null
let logPollTimer: ReturnType<typeof setInterval> | null = null
const logListRef = ref<HTMLElement | null>(null)
// Polling and post-save refresh can overlap; only the newest schedule response should win.
let scheduleLoadRequestCursor = 0
let visibleScheduleLoadCount = 0

const controlNodeOptions = computed(() =>
  nodes.value.map((node) => ({
    label: `${node.name} · ${node.code}`,
    value: node.id,
  })),
)

const commandNodeOptions = computed(() => [
  { label: '全部节点', value: '' },
  ...controlNodeOptions.value,
])

const scheduleNodeOptions = computed(() => controlNodeOptions.value)

const nodeInstructionGroupOptions = computed(() => [
  { label: '全部分组', value: 'ALL' },
  ...selectedNodeGroups.value.map((group) => ({
    label: resolveGroupLabel(group),
    value: group,
  })),
])

const gotifyChannelOptions = computed(() =>
  gotifyChannels.value.map((channel) => ({
    label: channel.enabled ? channel.name : `${channel.name} (已停用)`,
    value: channel.key,
  })),
)

const gotifyChannelNameMap = computed(() =>
  new Map(gotifyChannels.value.map((channel) => [channel.key, channel.name])),
)

const nodeInstructionOptions = [
  { label: '检查节点连通', value: 'agent.ping' },
  { label: '同步容器列表', value: 'docker.list_servers' },
  { label: '强制清理全部容器', value: 'node.kill_all' },
  { label: '检查更新（有差异才停服）', value: 'node.check_update' },
  { label: '验证游戏完整性（停服后 validate）', value: 'node.check_validate' },
  { label: '读取当前版本', value: 'node.get_oldver' },
  { label: '读取最新版本（不停服）', value: 'node.get_nowver' },
  { label: '崩溃检查（仅运行监控服）', value: 'node.monitor_check' },
  { label: '崩溃检查后启动', value: 'node.monitor_start' },
] as const

const rconInstructionOption = { label: 'RCON 指令', value: 'node.rcon_command' as const }

const scheduleModeOptions = [
  { label: '每 N 分钟', value: 'interval_minutes' },
  { label: '每天固定时间', value: 'daily' },
  { label: '每 N 天固定时间', value: 'every_n_days' },
  { label: '每 N 小时按时间窗', value: 'every_n_hours' },
]

const canViewNodesTab = computed(() => props.canViewNodeList || props.canManageNodes)
const canViewControlTab = computed(() => props.canViewControlGroups || props.canViewControlServers)
const canViewCommandPanel = computed(() =>
  props.canViewCommandActions || props.canViewRcon || props.canViewRunningCommands,
)
const canViewScheduleTab = computed(() => props.canEditSchedules || props.canViewScheduleList)
const canViewNotificationsTab = computed(() =>
  props.canCreateNotifications || props.canManageNotifications || props.canTestNotifications,
)
const canViewLogsTab = computed(() => props.canViewLogHistory)
const canReadGotifyConfig = computed(() => canViewScheduleTab.value || canViewNotificationsTab.value)
const canAccessNodeDirectory = computed(() =>
  canViewNodesTab.value
  || canViewControlTab.value
  || canViewCommandPanel.value
  || canViewScheduleTab.value
  || canViewNotificationsTab.value
  || canViewLogsTab.value,
)

const firstAvailableAgentTab = computed(() => {
  if (canViewNodesTab.value) return 'nodes'
  if (canViewControlTab.value) return 'control'
  if (canViewCommandPanel.value) return 'commands'
  if (canViewScheduleTab.value) return 'schedules'
  if (canViewNotificationsTab.value) return 'notifications'
  return 'logs'
})

const firstAvailableCommandSubTab = computed(() => {
  if (props.canViewCommandActions) return 'actions' as const
  if (props.canViewRcon) return 'rcon' as const
  if (props.canViewRunningCommands) return 'running' as const
  return 'running' as const
})

const agentPanelTabOptions = computed(() =>
  [
    canViewNodesTab.value ? { label: '节点管理', value: 'nodes' } : null,
    canViewControlTab.value ? { label: '批量操作', value: 'control' } : null,
    canViewCommandPanel.value ? { label: '节点操作', value: 'commands' } : null,
    canViewScheduleTab.value ? { label: '定时任务', value: 'schedules' } : null,
    canViewNotificationsTab.value ? { label: '通知管理', value: 'notifications' } : null,
    canViewLogsTab.value ? { label: '日志管理', value: 'logs' } : null,
  ].filter(Boolean) as Array<{ label: string, value: typeof agentPanelTab.value }>,
)

const commandSubTabOptions = computed(() =>
  [
    props.canViewCommandActions ? { label: '维护命令', value: 'actions' as const } : null,
    props.canViewRcon ? { label: 'RCON 操作', value: 'rcon' as const } : null,
    props.canViewRunningCommands ? { label: `进行中命令 ${activeCommands.value.length}`, value: 'running' as const } : null,
  ].filter(Boolean) as Array<{ label: string, value: typeof commandSubTab.value }>,
)

const firstAvailableScheduleSubTab = computed(() => {
  if (props.canEditSchedules) return 'edit' as const
  return 'list' as const
})

const scheduleSubTabOptions = computed(() =>
  [
    props.canEditSchedules ? { label: '编辑任务', value: 'edit' as const } : null,
    props.canViewScheduleList ? { label: '任务列表', value: 'list' as const } : null,
  ].filter(Boolean) as Array<{ label: string, value: typeof scheduleSubTab.value }>,
)

const scheduleCommandOptions = computed(() => {
  return props.canViewRcon
    ? [...nodeInstructionOptions, rconInstructionOption]
    : [...nodeInstructionOptions]
})

const selectedNode = computed(() =>
  nodes.value.find((node) => node.id === selectedControlNodeId.value) || null,
)

const selectedScheduleFormNode = computed(() =>
  nodes.value.find((node) => node.id === scheduleForm.value.nodeId) || null,
)

const selectedNodeServers = computed<ManagedNodeHeartbeatServerItem[]>(() => {
  const servers = selectedNode.value?.lastHeartbeat?.servers
  return Array.isArray(servers) ? servers : []
})

const selectedScheduleFormServers = computed<ManagedNodeHeartbeatServerItem[]>(() => {
  const servers = selectedScheduleFormNode.value?.lastHeartbeat?.servers
  return Array.isArray(servers) ? servers : []
})

const selectedNodeGroups = computed(() => {
  return resolveLogicalGroups(selectedNodeServers.value, selectedNode.value)
})

const selectedScheduleNodeGroups = computed(() => {
  return resolveLogicalGroups(selectedScheduleFormServers.value, selectedScheduleFormNode.value)
})

const groupOptions = computed(() => [
  { label: '全部分组', value: 'ALL' },
  ...selectedNodeGroups.value.map((group) => ({
    label: resolveGroupLabel(group),
    value: group,
  })),
])

const scheduleNodeInstructionGroupOptions = computed(() => [
  { label: '全部分组', value: 'ALL' },
  ...selectedScheduleNodeGroups.value.map((group) => ({
    label: resolveGroupLabel(group, selectedScheduleFormNode.value),
    value: group,
  })),
])

const rconServerOptions = computed(() =>
  buildServerSelectOptions(selectedNodeServers.value),
)

const maintenanceStartServerOptions = computed(() =>
  buildServerSelectOptions(selectedNodeServers.value),
)

const scheduleStartServerOptions = computed(() =>
  buildServerSelectOptions(selectedScheduleFormServers.value),
)

const filteredServers = computed(() => {
  if (selectedGroup.value === 'ALL') {
    return selectedNodeServers.value
  }

  return selectedNodeServers.value.filter((server) =>
    (server.groups || []).includes(selectedGroup.value),
  )
})

const selectedServers = computed(() =>
  filteredServers.value.filter((server) => selectedServerKeys.value.includes(server.key)),
)

const visibleActiveCommands = computed(() =>
  selectedCommandNodeId.value
    ? activeCommands.value.filter(command => command.nodeId === selectedCommandNodeId.value)
    : activeCommands.value,
)

const visibleSchedules = computed(() =>
  selectedScheduleNodeId.value
    ? schedules.value.filter(schedule => schedule.nodeId === selectedScheduleNodeId.value)
    : schedules.value,
)

const selectedVisibleActiveCommands = computed(() =>
  visibleActiveCommands.value.filter((command) => selectedActiveCommandIds.value.includes(command.id)),
)

const summaryItems = computed(() => {
  const total = nodes.value.length
  const online = nodes.value.filter((item) => item.status === 'ONLINE').length
  const disabled = nodes.value.filter((item) => item.status === 'DISABLED').length
  const pendingCommands = activeCommands.value.length

  return [
    { label: '节点总数', value: total },
    { label: '在线节点', value: online },
    { label: '停用节点', value: disabled },
    { label: '进行中命令', value: pendingCommands, hint: pendingCommands ? '节点操作 > 进行中命令' : undefined },
  ]
})

const selectedNodeOverview = computed(() => {
  const running = selectedNodeServers.value.filter((server) => isServerRunning(server)).length
  const missing = selectedNodeServers.value.filter((server) => isServerMissing(server)).length
  const total = selectedNodeServers.value.length

  return [
    { label: '服务器总数', value: total },
    { label: '运行中', value: running },
    { label: '未启动 / 缺失', value: missing },
    { label: '分组数量', value: selectedNodeGroups.value.length },
  ]
})

const commandPageCount = computed(() =>
  Math.max(1, Math.ceil(commands.value.length / COMMANDS_PER_PAGE)),
)

const pagedCommands = computed(() => {
  const start = (commandPage.value - 1) * COMMANDS_PER_PAGE
  return commands.value.slice(start, start + COMMANDS_PER_PAGE)
})

function formatDateTime(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD') : '-'
}

function formatRelative(value?: string | null) {
  if (!value) {
    return '未上报'
  }

  const diffSeconds = Math.max(0, dayjs().diff(dayjs(value), 'second'))

  if (diffSeconds < 60) {
    return `${diffSeconds} 秒前`
  }

  if (diffSeconds < 3600) {
    return `${Math.floor(diffSeconds / 60)} 分钟前`
  }

  if (diffSeconds < 86400) {
    return `${Math.floor(diffSeconds / 3600)} 小时前`
  }

  return `${Math.floor(diffSeconds / 86400)} 天前`
}

function formatIntervalMinutes(value: number) {
  const minutes = Math.max(1, Number(value) || 1)
  if (minutes % 1440 === 0) {
    return `${minutes / 1440} 天`
  }

  if (minutes % 60 === 0) {
    return `${minutes / 60} 小时`
  }

  return `${minutes} 分钟`
}

function isValidScheduleTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(value || '').trim())
}

function normalizeScheduleTime(value: string, label: string) {
  const safeValue = String(value || '').trim()
  if (!isValidScheduleTime(safeValue)) {
    throw new Error(`${label}格式必须为 HH:mm`)
  }

  return safeValue
}

function createScheduleForm(nodeId = selectedScheduleNodeId.value || selectedControlNodeId.value || nodes.value[0]?.id || ''): ScheduleFormState {
  return {
    id: '',
    name: '',
    nodeId,
    commandType: 'node.check_update',
    scheduleMode: 'every_n_hours',
    scheduleIntervalMinutes: 60,
    scheduleTime: '03:00',
    scheduleIntervalDays: 1,
    scheduleAnchorDate: dayjs().startOf('day').valueOf(),
    scheduleIntervalHours: 1,
    scheduleWindowStart: '00:00',
    scheduleWindowEnd: '23:59',
    isActive: true,
    notificationChannelKeys: [],
    monitorServerKey: '',
    startServerKeys: [],
    rconGroup: 'ALL',
    rconCommand: '',
  }
}

function buildScheduleConfigSummary(config: NodeScheduleConfig | null | undefined, fallbackIntervalMinutes = 60) {
  const type = config?.type || 'interval_minutes'

  if (type === 'daily') {
    return `每天 ${config?.time || '03:00'}`
  }

  if (type === 'every_n_days') {
    return `每 ${Math.max(1, Number(config?.intervalDays) || 1)} 天 ${config?.time || '03:00'}`
  }

  if (type === 'every_n_hours') {
    return `每 ${Math.max(1, Number(config?.intervalHours) || 1)} 小时 ${config?.windowStart || '00:00'} - ${config?.windowEnd || '23:59'}`
  }

  return `每 ${formatIntervalMinutes(config?.intervalMinutes || fallbackIntervalMinutes)} 执行一次`
}

function buildScheduleConfigFromForm(form: ScheduleFormState): NodeScheduleConfig {
  if (form.scheduleMode === 'daily') {
    return {
      type: 'daily',
      time: normalizeScheduleTime(form.scheduleTime, '执行时间'),
    }
  }

  if (form.scheduleMode === 'every_n_days') {
    if (!Number.isFinite(Number(form.scheduleAnchorDate))) {
      throw new Error('请填写开始日期')
    }

    return {
      type: 'every_n_days',
      intervalDays: Math.max(1, Number(form.scheduleIntervalDays) || 1),
      anchorDate: dayjs(Number(form.scheduleAnchorDate)).format('YYYY-MM-DD'),
      time: normalizeScheduleTime(form.scheduleTime, '执行时间'),
    }
  }

  if (form.scheduleMode === 'every_n_hours') {
    return {
      type: 'every_n_hours',
      intervalHours: Math.max(1, Number(form.scheduleIntervalHours) || 1),
      windowStart: normalizeScheduleTime(form.scheduleWindowStart, '开始时间'),
      windowEnd: normalizeScheduleTime(form.scheduleWindowEnd, '结束时间'),
    }
  }

  return {
    type: 'interval_minutes',
    intervalMinutes: Math.max(1, Number(form.scheduleIntervalMinutes) || 1),
  }
}

function resolveScheduleFormFields(
  config: NodeScheduleConfig | null | undefined,
  fallbackIntervalMinutes = 60,
  fallbackNextRunAt?: string | null,
) {
  const fallbackDay = fallbackNextRunAt && dayjs(fallbackNextRunAt).isValid()
    ? dayjs(fallbackNextRunAt)
    : dayjs()
  const safeConfig = config?.type
    ? config
    : {
      type: 'interval_minutes' as const,
      intervalMinutes: fallbackIntervalMinutes,
    }

  if (safeConfig.type === 'daily') {
    return {
      scheduleMode: 'daily' as const,
      scheduleIntervalMinutes: fallbackIntervalMinutes,
      scheduleTime: safeConfig.time || fallbackDay.format('HH:mm'),
      scheduleIntervalDays: 1,
      scheduleAnchorDate: fallbackDay.startOf('day').valueOf(),
      scheduleIntervalHours: 1,
      scheduleWindowStart: '00:00',
      scheduleWindowEnd: '23:59',
    }
  }

  if (safeConfig.type === 'every_n_days') {
    return {
      scheduleMode: 'every_n_days' as const,
      scheduleIntervalMinutes: fallbackIntervalMinutes,
      scheduleTime: safeConfig.time || fallbackDay.format('HH:mm'),
      scheduleIntervalDays: Math.max(1, Number(safeConfig.intervalDays) || 1),
      scheduleAnchorDate: dayjs(safeConfig.anchorDate || fallbackDay.format('YYYY-MM-DD')).startOf('day').valueOf(),
      scheduleIntervalHours: 1,
      scheduleWindowStart: '00:00',
      scheduleWindowEnd: '23:59',
    }
  }

  if (safeConfig.type === 'every_n_hours') {
    return {
      scheduleMode: 'every_n_hours' as const,
      scheduleIntervalMinutes: fallbackIntervalMinutes,
      scheduleTime: fallbackDay.format('HH:mm'),
      scheduleIntervalDays: 1,
      scheduleAnchorDate: fallbackDay.startOf('day').valueOf(),
      scheduleIntervalHours: Math.max(1, Number(safeConfig.intervalHours) || 1),
      scheduleWindowStart: safeConfig.windowStart || '00:00',
      scheduleWindowEnd: safeConfig.windowEnd || '23:59',
    }
  }

  return {
    scheduleMode: 'interval_minutes' as const,
    scheduleIntervalMinutes: Math.max(1, Number(safeConfig.intervalMinutes) || fallbackIntervalMinutes || 60),
    scheduleTime: fallbackDay.format('HH:mm'),
    scheduleIntervalDays: 1,
    scheduleAnchorDate: fallbackDay.startOf('day').valueOf(),
    scheduleIntervalHours: 1,
    scheduleWindowStart: '00:00',
    scheduleWindowEnd: '23:59',
  }
}

const scheduleFormSummary = computed(() => {
  try {
    return buildScheduleConfigSummary(buildScheduleConfigFromForm(scheduleForm.value), scheduleForm.value.scheduleIntervalMinutes)
  } catch {
    return '请先完善执行规则'
  }
})

function nodeStatusType(status?: ManagedNodeItem['status']) {
  if (status === 'ONLINE') return 'success'
  if (status === 'DISABLED') return 'warning'
  return 'default'
}

function nodeCardStateClass(node: ManagedNodeItem) {
  if (node.status === 'ONLINE') return 'is-online'
  if (node.status === 'OFFLINE') return 'is-offline'
  return 'is-disabled'
}

function commandStatusType(status?: NodeCommandItem['status']) {
  if (status === 'SUCCEEDED') return 'success'
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') return 'error'
  if (status === 'RUNNING' || status === 'CLAIMED') return 'warning'
  return 'default'
}

function isCommandInProgress(status?: NodeCommandItem['status']) {
  return status === 'PENDING' || status === 'CLAIMED' || status === 'RUNNING'
}

function normalizeServerState(server: ManagedNodeHeartbeatServerItem) {
  return String(server.state || server.status || '').trim().toLowerCase()
}

function isServerRunning(server: ManagedNodeHeartbeatServerItem) {
  return normalizeServerState(server) === 'running'
}

function isServerMissing(server: ManagedNodeHeartbeatServerItem) {
  const state = normalizeServerState(server)
  return !state || state === 'missing' || state === 'exited' || state === 'dead'
}

function serverStateType(server: ManagedNodeHeartbeatServerItem) {
  const state = normalizeServerState(server)
  if (state === 'running') return 'success'
  if (state === 'missing' || state === 'dead') return 'error'
  if (state === 'exited') return 'warning'
  return 'default'
}

function serverStateText(server: ManagedNodeHeartbeatServerItem) {
  const state = normalizeServerState(server)

  if (!state) {
    return '未知'
  }

  if (state === 'running') return '运行中'
  if (state === 'missing') return '未创建'
  if (state === 'exited') return '已停止'
  if (state === 'restarting') return '重启中'

  return state
}

function normalizeGroupList(groups: unknown) {
  const values = Array.isArray(groups) ? groups : []
  return Array.from(
    new Set(
      values
        .map((group) => String(group || '').trim())
        .filter(Boolean),
    ),
  )
}

function resolveGroupOrder(node: ManagedNodeItem | null = selectedNode.value) {
  const metadata = node?.lastHeartbeat?.metadata || {}
  const rawOrder =
    (Array.isArray(metadata.groupOrder) ? metadata.groupOrder : null)
    || (Array.isArray(metadata.group_order) ? metadata.group_order : null)
    || []

  return normalizeGroupList(rawOrder)
}

function sortGroups(groups: string[], node: ManagedNodeItem | null = selectedNode.value) {
  const order = resolveGroupOrder(node)
  if (!order.length) {
    return [...groups].sort((left, right) => left.localeCompare(right, 'zh-CN'))
  }

  const rank = new Map(order.map((group, index) => [group, index]))
  return [...groups].sort((left, right) => {
    const leftRank = rank.has(left) ? (rank.get(left) as number) : Number.MAX_SAFE_INTEGER
    const rightRank = rank.has(right) ? (rank.get(right) as number) : Number.MAX_SAFE_INTEGER
    if (leftRank !== rightRank) {
      return leftRank - rightRank
    }

    return left.localeCompare(right, 'zh-CN')
  })
}

function serverGroupsText(
  server: ManagedNodeHeartbeatServerItem,
  node: ManagedNodeItem | null = selectedNode.value,
) {
  const groups = sortGroups(normalizeGroupList(server.groups), node)
  return groups.length ? groups.map((group) => resolveGroupLabel(group, node)).join(' / ') : '未分组'
}

function serverImageText(server: ManagedNodeHeartbeatServerItem) {
  const image = server.image
  if (Array.isArray(image)) {
    return image[0] || '-'
  }

  return String(image || '-')
}

const monitorSelectionCommandTypes = [
  'node.check_update',
  'node.monitor_check',
  'node.monitor_start',
] as const

const startSelectionCommandTypes = [
  'node.check_update',
  'node.monitor_start',
] as const

function resolveLogicalGroups(
  servers: ManagedNodeHeartbeatServerItem[],
  node: ManagedNodeItem | null = selectedNode.value,
) {
  const values = new Set<string>()
  servers.forEach((server) => {
    normalizeGroupList(server.groups).forEach((group) => {
      values.add(group)
    })
  })

  return sortGroups(Array.from(values), node)
}

function buildServerSelectLabel(server: ManagedNodeHeartbeatServerItem) {
  const parts = [server.key, server.containerName || '未填写容器名']
  if (typeof server.primaryPort === 'number' && Number.isFinite(server.primaryPort)) {
    parts.push(`端口 ${server.primaryPort}`)
  }
  parts.push(serverStateText(server))
  return parts.join(' · ')
}

function buildServerSelectOptions(servers: ManagedNodeHeartbeatServerItem[]) {
  return servers.map((server) => ({
    label: buildServerSelectLabel(server),
    value: server.key,
  }))
}

function commandSupportsMonitorServer(commandType: string) {
  return monitorSelectionCommandTypes.includes(commandType as typeof monitorSelectionCommandTypes[number])
}

function commandSupportsStartTargets(commandType: string) {
  return startSelectionCommandTypes.includes(commandType as typeof startSelectionCommandTypes[number])
}

function normalizeOptionalServerKey(value: unknown) {
  const safeValue = String(value || '').trim()
  return safeValue || null
}

function normalizeSelectedServerKeys(value: unknown) {
  return normalizeServerKeyList(value)
}

function resolveServerChoiceLabel(
  servers: ManagedNodeHeartbeatServerItem[],
  key: string | null,
  fallback = 'Agent 默认监控服',
) {
  if (!key) {
    return fallback
  }

  const server = servers.find((item) => item.key === key)
  return server ? buildServerSelectLabel(server) : key
}

function resolveStartTargetsLabel(
  servers: ManagedNodeHeartbeatServerItem[],
  keys: string[],
  fallback = '默认启动 Agent 配置中允许自动启动的服务器',
) {
  if (!keys.length) {
    return fallback
  }

  const labels = keys.map((key) => resolveServerChoiceLabel(servers, key, key))
  return labels.length <= 2 ? labels.join(' / ') : `${labels.length} 台: ${labels.join(', ')}`
}

function nodeServerCount(node: ManagedNodeItem) {
  return Array.isArray(node.lastHeartbeat?.servers) ? node.lastHeartbeat?.servers.length || 0 : 0
}

function nodeGroupCount(node: ManagedNodeItem) {
  const values = new Set<string>()
  ;(node.lastHeartbeat?.servers || []).forEach((server) => {
    ;(server.groups || []).forEach((group) => {
      const safeGroup = String(group || '').trim()
      if (safeGroup) {
        values.add(safeGroup)
      }
    })
  })
  return values.size
}

function nodeRunningCount(node: ManagedNodeItem) {
  return (node.lastHeartbeat?.servers || []).filter((server) => isServerRunning(server)).length
}

function previewValue(value: unknown, fallback = '-') {
  if (value == null || value === '') {
    return fallback
  }

  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (!text) {
    return fallback
  }

  return text.length > 180 ? `${text.slice(0, 180)}...` : text
}

function normalizeResult(value: unknown) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null
  }

  return value as Record<string, unknown>
}

function commandActionText(commandType: string) {
  if (commandType === 'agent.ping') return '心跳测试'
  if (commandType === 'docker.list_servers') return '同步容器列表'
  if (commandType === 'docker.start_group') return '启动分组'
  if (commandType === 'docker.stop_group') return '强制停止分组'
  if (commandType === 'docker.restart_group') return '重启分组'
  if (commandType === 'docker.start_server') return '启动服务器'
  if (commandType === 'docker.stop_server') return '强制停止服务器'
  if (commandType === 'docker.restart_server') return '重启服务器'
  if (commandType === 'docker.remove_server') return '删除服务器'
  if (commandType === 'node.kill_all') return '强制清理容器'
  if (commandType === 'node.rcon_command') return 'RCON 指令'
  if (commandType === 'node.check_update') return '检查更新'
  if (commandType === 'node.check_validate') return '验证游戏完整性'
  if (commandType === 'node.get_oldver') return '读取当前版本'
  if (commandType === 'node.get_nowver') return '读取最新版本'
  if (commandType === 'node.monitor_check') return '崩溃检查'
  if (commandType === 'node.monitor_start') return '崩溃检查后启动'
  return commandType
}

function commandTargetText(command: NodeCommandItem) {
  const payload = normalizeResult(command.payload) || {}
  const group = String(payload.group || '').trim()
  const key = String(payload.key || '').trim()
  const rconCommand = String(payload.command || '').trim()
  const serverKeys = normalizeServerKeyList(payload.serverKeys || payload.targets)
  const startServerKeys = normalizeSelectedServerKeys(payload.startServerKeys)

  if (command.commandType.includes('_group')) {
    return group ? `分组 ${group}` : '分组'
  }

  if (command.commandType.includes('_server') || command.commandType === 'docker.remove_server') {
    return key ? `服务器 ${key}` : '服务器'
  }

  if (command.commandType === 'node.rcon_command') {
    if (serverKeys.length) {
      return serverKeys.length === 1
        ? `服务器 ${serverKeys[0]} · ${rconCommand || 'RCON'}`
        : `${serverKeys.length} 台服务器 · ${rconCommand || 'RCON'}`
    }

    return group && group !== 'ALL'
      ? `分组 ${group} · ${rconCommand || 'RCON'}`
      : (rconCommand ? `全部分组 · ${rconCommand}` : '全部分组')
  }

  if (
    command.commandType === 'node.check_update'
    || command.commandType === 'node.monitor_check'
    || command.commandType === 'node.monitor_start'
  ) {
    const pieces = []

    if (
      (command.commandType === 'node.check_update'
        || command.commandType === 'node.monitor_start')
      && startServerKeys.length
    ) {
      pieces.push(`启动 ${startServerKeys.length} 台`)
    }

    return pieces.length ? pieces.join(' · ') : '节点'
  }

  return '节点'
}

function commandSummaryText(command: NodeCommandItem) {
  const controlState = commandControlState(command)
  if (controlState.requestedAt && command.status === 'RUNNING') {
    return controlState.force
      ? '已请求强制终止，等待 Agent 响应'
      : '已请求终止，等待 Agent 响应'
  }

  if (command.errorMessage) {
    return command.errorMessage
  }

  const result = normalizeResult(command.result)
  if (!result) {
    return command.status === 'SUCCEEDED' ? '执行完成' : '等待 Agent 回传结果'
  }

  if (command.commandType === 'agent.ping') {
    return '节点连通正常'
  }

  if (command.commandType === 'docker.list_servers') {
    const summary = normalizeResult(result.summary)
    const serverCount = Array.isArray(result.servers) ? result.servers.length : Number(summary?.configuredServers || 0)
    const running = Number(summary?.runningServers || 0)
    return `已同步 ${serverCount} 台服务器, 当前运行中 ${running} 台`
  }

  if (command.commandType.includes('_group')) {
    const changed = Number(result.changed || 0)
    const total = Number(result.total || 0)
    const group = String(result.group || '').trim()
    return `${group || '当前分组'}已处理 ${total} 台服务器, 实际变更 ${changed} 台`
  }

  if (command.commandType === 'node.rcon_command') {
    const total = Number(result.total || 0)
    const success = Number(result.success || 0)
    const failed = Number(result.failed || 0)
    return `RCON 已发送到 ${total} 台服务器, 成功 ${success} 台, 失败 ${failed} 台`
  }

  if (
    command.commandType === 'node.check_update'
    || command.commandType === 'node.check_validate'
    || command.commandType === 'node.get_oldver'
    || command.commandType === 'node.get_nowver'
    || command.commandType === 'node.monitor_check'
    || command.commandType === 'node.monitor_start'
    || command.commandType === 'node.kill_all'
  ) {
    if (typeof result.message === 'string' && result.message.trim()) {
      return result.message.trim()
    }
  }

  if (typeof result.message === 'string' && result.message.trim()) {
    return result.message.trim()
  }

  const server = normalizeResult(result.monitorServer || result.server)
  if (server) {
    return `${String(server.key || '目标服务器')} 当前状态 ${serverStateText(server as unknown as ManagedNodeHeartbeatServerItem)}`
  }

  return previewValue(result, '执行完成')
}

function resultServerList(command: NodeCommandItem) {
  const result = normalizeResult(command.result)
  return Array.isArray(result?.servers) ? (result?.servers as unknown as ManagedNodeHeartbeatServerItem[]) : []
}

function resultGroupRows(command: NodeCommandItem) {
  const result = normalizeResult(command.result)
  if (Array.isArray(result?.results)) {
    return result.results as CommandGroupResultRow[]
  }

  const startServers = normalizeResult(result?.startServers)
  return Array.isArray(startServers?.results)
    ? (startServers.results as CommandGroupResultRow[])
    : []
}

function resultSingleServer(command: NodeCommandItem) {
  const result = normalizeResult(command.result)
  const server = normalizeResult(result?.monitorServer || result?.server)
  return server ? (server as unknown as ManagedNodeHeartbeatServerItem) : null
}

function normalizeServerKeyList(value: unknown) {
  const list = Array.isArray(value) ? value : []
  const keys = list
    .map((item) => {
      if (typeof item === 'string') {
        return item
      }
      if (item && typeof item === 'object') {
        return String((item as Record<string, unknown>).key || '')
      }
      return ''
    })
    .map(item => item.trim())
    .filter(Boolean)

  return Array.from(new Set(keys))
}

function commandControlState(command: NodeCommandItem) {
  const result = normalizeResult(command.result)
  const control = normalizeResult(result?.control)
  const requestedAt = typeof control?.cancellationRequestedAt === 'string'
    ? control.cancellationRequestedAt.trim()
    : ''

  return {
    requestedAt: requestedAt || null,
    requestedBySteamId: typeof control?.cancellationRequestedBySteamId === 'string'
      ? control.cancellationRequestedBySteamId.trim() || null
      : null,
    force: Boolean(control?.force),
    reason: typeof control?.reason === 'string'
      ? control.reason.trim() || null
      : null,
  }
}

function canGracefullyCancelCommand(command: NodeCommandItem) {
  return ['PENDING', 'CLAIMED', 'RUNNING'].includes(command.status) && !commandControlState(command).requestedAt
}

function canForceCancelCommand(command: NodeCommandItem) {
  return ['PENDING', 'CLAIMED', 'RUNNING'].includes(command.status) && !commandControlState(command).force
}

function sortSchedules(list: NodeCommandScheduleItem[]) {
  return [...list].sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1
    }

    return String(left.nextRunAt || '').localeCompare(String(right.nextRunAt || ''))
  })
}

function upsertScheduleLocally(schedule: NodeCommandScheduleItem) {
  const list = schedules.value.filter(item => item.id !== schedule.id)

  if (schedule.commandType === 'node.rcon_command' && !props.canViewRcon) {
    schedules.value = sortSchedules(list)
    return
  }

  list.push(schedule)
  schedules.value = sortSchedules(list)
}

function mergeCommandRecord(command: NodeCommandItem) {
  commands.value = [
    command,
    ...commands.value.filter(item => item.id !== command.id),
  ]
}

function mergeActiveCommandRecord(command: NodeCommandItem) {
  const nextList = activeCommands.value.filter(item => item.id !== command.id)
  if (['PENDING', 'CLAIMED', 'RUNNING'].includes(command.status)) {
    nextList.unshift(command)
  }
  activeCommands.value = nextList
}

function buildManualRconPayload() {
  const command = nodeCommandForm.value.rconCommand.trim()
  if (!command) {
    throw new Error('请填写 RCON 指令')
  }

  if (nodeCommandForm.value.rconTargetMode === 'servers') {
    const serverKeys = normalizeServerKeyList(nodeCommandForm.value.rconServerKeys)
    if (!serverKeys.length) {
      throw new Error('请至少选择一台服务器')
    }

    return {
      command,
      targetMode: 'servers' as const,
      serverKeys,
    }
  }

  return {
    command,
    targetMode: 'group' as const,
    group: nodeCommandForm.value.rconGroup,
  }
}

function buildMaintenancePayload(commandType: NodeActionType) {
  const payload: Record<string, unknown> = {}

  if (commandSupportsStartTargets(commandType)) {
    const startServerKeys = normalizeSelectedServerKeys(maintenanceCommandForm.value.startServerKeys)
    if (startServerKeys.length) {
      payload.startServerKeys = startServerKeys
    }
  }

  return payload
}

function queueMaintenanceCommand(commandType: MaintenanceCommandType) {
  if (!props.canViewCommandActions) {
    return
  }

  queueNodeInstruction(commandType, buildMaintenancePayload(commandType))
}

function queueManualRconCommand() {
  if (!props.canViewRcon) {
    return
  }

  try {
    const payload = buildManualRconPayload()
    queueNodeInstruction('node.rcon_command', payload)
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

async function copyText(value: string | null | undefined, label: string) {
  const text = String(value || '').trim()
  if (!text) {
    pushToast(`${label} 为空`, 'error')
    return
  }

  try {
    await navigator.clipboard.writeText(text)
    pushToast(`${label} 已复制`, 'success')
  } catch {
    pushToast(`${label} 复制失败`, 'error')
  }
}

async function loadNodes(silent = false) {
  if (!canAccessNodeDirectory.value) {
    nodes.value = []
    return
  }

  if (!silent) {
    loadingNodes.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/nodes`)
    nodes.value = data.nodes || []
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      loadingNodes.value = false
    }
  }
}

async function loadCommands(silent = false) {
  if (!props.canViewLogHistory) {
    commands.value = []
    return
  }

  if (!silent) {
    loadingCommands.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/commands`, {
      params: {
        nodeId: selectedCommandNodeId.value || undefined,
        status: selectedCommandStatus.value === 'ALL' ? undefined : selectedCommandStatus.value,
        limit: commandLimit.value,
      },
    })
    commands.value = data.commands || []
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      loadingCommands.value = false
    }
  }
}

async function loadActiveCommands(silent = false) {
  if (!props.canViewRunningCommands && !props.canViewLogHistory) {
    activeCommands.value = []
    return
  }

  if (!silent) {
    loadingActiveCommands.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/commands/active`, {
      params: {
        limit: 100,
      },
    })
    activeCommands.value = data.commands || []
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      loadingActiveCommands.value = false
    }
  }
}

async function loadSchedules(silent = false) {
  if (!canViewScheduleTab.value) {
    schedules.value = []
    loadingSchedules.value = false
    return
  }

  const requestId = ++scheduleLoadRequestCursor

  if (!silent) {
    visibleScheduleLoadCount += 1
    loadingSchedules.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/schedules`, {
      params: {
        _: Date.now(),
      },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    if (requestId !== scheduleLoadRequestCursor) {
      return
    }

    schedules.value = sortSchedules(data.schedules || [])
  } catch (error) {
    if (requestId !== scheduleLoadRequestCursor) {
      return
    }

    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      visibleScheduleLoadCount = Math.max(0, visibleScheduleLoadCount - 1)
      loadingSchedules.value = visibleScheduleLoadCount > 0
    }
  }
}

async function loadGotifyChannels(silent = false) {
  if (!canReadGotifyConfig.value) {
    gotifyChannels.value = []
    return
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/notifications/gotify`)
    gotifyChannels.value = Array.isArray(data.config?.channels) ? data.config.channels : []
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  }
}

async function refreshCurrentAgentView(silent = false) {
  const tasks: Promise<unknown>[] = [loadNodes(silent)]

  if (agentPanelTab.value === 'commands') {
    tasks.push(loadActiveCommands(silent))
  }

  if (agentPanelTab.value === 'logs') {
    tasks.push(loadCommands(silent))
  }

  if (agentPanelTab.value === 'schedules') {
    tasks.push(loadSchedules(silent), loadGotifyChannels(silent))
  }

  if (agentPanelTab.value === 'notifications') {
    tasks.push(loadGotifyChannels(silent))
  }

  await Promise.all(tasks)
}

async function refreshAll(silent = false) {
  await Promise.all([loadNodes(silent), loadCommands(silent), loadActiveCommands(silent), loadSchedules(silent)])
}

function startPolling() {
  stopPolling()

  if (!props.active) {
    return
  }

  pollTimer = setInterval(() => {
    const tasks: Promise<unknown>[] = [loadNodes(true)]

    if (agentPanelTab.value === 'commands') {
      tasks.push(loadActiveCommands(true))
    }

    if (agentPanelTab.value === 'logs') {
      tasks.push(loadCommands(true))
    }

    void Promise.all(tasks)
  }, 5000)
}

function stopPolling() {
  if (!pollTimer) {
    return
  }

  clearInterval(pollTimer)
  pollTimer = null
}

function resetNodeModal() {
  nodeModal.value = {
    show: false,
    mode: 'create',
    id: '',
    code: '',
    name: '',
    host: '',
    note: '',
    isActive: true,
  }
}

function openCreateNodeModal() {
  if (!props.canManageNodes) {
    return
  }

  resetNodeModal()
  nodeModal.value.show = true
}

function openEditNodeModal(node: ManagedNodeItem) {
  if (!props.canManageNodes) {
    return
  }

  nodeModal.value = {
    show: true,
    mode: 'edit',
    id: node.id,
    code: node.code,
    name: node.name,
    host: node.host || '',
    note: node.note || '',
    isActive: node.isActive,
  }
}

async function submitNodeModal() {
  if (!props.canManageNodes) {
    return
  }

  savingNode.value = true

  try {
    if (nodeModal.value.mode === 'create') {
      const { data } = await http.post(`${CONSOLE_API_BASE}/agent/nodes`, {
        code: nodeModal.value.code.trim() || undefined,
        name: nodeModal.value.name.trim(),
        host: nodeModal.value.host.trim() || undefined,
        note: nodeModal.value.note.trim() || undefined,
        isActive: nodeModal.value.isActive,
      })

      issuedKeyModal.value = {
        show: true,
        title: '节点创建成功',
        nodeName: data.node?.name || nodeModal.value.name.trim(),
        apiKey: data.apiKey || '',
      }
      pushToast('节点已创建', 'success')
    } else {
      await http.patch(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(nodeModal.value.id)}`, {
        code: nodeModal.value.code.trim() || undefined,
        name: nodeModal.value.name.trim() || undefined,
        host: nodeModal.value.host.trim() || undefined,
        note: nodeModal.value.note.trim() || undefined,
        isActive: nodeModal.value.isActive,
      })
      pushToast('节点信息已更新', 'success')
    }

    nodeModal.value.show = false
    await refreshAll(true)
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    savingNode.value = false
  }
}

function openConfirmDialog(
  title: string,
  lines: string[],
  positiveText: string,
  action: () => Promise<void>,
  behavior: {
    closeOnConfirm?: boolean
    backgroundNotice?: string
  } = {},
) {
  pendingConfirmAction = action
  pendingConfirmBehavior = behavior
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

  const action = pendingConfirmAction
  const behavior = pendingConfirmBehavior

  if (behavior?.closeOnConfirm) {
    closeConfirmDialog()
    if (behavior.backgroundNotice) {
      pushToast(behavior.backgroundNotice, 'info')
    }

    try {
      await action()
    } catch (error) {
      pushToast((error as Error).message, 'error')
    }
    return
  }

  confirmState.value.loading = true

  try {
    await action()
    confirmState.value.show = false
    pendingConfirmAction = null
    pendingConfirmBehavior = null
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    confirmState.value.loading = false
  }
}

function closeConfirmDialog() {
  confirmState.value.show = false
  confirmState.value.loading = false
  pendingConfirmAction = null
  pendingConfirmBehavior = null
}

function confirmToggleNode(node: ManagedNodeItem, nextValue: boolean) {
  if (!props.canManageNodes) {
    return
  }

  const nextLabel = nextValue ? '启用' : '停用'

  openConfirmDialog(
    `确认${nextLabel}节点`,
    [`${nextLabel}后将更新该节点的接入状态`, `确认${nextLabel} ${node.name} (${node.code})`],
    `确认${nextLabel}`,
    async () => {
      await http.patch(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(node.id)}`, {
        isActive: nextValue,
      })
      pushToast(`节点已${nextLabel}`, 'success')
      await refreshAll(true)
    },
  )
}

function confirmRotateKey(node: ManagedNodeItem) {
  if (!props.canManageNodes) {
    return
  }

  openConfirmDialog(
    '确认重置节点令牌',
    ['重置后旧令牌会立即失效', `确认重置 ${node.name} (${node.code}) 的令牌`],
    '确认重置',
    async () => {
      const { data } = await http.post(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(node.id)}/rotate-key`)
      issuedKeyModal.value = {
        show: true,
        title: '节点令牌已重置',
        nodeName: data.node?.name || node.name,
        apiKey: data.apiKey || '',
      }
      pushToast('节点令牌已重置', 'success')
      await refreshAll(true)
    },
  )
}

function selectNode(node: ManagedNodeItem) {
  selectedControlNodeId.value = node.id
  selectedCommandNodeId.value = node.id
  if (!scheduleForm.value.id) {
    scheduleForm.value.nodeId = node.id
  }

  if (canViewControlTab.value) {
    agentPanelTab.value = 'control'
    return
  }

  if (canViewCommandPanel.value) {
    agentPanelTab.value = 'commands'
    return
  }

  if (canViewScheduleTab.value) {
    agentPanelTab.value = 'schedules'
    return
  }

  if (canViewNotificationsTab.value) {
    agentPanelTab.value = 'notifications'
    return
  }

  if (canViewLogsTab.value) {
    agentPanelTab.value = 'logs'
    return
  }

  agentPanelTab.value = firstAvailableAgentTab.value
}

function resolveGroupLabel(group: string, node: ManagedNodeItem | null = selectedNode.value) {
  const safeGroup = String(group || '').trim()
  const metadata = node?.lastHeartbeat?.metadata || {}
  const rawLabels =
    (metadata.groupLabels && typeof metadata.groupLabels === 'object' ? metadata.groupLabels : null)
    || (metadata.group_labels && typeof metadata.group_labels === 'object' ? metadata.group_labels : null)
    || null

  if (rawLabels && safeGroup in rawLabels) {
    const label = String((rawLabels as Record<string, unknown>)[safeGroup] || '').trim()
    if (label) {
      return label
    }
  }

  return safeGroup || '未分组'
}

function toggleServer(serverKey: string, checked?: boolean) {
  const nextChecked = checked ?? !selectedServerKeys.value.includes(serverKey)

  selectedServerKeys.value = nextChecked
    ? Array.from(new Set([...selectedServerKeys.value, serverKey]))
    : selectedServerKeys.value.filter((item) => item !== serverKey)
}

function selectAllFilteredServers() {
  selectedServerKeys.value = filteredServers.value.map((server) => server.key)
}

function clearSelectedServers() {
  selectedServerKeys.value = []
}

function isActiveCommandSelected(commandId: string) {
  return selectedActiveCommandIds.value.includes(commandId)
}

function toggleActiveCommandSelection(commandId: string, checked?: boolean) {
  const nextChecked = checked ?? !isActiveCommandSelected(commandId)

  selectedActiveCommandIds.value = nextChecked
    ? Array.from(new Set([...selectedActiveCommandIds.value, commandId]))
    : selectedActiveCommandIds.value.filter((item) => item !== commandId)
}

function selectAllVisibleActiveCommands() {
  selectedActiveCommandIds.value = visibleActiveCommands.value.map((command) => command.id)
}

function clearSelectedActiveCommands() {
  selectedActiveCommandIds.value = []
}

function requireSelectedNode() {
  if (!selectedNode.value) {
    pushToast('请先选择一个节点', 'error')
    return null
  }

  return selectedNode.value
}

function requireSelectedGroup() {
  if (selectedGroup.value === 'ALL') {
    pushToast('请先选择一个具体分组', 'error')
    return ''
  }

  return selectedGroup.value
}

function requireSelectedServers() {
  if (!selectedServers.value.length) {
    pushToast('请先勾选至少一台服务器', 'error')
    return null
  }

  return selectedServers.value
}

function queueCommand(
  commandType: NodeActionType,
  payload: Record<string, unknown>,
  title: string,
  lines: string[],
  positiveText: string,
  options: {
    openLogAfterCreate?: boolean
    closeOnConfirm?: boolean
    backgroundNotice?: string
  } = {},
) {
  const node = requireSelectedNode()
  if (!node) {
    return
  }

  openConfirmDialog(
    title,
    lines,
    positiveText,
    async () => {
      const { data } = await http.post(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(node.id)}/commands`, {
        commandType,
        payload,
        expiresInSeconds: 300,
      })
      const command = data.command as NodeCommandItem | undefined
      if (command) {
        mergeActiveCommandRecord(command)
        if (props.canViewLogHistory) {
          mergeCommandRecord(command)
        }
      }
      pushToast('命令已下发', 'success')
      if (options.openLogAfterCreate && command && props.canViewLogDetails) {
        await openLogModal(command)
      }
    },
    {
      closeOnConfirm: options.closeOnConfirm,
      backgroundNotice: options.backgroundNotice,
    },
  )
}

function queueNodeInstruction(commandType: Exclude<NodeActionType, 'docker.start_group' | 'docker.stop_group' | 'docker.restart_group' | 'docker.start_server' | 'docker.stop_server' | 'docker.restart_server' | 'docker.remove_server'>, payload: Record<string, unknown> = {}) {
  const node = requireSelectedNode()
  if (!node) {
    return
  }

  const actionText = commandActionText(commandType)
  const lines = [`目标节点: ${node.name}`, `确认执行${actionText}`]

  if (commandType === 'node.rcon_command') {
    const group = String(payload.group || 'ALL').trim() || 'ALL'
    const commandText = String(payload.command || '').trim()
    const serverKeys = normalizeServerKeyList(payload.serverKeys || payload.targets)

    if (!commandText) {
      pushToast('请填写 RCON 指令', 'error')
      return
    }

    if (serverKeys.length) {
      lines.push(serverKeys.length === 1 ? `目标服务器: ${serverKeys[0]}` : `目标服务器: ${serverKeys.length} 台`)
      lines.push(serverKeys.join(', '))
    } else {
      lines.push(group === 'ALL' ? '目标分组: 全部分组' : `目标分组: ${group}`)
    }

    lines.push(commandText)
  }

  if (commandSupportsStartTargets(commandType)) {
    const startServerKeys = normalizeSelectedServerKeys(payload.startServerKeys)
    lines.push(`崩溃检查成功后启动: ${resolveStartTargetsLabel(selectedNodeServers.value, startServerKeys)}`)
  }

  if (commandType === 'node.check_update') {
    lines.push('流程: 先比较本地与远端版本, 只有检测到差异才会停服并执行 validate。')
  }

  if (commandType === 'node.check_validate') {
    lines.push('流程: 立即停服并执行 update validate, 完成后结束。')
  }

  if (commandType === 'node.get_oldver') {
    lines.push('流程: 只读取当前节点本地版本, 不停服。')
  }

  if (commandType === 'node.get_nowver') {
    lines.push('流程: 只读取远端最新版本, 不停服。')
  }

  queueCommand(
    commandType,
    payload,
    `确认${actionText}`,
    lines,
    actionText,
    {
      closeOnConfirm: true,
      backgroundNotice: `已转入后台执行${actionText}，可继续操作其他内容。`,
      openLogAfterCreate:
        props.canViewLogDetails
        && (
          commandType === 'node.check_update'
          || commandType === 'node.check_validate'
          || commandType === 'node.get_nowver'
          || commandType === 'node.monitor_check'
          || commandType === 'node.monitor_start'
        ),
    },
  )
}

function queueGroupAction(commandType: Extract<NodeActionType, 'docker.start_group' | 'docker.stop_group' | 'docker.restart_group'>) {
  if (!props.canViewControlGroups) {
    return
  }

  const node = requireSelectedNode()
  const group = requireSelectedGroup()
  if (!node || !group) {
    return
  }

  const actionText = commandActionText(commandType)
  queueCommand(
    commandType,
    { group },
    `确认${actionText}`,
    [`目标节点: ${node.name}`, `确认对分组 ${group} 执行${actionText}`],
    actionText,
    {
      closeOnConfirm: true,
      backgroundNotice: `已转入后台执行${actionText}，可继续操作其他内容。`,
    },
  )
}

function queueServerAction(commandType: Extract<NodeActionType, 'docker.start_server' | 'docker.stop_server' | 'docker.restart_server' | 'docker.remove_server'>) {
  if (!props.canViewControlServers) {
    return
  }

  const node = requireSelectedNode()
  const servers = requireSelectedServers()
  if (!node || !servers) {
    return
  }

  const actionText = commandActionText(commandType)
  const serverNames = servers.map((server) => server.key).join(', ')

  openConfirmDialog(
    `确认${actionText}`,
    [
      `目标节点: ${node.name}`,
      `本次将处理 ${servers.length} 台服务器`,
      serverNames,
    ],
    actionText,
    async () => {
      const results = await Promise.allSettled(
        servers.map(async (server) => {
          const { data } = await http.post(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(node.id)}/commands`, {
            commandType,
            payload: { key: server.key },
            expiresInSeconds: 300,
          })
          return data.command as NodeCommandItem | undefined
        }),
      )

      const createdCommands = results
        .filter((item): item is PromiseFulfilledResult<NodeCommandItem | undefined> => item.status === 'fulfilled')
        .map(item => item.value)
        .filter((item): item is NodeCommandItem => Boolean(item))

      createdCommands.forEach((command) => {
        mergeActiveCommandRecord(command)
        if (props.canViewLogHistory) {
          mergeCommandRecord(command)
        }
      })

      const failedResults = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected')
      if (!createdCommands.length && failedResults.length) {
        throw failedResults[0].reason
      }

      pushToast(
        failedResults.length
          ? `已下发 ${createdCommands.length} 条命令，另有 ${failedResults.length} 条未提交成功`
          : `已下发 ${createdCommands.length} 条命令`,
        'success',
      )

      if (failedResults.length) {
        pushToast(`有 ${failedResults.length} 条命令提交失败，请稍后重试。`, 'error')
      }
    },
    {
      closeOnConfirm: true,
      backgroundNotice: `正在后台下发 ${servers.length} 条命令，可继续操作其他内容。`,
    },
  )
}

function openCommandDetails(command: NodeCommandItem) {
  commandDetailModal.value = {
    show: true,
    command,
  }
}

function isCommandExpanded(commandId: string) {
  return expandedCommandIds.value.includes(commandId)
}

function toggleCommandExpanded(commandId: string) {
  expandedCommandIds.value = isCommandExpanded(commandId)
    ? expandedCommandIds.value.filter((item) => item !== commandId)
    : [...expandedCommandIds.value, commandId]
}

function setCommandPage(page: number) {
  const nextPage = Math.max(1, Math.min(page, commandPageCount.value))
  commandPage.value = nextPage
  expandedCommandIds.value = []
}

function isScheduleExpanded(scheduleId: string) {
  return scheduleExpandedIds.value.includes(scheduleId)
}

function toggleScheduleExpanded(scheduleId: string) {
  scheduleExpandedIds.value = isScheduleExpanded(scheduleId)
    ? scheduleExpandedIds.value.filter((item) => item !== scheduleId)
    : [...scheduleExpandedIds.value, scheduleId]
}

function resolveGotifyChannelNames(channelKeys: string[] | undefined) {
  return (Array.isArray(channelKeys) ? channelKeys : [])
    .map((key) => gotifyChannelNameMap.value.get(String(key || '').trim()) || String(key || '').trim())
    .filter(Boolean)
}

const isLogModalLive = computed(() =>
  Boolean(logModal.value.show && logModal.value.command && isCommandInProgress(logModal.value.command.status)),
)

const logModalHint = computed(() =>
  isLogModalLive.value
    ? '运行中，日志会自动刷新并跟随到最新输出。'
    : '命令已结束，可手动刷新查看完整执行输出。',
)

function formatLogTerminalLine(log: NodeCommandLogItem) {
  const timestamp = dayjs(log.createdAt).format('MM-DD HH:mm:ss')
  const level = String(log.level || '').trim().toLowerCase()
  const levelSuffix = level && level !== 'info' ? ` ${level}` : ''
  return `${timestamp}${levelSuffix} | ${log.message}`
}

const logTerminalText = computed(() =>
  commandLogs.value.map((log) => formatLogTerminalLine(log)).join('\n'),
)

function stopLogPolling() {
  if (!logPollTimer) {
    return
  }

  clearInterval(logPollTimer)
  logPollTimer = null
}

function syncLogPolling() {
  if (!props.active || !logModal.value.show || !logModal.value.command || !isCommandInProgress(logModal.value.command.status)) {
    stopLogPolling()
    return
  }

  if (logPollTimer) {
    return
  }

  logPollTimer = setInterval(() => {
    void refreshLogModal(true)
  }, 2000)
}

function isLogViewerNearBottom() {
  const element = logListRef.value
  if (!element) {
    return true
  }

  const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
  return remaining <= 72
}

function scrollLogViewerToBottom(force = false) {
  nextTick(() => {
    const element = logListRef.value
    if (!element) {
      return
    }

    if (force || isLogViewerNearBottom()) {
      element.scrollTop = element.scrollHeight
    }
  })
}

async function refreshLogModal(silent = false) {
  const currentCommand = logModal.value.command
  if (!logModal.value.show || !currentCommand) {
    stopLogPolling()
    return
  }

  if (!silent) {
    loadingLogs.value = true
  }

  const shouldStickToBottom = isLogViewerNearBottom()

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/commands/${encodeURIComponent(currentCommand.id)}/logs`, {
      params: { limit: 1000 },
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    })

    const nextCommand = (data.command || currentCommand) as NodeCommandItem
    const nextLogs = Array.isArray(data.logs) ? data.logs as NodeCommandLogItem[] : []

    logModal.value = {
      show: true,
      command: nextCommand,
    }
    commandLogs.value = nextLogs
    mergeActiveCommandRecord(nextCommand)
    if (props.canViewLogHistory) {
      mergeCommandRecord(nextCommand)
    }
    if (shouldStickToBottom || isCommandInProgress(nextCommand.status)) {
      scrollLogViewerToBottom(true)
    }
    syncLogPolling()
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
      logModal.value.show = false
      stopLogPolling()
    }
  } finally {
    if (!silent) {
      loadingLogs.value = false
    }
  }
}

async function openLogModal(command: NodeCommandItem) {
  if (!props.canViewLogDetails) {
    return
  }

  logModal.value = {
    show: true,
    command,
  }
  commandLogs.value = []
  await refreshLogModal(false)
}

function resetScheduleForm() {
  if (!props.canEditSchedules) {
    return
  }

  scheduleForm.value = createScheduleForm(selectedScheduleNodeId.value || selectedControlNodeId.value || nodes.value[0]?.id || '')
  scheduleSubTab.value = 'edit'
}

function fillScheduleForm(schedule: NodeCommandScheduleItem) {
  if (!props.canEditSchedules) {
    return
  }

  const monitorServerKey = normalizeOptionalServerKey(schedule.payload?.monitorServerKey) || ''
  const startServerKeys = normalizeSelectedServerKeys(schedule.payload?.startServerKeys)
  const scheduleFields = resolveScheduleFormFields(
    schedule.scheduleConfig,
    schedule.intervalMinutes,
    schedule.nextRunAt,
  )

  scheduleForm.value = {
    id: schedule.id,
    name: schedule.name,
    nodeId: schedule.nodeId,
    commandType: schedule.commandType as NodeActionType,
    ...scheduleFields,
    isActive: schedule.isActive,
    notificationChannelKeys: Array.isArray(schedule.notificationChannelKeys) ? [...schedule.notificationChannelKeys] : [],
    monitorServerKey,
    startServerKeys,
    rconGroup: String(schedule.payload?.group || 'ALL'),
    rconCommand: String(schedule.payload?.command || ''),
  }
  scheduleSubTab.value = 'edit'
}

function buildSchedulePayload() {
  const payload: Record<string, unknown> = {}

  if (scheduleForm.value.commandType === 'node.rcon_command') {
    const command = scheduleForm.value.rconCommand.trim()
    if (!command) {
      throw new Error('请填写 RCON 指令')
    }

    return {
      group: scheduleForm.value.rconGroup,
      command,
    }
  }

  if (commandSupportsStartTargets(scheduleForm.value.commandType)) {
    const startServerKeys = normalizeSelectedServerKeys(scheduleForm.value.startServerKeys)
    if (startServerKeys.length) {
      payload.startServerKeys = startServerKeys
    }
  }

  return payload
}

async function saveSchedule() {
  if (!props.canEditSchedules) {
    return
  }

  savingSchedule.value = true

  try {
    const payload = {
      name: scheduleForm.value.name.trim(),
      nodeId: scheduleForm.value.nodeId,
      commandType: scheduleForm.value.commandType,
      payload: buildSchedulePayload(),
      notificationChannelKeys: scheduleForm.value.notificationChannelKeys,
      scheduleConfig: buildScheduleConfigFromForm(scheduleForm.value),
      isActive: scheduleForm.value.isActive,
    }

    let schedule: NodeCommandScheduleItem

    if (scheduleForm.value.id) {
      const { data } = await http.patch(`${CONSOLE_API_BASE}/agent/schedules/${encodeURIComponent(scheduleForm.value.id)}`, payload)
      schedule = data.schedule
      pushToast('定时任务已更新', 'success')
    } else {
      const { data } = await http.post(`${CONSOLE_API_BASE}/agent/schedules`, payload)
      schedule = data.schedule
      pushToast('定时任务已创建', 'success')
    }

    upsertScheduleLocally(schedule)
    selectedScheduleNodeId.value = schedule.nodeId
    fillScheduleForm(schedule)
    scheduleExpandedIds.value = Array.from(new Set([schedule.id, ...scheduleExpandedIds.value]))
    scheduleSubTab.value = props.canViewScheduleList ? 'list' : 'edit'
    await loadSchedules(true)
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    savingSchedule.value = false
  }
}

function confirmDeleteSchedule(schedule: NodeCommandScheduleItem) {
  if (!props.canEditSchedules) {
    return
  }

  openConfirmDialog(
    '确认删除定时任务',
    ['删除后不会再自动下发该节点操作', `${schedule.name} · ${commandActionText(schedule.commandType)}`],
    '确认删除',
    async () => {
      await http.delete(`${CONSOLE_API_BASE}/agent/schedules/${encodeURIComponent(schedule.id)}`)
      pushToast('定时任务已删除', 'success')
      schedules.value = schedules.value.filter(item => item.id !== schedule.id)
      scheduleExpandedIds.value = scheduleExpandedIds.value.filter(id => id !== schedule.id)
      if (scheduleForm.value.id === schedule.id) {
        resetScheduleForm()
      }
      await loadSchedules(true)
    },
  )
}

function confirmToggleSchedule(schedule: NodeCommandScheduleItem, nextValue: boolean) {
  if (!props.canEditSchedules) {
    return
  }

  openConfirmDialog(
    nextValue ? '确认启用定时任务' : '确认停用定时任务',
    [nextValue ? '启用后会按设定时间自动下发节点操作' : '停用后不会继续自动下发节点操作', schedule.name],
    nextValue ? '确认启用' : '确认停用',
    async () => {
      const { data } = await http.patch(`${CONSOLE_API_BASE}/agent/schedules/${encodeURIComponent(schedule.id)}`, {
        isActive: nextValue,
      })
      pushToast(nextValue ? '定时任务已启用' : '定时任务已停用', 'success')
      upsertScheduleLocally(data.schedule)
      await loadSchedules(true)
    },
  )
}

function requestCommandCancellation(command: NodeCommandItem, force = false) {
  if (!props.canViewRunningCommands) {
    return
  }

  const actionLabel = force ? '强制终止' : '终止'
  const controlState = commandControlState(command)
  const lines = [
    `${commandActionText(command.commandType)} · ${command.node?.name || command.nodeId}`,
    `目标: ${commandTargetText(command)}`,
    force
      ? '会向 Agent 发送强制终止请求，适用于 steamcmd / 监控这类长任务。'
      : '会向 Agent 发送终止请求，正在排队的命令会直接取消。',
  ]

  if (controlState.requestedAt) {
    lines.push(`当前已在 ${formatDateTime(controlState.requestedAt)} 请求过一次终止`)
  }

  openConfirmDialog(
    `确认${actionLabel}命令`,
    lines,
    `确认${actionLabel}`,
    async () => {
      const { data } = await http.post(`${CONSOLE_API_BASE}/agent/commands/${encodeURIComponent(command.id)}/cancel`, {
        force,
      })
      const nextCommand = data.command as NodeCommandItem
      mergeActiveCommandRecord(nextCommand)
      if (props.canViewLogHistory) {
        mergeCommandRecord(nextCommand)
      }
      pushToast(force ? '已请求强制终止命令' : '已请求终止命令', 'success')
      await Promise.all([
        loadActiveCommands(true),
        props.canViewLogHistory ? loadCommands(true) : Promise.resolve(),
      ])
    },
    {
      closeOnConfirm: true,
      backgroundNotice: force
        ? '强制终止请求已转入后台提交，可继续操作其他内容。'
        : '终止请求已转入后台提交，可继续操作其他内容。',
    },
  )
}

function requestBatchCommandCancellation(force = false) {
  if (!props.canViewRunningCommands) {
    return
  }

  const selectedCommands = selectedVisibleActiveCommands.value

  if (!selectedCommands.length) {
    pushToast('请先选择至少一条进行中命令', 'error')
    return
  }

  const actionLabel = force ? '强制终止' : '终止'
  const lines = [
    `本次共选择 ${selectedCommands.length} 条进行中命令`,
    force
      ? '会向 Agent 批量发送强制终止请求，适用于 steamcmd / 监控这类长任务。'
      : '会向 Agent 批量发送终止请求，排队中的命令会直接取消。',
  ]

  if (selectedCommandNodeId.value) {
    const node = nodes.value.find((item) => item.id === selectedCommandNodeId.value)
    if (node) {
      lines.push(`当前节点筛选: ${node.name}`)
    }
  }

  openConfirmDialog(
    `确认批量${actionLabel}命令`,
    lines,
    `确认批量${actionLabel}`,
    async () => {
      const { data } = await http.post(`${CONSOLE_API_BASE}/agent/commands/batch-cancel`, {
        ids: selectedCommands.map((command) => command.id),
        force,
      })

      const result = data.result || {}
      const nextCommands = Array.isArray(result.commands) ? result.commands as NodeCommandItem[] : []

      nextCommands.forEach((command) => {
        mergeActiveCommandRecord(command)
        if (props.canViewLogHistory) {
          mergeCommandRecord(command)
        }
      })

      selectedActiveCommandIds.value = selectedActiveCommandIds.value.filter((id) =>
        !selectedCommands.some((command) => command.id === id),
      )

      const affectedCount = Number(result.affectedCount || nextCommands.length || 0)
      pushToast(
        force
          ? `已请求强制终止 ${affectedCount} 条命令`
          : `已请求终止 ${affectedCount} 条命令`,
        'success',
      )

      await Promise.all([
        loadActiveCommands(true),
        props.canViewLogHistory ? loadCommands(true) : Promise.resolve(),
      ])
    },
    {
      closeOnConfirm: true,
      backgroundNotice: force
        ? `正在后台提交 ${selectedCommands.length} 条强制终止请求，可继续操作其他内容。`
        : `正在后台提交 ${selectedCommands.length} 条终止请求，可继续操作其他内容。`,
    },
  )
}

function handleGotifyConfigUpdated(config: GotifyConfig) {
  gotifyChannels.value = Array.isArray(config.channels) ? config.channels : []
}

watch(
  () => props.active,
  (active) => {
    if (!active) {
      stopPolling()
      stopLogPolling()
      return
    }

    void refreshCurrentAgentView()
    startPolling()
    syncLogPolling()
  },
  { immediate: true },
)

watch(
  () => agentPanelTab.value,
  () => {
    if (props.active) {
      void refreshCurrentAgentView()
    }
  },
)

watch(
  () => nodes.value,
  (list) => {
    if (!list.length) {
      selectedControlNodeId.value = ''
      selectedCommandNodeId.value = ''
      selectedScheduleNodeId.value = ''
      return
    }

    if (!list.some((node) => node.id === selectedControlNodeId.value)) {
      selectedControlNodeId.value = list[0].id
    }

    if (selectedCommandNodeId.value && !list.some((node) => node.id === selectedCommandNodeId.value)) {
      selectedCommandNodeId.value = ''
    }

    if (selectedScheduleNodeId.value && !list.some((node) => node.id === selectedScheduleNodeId.value)) {
      selectedScheduleNodeId.value = ''
    }

    if (!scheduleForm.value.nodeId || !list.some((node) => node.id === scheduleForm.value.nodeId)) {
      scheduleForm.value.nodeId = selectedScheduleNodeId.value || list[0].id
    }
  },
  { immediate: true },
)

watch(
  () => selectedControlNodeId.value,
  () => {
    selectedGroup.value = 'ALL'
    selectedServerKeys.value = []
    nodeCommandForm.value.rconServerKeys = []
    maintenanceCommandForm.value.monitorServerKey = ''
    maintenanceCommandForm.value.startServerKeys = []
  },
)

watch(
  () => selectedGroup.value,
  () => {
    selectedServerKeys.value = selectedServerKeys.value.filter((key) =>
      filteredServers.value.some((server) => server.key === key),
    )
  },
)

watch(
  () => selectedNodeServers.value,
  () => {
    nodeCommandForm.value.rconServerKeys = nodeCommandForm.value.rconServerKeys.filter((key) =>
      selectedNodeServers.value.some((server) => server.key === key),
    )
    if (
      maintenanceCommandForm.value.monitorServerKey
      && !selectedNodeServers.value.some((server) => server.key === maintenanceCommandForm.value.monitorServerKey)
    ) {
      maintenanceCommandForm.value.monitorServerKey = ''
    }
    maintenanceCommandForm.value.startServerKeys = maintenanceCommandForm.value.startServerKeys.filter((key) =>
      selectedNodeServers.value.some((server) => server.key === key),
    )
  },
)

watch(
  () => [selectedCommandNodeId.value, selectedCommandStatus.value, commandLimit.value] as const,
  () => {
    commandPage.value = 1
    expandedCommandIds.value = []
    if (props.active) {
      void loadCommands()
    }
  },
)

watch(
  () => selectedScheduleNodeId.value,
  () => {
    if (!scheduleForm.value.id && selectedScheduleNodeId.value) {
      scheduleForm.value.nodeId = selectedScheduleNodeId.value
    }
  },
)

watch(
  () => visibleSchedules.value.map((schedule) => schedule.id),
  (visibleIds) => {
    scheduleExpandedIds.value = scheduleExpandedIds.value.filter((id) => visibleIds.includes(id))
  },
)

watch(
  () => selectedScheduleFormServers.value,
  () => {
    if (
      scheduleForm.value.monitorServerKey
      && !selectedScheduleFormServers.value.some((server) => server.key === scheduleForm.value.monitorServerKey)
    ) {
      scheduleForm.value.monitorServerKey = ''
    }
    scheduleForm.value.startServerKeys = scheduleForm.value.startServerKeys.filter((key) =>
      selectedScheduleFormServers.value.some((server) => server.key === key),
    )
  },
)

watch(
  () => [
    canViewNodesTab.value,
    canViewControlTab.value,
    canViewCommandPanel.value,
    canViewScheduleTab.value,
    canViewNotificationsTab.value,
    canViewLogsTab.value,
    agentPanelTab.value,
  ] as const,
  () => {
    const current = agentPanelTab.value
    const allowed =
      (current === 'nodes' && canViewNodesTab.value)
      || (current === 'control' && canViewControlTab.value)
      || (current === 'commands' && canViewCommandPanel.value)
      || (current === 'schedules' && canViewScheduleTab.value)
      || (current === 'notifications' && canViewNotificationsTab.value)
      || (current === 'logs' && canViewLogsTab.value)

    if (!allowed) {
      agentPanelTab.value = firstAvailableAgentTab.value
    }
  },
  { immediate: true },
)

watch(
  () => [props.canViewCommandActions, props.canViewRcon, props.canViewRunningCommands, commandSubTab.value] as const,
  () => {
    const current = commandSubTab.value
    const allowed =
      (current === 'actions' && props.canViewCommandActions)
      || (current === 'rcon' && props.canViewRcon)
      || (current === 'running' && props.canViewRunningCommands)

    if (!allowed) {
      commandSubTab.value = firstAvailableCommandSubTab.value
    }
  },
  { immediate: true },
)

watch(
  () => [props.canEditSchedules, props.canViewScheduleList, scheduleSubTab.value] as const,
  () => {
    const current = scheduleSubTab.value
    const allowed =
      (current === 'edit' && props.canEditSchedules)
      || (current === 'list' && props.canViewScheduleList)

    if (!allowed) {
      scheduleSubTab.value = firstAvailableScheduleSubTab.value
    }
  },
  { immediate: true },
)

watch(
  () => scheduleSubTab.value,
  () => {
    if (!props.active || agentPanelTab.value !== 'schedules') {
      return
    }

    if (scheduleSubTab.value === 'list' && props.canViewScheduleList) {
      void loadSchedules()
      return
    }

    if (scheduleSubTab.value === 'edit' && canReadGotifyConfig.value) {
      void loadGotifyChannels(true)
    }
  },
)

watch(
  () => commands.value,
  (list) => {
    if (commandPage.value > commandPageCount.value) {
      commandPage.value = commandPageCount.value
    }

    expandedCommandIds.value = expandedCommandIds.value.filter((id) =>
      list.some((command) => command.id === id),
    )
  },
)

watch(
  () => visibleActiveCommands.value.map((command) => command.id),
  (visibleIds) => {
    selectedActiveCommandIds.value = selectedActiveCommandIds.value.filter((id) => visibleIds.includes(id))
  },
  { immediate: true },
)

watch(
  () => props.canViewRcon,
  (canViewRcon) => {
    if (!canViewRcon && scheduleForm.value.commandType === 'node.rcon_command') {
      scheduleForm.value.commandType = 'node.check_update'
      scheduleForm.value.rconCommand = ''
    }
  },
)

watch(
  () => [logModal.value.show, logModal.value.command?.id, logModal.value.command?.status] as const,
  ([show]) => {
    if (!show) {
      stopLogPolling()
      commandLogs.value = []
      loadingLogs.value = false
      return
    }

    syncLogPolling()
  },
)

onBeforeUnmount(() => {
  stopPolling()
  stopLogPolling()
})
</script>

<template>
  <div class="console-wrap">
    <ConsoleMetricStrip :items="summaryItems" />

    <ConsoleSegmentedTabs v-model="agentPanelTab" :options="agentPanelTabOptions" />

    <Transition name="console-panel-switch" mode="out-in">
      <div :key="agentPanelTab" class="agent-panel-stack">
        <ConsolePanelCard v-if="agentPanelTab === 'nodes' && canViewNodesTab" title="节点管理" description="统一查看节点状态、基础信息和启停配置。">
          <template #header-extra>
            <NSpace size="small">
              <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新列表" @click="refreshAll()">
                <ConsoleRefreshIcon />
              </NButton>
              <NButton v-if="props.canManageNodes" type="primary" @click="openCreateNodeModal">新增节点</NButton>
            </NSpace>
          </template>

          <div v-if="loadingNodes && !nodes.length" class="hero-note min-h-[240px]">
            <NSpin size="large" />
          </div>

          <div v-else-if="nodes.length" class="agent-node-list">
            <article
              v-for="node in nodes"
              :key="node.id"
              class="agent-node-card"
              :class="[nodeCardStateClass(node), { 'is-active': selectedControlNodeId === node.id }]"
              @click="selectNode(node)"
            >
              <div class="agent-node-card__top">
                <div class="agent-node-card__title">
                  <strong>{{ node.name }}</strong>
                  <span>{{ node.code }}</span>
                </div>
                <NTag round :type="nodeStatusType(node.status)">
                  {{ node.status }}
                </NTag>
              </div>

              <div class="agent-node-card__meta">
                <div>
                  <span>主机</span>
                  <strong>{{ node.host || '-' }}</strong>
                </div>
                <div>
                  <span>服务器</span>
                  <strong>{{ nodeServerCount(node) }}</strong>
                </div>
                <div>
                  <span>运行中</span>
                  <strong>{{ nodeRunningCount(node) }}</strong>
                </div>
                <div>
                  <span>最近心跳</span>
                  <strong>{{ formatRelative(node.lastSeenAt) }}</strong>
                </div>
              </div>

              <div class="agent-node-card__heartbeat">
                <span>分组 {{ nodeGroupCount(node) }}</span>
                <span>版本 {{ node.agentVersion || '-' }}</span>
                <span>IP {{ node.lastIp || '-' }}</span>
                <span>主机名 {{ node.lastHeartbeat?.hostname || '-' }}</span>
                <span v-if="node.note" class="agent-node-card__note-chip">{{ node.note }}</span>
              </div>

              <div v-if="props.canManageNodes" class="agent-node-card__footer">
                <div class="agent-node-card__actions" @click.stop>
                  <NButton secondary class="console-button-tone--warning" @click="openEditNodeModal(node)">编辑</NButton>
                  <NButton secondary class="console-button-tone--warning" @click="confirmRotateKey(node)">重置令牌</NButton>
                  <div class="agent-node-card__switch">
                    <span>{{ node.isActive ? '已启用' : '已停用' }}</span>
                    <NSwitch
                      :value="node.isActive"
                      @update:value="(value) => confirmToggleNode(node, value)"
                    />
                  </div>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="hero-note min-h-[240px]">
            <div class="hero-note__inner">
              <div class="hero-note__title">暂无节点</div>
              <div class="hero-note__desc">先新增一台 Agent 节点, 然后把生成的令牌填进 `agent.yaml`</div>
            </div>
          </div>
        </ConsolePanelCard>

        <ConsolePanelCard v-else-if="agentPanelTab === 'control' && canViewControlTab" title="批量操作" description="按节点、分组和勾选服务器执行统一的批量操作。">
          <div v-if="selectedNode" class="agent-control-stack">
            <div class="agent-selected-node-banner console-panel-banner">
              <div class="console-panel-banner__copy">
                <strong>{{ selectedNode.name }}</strong>
                <span>{{ selectedNode.code }} · {{ selectedNode.host || '未填写主机地址' }}</span>
              </div>
            </div>

            <section class="agent-command-section agent-command-section--flat">
              <NForm label-placement="top" class="console-field-grid cols-2 agent-toolbar-grid">
                <NFormItem label="节点">
                  <NSelect v-model:value="selectedControlNodeId" :options="controlNodeOptions" />
                </NFormItem>
                <NFormItem label="分组">
                  <NSelect v-model:value="selectedGroup" :options="groupOptions" />
                </NFormItem>
              </NForm>

              <div class="agent-overview-grid">
                <div v-for="item in selectedNodeOverview" :key="item.label" class="agent-mini-stat">
                  <span>{{ item.label }}</span>
                  <strong>{{ item.value }}</strong>
                </div>
              </div>
            </section>

            <div class="agent-control-grid">
              <section v-if="props.canViewControlGroups" class="agent-action-section">
                <div class="agent-action-section__header">
                  <strong>分组操作</strong>
                  <span>
                    {{
                      selectedGroup === 'ALL'
                        ? '先选择一个具体分组后再执行启动、停止或重启'
                        : `当前分组: ${resolveGroupLabel(selectedGroup)}`
                    }}
                  </span>
                </div>
                <div class="agent-action-grid">
                  <NButton secondary class="console-button-tone--success" :disabled="selectedGroup === 'ALL'" @click="queueGroupAction('docker.start_group')">启动分组</NButton>
                  <NButton secondary class="console-button-tone--danger" :disabled="selectedGroup === 'ALL'" @click="queueGroupAction('docker.stop_group')">强停分组</NButton>
                  <NButton secondary class="console-button-tone--warning" :disabled="selectedGroup === 'ALL'" @click="queueGroupAction('docker.restart_group')">重启分组</NButton>
                </div>
              </section>

              <section v-if="props.canViewControlServers" class="agent-action-section">
                <div class="agent-action-section__header">
                <strong>批量操作</strong>
                  <span>
                    {{
                      selectedServers.length
                        ? `当前已勾选 ${selectedServers.length} 台服务器`
                        : '可在下面列表中勾选一台或多台服务器'
                    }}
                  </span>
                </div>
                <div class="agent-action-grid">
                  <NButton secondary class="console-button-tone--success" :disabled="!selectedServers.length" @click="queueServerAction('docker.start_server')">批量启动</NButton>
                  <NButton secondary class="console-button-tone--danger" :disabled="!selectedServers.length" @click="queueServerAction('docker.stop_server')">批量强停</NButton>
                  <NButton secondary class="console-button-tone--warning" :disabled="!selectedServers.length" @click="queueServerAction('docker.restart_server')">批量重启</NButton>
                  <NButton secondary class="console-button-tone--danger" :disabled="!selectedServers.length" @click="queueServerAction('docker.remove_server')">批量删除</NButton>
                </div>
              </section>
            </div>

            <section v-if="props.canViewControlServers" class="agent-action-section">
              <div class="agent-action-section__header">
                <strong>服务器列表</strong>
                <span>按分组筛选后直接勾选服务器, 再执行批量操作</span>
              </div>

              <div v-if="filteredServers.length" class="agent-action-grid">
                <NButton secondary class="console-button-tone--neutral-strong" @click="selectAllFilteredServers">全选当前分组</NButton>
                <NButton secondary class="console-button-tone--neutral-strong" @click="clearSelectedServers">取消勾选</NButton>
              </div>

              <div v-if="filteredServers.length" class="agent-server-list">
                <div
                  v-for="server in filteredServers"
                  :key="server.key"
                  class="agent-server-row"
                  :class="{ 'is-active': selectedServerKeys.includes(server.key) }"
                  @click="toggleServer(server.key)"
                >
                  <div class="agent-server-row__check" @click.stop>
                    <NCheckbox
                      :checked="selectedServerKeys.includes(server.key)"
                      @update:checked="(value) => toggleServer(server.key, value)"
                    />
                  </div>
                  <div class="agent-server-row__main">
                    <div class="agent-server-row__title">
                      <strong>{{ server.key }}</strong>
                      <span>{{ server.containerName || '未填写容器名' }}</span>
                    </div>
                    <div class="agent-server-row__meta">
                      <span>分组 {{ serverGroupsText(server) }}</span>
                      <span>镜像 {{ serverImageText(server) }}</span>
                    </div>
                  </div>
                  <div class="agent-server-row__side">
                    <NTag round :type="serverStateType(server)">
                      {{ serverStateText(server) }}
                    </NTag>
                  </div>
                </div>
              </div>

              <div v-else class="hero-note min-h-[180px]">
                <div class="hero-note__inner">
                  <div class="hero-note__title">当前没有可显示的服务器</div>
                  <div class="hero-note__desc">可以先切换分组或先执行一次同步容器列表</div>
                </div>
              </div>
            </section>
          </div>

          <div v-else class="hero-note min-h-[420px]">
            <div class="hero-note__inner">
              <div class="hero-note__title">请选择一个节点</div>
              <div class="hero-note__desc">先在节点管理里选中一个节点, 再回来执行批量操作</div>
            </div>
          </div>
        </ConsolePanelCard>

        <ConsolePanelCard v-else-if="agentPanelTab === 'commands' && canViewCommandPanel" title="节点操作" description="把维护命令、RCON 操作和进行中命令拆开管理，避免互相干扰。">
          <div v-if="selectedNode" class="agent-control-stack">
            <div class="agent-selected-node-banner console-panel-banner">
              <div class="console-panel-banner__copy">
                <strong>{{ selectedNode.name }}</strong>
                <span>{{ selectedNode.code }} · {{ selectedNode.host || '未填写主机地址' }}</span>
              </div>
              <NButton secondary class="console-action-icon" title="刷新数据" @click="refreshAll()">
                <ConsoleRefreshIcon />
              </NButton>
            </div>

            <div class="agent-command-sections">
              <ConsoleSegmentedTabs v-model="commandSubTab" :options="commandSubTabOptions" />

              <Transition name="console-panel-switch" mode="out-in">
                <div v-if="commandSubTab === 'actions'" key="command-actions" class="agent-panel-stack">
                  <section class="agent-command-section agent-command-section--flat">
                    <div class="agent-action-section__header">
                      <strong>维护命令</strong>
                    </div>
                    <NForm label-placement="top" class="console-field-grid cols-2 agent-toolbar-grid">
                      <NFormItem label="节点">
                        <NSelect v-model:value="selectedControlNodeId" :options="controlNodeOptions" />
                      </NFormItem>
                      <NFormItem label="快速刷新">
                        <div class="console-inline-actions">
                          <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新数据" @click="refreshAll()">
                            <ConsoleRefreshIcon />
                          </NButton>
                        </div>
                      </NFormItem>
                      <NFormItem label="崩溃检查成功后启动" class="col-span-full">
                        <NSelect
                          v-model:value="maintenanceCommandForm.startServerKeys"
                          multiple
                          clearable
                          filterable
                          max-tag-count="responsive"
                          :options="maintenanceStartServerOptions"
                          placeholder="不选则按 Agent 配置自动选择启动目标"
                        />
                      </NFormItem>
                    </NForm>
                  </section>

                  <div class="agent-maintenance-layout">
                    <div class="agent-maintenance-stack">
                      <section class="agent-command-section">
                        <div class="agent-action-section__header">
                          <strong>基础与维护</strong>
                        </div>
                        <div class="agent-action-grid">
                          <NButton secondary class="console-button-tone--neutral-strong" @click="queueNodeInstruction('agent.ping')">心跳测试</NButton>
                          <NButton secondary class="console-button-tone--neutral-strong" @click="queueNodeInstruction('docker.list_servers')">同步容器列表</NButton>
                          <NButton secondary class="console-button-tone--neutral-strong" @click="queueMaintenanceCommand('node.check_update')">检查更新</NButton>
                          <NButton secondary class="console-button-tone--danger" @click="queueNodeInstruction('node.check_validate')">验证游戏完整性</NButton>
                          <NButton secondary class="console-button-tone--danger" @click="queueNodeInstruction('node.kill_all')">强制清理容器</NButton>
                        </div>
                      </section>

                      <section class="agent-command-section">
                        <div class="agent-action-section__header">
                          <strong>版本与监控</strong>
                        </div>
                        <div class="agent-action-grid">
                          <NButton secondary class="console-button-tone--neutral-strong" @click="queueNodeInstruction('node.get_oldver')">读取当前版本</NButton>
                          <NButton secondary class="console-button-tone--neutral-strong" @click="queueNodeInstruction('node.get_nowver')">读取最新版本</NButton>
                          <NButton secondary class="console-button-tone--warning" @click="queueMaintenanceCommand('node.monitor_check')">崩溃检查</NButton>
                          <NButton secondary class="console-button-tone--success" @click="queueMaintenanceCommand('node.monitor_start')">崩溃检查后启动</NButton>
                        </div>
                      </section>
                    </div>

                    <section class="agent-command-section agent-command-section--flat agent-maintenance-notes">
                      <div class="agent-action-section__header">
                        <strong>说明</strong>
                      </div>
                      <div class="agent-maintenance-note-list">
                        <div class="agent-command-card__summary">
                          检查更新不会进行停服检查, 只有对比到版本差异才会进行更新。
                        </div>
                        <div class="agent-command-card__summary">
                          验证游戏完整性会自动停服进行修复。
                        </div>
                        <div class="agent-command-card__summary">
                          崩溃检查会自动重新创建容器进行判断一段时间内是否崩溃。
                        </div>
                      </div>
                    </section>
                  </div>
                </div>

                <div v-else-if="commandSubTab === 'rcon'" key="command-rcon" class="agent-panel-stack">
                  <section class="agent-command-section agent-command-section--flat">
                    <div class="agent-action-section__header">
                      <strong>RCON 操作</strong>
                      <span>支持按分组或按服务器下发，密码从官网服务器目录读取并透传给 Agent</span>
                    </div>
                    <NForm label-placement="top" class="console-field-grid cols-3">
                      <NFormItem label="节点">
                        <NSelect v-model:value="selectedControlNodeId" :options="controlNodeOptions" />
                      </NFormItem>
                      <NFormItem label="目标类型">
                        <NSelect
                          v-model:value="nodeCommandForm.rconTargetMode"
                          :options="[
                            { label: '按分组', value: 'group' },
                            { label: '按服务器', value: 'servers' },
                          ]"
                        />
                      </NFormItem>
                      <NFormItem label="快速刷新">
                        <div class="console-inline-actions">
                          <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新数据" @click="refreshAll()">
                            <ConsoleRefreshIcon />
                          </NButton>
                        </div>
                      </NFormItem>
                      <NFormItem v-if="nodeCommandForm.rconTargetMode === 'group'" label="目标分组">
                        <NSelect v-model:value="nodeCommandForm.rconGroup" :options="nodeInstructionGroupOptions" />
                      </NFormItem>
                      <NFormItem v-else label="目标服务器" class="col-span-full">
                        <NSelect
                          v-model:value="nodeCommandForm.rconServerKeys"
                          multiple
                          clearable
                          filterable
                          max-tag-count="responsive"
                          :options="rconServerOptions"
                          placeholder="选择一台或多台服务器"
                        />
                      </NFormItem>
                      <NFormItem
                        label="RCON 指令"
                        :class="{ 'col-span-full': nodeCommandForm.rconTargetMode === 'servers' }"
                      >
                        <NInput
                          v-model:value="nodeCommandForm.rconCommand"
                          placeholder="status"
                          @keydown.enter.prevent="queueManualRconCommand()"
                        />
                      </NFormItem>
                    </NForm>
                    <div class="agent-action-grid">
                      <NButton type="primary" @click="queueManualRconCommand()">
                        发送 RCON
                      </NButton>
                    </div>
                  </section>
                </div>

                <div v-else key="command-running" class="agent-panel-stack">
                  <section class="agent-command-section agent-command-section--flat">
                    <div class="agent-action-section__header">
                      <strong>进行中命令</strong>
                      <span>支持批量勾选、批量终止和批量强制终止当前任务</span>
                    </div>
                    <NForm label-placement="top" class="console-field-grid cols-3 agent-toolbar-grid">
                      <NFormItem label="节点筛选">
                        <NSelect v-model:value="selectedCommandNodeId" :options="commandNodeOptions" />
                      </NFormItem>
                      <NFormItem label="统计">
                        <div class="agent-command-card__summary">
                          当前筛选下共 {{ visibleActiveCommands.length }} 条待领取 / 已领取 / 运行中的命令
                        </div>
                      </NFormItem>
                      <NFormItem label="刷新">
                        <div class="console-inline-actions">
                          <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新进行中命令" @click="loadActiveCommands()">
                            <ConsoleRefreshIcon />
                          </NButton>
                        </div>
                      </NFormItem>
                    </NForm>
                    <div class="agent-command-card__actions">
                      <NButton secondary class="console-button-tone--neutral-strong" :disabled="!visibleActiveCommands.length" @click="selectAllVisibleActiveCommands()">
                        全选当前筛选
                      </NButton>
                      <NButton secondary class="console-button-tone--neutral-strong" :disabled="!selectedActiveCommandIds.length" @click="clearSelectedActiveCommands()">
                        清空选择
                      </NButton>
                      <NButton
                        secondary
                        class="console-button-tone--warning"
                        :disabled="!selectedVisibleActiveCommands.length"
                        @click="requestBatchCommandCancellation(false)"
                      >
                        批量终止 {{ selectedVisibleActiveCommands.length ? `(${selectedVisibleActiveCommands.length})` : '' }}
                      </NButton>
                      <NButton
                        secondary
                        class="console-button-tone--danger"
                        :disabled="!selectedVisibleActiveCommands.length"
                        @click="requestBatchCommandCancellation(true)"
                      >
                        批量强制终止 {{ selectedVisibleActiveCommands.length ? `(${selectedVisibleActiveCommands.length})` : '' }}
                      </NButton>
                    </div>
                  </section>

                  <div v-if="loadingActiveCommands && !visibleActiveCommands.length" class="hero-note min-h-[220px]">
                    <NSpin size="large" />
                  </div>

                  <div v-else-if="visibleActiveCommands.length" class="agent-command-list">
                    <article v-for="command in visibleActiveCommands" :key="command.id" class="fold-card agent-command-card">
                      <button
                        type="button"
                        class="fold-card__trigger agent-command-card__trigger"
                        @click="toggleCommandExpanded(command.id)"
                      >
                        <div class="fold-card__title agent-command-card__title">
                          <strong>{{ commandActionText(command.commandType) }}</strong>
                          <span>{{ command.node?.name || command.nodeId }} · {{ commandTargetText(command) }}</span>
                          <span class="agent-command-card__preview">{{ commandSummaryText(command) }}</span>
                        </div>
                        <div class="fold-card__meta agent-command-card__meta-head">
                          <NCheckbox
                            :checked="isActiveCommandSelected(command.id)"
                            @mousedown.stop
                            @click.stop
                            @update:checked="(checked) => toggleActiveCommandSelection(command.id, checked)"
                          />
                          <NTag round :type="commandStatusType(command.status)">
                            {{ command.status }}
                          </NTag>
                          <NTag
                            v-if="commandControlState(command).requestedAt"
                            round
                            :type="commandControlState(command).force ? 'error' : 'warning'"
                          >
                            {{ commandControlState(command).force ? '已请求强停' : '已请求终止' }}
                          </NTag>
                          <span class="fold-card__arrow" :class="{ 'is-open': isCommandExpanded(command.id) }">⌄</span>
                        </div>
                      </button>

                      <div v-if="isCommandExpanded(command.id)" class="fold-card__body agent-command-card__body cdk-expand-panel">
                        <div class="agent-command-card__summary">
                          {{ commandSummaryText(command) }}
                        </div>

                        <div class="agent-command-card__meta">
                          <div>
                            <span>创建时间</span>
                            <strong>{{ formatDateTime(command.createdAt) }}</strong>
                          </div>
                          <div>
                            <span>开始时间</span>
                            <strong>{{ formatDateTime(command.startedAt) }}</strong>
                          </div>
                          <div>
                            <span>下发人</span>
                            <strong>{{ command.createdBySteamId }}</strong>
                          </div>
                          <div>
                            <span>当前参数</span>
                            <strong>{{ previewValue(command.payload, '-') }}</strong>
                          </div>
                        </div>

                        <div class="agent-command-card__actions">
                          <NButton secondary @click="openCommandDetails(command)">查看详情</NButton>
                          <NButton v-if="props.canViewLogDetails" secondary @click="openLogModal(command)">查看日志</NButton>
                          <NButton secondary @click="copyText(JSON.stringify(command.payload || {}, null, 2), '命令参数')">
                            复制参数
                          </NButton>
                          <NButton
                            secondary
                            class="console-button-tone--warning"
                            :disabled="!canGracefullyCancelCommand(command)"
                            @click="requestCommandCancellation(command, false)"
                          >
                            终止
                          </NButton>
                          <NButton
                            secondary
                            class="console-button-tone--danger"
                            :disabled="!canForceCancelCommand(command)"
                            @click="requestCommandCancellation(command, true)"
                          >
                            强制终止
                          </NButton>
                        </div>
                      </div>
                    </article>
                  </div>

                  <div v-else class="hero-note min-h-[220px]">
                    <div class="hero-note__inner">
                      <div class="hero-note__title">暂无进行中命令</div>
                      <div class="hero-note__desc">新下发的批量操作、维护命令或定时命令都会显示在这里</div>
                    </div>
                  </div>
                </div>
              </Transition>
            </div>
          </div>

          <div v-else class="hero-note min-h-[320px]">
            <div class="hero-note__inner">
              <div class="hero-note__title">请选择一个节点</div>
              <div class="hero-note__desc">先在节点管理里选中一个节点, 再回来执行节点操作</div>
            </div>
          </div>
        </ConsolePanelCard>

        <ConsolePanelCard v-else-if="agentPanelTab === 'schedules' && canViewScheduleTab" title="定时任务" description="把任务编辑和任务列表拆开，创建后列表只做本地筛选，不再因为筛选请求把新任务刷没。">
          <div class="agent-panel-stack">
            <ConsoleSegmentedTabs v-model="scheduleSubTab" :options="scheduleSubTabOptions" />

            <Transition name="console-panel-switch" mode="out-in">
              <section v-if="scheduleSubTab === 'edit' && props.canEditSchedules" key="schedule-edit" class="agent-command-section agent-schedule-editor">
                <div class="agent-action-section__header">
                  <strong>{{ scheduleForm.id ? '编辑任务' : '新增任务' }}</strong>
                  <span>支持按节点配置每天、每 N 天、每 N 小时窗口等自动执行规则</span>
                </div>

                <NForm label-placement="top" class="console-field-grid cols-2">
                  <NFormItem label="任务名称">
                    <NInput v-model:value="scheduleForm.name" />
                  </NFormItem>
                  <NFormItem label="节点">
                    <NSelect v-model:value="scheduleForm.nodeId" :options="scheduleNodeOptions" />
                  </NFormItem>
                  <NFormItem label="命令类型">
                    <NSelect v-model:value="scheduleForm.commandType" :options="scheduleCommandOptions" />
                  </NFormItem>
                  <NFormItem label="执行规则">
                    <NSelect v-model:value="scheduleForm.scheduleMode" :options="scheduleModeOptions" />
                  </NFormItem>
                  <NFormItem v-if="scheduleForm.scheduleMode === 'interval_minutes'" label="分钟间隔">
                    <NInputNumber v-model:value="scheduleForm.scheduleIntervalMinutes" :min="1" :max="10080" :show-button="false" class="w-full" />
                  </NFormItem>
                  <NFormItem v-else-if="scheduleForm.scheduleMode === 'daily'" label="执行时间">
                    <NInput v-model:value="scheduleForm.scheduleTime" placeholder="03:00" />
                  </NFormItem>
                  <template v-else-if="scheduleForm.scheduleMode === 'every_n_days'">
                    <NFormItem label="每隔天数">
                      <NInputNumber v-model:value="scheduleForm.scheduleIntervalDays" :min="1" :max="365" :show-button="false" class="w-full" />
                    </NFormItem>
                    <NFormItem label="开始日期">
                      <NDatePicker v-model:value="scheduleForm.scheduleAnchorDate" type="date" :clearable="false" class="w-full" />
                    </NFormItem>
                    <NFormItem label="执行时间">
                      <NInput v-model:value="scheduleForm.scheduleTime" placeholder="03:00" />
                    </NFormItem>
                  </template>
                  <template v-else-if="scheduleForm.scheduleMode === 'every_n_hours'">
                    <NFormItem label="小时间隔">
                      <NInputNumber v-model:value="scheduleForm.scheduleIntervalHours" :min="1" :max="168" :show-button="false" class="w-full" />
                    </NFormItem>
                    <NFormItem label="开始时间">
                      <NInput v-model:value="scheduleForm.scheduleWindowStart" placeholder="00:00" />
                    </NFormItem>
                    <NFormItem label="结束时间">
                      <NInput v-model:value="scheduleForm.scheduleWindowEnd" placeholder="23:59" />
                    </NFormItem>
                  </template>
                  <NFormItem label="规则预览" class="col-span-full">
                    <div class="agent-schedule-rule-note">
                      <strong>{{ scheduleFormSummary }}</strong>
                      <span>保存后系统会自动计算下次执行时间，无需再手动填写。</span>
                    </div>
                  </NFormItem>
                  <NFormItem label="启用状态">
                    <NSwitch v-model:value="scheduleForm.isActive" />
                  </NFormItem>
                  <NFormItem label="通知渠道" class="col-span-full">
                    <NSelect
                      v-model:value="scheduleForm.notificationChannelKeys"
                      multiple
                      clearable
                      filterable
                      :options="gotifyChannelOptions"
                      placeholder="不选择则不推送 Gotify"
                    />
                  </NFormItem>
                  <NFormItem
                    v-if="commandSupportsStartTargets(scheduleForm.commandType)"
                    label="崩溃检查成功后启动"
                    class="col-span-full"
                  >
                    <NSelect
                      v-model:value="scheduleForm.startServerKeys"
                      multiple
                      clearable
                      filterable
                      max-tag-count="responsive"
                      :options="scheduleStartServerOptions"
                      placeholder="不选则按 Agent 配置自动选择启动目标"
                    />
                  </NFormItem>
                  <NFormItem
                    v-if="commandSupportsMonitorServer(scheduleForm.commandType) || commandSupportsStartTargets(scheduleForm.commandType)"
                    label="执行说明"
                    class="col-span-full"
                  >
                    <div class="agent-schedule-rule-note">
                      <strong>监控服固定使用 Agent 默认配置</strong>
                      <span>不选择启动目标时，会按 Agent YAML 里的自动启动配置执行。</span>
                    </div>
                  </NFormItem>
                  <NFormItem v-if="scheduleForm.commandType === 'node.rcon_command'" label="RCON 目标分组">
                    <NSelect v-model:value="scheduleForm.rconGroup" :options="scheduleNodeInstructionGroupOptions" />
                  </NFormItem>
                  <NFormItem v-if="scheduleForm.commandType === 'node.rcon_command'" label="RCON 指令">
                    <NInput v-model:value="scheduleForm.rconCommand" />
                  </NFormItem>
                </NForm>

                <div class="agent-action-grid">
                  <NButton secondary class="console-button-tone--neutral-strong" :loading="savingSchedule" @click="saveSchedule">
                    {{ scheduleForm.id ? '保存修改' : '创建任务' }}
                  </NButton>
                  <NButton secondary class="console-button-tone--neutral-strong" @click="resetScheduleForm">清空表单</NButton>
                </div>
              </section>

              <section v-else key="schedule-list" class="agent-command-section agent-schedule-list-panel">
                <div class="agent-selected-node-banner console-panel-banner">
                  <div class="console-panel-banner__copy">
                    <strong>任务列表</strong>
                    <span>查看节点自动执行计划，可以直接编辑、启停和删除</span>
                  </div>
                    <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新任务" @click="loadSchedules()">
                      <ConsoleRefreshIcon />
                    </NButton>
                </div>

                <NForm label-placement="top" class="console-field-grid cols-2">
                  <NFormItem label="节点筛选">
                    <NSelect v-model:value="selectedScheduleNodeId" clearable :options="[{ label: '全部节点', value: '' }, ...scheduleNodeOptions]" />
                  </NFormItem>
                  <NFormItem label="操作">
                    <div class="console-inline-control">
                      <NButton v-if="props.canEditSchedules" secondary class="console-button-tone--neutral-strong" @click="resetScheduleForm">新建任务</NButton>
                    </div>
                  </NFormItem>
                </NForm>

                <div v-if="loadingSchedules && !schedules.length" class="hero-note min-h-[220px]">
                  <NSpin size="large" />
                </div>

                <div v-else-if="visibleSchedules.length" class="agent-command-list">
                  <article v-for="schedule in visibleSchedules" :key="schedule.id" class="fold-card agent-command-card">
                    <button
                      type="button"
                      class="fold-card__trigger agent-command-card__trigger"
                      @click="toggleScheduleExpanded(schedule.id)"
                    >
                      <div class="fold-card__title agent-command-card__title">
                        <strong>{{ schedule.name }}</strong>
                        <span>{{ schedule.node?.name || schedule.nodeId }} · {{ commandActionText(schedule.commandType) }}</span>
                        <span class="agent-command-card__preview">{{ schedule.scheduleSummary || `每 ${formatIntervalMinutes(schedule.intervalMinutes)} 执行一次` }} · 下次 {{ formatDateTime(schedule.nextRunAt) }}</span>
                      </div>
                      <div class="fold-card__meta agent-command-card__meta-head">
                        <NTag round :type="schedule.isActive ? 'success' : 'default'">
                          {{ schedule.isActive ? '已启用' : '已停用' }}
                        </NTag>
                        <span class="fold-card__arrow" :class="{ 'is-open': isScheduleExpanded(schedule.id) }">⌄</span>
                      </div>
                    </button>

                    <div v-if="isScheduleExpanded(schedule.id)" class="fold-card__body agent-command-card__body cdk-expand-panel">
                      <div class="agent-command-card__meta">
                        <div>
                          <span>下次执行</span>
                          <strong>{{ formatDateTime(schedule.nextRunAt) }}</strong>
                        </div>
                        <div>
                          <span>最近下发</span>
                          <strong>{{ formatDateTime(schedule.lastQueuedAt) }}</strong>
                        </div>
                        <div>
                          <span>最近命令</span>
                          <strong>{{ schedule.lastCommandId || '-' }}</strong>
                        </div>
                        <div>
                          <span>创建人</span>
                          <strong>{{ schedule.createdBySteamId }}</strong>
                        </div>
                      </div>

                      <div class="agent-command-card__summary">
                        通知渠道:
                        {{
                          schedule.notificationChannelKeys?.length
                            ? resolveGotifyChannelNames(schedule.notificationChannelKeys).join(' / ')
                            : '不推送'
                        }}
                      </div>

                      <div class="agent-command-card__summary">
                        执行规则: {{ schedule.scheduleSummary || `每 ${formatIntervalMinutes(schedule.intervalMinutes)} 执行一次` }}
                      </div>

                      <div v-if="Object.keys(schedule.payload || {}).length" class="agent-command-card__summary">
                        {{ JSON.stringify(schedule.payload || {}, null, 2) }}
                      </div>

                      <div class="agent-command-card__actions">
                        <NButton v-if="props.canEditSchedules" secondary class="console-button-tone--neutral-strong" @click="fillScheduleForm(schedule)">载入编辑</NButton>
                        <NButton v-if="props.canEditSchedules" secondary class="console-button-tone--neutral-strong" @click="confirmToggleSchedule(schedule, !schedule.isActive)">
                          {{ schedule.isActive ? '停用' : '启用' }}
                        </NButton>
                        <NButton v-if="props.canEditSchedules" secondary class="console-button-tone--danger" @click="confirmDeleteSchedule(schedule)">删除</NButton>
                      </div>
                    </div>
                  </article>
                </div>

                <div v-else class="hero-note min-h-[220px]">
                  <div class="hero-note__inner">
                    <div class="hero-note__title">暂无定时任务</div>
                    <div class="hero-note__desc">
                      {{ selectedScheduleNodeId ? '当前节点下还没有任务，切到“编辑任务”即可新增。' : '创建后会按设定时间自动为节点下发维护命令。' }}
                    </div>
                  </div>
                </div>
              </section>
            </Transition>
          </div>
        </ConsolePanelCard>

        <GotifyNotificationPanel
          v-else-if="agentPanelTab === 'notifications' && canViewNotificationsTab"
          :active="agentPanelTab === 'notifications'"
          :can-create="props.canCreateNotifications"
          :can-manage="props.canManageNotifications"
          :can-test="props.canTestNotifications"
          @updated="handleGotifyConfigUpdated"
        />

        <ConsolePanelCard v-else-if="canViewLogsTab" title="日志管理" description="统一查看命令历史、结果摘要与执行日志。">
          <div class="console-subsection agent-log-filter-panel">
            <NForm label-placement="top" class="console-field-grid cols-3">
              <NFormItem label="节点筛选">
                <NSelect v-model:value="selectedCommandNodeId" :options="commandNodeOptions" />
              </NFormItem>
              <NFormItem label="状态筛选">
                <NSelect v-model:value="selectedCommandStatus" :options="commandStatusOptions" />
              </NFormItem>
              <NFormItem label="显示数量">
                <div class="console-inline-control">
                  <NInputNumber v-model:value="commandLimit" :min="10" :max="100" :show-button="false" class="w-full" />
                  <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新日志" @click="refreshAll()">
                    <ConsoleRefreshIcon />
                  </NButton>
                </div>
              </NFormItem>
            </NForm>
          </div>

          <div v-if="loadingCommands && !commands.length" class="hero-note min-h-[240px]">
            <NSpin size="large" />
          </div>

          <template v-else-if="commands.length">
            <div class="console-subsection agent-log-history-panel">
              <div class="agent-command-list">
                <article v-for="command in pagedCommands" :key="command.id" class="fold-card agent-command-card">
                  <button
                    type="button"
                    class="fold-card__trigger agent-command-card__trigger"
                    @click="toggleCommandExpanded(command.id)"
                  >
                    <div class="fold-card__title agent-command-card__title">
                      <strong>{{ commandActionText(command.commandType) }}</strong>
                      <span>{{ command.node?.name || command.nodeId }} · {{ commandTargetText(command) }}</span>
                      <span class="agent-command-card__preview">{{ commandSummaryText(command) }}</span>
                    </div>
                    <div class="fold-card__meta agent-command-card__meta-head">
                      <NTag round :type="commandStatusType(command.status)">
                        {{ command.status }}
                      </NTag>
                      <span class="fold-card__arrow" :class="{ 'is-open': isCommandExpanded(command.id) }">⌄</span>
                    </div>
                  </button>

                  <div v-if="isCommandExpanded(command.id)" class="fold-card__body agent-command-card__body cdk-expand-panel">
                    <div class="agent-command-card__summary">
                      {{ commandSummaryText(command) }}
                    </div>

                    <div class="agent-command-card__meta">
                      <div>
                        <span>创建时间</span>
                        <strong>{{ formatDateTime(command.createdAt) }}</strong>
                      </div>
                      <div>
                        <span>开始时间</span>
                        <strong>{{ formatDateTime(command.startedAt) }}</strong>
                      </div>
                      <div>
                        <span>结束时间</span>
                        <strong>{{ formatDateTime(command.finishedAt) }}</strong>
                      </div>
                      <div>
                        <span>下发人</span>
                        <strong>{{ command.createdBySteamId }}</strong>
                      </div>
                    </div>

                    <div class="agent-command-card__actions">
                      <NButton secondary @click="openCommandDetails(command)">查看详情</NButton>
                      <NButton v-if="props.canViewLogDetails" secondary @click="openLogModal(command)">查看日志</NButton>
                      <NButton secondary @click="copyText(JSON.stringify(command.result || command.payload || {}, null, 2), '命令详情')">
                        复制结果
                      </NButton>
                    </div>
                  </div>
                </article>
              </div>

              <div v-if="commandPageCount > 1" class="table-pagination">
                <NPagination
                  :page="commandPage"
                  :page-count="commandPageCount"
                  :page-slot="7"
                  @update:page="setCommandPage"
                />
              </div>
            </div>
          </template>

          <div v-else class="hero-note min-h-[240px]">
            <div class="hero-note__inner">
              <div class="hero-note__title">暂无命令</div>
              <div class="hero-note__desc">切到批量操作执行命令后, 这里就会显示记录</div>
            </div>
          </div>
        </ConsolePanelCard>
      </div>
    </Transition>

    <NModal
      v-model:show="nodeModal.show"
      preset="card"
      :title="nodeModal.mode === 'create' ? '新增节点' : '编辑节点'"
      class="max-w-[640px]"
    >
      <NForm label-placement="top" class="console-field-grid cols-2">
        <NFormItem label="节点编码">
          <NInput v-model:value="nodeModal.code" placeholder="ca-practice-01" />
        </NFormItem>
        <NFormItem label="节点名称">
          <NInput v-model:value="nodeModal.name" placeholder="加拿大练习服 01" />
        </NFormItem>
        <NFormItem label="主机地址">
          <NInput v-model:value="nodeModal.host" placeholder="38.14.212.47" />
        </NFormItem>
        <NFormItem label="接入状态">
          <NSwitch v-model:value="nodeModal.isActive" />
        </NFormItem>
        <NFormItem label="备注" class="col-span-full">
          <NInput
            v-model:value="nodeModal.note"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="可填写这台机器的用途或线路说明"
          />
        </NFormItem>
      </NForm>

      <NSpace justify="end">
        <NButton @click="nodeModal.show = false">取消</NButton>
        <NButton type="primary" :loading="savingNode" @click="submitNodeModal">
          {{ nodeModal.mode === 'create' ? '创建节点' : '保存修改' }}
        </NButton>
      </NSpace>
    </NModal>

    <NModal v-model:show="issuedKeyModal.show" preset="card" :title="issuedKeyModal.title" class="max-w-[680px]">
      <div class="agent-issued-key">
        <div class="agent-issued-key__title">{{ issuedKeyModal.nodeName }}</div>
        <div class="agent-issued-key__desc">这个令牌只会在这里明文显示一次, 请立即写入 Agent 配置</div>
        <pre class="agent-issued-key__code">{{ issuedKeyModal.apiKey }}</pre>
      </div>

      <NSpace justify="end" class="agent-issued-key__actions">
        <NButton secondary @click="copyText(issuedKeyModal.apiKey, 'Agent 令牌')">复制令牌</NButton>
        <NButton type="primary" @click="issuedKeyModal.show = false">我知道了</NButton>
      </NSpace>
    </NModal>

    <NModal
      v-model:show="commandDetailModal.show"
      preset="card"
      :title="commandDetailModal.command ? `${commandActionText(commandDetailModal.command.commandType)}详情` : '命令详情'"
      class="max-w-[900px]"
    >
      <template v-if="commandDetailModal.command">
        <div class="agent-detail-stack">
          <div class="detail-grid">
            <div class="detail-tile">
              <div class="detail-tile__label">节点</div>
              <div class="detail-tile__value">{{ commandDetailModal.command.node?.name || commandDetailModal.command.nodeId }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">目标</div>
              <div class="detail-tile__value">{{ commandTargetText(commandDetailModal.command) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">状态</div>
              <div class="detail-tile__value">{{ commandDetailModal.command.status }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">创建时间</div>
              <div class="detail-tile__value">{{ formatDateTime(commandDetailModal.command.createdAt) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">开始时间</div>
              <div class="detail-tile__value">{{ formatDateTime(commandDetailModal.command.startedAt) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">结束时间</div>
              <div class="detail-tile__value">{{ formatDateTime(commandDetailModal.command.finishedAt) }}</div>
            </div>
          </div>

          <section class="agent-detail-section">
            <div class="agent-detail-section__title">执行摘要</div>
            <div class="agent-detail-section__body">{{ commandSummaryText(commandDetailModal.command) }}</div>
          </section>

          <section
            v-if="commandDetailModal.command.commandType === 'docker.list_servers' && resultServerList(commandDetailModal.command).length"
            class="agent-detail-section"
          >
            <div class="agent-detail-section__title">同步到的服务器</div>
            <div class="agent-detail-server-list">
              <div
                v-for="server in resultServerList(commandDetailModal.command)"
                :key="server.key"
                class="agent-detail-server-item"
              >
                <div class="agent-detail-server-item__top">
                  <strong>{{ server.key }}</strong>
                  <NTag round :type="serverStateType(server)">{{ serverStateText(server) }}</NTag>
                </div>
                <div class="agent-detail-server-item__meta">
                  <span>{{ server.containerName || '未填写容器名' }}</span>
                  <span>{{ serverGroupsText(server) }}</span>
                </div>
              </div>
            </div>
          </section>

          <section v-if="resultGroupRows(commandDetailModal.command).length" class="agent-detail-section">
            <div class="agent-detail-section__title">批量执行结果</div>
            <div class="agent-detail-server-list">
              <div
                v-for="(row, index) in resultGroupRows(commandDetailModal.command)"
                :key="`${commandDetailModal.command.id}-${index}`"
                class="agent-detail-server-item"
              >
                <div class="agent-detail-server-item__top">
                  <strong>{{ String(row.server?.key || row.server?.containerName || `结果 ${index + 1}`) }}</strong>
                  <NTag round :type="row.changed ? 'success' : 'default'">
                    {{ row.changed ? '已变更' : '无变化' }}
                  </NTag>
                </div>
                <div class="agent-detail-server-item__meta">
                  <span>{{ String(row.message || '-') }}</span>
                  <span>{{ String(row.server?.containerName || row.server?.status || '-') }}</span>
                </div>
              </div>
            </div>
          </section>

          <section v-if="resultSingleServer(commandDetailModal.command)" class="agent-detail-section">
            <div class="agent-detail-section__title">服务器结果</div>
            <div class="detail-grid">
              <div class="detail-tile">
                <div class="detail-tile__label">服务器</div>
                <div class="detail-tile__value">{{ resultSingleServer(commandDetailModal.command)?.key || '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">容器名</div>
                <div class="detail-tile__value">{{ resultSingleServer(commandDetailModal.command)?.containerName || '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">状态</div>
                <div class="detail-tile__value">
                  {{
                    resultSingleServer(commandDetailModal.command)
                      ? serverStateText(resultSingleServer(commandDetailModal.command)!)
                      : '-'
                  }}
                </div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">分组</div>
                <div class="detail-tile__value">
                  {{
                    resultSingleServer(commandDetailModal.command)
                      ? serverGroupsText(resultSingleServer(commandDetailModal.command)!)
                      : '-'
                  }}
                </div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">主端口</div>
                <div class="detail-tile__value">{{ resultSingleServer(commandDetailModal.command)?.primaryPort ?? '-' }}</div>
              </div>
              <div class="detail-tile">
                <div class="detail-tile__label">重启次数</div>
                <div class="detail-tile__value">{{ resultSingleServer(commandDetailModal.command)?.restartCount ?? '-' }}</div>
              </div>
            </div>
          </section>

          <section class="agent-detail-section">
            <div class="agent-detail-section__title">原始数据</div>
            <pre class="agent-issued-key__code">{{ JSON.stringify(commandDetailModal.command.result || commandDetailModal.command.payload || {}, null, 2) }}</pre>
          </section>
        </div>
      </template>
    </NModal>

    <NModal
      v-model:show="logModal.show"
      preset="card"
      :title="logModal.command ? `${commandActionText(logModal.command.commandType)}日志` : '命令日志'"
      class="max-w-[880px]"
    >
      <template v-if="logModal.command">
        <div class="agent-detail-stack">
          <div class="detail-grid">
            <div class="detail-tile">
              <div class="detail-tile__label">节点</div>
              <div class="detail-tile__value">{{ logModal.command.node?.name || logModal.command.nodeId }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">目标</div>
              <div class="detail-tile__value">{{ commandTargetText(logModal.command) }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">状态</div>
              <div class="detail-tile__value">{{ logModal.command.status }}</div>
            </div>
            <div class="detail-tile">
              <div class="detail-tile__label">日期</div>
              <div class="detail-tile__value">{{ formatDate(logModal.command.updatedAt) }}</div>
            </div>
          </div>

          <div class="agent-log-toolbar">
            <div class="agent-log-toolbar__status">
              <span class="agent-log-toolbar__dot" :class="{ 'is-live': isLogModalLive }" />
              <span>{{ logModalHint }}</span>
              <span v-if="commandLogs.length">共 {{ commandLogs.length }} 行</span>
            </div>
            <div class="agent-log-toolbar__actions">
              <NButton
                v-if="logModal.command && props.canViewRunningCommands"
                secondary
                class="console-button-tone--warning"
                :disabled="!canGracefullyCancelCommand(logModal.command)"
                @click="requestCommandCancellation(logModal.command, false)"
              >
                终止
              </NButton>
              <NButton
                v-if="logModal.command && props.canViewRunningCommands"
                secondary
                class="console-button-tone--danger"
                :disabled="!canForceCancelCommand(logModal.command)"
                @click="requestCommandCancellation(logModal.command, true)"
              >
                强制终止
              </NButton>
              <NButton secondary class="console-action-icon console-button-tone--neutral-strong" title="刷新日志" @click="refreshLogModal()">
                <ConsoleRefreshIcon />
              </NButton>
            </div>
          </div>

          <div v-if="loadingLogs" class="hero-note min-h-[240px]">
            <NSpin size="large" />
          </div>

          <div v-else-if="commandLogs.length" ref="logListRef" class="agent-log-terminal">
            <pre class="agent-log-terminal__body">{{ logTerminalText }}</pre>
          </div>

          <div v-else class="hero-note min-h-[240px]">
            <div class="hero-note__inner">
              <div class="hero-note__title">暂无日志</div>
              <div class="hero-note__desc">这条命令目前还没有回传执行日志</div>
            </div>
          </div>
        </div>
      </template>
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
.agent-panel-stack {
  display: grid;
  gap: 18px;
}

.agent-summary-grid,
.agent-overview-grid {
  display: grid;
  gap: 14px;
}

.agent-summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.agent-overview-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.agent-summary-card,
.agent-mini-stat {
  min-height: 104px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  text-align: center;
}

.agent-summary-card :deep(.n-card__content) {
  min-height: 104px;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 8px;
  text-align: center;
}

.agent-summary-card__label {
  font-size: 12px;
  color: var(--app-text-muted);
}

.agent-summary-card__value {
  font-size: 28px;
  font-weight: 800;
  color: var(--app-text);
  line-height: 1;
}

.agent-node-list,
.agent-command-list,
.agent-log-list,
.agent-detail-stack {
  display: grid;
  gap: 10px;
}

.agent-command-sections {
  display: grid;
  gap: 16px;
}

.agent-control-grid,
.agent-toolbar-grid,
.agent-maintenance-layout,
.agent-maintenance-stack,
.agent-maintenance-note-list {
  display: grid;
  gap: 14px;
}

.agent-node-card,
.agent-command-card,
.agent-log-item,
.agent-mini-stat,
.agent-detail-section,
.agent-detail-server-item {
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.014);
}

.agent-log-filter-panel,
.agent-log-history-panel {
  gap: 14px;
}

.agent-log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.agent-log-toolbar__status {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  color: var(--app-text-muted);
  font-size: 12px;
}

.agent-log-toolbar__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.agent-log-toolbar__dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.22);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06);
  flex: none;
}

.agent-log-toolbar__dot.is-live {
  background: rgb(99, 226, 182);
  box-shadow: 0 0 0 4px rgba(99, 226, 182, 0.14);
}

.agent-command-section {
  display: grid;
  gap: 14px;
  padding: 0;
  border: 0;
  background: transparent;
}

.agent-command-section--flat {
  background: transparent;
}

.agent-detail-section {
  display: grid;
  gap: 12px;
  padding: var(--app-console-surface-pad-y-lg) var(--app-console-surface-pad-x);
}

.agent-node-card {
  --agent-node-border: var(--app-border-soft);
  --agent-node-border-hover: var(--app-console-hover-border);
  --agent-node-border-active: rgba(255, 255, 255, 0.16);
  --agent-node-ring-rgb: 236, 240, 246;
  display: grid;
  gap: 12px;
  padding: calc(var(--app-console-surface-pad-y-lg) + 2px) var(--app-console-surface-pad-x) var(--app-console-surface-pad-y-lg);
  border-color: var(--agent-node-border);
  cursor: pointer;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease, background-color 0.2s ease;
}

.agent-node-card.is-online {
  --agent-node-border: var(--app-button-primary-border);
  --agent-node-border-hover: var(--app-button-primary-border-hover);
  --agent-node-border-active: var(--app-button-primary-border-active);
  --agent-node-ring-rgb: var(--app-button-primary-rgb);
}

.agent-node-card.is-offline {
  --agent-node-border: var(--app-button-danger-border);
  --agent-node-border-hover: var(--app-button-danger-border-hover);
  --agent-node-border-active: var(--app-button-danger-border-active);
  --agent-node-ring-rgb: var(--app-button-danger-rgb);
}

.agent-node-card.is-disabled {
  --agent-node-border: var(--app-button-neutral-border);
  --agent-node-border-hover: var(--app-button-neutral-border-hover);
  --agent-node-border-active: var(--app-button-neutral-border-active);
}

.agent-node-card:hover {
  border-color: var(--agent-node-border-hover);
  background: rgba(255, 255, 255, 0.02);
}

.agent-server-row:hover {
  border-color: rgba(99, 226, 182, 0.18);
  background: rgba(255, 255, 255, 0.02);
}

.agent-node-card.is-active {
  border-color: var(--agent-node-border-active);
  background: rgba(255, 255, 255, 0.02);
  box-shadow: inset 0 0 0 1px rgba(var(--agent-node-ring-rgb), 0.12);
}

.agent-server-row.is-active {
  border-color: rgba(99, 226, 182, 0.28);
  background: rgba(99, 226, 182, 0.05);
  box-shadow: none;
}

.agent-node-card__top,
.agent-log-item__meta,
.agent-server-row,
.agent-detail-server-item__top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-node-card__title,
.agent-command-card__title,
.agent-server-row__title {
  display: grid;
  gap: 4px;
}

.agent-node-card__title strong,
.agent-command-card__title strong,
.agent-server-row__title strong,
.agent-detail-server-item__top strong {
  font-size: 16px;
  color: var(--app-text);
}

.agent-node-card__title span,
.agent-command-card__title span,
.agent-server-row__title span {
  font-size: 12px;
  color: var(--app-text-muted);
}

.agent-node-card__meta,
.agent-command-card__meta,
.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.agent-node-card__meta,
.agent-command-card__meta {
  margin-top: 0;
}

.agent-node-card__meta {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 0;
}

.agent-node-card__meta > div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 8px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.agent-node-card__meta span,
.agent-node-card__heartbeat span,
.agent-command-card__meta span,
.agent-log-item__meta span,
.agent-mini-stat span,
.detail-tile__label,
.agent-action-section__header span,
.agent-server-row__meta span,
.agent-detail-server-item__meta span {
  font-size: 12px;
  color: var(--app-text-muted);
}

.agent-node-card__meta strong,
.agent-command-card__meta strong,
.agent-mini-stat strong,
.detail-tile__value {
  display: block;
  margin-top: 4px;
  font-size: 13px;
  color: var(--app-text);
  line-height: 1.5;
  word-break: break-word;
}

.agent-node-card__heartbeat {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin-top: 0;
}

.agent-node-card__footer {
  display: grid;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.agent-node-card__note-chip {
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(99, 226, 182, 0.08);
  border: 1px solid rgba(99, 226, 182, 0.14);
  color: var(--app-text-soft);
}

.agent-node-card__actions,
.agent-command-card__actions,
.agent-action-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.agent-action-grid :deep(.n-button) {
  min-width: 124px;
}

.agent-node-card__actions,
.agent-command-card__actions {
  margin-top: 0;
}

.agent-node-card__actions {
  justify-content: flex-end;
  align-items: center;
}

.agent-node-card__switch {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--app-text-soft);
  font-size: 13px;
}

.agent-control-stack,
.agent-action-section {
  display: grid;
  gap: 14px;
}

.agent-maintenance-notes {
  align-content: start;
}

.agent-control-stack > .agent-action-section {
  padding: 18px 0 0;
  border-radius: 0;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: transparent;
}

.agent-control-stack > .agent-action-section:first-of-type {
  padding-top: 0;
  border-top: 0;
}

.agent-selected-node-banner {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.agent-action-section__header {
  display: grid;
  gap: 8px;
  padding-bottom: 0;
}

.agent-action-section__header strong {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--app-text);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.agent-detail-section__title {
  color: var(--app-text);
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.agent-server-list,
.agent-detail-server-list {
  display: grid;
  gap: 10px;
}

.agent-server-row {
  width: 100%;
  padding: 12px 13px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: var(--app-panel-bg-soft);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 12px;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.agent-server-row__check {
  padding-top: 2px;
}

.agent-server-row__main,
.agent-detail-server-item__meta {
  display: grid;
  gap: 7px;
}

.agent-server-row__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}

.agent-server-row__side {
  flex: none;
}

.agent-command-card {
  overflow: hidden;
}

.agent-log-terminal {
  max-height: 440px;
  overflow: auto;
  padding: 12px;
  border: 1px solid rgba(81, 96, 122, 0.42);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(17, 23, 37, 0.96), rgba(10, 14, 24, 0.98)),
    radial-gradient(circle at top, rgba(99, 226, 182, 0.08), transparent 42%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.agent-log-terminal__body {
  margin: 0;
  min-height: 100%;
  color: #e9eef7;
  font-size: 12px;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Cascadia Mono', 'Consolas', 'SFMono-Regular', monospace;
}

.agent-command-card__summary,
.agent-detail-section__body {
  min-height: var(--app-console-summary-min-height);
  display: grid;
  align-content: center;
  padding: var(--app-console-surface-pad-y) var(--app-console-surface-pad-x) var(--app-console-surface-pad-y) calc(var(--app-console-surface-pad-x) + 2px);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-left: 2px solid rgba(99, 226, 182, 0.16);
  color: var(--app-text);
  font-size: 13px;
  line-height: 1.7;
  box-sizing: border-box;
  overflow-wrap: anywhere;
}

.agent-mini-stat {
  padding: var(--app-console-surface-pad-y) var(--app-console-surface-pad-x);
  min-height: 78px;
}

.agent-mini-stat strong {
  margin-top: 0;
  font-size: 24px;
}

.agent-command-card__trigger {
  width: 100%;
  align-items: flex-start;
  padding: 12px 14px;
}

.agent-command-card__meta-head {
  align-items: center;
}

.agent-command-card__body {
  display: grid;
  gap: 14px;
}

.agent-command-card__preview {
  display: -webkit-box;
  overflow: hidden;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.agent-command-card__actions {
  margin-top: 0;
}

.detail-tile,
.agent-detail-server-item {
  padding: var(--app-console-surface-pad-y) var(--app-console-surface-pad-x);
}

.agent-issued-key__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--app-text);
}

.agent-issued-key__desc {
  margin-top: 8px;
  color: var(--app-text-muted);
  font-size: 13px;
}

.agent-issued-key__actions {
  margin-top: 14px;
}

.agent-issued-key__code,
.agent-log-item__message {
  margin: 14px 0 0;
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  padding: var(--app-console-surface-pad-y) var(--app-console-surface-pad-x);
  color: var(--app-text);
  font-size: 12px;
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-log-item__message {
  margin-top: 10px;
  background: rgba(5, 8, 15, 0.68);
  border-color: rgba(81, 96, 122, 0.28);
  font-family: 'Cascadia Mono', 'Consolas', 'SFMono-Regular', monospace;
  color: #e9eef7;
}

.agent-log-item {
  padding: 10px 12px;
  border-color: rgba(81, 96, 122, 0.28);
  background: rgba(255, 255, 255, 0.02);
}

.agent-node-list {
  gap: 12px;
}

.agent-command-section {
  padding: 18px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.agent-command-sections > .agent-command-section:first-child {
  padding-top: 0;
  border-top: 0;
}

.agent-schedule-list-panel .agent-command-card__summary {
  white-space: pre-wrap;
  word-break: break-word;
}

.agent-schedule-rule-note {
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 14px 16px;
  border: 1px solid var(--app-border-soft);
  border-radius: var(--app-radius-md);
  background: rgba(255, 255, 255, 0.014);
}

.agent-schedule-rule-note strong {
  font-size: 14px;
  color: var(--app-text);
}

.agent-schedule-rule-note span {
  font-size: 12px;
  color: var(--app-text-muted);
}

@media (max-width: 1200px) {
  .agent-summary-grid,
  .agent-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (min-width: 769px) {
  .console-field-grid.cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .console-field-grid.cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .col-span-full {
    grid-column: 1 / -1;
  }

  .agent-control-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
  }

  .agent-maintenance-layout {
    grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
    align-items: start;
  }

  .agent-server-list {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    align-items: stretch;
  }

}

@media (max-width: 768px) {
  .agent-summary-grid,
  .agent-overview-grid,
  .agent-node-card__meta,
  .agent-command-card__meta,
  .detail-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .agent-panel-stack,
  .agent-control-stack,
  .agent-action-section,
  .agent-command-sections {
    gap: 12px;
  }

  .agent-summary-card,
  .agent-summary-card :deep(.n-card__content),
  .agent-mini-stat {
    min-height: 74px;
  }

  .agent-summary-card :deep(.n-card__content) {
    gap: 6px;
  }

  .agent-summary-card__value,
  .agent-mini-stat strong {
    font-size: 22px;
  }

  .agent-node-card,
  .agent-log-item,
  .agent-detail-section,
  .agent-detail-server-item,
  .agent-server-row,
  .agent-mini-stat {
    padding: var(--app-console-surface-pad-y) var(--app-console-surface-pad-x);
  }

  .agent-node-card__meta > div {
    padding: 8px 10px;
  }

  .agent-node-card__actions,
  .agent-command-card__actions,
  .agent-action-grid,
  .agent-log-toolbar,
  .agent-log-item__meta,
  .agent-selected-node-banner {
    flex-direction: column;
  }

  .agent-node-card__actions {
    align-items: stretch;
  }

  .agent-action-grid :deep(.n-button) {
    width: 100%;
    min-width: 0;
  }

  .agent-server-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
  }

  .agent-node-card__switch {
    margin-left: 0;
    justify-content: space-between;
    width: 100%;
  }

  .agent-server-row__side {
    align-self: flex-start;
  }
}
</style>
