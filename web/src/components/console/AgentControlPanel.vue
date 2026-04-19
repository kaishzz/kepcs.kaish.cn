<script setup lang="ts">
import dayjs from 'dayjs'
import {
  NButton,
  NCard,
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
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import { http } from '../../lib/api'
import { CONSOLE_API_BASE } from '../../lib/console'
import { pushToast } from '../../lib/toast'
import GotifyNotificationPanel from './GotifyNotificationPanel.vue'
import ConsoleMetricStrip from './ConsoleMetricStrip.vue'
import ConsolePanelCard from './ConsolePanelCard.vue'
import ConsoleSegmentedTabs from './ConsoleSegmentedTabs.vue'
import type {
  GotifyChannelItem,
  GotifyConfig,
  ManagedNodeHeartbeatServerItem,
  ManagedNodeItem,
  NodeCommandItem,
  NodeCommandLogItem,
  NodeCommandScheduleItem,
  NodeCommandStatus,
} from '../../types'

const props = withDefaults(defineProps<{
  active: boolean
  canViewNodes?: boolean
  canViewControl?: boolean
  canViewCommands?: boolean
  canViewSchedules?: boolean
  canViewLogs?: boolean
}>(), {
  canViewNodes: true,
  canViewControl: true,
  canViewCommands: true,
  canViewSchedules: true,
  canViewLogs: true,
})

type NodeFormMode = 'create' | 'edit'
type CommandStatusFilter = 'ALL' | NodeCommandStatus
type RconTargetMode = 'group' | 'servers'
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
  | 'node.check_update_monitor'
  | 'node.check_update_start'
  | 'node.get_oldver'
  | 'node.get_nowver'
  | 'node.monitor_check'
  | 'node.monitor_start'

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
const commandLogs = ref<NodeCommandLogItem[]>([])
const schedules = ref<NodeCommandScheduleItem[]>([])
const loadingNodes = ref(false)
const loadingCommands = ref(false)
const loadingLogs = ref(false)
const loadingSchedules = ref(false)
const savingNode = ref(false)
const savingSchedule = ref(false)
const agentPanelTab = ref<'nodes' | 'control' | 'commands' | 'schedules' | 'notifications' | 'logs'>('nodes')
const selectedControlNodeId = ref('')
const selectedCommandNodeId = ref('')
const selectedScheduleNodeId = ref('')
const selectedGroup = ref('ALL')
const selectedServerKeys = ref<string[]>([])
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

const gotifyChannels = ref<GotifyChannelItem[]>([])

const scheduleForm = ref({
  id: '',
  name: '',
  nodeId: '',
  commandType: 'node.check_update' as NodeActionType,
  intervalMinutes: 60,
  nextRunAt: Date.now() + 60 * 60 * 1000,
  isActive: true,
  notificationChannelKeys: [] as string[],
  rconGroup: 'ALL',
  rconCommand: '',
})

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
let pollTimer: ReturnType<typeof setInterval> | null = null
const LOGICAL_GROUPS = ['all', 'xl', 'pt', 'ks'] as const

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
  { label: '检查更新', value: 'node.check_update' },
  { label: '验证更新', value: 'node.check_validate' },
  { label: '更新并监控', value: 'node.check_update_monitor' },
  { label: '更新成功后启动', value: 'node.check_update_start' },
  { label: '读取当前版本', value: 'node.get_oldver' },
  { label: '读取最新版本', value: 'node.get_nowver' },
  { label: '监控检查', value: 'node.monitor_check' },
  { label: '监控成功后启动', value: 'node.monitor_start' },
  { label: 'RCON 指令', value: 'node.rcon_command' },
]

const firstAvailableAgentTab = computed(() => {
  if (props.canViewNodes) return 'nodes'
  if (props.canViewControl) return 'control'
  if (props.canViewCommands) return 'commands'
  if (props.canViewSchedules) return 'schedules'
  return 'logs'
})

const agentPanelTabOptions = computed(() =>
  [
    props.canViewNodes ? { label: '节点管理', value: 'nodes' } : null,
    props.canViewControl ? { label: '批量操作', value: 'control' } : null,
    props.canViewCommands ? { label: '节点操作', value: 'commands' } : null,
    props.canViewSchedules ? { label: '定时任务', value: 'schedules' } : null,
    props.canViewSchedules ? { label: '通知管理', value: 'notifications' } : null,
    props.canViewLogs ? { label: '日志管理', value: 'logs' } : null,
  ].filter(Boolean) as Array<{ label: string, value: typeof agentPanelTab.value }>,
)

const selectedNode = computed(() =>
  nodes.value.find((node) => node.id === selectedControlNodeId.value) || null,
)

const selectedNodeServers = computed<ManagedNodeHeartbeatServerItem[]>(() => {
  const servers = selectedNode.value?.lastHeartbeat?.servers
  return Array.isArray(servers) ? servers : []
})

const selectedNodeGroups = computed(() => {
  const values = new Set<string>()
  selectedNodeServers.value.forEach((server) => {
    ;(server.groups || []).forEach((group) => {
      const safeGroup = String(group || '').trim()
      if (safeGroup && LOGICAL_GROUPS.includes(safeGroup as typeof LOGICAL_GROUPS[number])) {
        values.add(safeGroup)
      }
    })
  })

  return Array.from(values).sort((left, right) => left.localeCompare(right, 'zh-CN'))
})

const groupOptions = computed(() => [
  { label: '全部分组', value: 'ALL' },
  ...selectedNodeGroups.value.map((group) => ({
    label: resolveGroupLabel(group),
    value: group,
  })),
])

const rconServerOptions = computed(() =>
  selectedNodeServers.value.map((server) => ({
    label: `${server.key} · ${server.containerName || '未填写容器名'}`,
    value: server.key,
  })),
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

const summaryItems = computed(() => {
  const total = nodes.value.length
  const online = nodes.value.filter((item) => item.status === 'ONLINE').length
  const disabled = nodes.value.filter((item) => item.status === 'DISABLED').length
  const pendingCommands = commands.value.filter((item) =>
    ['PENDING', 'CLAIMED', 'RUNNING'].includes(item.status),
  ).length

  return [
    { label: '节点总数', value: total },
    { label: '在线节点', value: online },
    { label: '停用节点', value: disabled },
    { label: '进行中命令', value: pendingCommands },
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

function serverGroupsText(server: ManagedNodeHeartbeatServerItem) {
  const groups = (server.groups || []).filter((group) =>
    LOGICAL_GROUPS.includes(String(group || '').trim() as typeof LOGICAL_GROUPS[number]),
  )
  return groups.length ? groups.map((group) => resolveGroupLabel(group)).join(' / ') : '未分组'
}

function serverImageText(server: ManagedNodeHeartbeatServerItem) {
  const image = server.image
  if (Array.isArray(image)) {
    return image[0] || '-'
  }

  return String(image || '-')
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
  if (commandType === 'node.check_validate') return '验证更新'
  if (commandType === 'node.check_update_monitor') return '更新并监控'
  if (commandType === 'node.check_update_start') return '更新成功后启动'
  if (commandType === 'node.get_oldver') return '读取当前版本'
  if (commandType === 'node.get_nowver') return '读取最新版本'
  if (commandType === 'node.monitor_check') return '监控检查'
  if (commandType === 'node.monitor_start') return '监控成功后启动'
  return commandType
}

function commandTargetText(command: NodeCommandItem) {
  const payload = normalizeResult(command.payload) || {}
  const group = String(payload.group || '').trim()
  const key = String(payload.key || '').trim()
  const rconCommand = String(payload.command || '').trim()
  const serverKeys = normalizeServerKeyList(payload.serverKeys || payload.targets)

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

  return '节点'
}

function commandSummaryText(command: NodeCommandItem) {
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
    || command.commandType === 'node.check_update_monitor'
    || command.commandType === 'node.check_update_start'
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

  const server = normalizeResult(result.server)
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
  return Array.isArray(result?.results)
    ? (result?.results as CommandGroupResultRow[])
    : []
}

function resultSingleServer(command: NodeCommandItem) {
  const result = normalizeResult(command.result)
  const server = normalizeResult(result?.server)
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

function queueManualRconCommand() {
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
  if (!props.canViewNodes && !props.canViewControl && !props.canViewCommands && !props.canViewSchedules) {
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
  if (!props.canViewLogs) {
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

async function loadSchedules(silent = false) {
  if (!props.canViewSchedules) {
    schedules.value = []
    return
  }

  if (!silent) {
    loadingSchedules.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/schedules`, {
      params: {
        nodeId: selectedScheduleNodeId.value || undefined,
      },
    })
    schedules.value = data.schedules || []
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      loadingSchedules.value = false
    }
  }
}

async function loadGotifyChannels(silent = false) {
  if (!props.canViewSchedules) {
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

async function refreshAll(silent = false) {
  await Promise.all([loadNodes(silent), loadCommands(silent), loadSchedules(silent)])
}

function startPolling() {
  stopPolling()

  if (!props.active) {
    return
  }

  pollTimer = setInterval(() => {
    void refreshAll(true)
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
  resetNodeModal()
  nodeModal.value.show = true
}

function openEditNodeModal(node: ManagedNodeItem) {
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
    // Keep the modal open so the user can see the error toast.
  } finally {
    confirmState.value.loading = false
  }
}

function closeConfirmDialog() {
  confirmState.value.show = false
  confirmState.value.loading = false
  pendingConfirmAction = null
}

function confirmToggleNode(node: ManagedNodeItem, nextValue: boolean) {
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
  selectedScheduleNodeId.value = node.id
  scheduleForm.value.nodeId = node.id
  agentPanelTab.value = 'control'
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
) {
  const node = requireSelectedNode()
  if (!node) {
    return
  }

  openConfirmDialog(title, lines, positiveText, async () => {
    try {
      await http.post(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(node.id)}/commands`, {
        commandType,
        payload,
        expiresInSeconds: 300,
      })
      pushToast('命令已下发', 'success')
      if (props.canViewLogs) {
        agentPanelTab.value = 'logs'
        await loadCommands(true)
      }
    } catch (error) {
      pushToast((error as Error).message, 'error')
      throw error
    }
  })
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

  queueCommand(
    commandType,
    payload,
    `确认${actionText}`,
    lines,
    actionText,
  )
}

function queueGroupAction(commandType: Extract<NodeActionType, 'docker.start_group' | 'docker.stop_group' | 'docker.restart_group'>) {
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
  )
}

function queueServerAction(commandType: Extract<NodeActionType, 'docker.start_server' | 'docker.stop_server' | 'docker.restart_server' | 'docker.remove_server'>) {
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
      try {
        for (const server of servers) {
          await http.post(`${CONSOLE_API_BASE}/agent/nodes/${encodeURIComponent(node.id)}/commands`, {
            commandType,
            payload: { key: server.key },
            expiresInSeconds: 300,
          })
        }
        pushToast(`已下发 ${servers.length} 条命令`, 'success')
        if (props.canViewLogs) {
          agentPanelTab.value = 'logs'
          await loadCommands(true)
        }
      } catch (error) {
        pushToast((error as Error).message, 'error')
        throw error
      }
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

async function openLogModal(command: NodeCommandItem) {
  logModal.value = {
    show: true,
    command,
  }
  loadingLogs.value = true

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/commands/${encodeURIComponent(command.id)}/logs`, {
      params: { limit: 500 },
    })
    commandLogs.value = data.logs || []
  } catch (error) {
    pushToast((error as Error).message, 'error')
    logModal.value.show = false
  } finally {
    loadingLogs.value = false
  }
}

function resetScheduleForm() {
  scheduleForm.value = {
    id: '',
    name: '',
    nodeId: selectedControlNodeId.value || nodes.value[0]?.id || '',
    commandType: 'node.check_update',
    intervalMinutes: 60,
    nextRunAt: Date.now() + 60 * 60 * 1000,
    isActive: true,
    notificationChannelKeys: [],
    rconGroup: 'ALL',
    rconCommand: '',
  }
}

function fillScheduleForm(schedule: NodeCommandScheduleItem) {
  scheduleForm.value = {
    id: schedule.id,
    name: schedule.name,
    nodeId: schedule.nodeId,
    commandType: schedule.commandType as NodeActionType,
    intervalMinutes: schedule.intervalMinutes,
    nextRunAt: schedule.nextRunAt ? new Date(schedule.nextRunAt).getTime() : Date.now() + 60 * 60 * 1000,
    isActive: schedule.isActive,
    notificationChannelKeys: Array.isArray(schedule.notificationChannelKeys) ? [...schedule.notificationChannelKeys] : [],
    rconGroup: String(schedule.payload?.group || 'ALL'),
    rconCommand: String(schedule.payload?.command || ''),
  }
}

function buildSchedulePayload() {
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

  return {}
}

async function saveSchedule() {
  savingSchedule.value = true

  try {
    const payload = {
      name: scheduleForm.value.name.trim(),
      nodeId: scheduleForm.value.nodeId,
      commandType: scheduleForm.value.commandType,
      payload: buildSchedulePayload(),
      notificationChannelKeys: scheduleForm.value.notificationChannelKeys,
      intervalMinutes: scheduleForm.value.intervalMinutes,
      nextRunAt: new Date(Number(scheduleForm.value.nextRunAt)).toISOString(),
      isActive: scheduleForm.value.isActive,
    }

    if (scheduleForm.value.id) {
      await http.patch(`${CONSOLE_API_BASE}/agent/schedules/${encodeURIComponent(scheduleForm.value.id)}`, payload)
      pushToast('定时任务已更新', 'success')
    } else {
      await http.post(`${CONSOLE_API_BASE}/agent/schedules`, payload)
      pushToast('定时任务已创建', 'success')
    }

    resetScheduleForm()
    await loadSchedules(true)
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    savingSchedule.value = false
  }
}

function confirmDeleteSchedule(schedule: NodeCommandScheduleItem) {
  openConfirmDialog(
    '确认删除定时任务',
    ['删除后不会再自动下发该节点操作', `${schedule.name} · ${commandActionText(schedule.commandType)}`],
    '确认删除',
    async () => {
      await http.delete(`${CONSOLE_API_BASE}/agent/schedules/${encodeURIComponent(schedule.id)}`)
      pushToast('定时任务已删除', 'success')
      if (scheduleForm.value.id === schedule.id) {
        resetScheduleForm()
      }
      await loadSchedules(true)
    },
  )
}

function confirmToggleSchedule(schedule: NodeCommandScheduleItem, nextValue: boolean) {
  openConfirmDialog(
    nextValue ? '确认启用定时任务' : '确认停用定时任务',
    [nextValue ? '启用后会按设定时间自动下发节点操作' : '停用后不会继续自动下发节点操作', schedule.name],
    nextValue ? '确认启用' : '确认停用',
    async () => {
      await http.patch(`${CONSOLE_API_BASE}/agent/schedules/${encodeURIComponent(schedule.id)}`, {
        isActive: nextValue,
      })
      pushToast(nextValue ? '定时任务已启用' : '定时任务已停用', 'success')
      await loadSchedules(true)
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
      return
    }

    void refreshAll()
    void loadGotifyChannels(true)
    startPolling()
  },
  { immediate: true },
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

    if (!selectedScheduleNodeId.value) {
      selectedScheduleNodeId.value = list[0].id
    }

    if (!scheduleForm.value.nodeId) {
      scheduleForm.value.nodeId = list[0].id
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
    if (props.active) {
      void loadSchedules()
    }
  },
)

watch(
  () => [props.canViewNodes, props.canViewControl, props.canViewCommands, props.canViewSchedules, props.canViewLogs, agentPanelTab.value] as const,
  () => {
    const current = agentPanelTab.value
    const allowed =
      (current === 'nodes' && props.canViewNodes)
      || (current === 'control' && props.canViewControl)
      || (current === 'commands' && props.canViewCommands)
      || (current === 'schedules' && props.canViewSchedules)
      || (current === 'notifications' && props.canViewSchedules)
      || (current === 'logs' && props.canViewLogs)

    if (!allowed) {
      agentPanelTab.value = firstAvailableAgentTab.value
    }
  },
  { immediate: true },
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

onBeforeUnmount(() => {
  stopPolling()
})
</script>

<template>
  <div class="console-wrap">
    <ConsoleMetricStrip :items="summaryItems" />

    <ConsoleSegmentedTabs v-model="agentPanelTab" :options="agentPanelTabOptions" />

    <Transition name="console-panel-switch" mode="out-in">
      <div :key="agentPanelTab" class="agent-panel-stack">
        <ConsolePanelCard v-if="agentPanelTab === 'nodes' && props.canViewNodes" title="节点管理" description="统一查看节点状态、基础信息和启停配置。">
        <template #header-extra>
          <NSpace size="small">
            <NButton secondary class="console-action-icon" title="刷新列表" @click="refreshAll()">↻</NButton>
            <NButton type="primary" @click="openCreateNodeModal">新增节点</NButton>
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

            <div class="agent-node-card__footer">
              <div class="agent-node-card__actions" @click.stop>
                <NButton type="warning" @click="openEditNodeModal(node)">编辑</NButton>
                <NButton type="warning" @click="confirmRotateKey(node)">重置令牌</NButton>
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

        <ConsolePanelCard v-else-if="agentPanelTab === 'control' && props.canViewControl" title="批量操作" description="按节点、分组和勾选服务器执行统一的批量操作。">
          <div v-if="selectedNode" class="agent-control-stack">
            <div class="agent-selected-node-banner console-panel-banner">
              <div class="console-panel-banner__copy">
                <strong>{{ selectedNode.name }}</strong>
                <span>{{ selectedNode.code }} · {{ selectedNode.host || '未填写主机地址' }}</span>
              </div>
              <NButton secondary @click="agentPanelTab = 'nodes'">切换节点</NButton>
            </div>

            <section class="agent-command-section agent-command-section--flat">
              <NForm label-placement="top" class="console-field-grid cols-3 agent-toolbar-grid">
                <NFormItem label="节点">
                  <NSelect v-model:value="selectedControlNodeId" :options="controlNodeOptions" />
                </NFormItem>
                <NFormItem label="分组">
                  <NSelect v-model:value="selectedGroup" :options="groupOptions" />
                </NFormItem>
                <NFormItem label="当前勾选">
                  <div class="selection-summary-box">
                    <div class="selection-summary-box__label">已选服务器</div>
                    <div class="selection-summary-box__sub">
                      {{ selectedGroup === 'ALL' ? '全部分组' : resolveGroupLabel(selectedGroup) }}
                    </div>
                    <div class="selection-summary-box__main">
                      <span class="selection-summary-box__value">{{ selectedServers.length }}</span>
                      <span class="selection-summary-box__unit">台</span>
                    </div>
                  </div>
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
              <section class="agent-action-section">
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
                  <NButton secondary :disabled="selectedGroup === 'ALL'" @click="queueGroupAction('docker.start_group')">启动分组</NButton>
                  <NButton secondary :disabled="selectedGroup === 'ALL'" @click="queueGroupAction('docker.stop_group')">强停分组</NButton>
                  <NButton secondary :disabled="selectedGroup === 'ALL'" @click="queueGroupAction('docker.restart_group')">重启分组</NButton>
                </div>
              </section>

              <section class="agent-action-section">
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
                  <NButton secondary :disabled="!selectedServers.length" @click="queueServerAction('docker.start_server')">批量启动</NButton>
                  <NButton secondary :disabled="!selectedServers.length" @click="queueServerAction('docker.stop_server')">批量强停</NButton>
                  <NButton secondary :disabled="!selectedServers.length" @click="queueServerAction('docker.restart_server')">批量重启</NButton>
                  <NButton type="error" ghost :disabled="!selectedServers.length" @click="queueServerAction('docker.remove_server')">批量删除</NButton>
                </div>
              </section>
            </div>

            <section class="agent-action-section">
              <div class="agent-action-section__header">
                <strong>服务器列表</strong>
                <span>按分组筛选后直接勾选服务器, 再执行批量操作</span>
              </div>

              <div v-if="filteredServers.length" class="agent-action-grid">
                <NButton secondary @click="selectAllFilteredServers">全选当前分组</NButton>
                <NButton secondary @click="clearSelectedServers">取消勾选</NButton>
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

        <ConsolePanelCard v-else-if="agentPanelTab === 'commands' && props.canViewCommands" title="节点操作" description="集中下发节点维护命令和 RCON 指令，保持统一的命令面板结构。">
          <div v-if="selectedNode" class="agent-control-stack">
            <div class="agent-selected-node-banner console-panel-banner">
              <div class="console-panel-banner__copy">
                <strong>{{ selectedNode.name }}</strong>
                <span>{{ selectedNode.code }} · {{ selectedNode.host || '未填写主机地址' }}</span>
              </div>
              <NButton secondary class="console-action-icon" title="刷新数据" @click="refreshAll()">↻</NButton>
            </div>

            <div class="agent-command-sections">
              <section class="agent-command-section agent-command-section--flat">
                <div class="agent-action-section__header">
                  <strong>节点选择</strong>
                  <span>节点操作不会要求你勾选单台服务器, 直接对当前节点执行</span>
                </div>
                <NForm label-placement="top" class="console-field-grid cols-2 agent-toolbar-grid">
                  <NFormItem label="节点">
                    <NSelect v-model:value="selectedControlNodeId" :options="controlNodeOptions" />
                  </NFormItem>
                  <NFormItem label="快速刷新">
                    <div class="console-inline-actions">
                      <NButton secondary class="console-action-icon" title="刷新数据" @click="refreshAll()">↻</NButton>
                    </div>
                  </NFormItem>
                </NForm>
              </section>

              <div class="agent-control-grid">
                <section class="agent-command-section">
                  <div class="agent-action-section__header">
                    <strong>基础与维护</strong>
                    <span>把旧脚本里的维护动作收成节点级命令</span>
                  </div>
                  <div class="agent-action-grid">
                    <NButton secondary @click="queueNodeInstruction('agent.ping')">心跳测试</NButton>
                    <NButton secondary @click="queueNodeInstruction('docker.list_servers')">同步容器列表</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.check_update')">检查更新</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.check_validate')">验证更新</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.check_update_monitor')">更新并监控</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.check_update_start')">更新成功后启动</NButton>
                    <NButton type="error" ghost @click="queueNodeInstruction('node.kill_all')">强制清理容器</NButton>
                  </div>
                </section>

                <section class="agent-command-section">
                  <div class="agent-action-section__header">
                    <strong>版本与监控</strong>
                    <span>读取版本号, 或单独执行监控检查与启动流程</span>
                  </div>
                  <div class="agent-action-grid">
                    <NButton secondary @click="queueNodeInstruction('node.get_oldver')">读取当前版本</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.get_nowver')">读取最新版本</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.monitor_check')">监控检查</NButton>
                    <NButton secondary @click="queueNodeInstruction('node.monitor_start')">监控成功后启动</NButton>
                  </div>
                </section>
              </div>

              <section class="agent-command-section">
                <div class="agent-action-section__header">
                  <strong>RCON 指令</strong>
                  <span>支持按分组或按单台服务器下发, 密码从官网服务器目录读取并透传给 Agent</span>
                </div>
                <NForm label-placement="top" class="console-field-grid cols-3">
                  <NFormItem label="目标类型">
                    <NSelect
                      v-model:value="nodeCommandForm.rconTargetMode"
                      :options="[
                        { label: '按分组', value: 'group' },
                        { label: '按服务器', value: 'servers' },
                      ]"
                    />
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
          </div>

          <div v-else class="hero-note min-h-[320px]">
            <div class="hero-note__inner">
              <div class="hero-note__title">请选择一个节点</div>
              <div class="hero-note__desc">先在节点管理里选中一个节点, 再回来执行节点操作</div>
            </div>
          </div>
        </ConsolePanelCard>

        <ConsolePanelCard v-else-if="agentPanelTab === 'schedules' && props.canViewSchedules" title="定时任务" description="统一维护节点级定时命令、通知渠道和执行频率。">
          <div class="agent-schedule-layout">
            <section class="agent-command-section agent-schedule-editor">
              <div class="agent-action-section__header">
                <strong>{{ scheduleForm.id ? '编辑定时任务' : '新增定时任务' }}</strong>
                <span>支持按节点定时执行维护命令, 例如每小时检查更新或读取版本</span>
              </div>

              <NForm label-placement="top" class="console-field-grid cols-2">
                <NFormItem label="任务名称">
                  <NInput v-model:value="scheduleForm.name" />
                </NFormItem>
                <NFormItem label="节点">
                  <NSelect v-model:value="scheduleForm.nodeId" :options="scheduleNodeOptions" />
                </NFormItem>
                <NFormItem label="命令类型">
                  <NSelect v-model:value="scheduleForm.commandType" :options="nodeInstructionOptions" />
                </NFormItem>
                <NFormItem label="执行间隔 (分钟)">
                  <NInputNumber v-model:value="scheduleForm.intervalMinutes" :min="1" :max="10080" :show-button="false" class="w-full" />
                </NFormItem>
                <NFormItem label="下次执行时间">
                  <NDatePicker v-model:value="scheduleForm.nextRunAt" type="datetime" :clearable="false" class="w-full" />
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
                <NFormItem v-if="scheduleForm.commandType === 'node.rcon_command'" label="RCON 目标分组">
                  <NSelect v-model:value="scheduleForm.rconGroup" :options="nodeInstructionGroupOptions" />
                </NFormItem>
                <NFormItem v-if="scheduleForm.commandType === 'node.rcon_command'" label="RCON 指令">
                  <NInput v-model:value="scheduleForm.rconCommand" />
                </NFormItem>
              </NForm>

              <div class="agent-action-grid">
                <NButton type="primary" :loading="savingSchedule" @click="saveSchedule">
                  {{ scheduleForm.id ? '保存修改' : '创建任务' }}
                </NButton>
                <NButton secondary @click="resetScheduleForm">清空表单</NButton>
              </div>
            </section>

            <section class="agent-command-section agent-schedule-list-panel">
              <div class="agent-selected-node-banner console-panel-banner">
                <div class="console-panel-banner__copy">
                  <strong>任务列表</strong>
                  <span>查看节点自动执行计划, 可以直接编辑、启停和删除</span>
                </div>
                <NButton secondary class="console-action-icon" title="刷新任务" @click="loadSchedules()">↻</NButton>
              </div>

              <NForm label-placement="top" class="console-field-grid cols-2">
                <NFormItem label="节点筛选">
                  <NSelect v-model:value="selectedScheduleNodeId" clearable :options="[{ label: '全部节点', value: '' }, ...scheduleNodeOptions]" />
                </NFormItem>
                <NFormItem label="操作">
                  <div class="console-inline-control">
                    <NButton type="primary" @click="resetScheduleForm">新建任务</NButton>
                  </div>
                </NFormItem>
              </NForm>

              <div v-if="loadingSchedules && !schedules.length" class="hero-note min-h-[220px]">
                <NSpin size="large" />
              </div>

              <div v-else-if="schedules.length" class="agent-command-list">
                <article v-for="schedule in schedules" :key="schedule.id" class="fold-card agent-command-card">
                  <button
                    type="button"
                    class="fold-card__trigger agent-command-card__trigger"
                    @click="toggleScheduleExpanded(schedule.id)"
                  >
                    <div class="fold-card__title agent-command-card__title">
                      <strong>{{ schedule.name }}</strong>
                      <span>{{ schedule.node?.name || schedule.nodeId }} · {{ commandActionText(schedule.commandType) }}</span>
                      <span class="agent-command-card__preview">每 {{ formatIntervalMinutes(schedule.intervalMinutes) }} 执行一次 · 下次 {{ formatDateTime(schedule.nextRunAt) }}</span>
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

                    <div v-if="Object.keys(schedule.payload || {}).length" class="agent-command-card__summary">
                      {{ JSON.stringify(schedule.payload || {}, null, 2) }}
                    </div>

                    <div class="agent-command-card__actions">
                      <NButton type="warning" @click="fillScheduleForm(schedule)">载入编辑</NButton>
                      <NButton secondary @click="confirmToggleSchedule(schedule, !schedule.isActive)">
                        {{ schedule.isActive ? '停用' : '启用' }}
                      </NButton>
                      <NButton type="error" ghost @click="confirmDeleteSchedule(schedule)">删除</NButton>
                    </div>
                  </div>
                </article>
              </div>

              <div v-else class="hero-note min-h-[220px]">
                <div class="hero-note__inner">
                  <div class="hero-note__title">暂无定时任务</div>
                  <div class="hero-note__desc">创建后会按设定时间自动为节点下发维护命令</div>
                </div>
              </div>
            </section>
          </div>
        </ConsolePanelCard>

        <GotifyNotificationPanel
          v-else-if="agentPanelTab === 'notifications' && props.canViewSchedules"
          :active="agentPanelTab === 'notifications'"
          @updated="handleGotifyConfigUpdated"
        />

        <ConsolePanelCard v-else-if="props.canViewLogs" title="日志管理" description="统一查看命令历史、结果摘要与执行日志。">
          <div class="agent-log-toolbar">
            <NButton secondary class="console-action-icon" title="刷新日志" @click="refreshAll()">↻</NButton>
          </div>

          <div class="console-subsection agent-log-filter-panel">
            <NForm label-placement="top" class="console-field-grid cols-3">
              <NFormItem label="节点筛选">
                <NSelect v-model:value="selectedCommandNodeId" :options="commandNodeOptions" />
              </NFormItem>
              <NFormItem label="状态筛选">
                <NSelect v-model:value="selectedCommandStatus" :options="commandStatusOptions" />
              </NFormItem>
              <NFormItem label="显示数量">
                <NInputNumber v-model:value="commandLimit" :min="10" :max="100" :show-button="false" class="w-full" />
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
                      <NButton secondary @click="openLogModal(command)">查看日志</NButton>
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

      <NSpace justify="end">
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

          <section v-else-if="resultGroupRows(commandDetailModal.command).length" class="agent-detail-section">
            <div class="agent-detail-section__title">分组执行结果</div>
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

          <section v-else-if="resultSingleServer(commandDetailModal.command)" class="agent-detail-section">
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

          <div v-if="loadingLogs" class="hero-note min-h-[240px]">
            <NSpin size="large" />
          </div>

          <div v-else-if="commandLogs.length" class="agent-log-list">
            <article v-for="log in commandLogs" :key="log.id" class="agent-log-item">
              <div class="agent-log-item__meta">
                <span>{{ formatDateTime(log.createdAt) }}</span>
                <span>{{ log.level }}</span>
              </div>
              <pre class="agent-log-item__message">{{ log.message }}</pre>
            </article>
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

.agent-command-sections,
.agent-schedule-layout {
  display: grid;
  gap: 16px;
}

.agent-control-grid,
.agent-toolbar-grid {
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
  justify-content: flex-end;
  margin-bottom: 14px;
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

.agent-log-item {
  padding: var(--app-console-surface-pad-y) var(--app-console-surface-pad-x);
}

.agent-node-list {
  gap: 12px;
}

.agent-command-section {
  padding: 18px 0 0;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.agent-command-sections > .agent-command-section:first-child,
.agent-schedule-layout > .agent-command-section:first-child {
  padding-top: 0;
  border-top: 0;
}

.agent-schedule-list-panel .agent-command-card__summary {
  white-space: pre-wrap;
  word-break: break-word;
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

  .agent-server-list {
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    align-items: stretch;
  }

  .agent-schedule-layout {
    grid-template-columns: minmax(340px, 0.88fr) minmax(0, 1.12fr);
    align-items: start;
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
  .agent-command-sections,
  .agent-schedule-layout {
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
  .agent-log-item__meta,
  .agent-selected-node-banner,
  .agent-log-toolbar {
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
