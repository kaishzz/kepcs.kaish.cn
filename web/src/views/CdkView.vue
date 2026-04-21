<script setup lang="ts">
import dayjs from 'dayjs'
import type {
  DataTableColumns,
  DataTableRowKey,
  DropdownOption,
} from 'naive-ui'
import {
  NAutoComplete,
  NAvatar,
  NButton,
  NCard,
  NCheckbox,
  NCollapseTransition,
  NDataTable,
  NDatePicker,
  NDropdown,
  NForm,
  NFormItem,
  NGrid,
  NGi,
  NInput,
  NInputNumber,
  NModal,
  NPagination,
  NSelect,
  NSpace,
  NSpin,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  NText,
} from 'naive-ui'
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'

import AppShell from '../components/AppShell.vue'
import AccessControlPanel from '../components/console/AccessControlPanel.vue'
import AgentControlPanel from '../components/console/AgentControlPanel.vue'
import ConsoleMetricStrip from '../components/console/ConsoleMetricStrip.vue'
import ConsolePanelCard from '../components/console/ConsolePanelCard.vue'
import ConsoleSectionBlock from '../components/console/ConsoleSectionBlock.vue'
import ConsoleSegmentedTabs from '../components/console/ConsoleSegmentedTabs.vue'
import ServerCatalogPanel from '../components/console/ServerCatalogPanel.vue'
import { http } from '../lib/api'
import { CONSOLE_API_BASE, CONSOLE_PAGE_PATH } from '../lib/console'
import { buildNavItems } from '../lib/navigation'
import { capturePageSurfaceScroll, restorePageSurfaceScroll } from '../lib/pageSurface'
import { pushToast } from '../lib/toast'
import { useAuthStore } from '../stores/auth'
import type {
  AuditLogItem,
  CdkItem,
  CdkProductItem,
  MapChallengeRecordItem,
  ManagedNodeItem,
  OrderItem,
  SessionUser,
} from '../types'

type CdkStatusFilter = 'ALL' | 'UNUSED' | 'USED' | 'EXPIRED' | 'REVOKED'
type CdkSort = 'CREATED_DESC' | 'CREATED_ASC' | 'EXPIRES_ASC' | 'EXPIRES_DESC' | 'UPDATED_DESC'
type BatchAction = 'set-note' | 'set-owner' | 'set-status' | 'delete'
type LogSubTab = 'audit' | 'orders'
type MapChallengeSubTab = 'edit' | 'recent'
type ServerDataSubTab = 'catalog' | 'whitelist' | 'migration'
type ConsoleTab =
  | 'my-cdks'
  | 'manage-cdks'
  | 'logs'
  | 'map-challenges'
  | 'admins'
  | 'agents'
  | 'server-catalog'
  | 'products'
type ConsoleLoadKey =
  | 'my-cdks'
  | 'manage-cdks'
  | 'logs-audit'
  | 'logs-orders'
  | 'map-challenges'
  | 'admins'
  | 'agents'
  | 'server-catalog'
  | 'products'

const officialWhitelistProductCode = 'kepcs_whitelist_single'
const officialWhitelistDatabase = 'cs2_kepcore'

const router = useRouter()
const auth = useAuthStore()

const authLoading = ref(true)
const isMobileView = ref(false)
const authAvatarFailed = ref(false)
const myLoading = ref(false)
const manageLoading = ref(false)
const logLoading = ref(false)
const orderLogLoading = ref(false)
const productLoading = ref(false)
const nodeOverviewLoading = ref(false)
const mapChallengeLoading = ref(false)
const redeemSubmitting = ref(false)
const createSubmitting = ref(false)
const batchSubmitting = ref(false)
const productSubmitting = ref(false)
const mapChallengeSubmitting = ref(false)
const whitelistManualSubmitting = ref(false)
const whitelistMigrationSubmitting = ref(false)
const productTogglePendingIds = ref<string[]>([])

const activeTab = ref('my-cdks')
const manageSubTab = ref<'create' | 'self' | 'batch'>('create')
const logSubTab = ref<LogSubTab>('audit')
const mapChallengeSubTab = ref<MapChallengeSubTab>('edit')
const serverDataSubTab = ref<ServerDataSubTab>('catalog')
const myCdks = ref<CdkItem[]>([])
const managedCdks = ref<CdkItem[]>([])
const logs = ref<AuditLogItem[]>([])
const orderLogs = ref<OrderItem[]>([])
const products = ref<CdkProductItem[]>([])
const overviewNodes = ref<ManagedNodeItem[]>([])
const mapChallenges = ref<MapChallengeRecordItem[]>([])
const checkedRowKeys = ref<DataTableRowKey[]>([])
const myExpandedRowKeys = ref<DataTableRowKey[]>([])
const manageExpandedRowKeys = ref<DataTableRowKey[]>([])
const expandedAuditLogIds = ref<string[]>([])
const expandedOrderLogIds = ref<string[]>([])
const whitelistOptions = ref<Array<{ label: string, value: string }>>([])

function createConsoleLoadState(): Record<ConsoleLoadKey, boolean> {
  return {
    'my-cdks': false,
    'manage-cdks': false,
    'logs-audit': false,
    'logs-orders': false,
    'map-challenges': false,
    admins: false,
    agents: false,
    'server-catalog': false,
    products: false,
  }
}

const consoleLoadState = ref<Record<ConsoleLoadKey, boolean>>(createConsoleLoadState())
const nodeOverviewLoaded = ref(false)

function createStablePagination<T>(rows: Ref<T[]>, pageSize: number) {
  const page = ref(1)

  const pageCount = computed(() =>
    Math.max(1, Math.ceil(rows.value.length / pageSize)),
  )

  const pagedRows = computed(() => {
    const start = (page.value - 1) * pageSize
    return rows.value.slice(start, start + pageSize)
  })

  function reset() {
    page.value = 1
  }

  function clamp() {
    if (page.value > pageCount.value) {
      page.value = pageCount.value
    }
  }

  async function setPage(nextPage: number) {
    const previousScrollTop = capturePageSurfaceScroll()
    page.value = nextPage
    await restorePageSurfaceScroll(previousScrollTop)
  }

  watch(() => rows.value.length, clamp)

  return {
    page,
    pageCount,
    pagedRows,
    reset,
    setPage,
  }
}

const myCdkPagination = createStablePagination(myCdks, 8)
const managedCdkPagination = createStablePagination(managedCdks, 10)
const logPagination = createStablePagination(logs, 12)
const orderLogPagination = createStablePagination(orderLogs, 10)
const productPagination = createStablePagination(products, 10)
const mapChallengePagination = createStablePagination(mapChallenges, 10)

const myFilters = ref<{ status: CdkStatusFilter, sort: CdkSort }>({
  status: 'ALL',
  sort: 'UPDATED_DESC',
})

const manageFilters = ref<{ status: CdkStatusFilter, sort: CdkSort, ownerSteamId: string }>({
  status: 'ALL',
  sort: 'UPDATED_DESC',
  ownerSteamId: '',
})

const logFilters = ref({
  limit: 100,
  actorSteamId: '',
  actorRole: null as 'root' | 'staff' | 'admin' | 'user' | null,
  action: '',
  targetType: '',
})

const orderLogFilters = ref({
  limit: 100,
  orderNo: '',
  steamId64: '',
  email: '',
  status: null as 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'REFUNDED' | null,
  productType: null as 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK' | null,
})

const createForm = ref({
  count: 1,
  ownerSteamId: '',
  note: '',
  permanent: true,
  expiresAt: null as number | null,
})

const selfCreateForm = ref({
  count: 1,
  note: '',
  permanent: true,
  expiresAt: null as number | null,
})

const batchForm = ref({
  action: 'set-note' as BatchAction,
  note: '',
  ownerSteamId: '',
  status: 'REVOKED' as 'ACTIVE' | 'REVOKED',
})

const manualWhitelistForm = ref({
  steamId64: '',
  qq: '',
  note: '',
})

const whitelistMigrationForm = ref({
  oldSteamId64: '',
  newSteamId64: '',
})

const mapChallengeForm = ref({
  steamId64: '',
  mapName: '',
  stage: '',
  mode: 'pass' as 'pass' | 'survival',
  duration: 0,
})

const mapChallengeFilters = ref({
  limit: 100,
  steamId64: '',
  mapName: '',
  stage: '',
  mode: 'ALL' as 'ALL' | 'pass' | 'survival',
})

const productForm = ref({
  code: '',
  name: '',
  description: '',
  productType: 'CUSTOM' as 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK',
  amountFen: 100,
  targetDatabase: '',
  cdkType: '',
  cdkQuantity: 1,
  isActive: false,
  sortOrder: 0,
})

const redeemDialog = ref({
  show: false,
  id: '',
  code: '',
  targetSteamId: '',
  qq: '',
  email: '',
})

const productEditor = ref({
  show: false,
  id: '',
  code: '',
  name: '',
  description: '',
  productType: 'CUSTOM' as 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK',
  amountFen: 100,
  targetDatabase: '',
  cdkType: '',
  cdkQuantity: 1,
  isActive: false,
  sortOrder: 0,
})

const createWhitelistDatabaseLocked = computed(
  () =>
    productForm.value.productType === 'WHITELIST'
    && productForm.value.code.trim() === officialWhitelistProductCode,
)

const editWhitelistDatabaseLocked = computed(
  () =>
    productEditor.value.productType === 'WHITELIST'
    && productEditor.value.code.trim() === officialWhitelistProductCode,
)

let whitelistSearchTimer: ReturnType<typeof setTimeout> | null = null
let manageFilterTimer: ReturnType<typeof setTimeout> | null = null
let logFilterTimer: ReturnType<typeof setTimeout> | null = null
let orderLogFilterTimer: ReturnType<typeof setTimeout> | null = null
let mapChallengeFilterTimer: ReturnType<typeof setTimeout> | null = null
let overviewRefreshTimer: ReturnType<typeof setInterval> | null = null

const navItems = computed(() => buildNavItems(CONSOLE_PAGE_PATH))
const permissionSet = computed(() => new Set(auth.user?.permissions || []))

function hasConsolePermission(permissionKey: string) {
  return Boolean(auth.user?.isRoot || permissionSet.value.has(permissionKey))
}

const canManageCdksCreate = computed(() => hasConsolePermission('console.manage_cdks.create'))
const canManageCdksSelf = computed(() => hasConsolePermission('console.manage_cdks.self'))
const canManageCdksBatch = computed(() => hasConsolePermission('console.manage_cdks.batch'))
const canManageCdks = computed(() =>
  canManageCdksCreate.value
  || canManageCdksSelf.value
  || canManageCdksBatch.value,
)
const canViewAuditLogs = computed(() => hasConsolePermission('console.logs.audit'))
const canViewOrderLogs = computed(() => hasConsolePermission('console.logs.orders'))
const canViewLogs = computed(() => canViewAuditLogs.value || canViewOrderLogs.value)
const canEditMapChallenges = computed(() => hasConsolePermission('console.map_challenges.edit'))
const canViewRecentMapChallenges = computed(() => hasConsolePermission('console.map_challenges.recent'))
const canManageMapChallenges = computed(() =>
  canEditMapChallenges.value || canViewRecentMapChallenges.value,
)
const canManageAccessGroups = computed(() => hasConsolePermission('console.access.groups'))
const canManageAccessUsers = computed(() => hasConsolePermission('console.access.users'))
const canManageAccess = computed(() =>
  canManageAccessGroups.value || canManageAccessUsers.value,
)
const canCreateWhitelist = computed(() => hasConsolePermission('console.whitelist.manual'))
const canMigrateWhitelist = computed(() => hasConsolePermission('console.whitelist.migration'))
const canViewAgentNodeList = computed(() => hasConsolePermission('console.agents.nodes.list'))
const canManageAgentNodes = computed(() => hasConsolePermission('console.agents.nodes.manage'))
const canViewAgentNodes = computed(() =>
  canViewAgentNodeList.value || canManageAgentNodes.value,
)
const canViewAgentControlGroups = computed(() => hasConsolePermission('console.agents.control.groups'))
const canViewAgentControlServers = computed(() => hasConsolePermission('console.agents.control.servers'))
const canViewAgentControl = computed(() =>
  canViewAgentControlGroups.value || canViewAgentControlServers.value,
)
const canViewAgentCommandActions = computed(() => hasConsolePermission('console.agents.commands.maintain'))
const canViewAgentCommandRunning = computed(() => hasConsolePermission('console.agents.commands.running'))
const canViewAgentRcon = computed(() => hasConsolePermission('console.agents.rcon'))
const canEditAgentSchedules = computed(() => hasConsolePermission('console.agents.schedules.edit'))
const canViewAgentScheduleList = computed(() => hasConsolePermission('console.agents.schedules.list'))
const canViewAgentSchedules = computed(() =>
  canEditAgentSchedules.value || canViewAgentScheduleList.value,
)
const canCreateAgentNotifications = computed(() => hasConsolePermission('console.agents.notifications.create'))
const canManageAgentNotifications = computed(() => hasConsolePermission('console.agents.notifications.manage'))
const canTestAgentNotifications = computed(() => hasConsolePermission('console.agents.notifications.test'))
const canViewAgentNotifications = computed(() =>
  canCreateAgentNotifications.value
  || canManageAgentNotifications.value
  || canTestAgentNotifications.value,
)
const canViewAgentCommandHistory = computed(() => hasConsolePermission('console.agents.logs.history'))
const canViewAgentCommandLogDetails = computed(() => hasConsolePermission('console.agents.logs.detail'))
const canViewAgentLogs = computed(() => canViewAgentCommandHistory.value)
const canViewNodeOverview = computed(() =>
  canViewAgentNodes.value
  || canViewAgentControl.value
  || canViewAgentCommandActions.value
  || canViewAgentCommandRunning.value
  || canViewAgentRcon.value
  || canViewAgentSchedules.value,
)
const canViewAgentTab = computed(() =>
  canViewAgentNodes.value
  || canViewAgentControl.value
  || canViewAgentCommandActions.value
  || canViewAgentCommandRunning.value
  || canViewAgentRcon.value
  || canViewAgentSchedules.value
  || canViewAgentNotifications.value
  || canViewAgentLogs.value,
)
const canViewServerCatalog = computed(() =>
  hasConsolePermission('console.server_catalog.kepcs')
  || hasConsolePermission('console.server_catalog.default_map')
  || hasConsolePermission('console.server_catalog.idle_restart')
  || hasConsolePermission('console.server_catalog.community'),
)
const canViewServerDataTools = computed(() =>
  canViewServerCatalog.value
  || canCreateWhitelist.value
  || canMigrateWhitelist.value,
)
const canCreateProducts = computed(() => hasConsolePermission('console.products.create'))
const canViewProductList = computed(() => hasConsolePermission('console.products.list'))
const canManageProducts = computed(() => canCreateProducts.value || canViewProductList.value)

const tabOptions = computed(() => {
  const tabs = [{ name: 'my-cdks', label: '我的 CDK' }]

  if (canManageCdks.value) tabs.push({ name: 'manage-cdks', label: 'CDK 管理' })
  if (canViewLogs.value) tabs.push({ name: 'logs', label: '日志管理' })
  if (canManageMapChallenges.value) tabs.push({ name: 'map-challenges', label: '魔怔数据' })
  if (canManageAccess.value) tabs.push({ name: 'admins', label: '权限管理' })
  if (canViewAgentTab.value) tabs.push({ name: 'agents', label: '服务器控制' })
  if (canViewServerDataTools.value) tabs.push({ name: 'server-catalog', label: '服务器数据' })
  if (canManageProducts.value) tabs.push({ name: 'products', label: '商品管理' })

  return tabs
})

const myOverviewStats = computed(() => [
  { label: '拥有数量', value: myCdks.value.length },
  { label: '可立即使用', value: myCdks.value.filter((item) => item.isValid).length },
  { label: '已完成新增', value: myCdks.value.filter((item) => item.status === 'USED').length },
])

const manageSubTabOptions = computed(() =>
  [
    canManageCdksCreate.value ? { label: '新增 CDK', value: 'create' as const } : null,
    canManageCdksSelf.value ? { label: '给我自己生成', value: 'self' as const } : null,
    canManageCdksBatch.value ? { label: '批量管理', value: 'batch' as const } : null,
  ].filter(Boolean) as Array<{ label: string, value: typeof manageSubTab.value }>,
)

const logSubTabOptions = computed(() =>
  [
    canViewAuditLogs.value ? { label: '操作日志', value: 'audit' } : null,
    canViewOrderLogs.value ? { label: '订单日志', value: 'orders' } : null,
  ].filter(Boolean) as Array<{ label: string, value: LogSubTab }>,
)

const mapChallengeSubTabOptions = computed(() =>
  [
    canEditMapChallenges.value ? { label: '新增 / 更新记录', value: 'edit' as const } : null,
    canViewRecentMapChallenges.value ? { label: '最近记录', value: 'recent' as const } : null,
  ].filter(Boolean) as Array<{ label: string, value: typeof mapChallengeSubTab.value }>,
)

const serverDataSubTabOptions = computed(() =>
  [
    canViewServerCatalog.value ? { label: '服务器目录', value: 'catalog' } : null,
    canCreateWhitelist.value ? { label: '新增白名单', value: 'whitelist' } : null,
    canMigrateWhitelist.value ? { label: '数据迁移', value: 'migration' } : null,
  ].filter(Boolean) as Array<{ label: string, value: ServerDataSubTab }>,
)

const statusOptions = [
  { label: '全部状态', value: 'ALL' },
  { label: '未使用', value: 'UNUSED' },
  { label: '已使用', value: 'USED' },
  { label: '已过期', value: 'EXPIRED' },
  { label: '已撤销', value: 'REVOKED' },
]

const sortOptions = [
  { label: '最近变动', value: 'UPDATED_DESC' },
  { label: '从新到旧', value: 'CREATED_DESC' },
  { label: '从旧到新', value: 'CREATED_ASC' },
  { label: '过期时间从近到远', value: 'EXPIRES_ASC' },
  { label: '过期时间从远到近', value: 'EXPIRES_DESC' },
]

const batchActionOptions = [
  { label: '批量改备注', value: 'set-note' },
  { label: '批量改持有人', value: 'set-owner' },
  { label: '批量改状态', value: 'set-status' },
  { label: '批量删除', value: 'delete' },
]

const logRoleOptions = [
  { label: '超级管理员', value: 'root' },
  { label: '分组成员', value: 'staff' },
  { label: '后台管理员', value: 'admin' },
  { label: '白名单玩家', value: 'user' },
]

const orderStatusOptions = [
  { label: '待支付', value: 'PENDING' },
  { label: '已支付', value: 'PAID' },
  { label: '已失败', value: 'FAILED' },
  { label: '已取消', value: 'CANCELLED' },
  { label: '已退款', value: 'REFUNDED' },
]

const orderProductTypeOptions = [
  { label: '开水服白名单', value: 'WHITELIST' },
  { label: '开水服白名单 CDK', value: 'WHITELIST_CDK' },
  { label: 'CDK 商品', value: 'CDK' },
  { label: '自定义商品', value: 'CUSTOM' },
]

const payProductTypeOptions = [
  { label: '开水服白名单', value: 'WHITELIST' },
  { label: '开水服白名单 CDK', value: 'WHITELIST_CDK' },
  { label: 'CDK 商品', value: 'CDK' },
  { label: '自定义商品', value: 'CUSTOM' },
]

const mapChallengeModeOptions = [
  { label: '通关模式', value: 'pass' },
  { label: '计时模式', value: 'survival' },
]

const mapChallengeFilterModeOptions = [
  { label: '全部模式', value: 'ALL' },
  ...mapChallengeModeOptions,
]

const userMenuOptions = computed<DropdownOption[]>(() => [
  { label: '刷新数据', key: 'refresh' },
  { label: '打开主页', key: 'profile' },
  { label: '退出登录', key: 'logout' },
])

const overviewRows = computed(() => canManageCdks.value ? managedCdks.value : myCdks.value)

const statusBreakdown = computed(() => {
  const source = overviewRows.value
  const items = [
    { label: '可用', value: source.filter((item) => item.status === 'ACTIVE' && !item.isExpired).length, color: '#63e2b6' },
    { label: '已使用', value: source.filter((item) => item.status === 'USED').length, color: '#58b6ff' },
    { label: '已过期', value: source.filter((item) => item.isExpired).length, color: '#ffb454' },
    { label: '已撤销', value: source.filter((item) => item.status === 'REVOKED').length, color: '#ff6f91' },
  ]
  const total = items.reduce((sum, item) => sum + item.value, 0)

  return items.map((item) => ({
    ...item,
    percent: total > 0 ? Math.round((item.value / total) * 1000) / 10 : 0,
  }))
})

const consoleOverviewCards = computed(() => {
  const cards: Array<{
    title: string
    items: Array<{ label: string, value: number }>
    loading: boolean
  }> = []

  if (canManageProducts.value) {
    const activeProducts = products.value.filter((item) => item.isActive)
    cards.push({
      title: '商品概览',
      items: [
        { label: '商品总数', value: products.value.length },
        { label: '已上架', value: activeProducts.length },
      ],
      loading: productLoading.value && !consoleLoadState.value.products,
    })
  }

  if (canViewNodeOverview.value) {
    cards.push({
      title: '节点概览',
      items: [
        { label: '节点总数', value: overviewNodes.value.length },
        { label: '在线节点', value: overviewNodes.value.filter((item) => item.status === 'ONLINE').length },
      ],
      loading: nodeOverviewLoading.value && !nodeOverviewLoaded.value,
    })
  }

  if (cards.length) {
    return cards
  }

  return [
    {
      title: '我的概览',
      items: [
        { label: '持有总数', value: myCdks.value.length },
        { label: '当前可用', value: myCdks.value.filter((item) => item.isValid).length },
        { label: '已使用', value: myCdks.value.filter((item) => item.status === 'USED').length },
        { label: '已失效', value: myCdks.value.filter((item) => item.status === 'REVOKED' || item.isExpired).length },
      ],
      loading: false,
    },
  ]
})

const roleText = computed(() => {
  if (auth.user?.displayRoleName) return auth.user.displayRoleName
  if (auth.user?.role === 'root') return '超级管理员'
  if (auth.user?.role === 'staff') return '分组成员'
  return '白名单玩家'
})

const checkedIds = computed(() => checkedRowKeys.value.map((item) => String(item)))
const authAvatarSrc = computed(() => {
  if (!auth.user?.steamId) {
    return undefined
  }

  return `${CONSOLE_API_BASE}/auth/avatar/${auth.user.steamId}`
})
const authAvatarLabel = computed(() => auth.user?.displayName?.slice(0, 1) || 'K')

function formatDate(value?: string | null) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function formatMobileDateTime(value?: string | null) {
  return value ? dayjs(value).format('MM-DD HH:mm') : '-'
}

function roleTagType(role?: string) {
  if (role === 'root') return 'error'
  if (role === 'staff') return 'warning'
  if (role === 'admin') return 'info'
  return 'default'
}

function auditActorRoleText(role?: string | null) {
  if (role === 'root') return '超级管理员'
  if (role === 'staff') return '分组成员'
  if (role === 'admin') return '后台管理员'
  return '白名单玩家'
}

function cdkStatusType(row: CdkItem) {
  if (!row.isRedeemable && row.status === 'ACTIVE') return 'warning'
  if (row.status === 'USED') return 'success'
  if (row.status === 'REVOKED') return 'error'
  if (row.isExpired) return 'warning'
  return 'info'
}

function cdkStatusText(row: CdkItem) {
  if (!row.isRedeemable && row.status === 'ACTIVE') return '待配置'
  if (row.status === 'USED') return '已使用'
  if (row.status === 'REVOKED') return '已撤销'
  if (row.isExpired) return '已过期'
  return '可用'
}

function payProductTypeLabel(value?: string | null) {
  if (value === 'WHITELIST') return '开水服白名单'
  if (value === 'WHITELIST_CDK') return '开水服白名单 CDK'
  if (value === 'CDK') return 'CDK 商品'
  return '自定义商品'
}

function orderStatusTagType(status?: string | null) {
  if (status === 'PAID') return 'success'
  if (status === 'PENDING') return 'warning'
  if (status === 'FAILED' || status === 'CANCELLED' || status === 'REFUNDED') return 'error'
  return 'default'
}

function formatAmountYuan(amountFen?: number | null) {
  return `${((Number(amountFen) || 0) / 100).toFixed(2)} 元`
}

function mapChallengeModeLabel(value?: string | null) {
  return value === 'survival' ? '计时模式' : '通关模式'
}

function formatMapChallengeDuration(seconds: number, mode?: string | null) {
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

function buildMapChallengeTarget(mapName?: string | null, stage?: string | null) {
  const safeMapName = String(mapName || '').trim()
  const safeStage = String(stage || '').trim()

  if (safeMapName && safeStage) {
    return `${safeMapName} · ${safeStage}`
  }

  return safeMapName || safeStage || '-'
}

function defaultSortOrderForProduct(type: 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK', code = '') {
  const normalizedCode = code.trim()

  if (normalizedCode === officialWhitelistProductCode) {
    return 0
  }

  if (type === 'WHITELIST_CDK') {
    return 1
  }

  if (type === 'CDK') {
    return 2
  }

  if (type === 'CUSTOM') {
    return 1
  }

  return 1
}

function syncProductFormByType(
  target: {
    productType: 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK'
    code: string
    targetDatabase: string
    cdkType: string
    cdkQuantity: number
    sortOrder: number
  },
  options: {
    lockOfficialDatabase?: boolean
    applySuggestedSort?: boolean
  } = {},
) {
  const { lockOfficialDatabase = false, applySuggestedSort = false } = options

  if (target.productType !== 'WHITELIST') {
    target.targetDatabase = ''
  } else if (lockOfficialDatabase) {
    target.targetDatabase = officialWhitelistDatabase
  }

  if (target.productType !== 'CDK') {
    target.cdkType = ''
  }

  if (target.productType !== 'WHITELIST_CDK') {
    target.cdkQuantity = 1
  } else if (!(Number(target.cdkQuantity) >= 1)) {
    target.cdkQuantity = 1
  }

  if (applySuggestedSort || !(Number(target.sortOrder) >= 0)) {
    target.sortOrder = defaultSortOrderForProduct(target.productType, target.code)
  }
}

function syncActiveTab() {
  if (!canManageCdksCreate.value && manageSubTab.value === 'create') {
    manageSubTab.value = canManageCdksSelf.value ? 'self' : 'batch'
  }

  if (!canManageCdksSelf.value && manageSubTab.value === 'self') {
    manageSubTab.value = canManageCdksCreate.value ? 'create' : 'batch'
  }

  if (!canManageCdksBatch.value && manageSubTab.value === 'batch') {
    manageSubTab.value = canManageCdksCreate.value ? 'create' : 'self'
  }

  if (!canViewAuditLogs.value && canViewOrderLogs.value && logSubTab.value === 'audit') {
    logSubTab.value = 'orders'
  }

  if (!canViewOrderLogs.value && canViewAuditLogs.value && logSubTab.value === 'orders') {
    logSubTab.value = 'audit'
  }

  if (!canEditMapChallenges.value && mapChallengeSubTab.value === 'edit') {
    mapChallengeSubTab.value = 'recent'
  }

  if (!canViewRecentMapChallenges.value && mapChallengeSubTab.value === 'recent') {
    mapChallengeSubTab.value = 'edit'
  }

  if (!canViewServerCatalog.value && serverDataSubTab.value === 'catalog') {
    serverDataSubTab.value = canCreateWhitelist.value ? 'whitelist' : 'migration'
  }

  if (!canCreateWhitelist.value && serverDataSubTab.value === 'whitelist') {
    serverDataSubTab.value = canViewServerCatalog.value ? 'catalog' : 'migration'
  }

  if (!canMigrateWhitelist.value && serverDataSubTab.value === 'migration') {
    serverDataSubTab.value = canViewServerCatalog.value ? 'catalog' : 'whitelist'
  }

  if (!tabOptions.value.find((item) => item.name === activeTab.value)) {
    activeTab.value = tabOptions.value[0]?.name || 'my-cdks'
  }
}

function renderDetailGrid(entries: Array<{ label: string, value: string }>) {
  return h(
    'div',
    { class: 'detail-grid' },
    entries.map((item) =>
      h('div', { class: 'detail-tile' }, [
        h('div', { class: 'detail-tile__label' }, item.label),
        h('div', { class: 'detail-tile__value' }, item.value || '-'),
      ]),
    ),
  )
}

function buildCdkDetailEntries(row: CdkItem) {
  return [
    { label: '持有人', value: row.ownerSteamId },
    { label: '创建人', value: row.createdBySteamId },
    { label: 'CDK 类型', value: row.cdkType || '-' },
    { label: '是否可用', value: row.isRedeemable ? '可立即使用' : '待后续对接' },
    { label: '备注', value: row.note || '-' },
    { label: '来源商品', value: row.sourceProductCode || '-' },
    { label: '来源订单', value: row.sourceOrderNo || '-' },
    { label: '创建时间', value: formatDate(row.createdAt) },
    { label: '过期时间', value: formatDate(row.expiresAt) },
    { label: '最近更新', value: formatDate(row.updatedAt) },
    { label: '使用时间', value: formatDate(row.usedAt) },
    { label: '新增账号', value: row.redeemedTargetSteamId || '-' },
    { label: 'QQ / Email', value: `${row.redeemedTargetQq || '-'} / ${row.redeemedTargetEmail || '-'}` },
  ]
}

function renderCdkExpand(row: CdkItem) {
  return h('div', { class: 'cdk-expand-panel' }, [
    renderDetailGrid(buildCdkDetailEntries(row)),
  ])
}

function cdkRowKey(row: CdkItem) {
  return row.id
}

function toggleExpandedRow(keys: typeof myExpandedRowKeys, id: string) {
  keys.value = keys.value.includes(id)
    ? keys.value.filter((item) => item !== id)
    : [...keys.value, id]
}

function toggleMyExpandedRow(id: string) {
  toggleExpandedRow(myExpandedRowKeys, id)
}

function toggleManageExpandedRow(id: string) {
  toggleExpandedRow(manageExpandedRowKeys, id)
}

function isMyExpandedRow(id: string) {
  return myExpandedRowKeys.value.includes(id)
}

function isManageExpandedRow(id: string) {
  return manageExpandedRowKeys.value.includes(id)
}

function isCheckedRow(id: string) {
  return checkedRowKeys.value.some((item) => String(item) === id)
}

function setCheckedRow(id: string, checked: boolean) {
  if (checked) {
    if (isCheckedRow(id)) {
      return
    }

    checkedRowKeys.value = [...checkedRowKeys.value, id]
    return
  }

  checkedRowKeys.value = checkedRowKeys.value.filter((item) => String(item) !== id)
}

function buildAuditLogEntries(row: AuditLogItem) {
  return [
    { label: '操作者', value: row.actorSteamId },
    { label: '身份', value: auditActorRoleText(row.actorRole) },
    { label: '目标类型', value: row.targetType || '-' },
    { label: '目标', value: row.targetId || '-' },
  ]
}

function buildOrderLogEntries(row: OrderItem) {
  return [
    { label: '订单号', value: row.orderNo },
    { label: '商品类型', value: payProductTypeLabel(row.productType) },
    { label: 'SteamID64', value: row.steamId64 || '-' },
    { label: 'Email', value: row.email || '-' },
  ]
}

function stringifyStructuredValue(value: unknown) {
  if (value == null) {
    return '-'
  }

  if (typeof value === 'string') {
    const safeValue = value.trim()
    return safeValue || '-'
  }

  try {
    const text = JSON.stringify(value, null, 2)
    return text && text !== 'null' ? text : '-'
  } catch {
    const safeValue = String(value || '').trim()
    return safeValue || '-'
  }
}

function summarizeStructuredValue(value: unknown, maxLength = 72) {
  const text = stringifyStructuredValue(value).replace(/\s+/g, ' ').trim()
  if (text === '-') {
    return text
  }

  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, Math.max(0, maxLength - 3))}...`
}

function buildAuditLogPreview(row: AuditLogItem) {
  return summarizeStructuredValue(row.detail || row.targetId || row.action)
}

function buildOrderLogPreview(row: OrderItem) {
  return summarizeStructuredValue(row.remark || row.payInfo || row.providerOrderId || row.subject)
}

function renderLogDetailBlock(label: string, value: unknown) {
  const text = stringifyStructuredValue(value)
  if (text === '-') {
    return null
  }

  return h('div', { class: 'console-log-detail-block' }, [
    h('div', { class: 'console-log-detail-block__label' }, label),
    h('pre', { class: 'console-log-detail-block__content' }, text),
  ])
}

function renderAuditLogExpand(row: AuditLogItem) {
  const children = [
    renderDetailGrid([
      { label: '动作', value: row.action },
      { label: '时间', value: formatDate(row.createdAt) },
      ...buildAuditLogEntries(row),
    ]),
  ]
  const detailBlock = renderLogDetailBlock('详细内容', row.detail)

  if (detailBlock) {
    children.push(detailBlock)
  }

  return h('div', { class: 'cdk-expand-panel console-log-expand' }, children)
}

function renderOrderLogExpand(row: OrderItem) {
  const children = [
    renderDetailGrid([
      { label: '商品', value: row.subject || payProductTypeLabel(row.productType) },
      { label: '状态', value: row.status },
      { label: '支付方式', value: row.paymentType },
      { label: '金额', value: formatAmountYuan(row.amountFen) },
      { label: '创建时间', value: formatDate(row.createdAt) },
      { label: '支付时间', value: formatDate(row.paidAt) },
      ...buildOrderLogEntries(row),
    ]),
  ]

  ;([
    ['备注', row.remark],
    ['第三方订单号', row.providerOrderId],
    ['支付信息', row.payInfo],
    ['支付链接', row.paymentUrl],
    ['二维码', row.qrCode],
  ] as Array<[string, unknown]>).forEach(([label, value]) => {
    const block = renderLogDetailBlock(label, value)
    if (block) {
      children.push(block)
    }
  })

  return h('div', { class: 'cdk-expand-panel console-log-expand' }, children)
}

function buildProductEntries(row: CdkProductItem) {
  return [
    { label: '商品编码', value: row.code },
    { label: '商品类型', value: payProductTypeLabel(row.productType) },
    { label: '排序', value: String(row.sortOrder) },
    { label: '最近更新', value: formatDate(row.updatedAt) },
  ]
}

function buildMapChallengeEntries(row: MapChallengeRecordItem) {
  return [
    { label: 'UID', value: row.userId == null ? '-' : String(row.userId) },
    { label: 'SteamID64', value: row.steamId },
    { label: '地图 · 阶段', value: buildMapChallengeTarget(row.mapName, row.stage) },
    { label: '模式', value: mapChallengeModeLabel(row.mode) },
    { label: '存活时间', value: formatMapChallengeDuration(row.duration, row.mode) },
    { label: '更新时间', value: formatDate(row.updatedAt) },
  ]
}

function shouldIgnoreRowClick(event: MouseEvent) {
  const target = event.target

  if (!(target instanceof Element)) {
    return false
  }

  return Boolean(
    target.closest(
      'button, a, input, textarea, select, label, .n-checkbox, .n-base-selection, .n-button, .n-tag, .n-popconfirm',
    ),
  )
}

function buildExpandRowProps(keys: typeof myExpandedRowKeys) {
  return (row: CdkItem) => ({
    class: 'cdk-row',
    onClick: (event: MouseEvent) => {
      if (shouldIgnoreRowClick(event)) {
        return
      }

      toggleExpandedRow(keys, row.id)
    },
  })
}

const myTableRowProps = buildExpandRowProps(myExpandedRowKeys)
const manageTableRowProps = buildExpandRowProps(manageExpandedRowKeys)

async function copyText(value: string | null | undefined, label: string) {
  const text = String(value || '').trim()

  if (!text || text === '-') {
    pushToast(`没有可复制的${label}`, 'info')
    return
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.setAttribute('readonly', 'true')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    pushToast(`${label}已复制`, 'success')
  } catch {
    pushToast(`复制${label}失败`, 'error')
  }
}

function renderCopyButton(value: string | null | undefined, label: string) {
  const text = String(value || '').trim() || '-'

  return h(
    'button',
    {
      type: 'button',
      class: 'log-copy-button',
      disabled: text === '-',
      onClick: async (event: MouseEvent) => {
        event.stopPropagation()
        await copyText(text, label)
      },
    },
    text,
  )
}

function toggleExpandedLogRow(target: typeof expandedAuditLogIds, id: string) {
  target.value = target.value.includes(id)
    ? target.value.filter((item) => item !== id)
    : [...target.value, id]
}

function isAuditLogExpanded(id: string) {
  return expandedAuditLogIds.value.includes(id)
}

function toggleAuditLogExpanded(id: string) {
  toggleExpandedLogRow(expandedAuditLogIds, id)
}

function isOrderLogExpanded(orderNo: string) {
  return expandedOrderLogIds.value.includes(orderNo)
}

function toggleOrderLogExpanded(orderNo: string) {
  toggleExpandedLogRow(expandedOrderLogIds, orderNo)
}

function syncViewport() {
  if (typeof window === 'undefined') {
    return
  }

  isMobileView.value = window.innerWidth <= 768
}

async function fetchMe() {
  authLoading.value = true

  try {
    await auth.fetchMe()
    if (auth.user) {
      syncActiveTab()
      authLoading.value = false
      await ensureConsoleOverviewLoaded()
      await ensureActiveTabLoaded(activeTab.value as ConsoleTab)
      return
    }
  } finally {
    authLoading.value = false
  }
}

async function loadMyCdks(silent = false) {
  if (!auth.user) return

  if (!silent) {
    myLoading.value = true
  }

  try {
    const { data } = await http.get('/console/api/cdks/me', { params: myFilters.value })
    myCdks.value = data.cdks || []
    if (!silent) {
      myCdkPagination.reset()
    }
    consoleLoadState.value['my-cdks'] = true
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      myLoading.value = false
    }
  }
}

async function loadManagedCdks(silent = false) {
  if (!canManageCdksBatch.value) return

  if (!silent) {
    manageLoading.value = true
  }

  try {
    const { data } = await http.get('/console/api/cdks/manage', {
      params: {
        ...manageFilters.value,
        ownerSteamId: manageFilters.value.ownerSteamId.trim() || undefined,
      },
    })
    managedCdks.value = data.cdks || []
    if (!silent) {
      managedCdkPagination.reset()
    }
    consoleLoadState.value['manage-cdks'] = true
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      manageLoading.value = false
    }
  }
}

async function loadLogs(silent = false) {
  if (!canViewAuditLogs.value) return

  if (!silent) {
    logLoading.value = true
  }

  try {
    const { data } = await http.get('/console/api/logs', {
      params: {
        limit: logFilters.value.limit,
        actorSteamId: logFilters.value.actorSteamId.trim() || undefined,
        actorRole: logFilters.value.actorRole || undefined,
        action: logFilters.value.action.trim() || undefined,
        targetType: logFilters.value.targetType.trim() || undefined,
      },
    })
    logs.value = data.logs || []
    if (!silent) {
      logPagination.reset()
    }
    consoleLoadState.value['logs-audit'] = true
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      logLoading.value = false
    }
  }
}

async function loadOrderLogs(silent = false) {
  if (!canViewOrderLogs.value) return

  if (!silent) {
    orderLogLoading.value = true
  }

  try {
    const { data } = await http.get('/console/api/orders', {
      params: {
        limit: orderLogFilters.value.limit,
        orderNo: orderLogFilters.value.orderNo.trim() || undefined,
        steamId64: orderLogFilters.value.steamId64.trim() || undefined,
        email: orderLogFilters.value.email.trim() || undefined,
        status: orderLogFilters.value.status || undefined,
        productType: orderLogFilters.value.productType || undefined,
      },
    })
    orderLogs.value = data.orders || []
    if (!silent) {
      orderLogPagination.reset()
    }
    consoleLoadState.value['logs-orders'] = true
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      orderLogLoading.value = false
    }
  }
}

async function loadAdmins() {
  consoleLoadState.value.admins = true
}

async function loadProducts(silent = false) {
  if (!canViewProductList.value) return

  if (!silent) {
    productLoading.value = true
  }

  try {
    const { data } = await http.get('/console/api/products/manage')
    products.value = data.products || []
    if (!silent) {
      productPagination.reset()
    }
    consoleLoadState.value.products = true
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      productLoading.value = false
    }
  }
}

async function loadOverviewNodes(silent = false) {
  if (!canViewNodeOverview.value) {
    overviewNodes.value = []
    nodeOverviewLoaded.value = false
    return
  }

  if (!silent) {
    nodeOverviewLoading.value = true
  }

  try {
    const { data } = await http.get(`${CONSOLE_API_BASE}/agent/nodes`)
    overviewNodes.value = data.nodes || []
    nodeOverviewLoaded.value = true
  } catch (error) {
    if (!silent) {
      pushToast((error as Error).message, 'error')
    }
  } finally {
    if (!silent) {
      nodeOverviewLoading.value = false
    }
  }
}

function isProductTogglePending(productId: string) {
  return productTogglePendingIds.value.includes(productId)
}

function setProductTogglePending(productId: string, pending: boolean) {
  if (pending) {
    if (!productTogglePendingIds.value.includes(productId)) {
      productTogglePendingIds.value = [...productTogglePendingIds.value, productId]
    }
    return
  }

  productTogglePendingIds.value = productTogglePendingIds.value.filter((item) => item !== productId)
}

function replaceProductInList(product: CdkProductItem) {
  products.value = products.value.map((item) => (item.id === product.id ? product : item))
}

async function toggleProductActive(row: CdkProductItem, nextValue: boolean) {
  if (!canViewProductList.value) {
    return
  }

  if (isProductTogglePending(row.id)) {
    return
  }

  const previousValue = row.isActive
  row.isActive = nextValue
  setProductTogglePending(row.id, true)

  try {
    const { data } = await http.patch(`/console/api/products/manage/${encodeURIComponent(row.id)}`, {
      isActive: nextValue,
    })

    if (data?.product) {
      replaceProductInList(data.product)
    }

    pushToast('商品状态已更新', 'success')
  } catch (error) {
    row.isActive = previousValue
    pushToast((error as Error).message, 'error')
  } finally {
    setProductTogglePending(row.id, false)
  }
}

function resetMapChallengeForm() {
  mapChallengeForm.value = {
    steamId64: '',
    mapName: '',
    stage: '',
    mode: 'pass',
    duration: 0,
  }
}

function fillMapChallengeForm(row: MapChallengeRecordItem) {
  mapChallengeForm.value = {
    steamId64: row.steamId,
    mapName: row.mapName,
    stage: row.stage,
    mode: row.mode,
    duration: row.mode === 'survival' ? Math.max(0, Number(row.duration) || 0) : 0,
  }
}

async function loadMapChallenges() {
  if (!canViewRecentMapChallenges.value) return
  mapChallengeLoading.value = true

  try {
    const { data } = await http.get('/console/api/map-challenges', {
      params: {
        limit: mapChallengeFilters.value.limit,
        steamId64: mapChallengeFilters.value.steamId64.trim() || undefined,
        mapName: mapChallengeFilters.value.mapName.trim() || undefined,
        stage: mapChallengeFilters.value.stage.trim() || undefined,
        mode: mapChallengeFilters.value.mode === 'ALL' ? undefined : mapChallengeFilters.value.mode,
      },
    })
    mapChallenges.value = data.rows || []
    mapChallengePagination.reset()
    consoleLoadState.value['map-challenges'] = true
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    mapChallengeLoading.value = false
  }
}

function saveMapChallengeRecord() {
  if (!canEditMapChallenges.value) {
    return
  }

  const payload = {
    steamId64: mapChallengeForm.value.steamId64.trim(),
    mapName: mapChallengeForm.value.mapName.trim(),
    stage: mapChallengeForm.value.stage.trim(),
    mode: mapChallengeForm.value.mode,
    duration: mapChallengeForm.value.mode === 'survival'
      ? Math.max(0, Number(mapChallengeForm.value.duration) || 0)
      : 0,
  }

  openConfirmDialog({
    title: '确认写入魔怔数据',
    lines: [
      `将写入 ${buildMapChallengeTarget(payload.mapName, payload.stage)} · ${mapChallengeModeLabel(payload.mode)}`,
      payload.mode === 'pass'
        ? `如 ${payload.steamId64} 已存在同阶段通关记录, 本次会直接跳过`
        : `仅当 ${payload.steamId64} 的存活时间更高时才会更新记录`,
    ],
    positiveText: '确认写入',
    onPositiveClick: async () => {
      mapChallengeSubmitting.value = true

      try {
        const { data } = await http.post('/console/api/map-challenges', payload)
        if (canViewRecentMapChallenges.value) {
          await loadMapChallenges()
        }
        const skippedMessage = data?.operation === 'skipped_lower_survival'
          ? '当前存活时间未超过历史最高, 本次已跳过'
          : '通关记录已存在, 本次已跳过'
        pushToast(data?.skipped ? skippedMessage : '魔怔数据已写入', data?.skipped ? 'info' : 'success')
      } catch (error) {
        pushToast((error as Error).message, 'error')
        throw error
      } finally {
        mapChallengeSubmitting.value = false
      }
    },
  })
}

async function ensureConsoleOverviewLoaded(force = false, silent = false) {
  if (!auth.user) {
    return
  }

  const tasks: Array<Promise<void>> = []

  if (canManageCdksBatch.value) {
    if (force || !consoleLoadState.value['manage-cdks']) {
      tasks.push(loadManagedCdks(silent))
    }
  }
  else if (force || !consoleLoadState.value['my-cdks']) {
    tasks.push(loadMyCdks(silent))
  }

  if (canViewProductList.value && (force || !consoleLoadState.value.products)) {
    tasks.push(loadProducts(silent))
  }

  if (canViewNodeOverview.value && (force || !nodeOverviewLoaded.value)) {
    tasks.push(loadOverviewNodes(silent))
  }

  if (tasks.length) {
    await Promise.all(tasks)
  }
}

async function ensureActiveTabLoaded(targetTab = activeTab.value as ConsoleTab, force = false) {
  if (!auth.user) {
    return
  }

  if (targetTab === 'my-cdks') {
    if (force || !consoleLoadState.value['my-cdks']) {
      await loadMyCdks()
    }
    return
  }

  if (targetTab === 'manage-cdks') {
    if (manageSubTab.value === 'batch' && canManageCdksBatch.value && (force || !consoleLoadState.value['manage-cdks'])) {
      await loadManagedCdks()
    }
    return
  }

  if (targetTab === 'logs') {
    if (logSubTab.value === 'orders' && !canViewOrderLogs.value && canViewAuditLogs.value) {
      logSubTab.value = 'audit'
    }

    if (logSubTab.value === 'audit' && !canViewAuditLogs.value && canViewOrderLogs.value) {
      logSubTab.value = 'orders'
    }

    if (logSubTab.value === 'orders') {
      if (force || !consoleLoadState.value['logs-orders']) {
        await loadOrderLogs()
      }
      return
    }

    if (force || !consoleLoadState.value['logs-audit']) {
      await loadLogs()
    }
    return
  }

  if (targetTab === 'map-challenges') {
    if (mapChallengeSubTab.value === 'recent' && (force || !consoleLoadState.value['map-challenges'])) {
      await loadMapChallenges()
    }
    return
  }

  if (targetTab === 'admins') {
    if (force || !consoleLoadState.value.admins) {
      await loadAdmins()
    }
    return
  }

  if (targetTab === 'agents') {
    consoleLoadState.value.agents = true
    return
  }

  if (targetTab === 'server-catalog') {
    consoleLoadState.value['server-catalog'] = true
    return
  }

  if (targetTab === 'products') {
    if (canViewProductList.value && (force || !consoleLoadState.value.products)) {
      await loadProducts()
    }
    return
  }
}

async function refreshCurrentConsoleData() {
  if (!auth.user) {
    return
  }

  await ensureConsoleOverviewLoaded(true)
  await ensureActiveTabLoaded(activeTab.value as ConsoleTab, true)
}

function startOverviewRefresh() {
  stopOverviewRefresh()

  overviewRefreshTimer = window.setInterval(() => {
    if (!auth.user) {
      return
    }

    void ensureConsoleOverviewLoaded(true, true)
  }, 1000)
}

function stopOverviewRefresh() {
  if (overviewRefreshTimer) {
    window.clearInterval(overviewRefreshTimer)
    overviewRefreshTimer = null
  }
}

function renderConfirmContent(lines: string[]) {
  return () =>
    h(
      'div',
      { class: 'confirm-dialog-copy' },
      lines.map((line) => h('div', { class: 'confirm-dialog-copy__line' }, line)),
    )
}

function openConfirmDialog({
  title,
  lines,
  positiveText,
  onPositiveClick,
}: {
  title: string
  lines: string[]
  positiveText: string
  onPositiveClick: () => Promise<void> | void
}) {
  let submitting = false
  let dialogReactive: { loading?: boolean } | null = null

  dialogReactive = window.$dialog?.warning({
    title,
    content: renderConfirmContent(lines),
    positiveText,
    negativeText: '取消',
    onPositiveClick: async () => {
      if (submitting) {
        return false
      }

      submitting = true

      if (dialogReactive) {
        dialogReactive.loading = true
      }

      try {
        await onPositiveClick()
        return true
      } catch (error) {
        if (dialogReactive) {
          dialogReactive.loading = false
        }

        submitting = false
        throw error
      }
    },
  })
}

function confirmToggleCdkStatus(row: CdkItem) {
  if (row.status === 'REVOKED') {
    openConfirmDialog({
      title: '确认恢复 CDK',
      lines: [
        '恢复后该 CDK 将可重新使用',
        `确认恢复 ${row.code}`,
      ],
      positiveText: '确认恢复',
      onPositiveClick: async () => {
        await patchCdk(row.id, { status: 'ACTIVE' }, 'CDK 状态已更新')
      },
    })
    return
  }

  openConfirmDialog({
    title: '确认撤销 CDK',
    lines: [
      '撤销后该 CDK 将无法继续使用',
      `确认撤销 ${row.code}`,
    ],
    positiveText: '确认撤销',
    onPositiveClick: async () => {
      await patchCdk(row.id, { status: 'REVOKED' }, 'CDK 状态已更新')
    },
  })
}

async function handleUserMenuSelect(key: string) {
  if (key === 'refresh') {
    await refreshCurrentConsoleData()
    pushToast('后台数据已刷新', 'success')
    return
  }

  if (key === 'profile') {
    window.open(auth.user?.profileUrl || `https://steamcommunity.com/profiles/${auth.user?.steamId || ''}`, '_blank', 'noopener')
    return
  }

  if (key === 'logout') {
    await auth.logout()
    myCdks.value = []
    managedCdks.value = []
    logs.value = []
    orderLogs.value = []
    mapChallenges.value = []
    products.value = []
    overviewNodes.value = []
    nodeOverviewLoaded.value = false
    consoleLoadState.value = createConsoleLoadState()
    myCdkPagination.reset()
    managedCdkPagination.reset()
    logPagination.reset()
    orderLogPagination.reset()
    mapChallengePagination.reset()
    productPagination.reset()
    checkedRowKeys.value = []
    activeTab.value = 'my-cdks'
    pushToast('已退出登录', 'success')
    void router.replace(CONSOLE_PAGE_PATH)
  }
}

function scheduleWhitelistSearch(query: string) {
  if (whitelistSearchTimer) clearTimeout(whitelistSearchTimer)

  whitelistSearchTimer = setTimeout(async () => {
    const keyword = query.trim()
    if (!keyword || keyword.length < 3 || !auth.user) {
      whitelistOptions.value = []
      return
    }

    try {
      const { data } = await http.get('/console/api/cdks/whitelist-search', { params: { q: keyword } })
      whitelistOptions.value = (data.rows || []).map((item: { steamId: string, note?: string | null }) => ({
        label: item.note ? `${item.steamId}  ${item.note}` : item.steamId,
        value: item.steamId,
      }))
    } catch {
      whitelistOptions.value = []
    }
  }, 280)
}

async function createCdksForOwner(ownerSteamId: string, count: number, note: string, permanent: boolean, expiresAt: number | null) {
  createSubmitting.value = true

  try {
    await http.post('/console/api/cdks/manage', {
      ownerSteamId,
      count,
      note: note.trim() || undefined,
      expiresAt: permanent || !expiresAt ? null : new Date(expiresAt).toISOString(),
    })

    await Promise.all([loadManagedCdks(), loadMyCdks()])
    pushToast('CDK 已创建', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    createSubmitting.value = false
  }
}

async function createCdks() {
  if (!canManageCdksCreate.value) return
  const ownerSteamId = createForm.value.ownerSteamId.trim()

  openConfirmDialog({
    title: '确认创建 CDK',
    lines: [
      `将为 ${ownerSteamId} 创建 ${createForm.value.count} 个 CDK`,
      '确认继续创建',
    ],
    positiveText: '确认创建',
    onPositiveClick: async () => {
      await createCdksForOwner(
        ownerSteamId,
        createForm.value.count,
        createForm.value.note,
        createForm.value.permanent,
        createForm.value.expiresAt,
      )
    },
  })
}

async function createMyCdks() {
  if (!canManageCdksSelf.value) return

  openConfirmDialog({
    title: '确认生成给自己',
    lines: [
      `将为当前账号生成 ${selfCreateForm.value.count} 个 CDK`,
      '确认继续生成',
    ],
    positiveText: '确认生成',
    onPositiveClick: async () => {
      await createCdksForOwner(
        auth.user!.steamId,
        selfCreateForm.value.count,
        selfCreateForm.value.note,
        selfCreateForm.value.permanent,
        selfCreateForm.value.expiresAt,
      )
    },
  })
}

function openRedeemDialog(row: CdkItem) {
  redeemDialog.value = {
    show: true,
    id: row.id,
    code: row.code,
    targetSteamId: '',
    qq: '',
    email: '',
  }
}

async function submitRedeem() {
  redeemSubmitting.value = true

  try {
    await http.post(`/console/api/cdks/${encodeURIComponent(redeemDialog.value.id)}/redeem`, {
      targetSteamId: redeemDialog.value.targetSteamId.trim(),
      qq: redeemDialog.value.qq.trim(),
      email: redeemDialog.value.email.trim(),
    })

    redeemDialog.value.show = false
    await Promise.all([loadMyCdks(), canManageCdks.value ? loadManagedCdks() : Promise.resolve()])
    pushToast('CDK 已使用成功', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    redeemSubmitting.value = false
  }
}

async function patchCdk(id: string, payload: Record<string, unknown>, successMessage: string) {
  try {
    await http.patch(`/console/api/cdks/manage/${encodeURIComponent(id)}`, payload)
    await Promise.all([loadManagedCdks(), loadMyCdks()])
    pushToast(successMessage, 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

async function deleteCdk(id: string) {
  try {
    await http.delete(`/console/api/cdks/manage/${encodeURIComponent(id)}`)
    await Promise.all([loadManagedCdks(), loadMyCdks()])
    checkedRowKeys.value = checkedRowKeys.value.filter((item) => item !== id)
    pushToast('CDK 已删除', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  }
}

function confirmDeleteCdk(row: CdkItem) {
  openConfirmDialog({
    title: '确认删除 CDK',
    lines: [
      '删除后该 CDK 记录将无法恢复',
      `确认删除 ${row.code}`,
    ],
    positiveText: '确认删除',
    onPositiveClick: async () => {
      await deleteCdk(row.id)
    },
  })
}

async function runBatchAction() {
  if (!canManageCdksBatch.value) {
    return
  }

  if (!checkedIds.value.length) {
    pushToast('请先勾选需要处理的 CDK', 'error')
    return
  }

  const actionLabelMap: Record<BatchAction, string> = {
    'set-note': '批量修改备注',
    'set-owner': '批量修改持有人',
    'set-status': batchForm.value.status === 'ACTIVE' ? '批量恢复' : '批量撤销',
    delete: '批量删除',
  }

  openConfirmDialog({
    title: '确认执行批量操作',
    lines: [
      `${actionLabelMap[batchForm.value.action]}将作用于当前选中的 CDK`,
      `确认处理 ${checkedIds.value.length} 项`,
    ],
    positiveText: '确认执行',
    onPositiveClick: async () => {
      batchSubmitting.value = true

      try {
        await http.post('/console/api/cdks/manage/batch', {
          ids: checkedIds.value,
          action: batchForm.value.action,
          note: batchForm.value.action === 'set-note' ? batchForm.value.note.trim() : undefined,
          ownerSteamId: batchForm.value.action === 'set-owner' ? batchForm.value.ownerSteamId.trim() : undefined,
          status: batchForm.value.action === 'set-status' ? batchForm.value.status : undefined,
        })

        checkedRowKeys.value = []
        await Promise.all([loadManagedCdks(), loadMyCdks()])
        pushToast('批量操作已完成', 'success')
      } catch (error) {
        pushToast((error as Error).message, 'error')
      } finally {
        batchSubmitting.value = false
      }
    },
  })
}

function createManualWhitelist() {
  openConfirmDialog({
    title: '确认新增白名单',
    lines: [
      `将为 ${manualWhitelistForm.value.steamId64.trim()} 直接新增白名单记录`,
      '确认按当前信息写入白名单',
    ],
    positiveText: '确认新增',
    onPositiveClick: async () => {
      whitelistManualSubmitting.value = true

      try {
        await http.post('/console/api/whitelist/manual', {
          steamId64: manualWhitelistForm.value.steamId64.trim(),
          qq: manualWhitelistForm.value.qq.trim(),
          note: manualWhitelistForm.value.note.trim() || undefined,
        })

        manualWhitelistForm.value = {
          steamId64: '',
          qq: '',
          note: '',
        }
        pushToast('白名单已新增', 'success')
      } catch (error) {
        pushToast((error as Error).message, 'error')
        throw error
      } finally {
        whitelistManualSubmitting.value = false
      }
    },
  })
}

function migrateWhitelistSteamId() {
  openConfirmDialog({
    title: '确认迁移白名单数据',
    lines: [
      `将把 ${whitelistMigrationForm.value.oldSteamId64.trim()} 替换为 ${whitelistMigrationForm.value.newSteamId64.trim()}`,
      '本次仅迁移 kep_player_info 中的 SteamID 字段',
    ],
    positiveText: '确认迁移',
    onPositiveClick: async () => {
      whitelistMigrationSubmitting.value = true

      try {
        await http.post('/console/api/whitelist/migrate', {
          oldSteamId64: whitelistMigrationForm.value.oldSteamId64.trim(),
          newSteamId64: whitelistMigrationForm.value.newSteamId64.trim(),
        })

        whitelistMigrationForm.value = {
          oldSteamId64: '',
          newSteamId64: '',
        }
        pushToast('白名单数据已迁移', 'success')
      } catch (error) {
        pushToast((error as Error).message, 'error')
        throw error
      } finally {
        whitelistMigrationSubmitting.value = false
      }
    },
  })
}

async function createProduct() {
  if (!canCreateProducts.value) {
    return
  }

  productSubmitting.value = true

  try {
    syncProductFormByType(productForm.value, {
      lockOfficialDatabase: createWhitelistDatabaseLocked.value,
      applySuggestedSort: true,
    })

    await http.post('/console/api/products/manage', {
      code: productForm.value.code.trim(),
      name: productForm.value.name.trim(),
      description: productForm.value.description.trim() || undefined,
      productType: productForm.value.productType,
      amountFen: productForm.value.amountFen,
      targetDatabase: (createWhitelistDatabaseLocked.value
        ? officialWhitelistDatabase
        : productForm.value.targetDatabase.trim()) || undefined,
      cdkType: productForm.value.cdkType.trim() || undefined,
      cdkQuantity: productForm.value.productType === 'WHITELIST_CDK'
        ? Math.max(1, Number(productForm.value.cdkQuantity) || 1)
        : undefined,
      isActive: productForm.value.isActive,
      sortOrder: productForm.value.sortOrder,
    })

    productForm.value = {
      code: '',
      name: '',
      description: '',
      productType: 'CUSTOM',
      amountFen: 100,
      targetDatabase: '',
      cdkType: '',
      cdkQuantity: 1,
      isActive: false,
      sortOrder: 0,
    }
    if (canViewProductList.value) {
      await loadProducts()
    }
    pushToast('CDK 商品已创建', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    productSubmitting.value = false
  }
}

function openProductEditor(row: CdkProductItem) {
  if (!canViewProductList.value) {
    return
  }

  productEditor.value = {
    show: true,
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || '',
    productType: row.productType,
    amountFen: row.amountFen,
    targetDatabase: row.targetDatabase || '',
    cdkType: row.cdkType || '',
    cdkQuantity: Math.max(1, Number(row.cdkQuantity) || 1),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
  }

  syncProductFormByType(productEditor.value, { lockOfficialDatabase: editWhitelistDatabaseLocked.value })
}

async function saveProductEditor() {
  if (!canViewProductList.value) {
    return
  }

  productSubmitting.value = true

  try {
    syncProductFormByType(productEditor.value, { lockOfficialDatabase: editWhitelistDatabaseLocked.value })

    await http.patch(`/console/api/products/manage/${encodeURIComponent(productEditor.value.id)}`, {
      name: productEditor.value.name.trim(),
      description: productEditor.value.description.trim() || undefined,
      productType: productEditor.value.productType,
      amountFen: productEditor.value.amountFen,
      targetDatabase: (editWhitelistDatabaseLocked.value
        ? officialWhitelistDatabase
        : productEditor.value.targetDatabase.trim()) || undefined,
      cdkType: productEditor.value.cdkType.trim() || undefined,
      cdkQuantity: productEditor.value.productType === 'WHITELIST_CDK'
        ? Math.max(1, Number(productEditor.value.cdkQuantity) || 1)
        : undefined,
      isActive: productEditor.value.isActive,
      sortOrder: productEditor.value.sortOrder,
    })

    productEditor.value.show = false
    await loadProducts()
    pushToast('商品信息已更新', 'success')
  } catch (error) {
    pushToast((error as Error).message, 'error')
  } finally {
    productSubmitting.value = false
  }
}

const myColumns = computed<DataTableColumns<CdkItem>>(() => {
  const columns: DataTableColumns<CdkItem> = [
    { type: 'expand', renderExpand: renderCdkExpand },
    { title: 'CDK', key: 'code', ellipsis: { tooltip: true } },
    {
      title: '状态',
      key: 'statusLabel',
      render: (row) => h(NTag, { round: false, type: cdkStatusType(row) }, { default: () => cdkStatusText(row) }),
    },
  ]

  if (!isMobileView.value) {
    columns.push(
      { title: '备注', key: 'note', ellipsis: { tooltip: true }, render: (row) => row.note || '-' },
      { title: '过期时间', key: 'expiresAt', render: (row) => formatDate(row.expiresAt) },
      { title: '最近变动', key: 'updatedAt', render: (row) => formatDate(row.updatedAt) },
    )
  }

  columns.push({
    title: '操作',
    key: 'actions',
    width: isMobileView.value ? 96 : 124,
    render: (row) =>
      row.isValid
        ? h(
            NButton,
            { size: 'small', type: 'primary', onClick: () => openRedeemDialog(row) },
            { default: () => (isMobileView.value ? '使用' : '使用 CDK') },
          )
        : h(NText, { depth: 3 }, { default: () => (isMobileView.value ? '不可用' : '不可使用') }),
  })

  return columns
})

const manageColumns = computed<DataTableColumns<CdkItem>>(() => {
  const columns: DataTableColumns<CdkItem> = [
    { type: 'selection' },
    { type: 'expand', renderExpand: renderCdkExpand },
    { title: 'CDK', key: 'code', ellipsis: { tooltip: true } },
  ]

  if (!isMobileView.value) {
    columns.push({ title: '持有人', key: 'ownerSteamId', ellipsis: { tooltip: true } })
  }

  columns.push({
    title: '状态',
    key: 'status',
    render: (row) => h(NTag, { round: false, type: cdkStatusType(row) }, { default: () => cdkStatusText(row) }),
  })

  if (!isMobileView.value) {
    columns.push(
      { title: '备注', key: 'note', ellipsis: { tooltip: true }, render: (row) => row.note || '-' },
      { title: '过期时间', key: 'expiresAt', render: (row) => formatDate(row.expiresAt) },
      { title: '最近变动', key: 'updatedAt', render: (row) => formatDate(row.updatedAt) },
    )
  }

  columns.push({
    title: '操作',
    key: 'actions',
    width: isMobileView.value ? 136 : 190,
    render: (row) =>
      h(NSpace, { size: 8, wrap: true }, () => [
        h(
          NButton,
          {
            size: 'small',
            type: 'warning',
            onClick: () => confirmToggleCdkStatus(row),
          },
          { default: () => (row.status === 'REVOKED' ? '恢复' : '撤销') },
        ),
        h(
          NButton,
          { size: 'small', type: 'error', onClick: () => confirmDeleteCdk(row) },
          { default: () => '删除' },
        ),
      ]),
  })

  return columns
})

const logColumns = computed<DataTableColumns<AuditLogItem>>(() => {
  if (isMobileView.value) {
    return [
      { title: '时间', key: 'createdAt', render: (row) => formatMobileDateTime(row.createdAt) },
      { title: '操作者', key: 'actorSteamId', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.actorSteamId, '操作者 SteamID64') },
      {
        title: '身份',
        key: 'actorRole',
        render: (row) => h(NTag, { round: false, type: roleTagType(row.actorRole) }, { default: () => auditActorRoleText(row.actorRole) }),
      },
      { title: '动作', key: 'action', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.action, '动作') },
    ]
  }

  return [
    { type: 'expand', renderExpand: renderAuditLogExpand },
    { title: '时间', key: 'createdAt', render: (row) => formatDate(row.createdAt) },
    { title: '操作者', key: 'actorSteamId', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.actorSteamId, '操作者 SteamID64') },
    {
      title: '身份',
      key: 'actorRole',
      render: (row) => h(NTag, { round: false, type: roleTagType(row.actorRole) }, { default: () => auditActorRoleText(row.actorRole) }),
    },
    { title: '动作', key: 'action', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.action, '动作') },
    { title: '目标类型', key: 'targetType' },
    { title: '目标', key: 'targetId', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.targetId, '目标') },
    { title: '内容预览', key: 'detailPreview', ellipsis: { tooltip: true }, render: (row) => buildAuditLogPreview(row) },
  ]
})

const orderLogColumns = computed<DataTableColumns<OrderItem>>(() => {
  if (isMobileView.value) {
    return [
      { title: '时间', key: 'createdAt', render: (row) => formatMobileDateTime(row.createdAt) },
      { title: '订单号', key: 'orderNo', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.orderNo, '订单号') },
      {
        title: '状态',
        key: 'status',
        render: (row) => h(NTag, { round: false, type: orderStatusTagType(row.status) }, { default: () => row.status }),
      },
      { title: '金额', key: 'amountFen', render: (row) => formatAmountYuan(row.amountFen) },
    ]
  }

  return [
    { type: 'expand', renderExpand: renderOrderLogExpand },
    { title: '时间', key: 'createdAt', render: (row) => formatDate(row.createdAt) },
    { title: '订单号', key: 'orderNo', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.orderNo, '订单号') },
    { title: '商品', key: 'subject', ellipsis: { tooltip: true }, render: (row) => row.subject || payProductTypeLabel(row.productType) },
    {
      title: '商品类型',
      key: 'productType',
      render: (row) => payProductTypeLabel(row.productType),
    },
    { title: 'SteamID64', key: 'steamId64', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.steamId64, 'SteamID64') },
    { title: 'Email', key: 'email', ellipsis: { tooltip: true }, render: (row) => renderCopyButton(row.email, 'Email') },
    { title: '金额', key: 'amountFen', render: (row) => formatAmountYuan(row.amountFen) },
    { title: '内容预览', key: 'detailPreview', ellipsis: { tooltip: true }, render: (row) => buildOrderLogPreview(row) },
    {
      title: '状态',
      key: 'status',
      render: (row) => h(NTag, { round: false, type: orderStatusTagType(row.status) }, { default: () => row.status }),
    },
  ]
})

const productColumns = computed<DataTableColumns<CdkProductItem>>(() => {
  const columns: DataTableColumns<CdkProductItem> = []

  if (!isMobileView.value) {
    columns.push({ title: '商品编码', key: 'code', ellipsis: { tooltip: true } })
  }

  columns.push(
    { title: '商品名称', key: 'name', ellipsis: { tooltip: true } },
    { title: '价格', key: 'amountYuan', render: (row) => `${(row.amountFen / 100).toFixed(2)} 元` },
  )

  if (!isMobileView.value) {
    columns.push(
      { title: '商品类型', key: 'productType', render: (row) => payProductTypeLabel(row.productType) },
      { title: '排序', key: 'sortOrder' },
      {
        title: '上架',
        key: 'isActive',
        render: (row) =>
          h(NSwitch, {
            value: row.isActive,
            loading: isProductTogglePending(row.id),
            disabled: isProductTogglePending(row.id),
            onUpdateValue: (value: boolean) => {
              void toggleProductActive(row, value)
            },
          }),
      },
      { title: '最近更新', key: 'updatedAt', render: (row) => formatDate(row.updatedAt) },
    )
  }

  columns.push({
    title: '操作',
    key: 'actions',
    width: 120,
    render: (row) => h(NButton, { size: 'small', type: 'warning', onClick: () => openProductEditor(row) }, { default: () => '编辑' }),
  })

  return columns
})

const mapChallengeColumns = computed<DataTableColumns<MapChallengeRecordItem>>(() => {
  const columns: DataTableColumns<MapChallengeRecordItem> = [
    {
      title: '玩家',
      key: 'name',
      ellipsis: { tooltip: true },
      render: (row) => row.name,
    },
    {
      title: 'UID',
      key: 'userId',
      width: 88,
      render: (row) => row.userId ?? '-',
    },
    {
      title: 'SteamID64',
      key: 'steamId',
      ellipsis: { tooltip: true },
      render: (row) => renderCopyButton(row.steamId, 'SteamID64'),
    },
    {
      title: '地图 · 阶段',
      key: 'target',
      ellipsis: { tooltip: true },
      render: (row) => buildMapChallengeTarget(row.mapName, row.stage),
    },
    {
      title: '模式',
      key: 'mode',
      render: (row) => mapChallengeModeLabel(row.mode),
    },
    {
      title: '存活时间',
      key: 'duration',
      render: (row) => formatMapChallengeDuration(row.duration, row.mode),
    },
    {
      title: '更新时间',
      key: 'updatedAt',
      render: (row) => formatDate(row.updatedAt),
    },
  ]

  if (canEditMapChallenges.value) {
    columns.push({
      title: '操作',
      key: 'actions',
      width: 120,
      render: (row) =>
        h(
          NButton,
          {
            size: 'small',
            type: 'warning',
            onClick: () => fillMapChallengeForm(row),
          },
          { default: () => '载入编辑' },
        ),
    })
  }

  return columns
})

watch(() => [myFilters.value.status, myFilters.value.sort], () => {
  if (auth.user) void loadMyCdks()
})

watch(() => [manageFilters.value.status, manageFilters.value.sort], () => {
  if (canManageCdksBatch.value) void loadManagedCdks()
})

watch(() => manageFilters.value.ownerSteamId, () => {
  if (!canManageCdksBatch.value) return
  if (manageFilterTimer) clearTimeout(manageFilterTimer)
  manageFilterTimer = setTimeout(() => {
    void loadManagedCdks()
  }, 280)
})

watch(() => [
  logFilters.value.limit,
  logFilters.value.actorSteamId,
  logFilters.value.actorRole,
  logFilters.value.action,
  logFilters.value.targetType,
], () => {
  if (!canViewLogs.value) return
  if (logFilterTimer) clearTimeout(logFilterTimer)
  logFilterTimer = setTimeout(() => {
    void loadLogs()
  }, 320)
})

watch(() => [
  orderLogFilters.value.limit,
  orderLogFilters.value.orderNo,
  orderLogFilters.value.steamId64,
  orderLogFilters.value.email,
  orderLogFilters.value.status,
  orderLogFilters.value.productType,
], () => {
  if (!canViewLogs.value) return
  if (orderLogFilterTimer) clearTimeout(orderLogFilterTimer)
  orderLogFilterTimer = setTimeout(() => {
    void loadOrderLogs()
  }, 320)
})

watch(
  () => logPagination.pagedRows.value.map((row) => row.id),
  (visibleIds) => {
    expandedAuditLogIds.value = expandedAuditLogIds.value.filter((id) => visibleIds.includes(id))
  },
  { immediate: true },
)

watch(
  () => orderLogPagination.pagedRows.value.map((row) => row.orderNo),
  (visibleIds) => {
    expandedOrderLogIds.value = expandedOrderLogIds.value.filter((id) => visibleIds.includes(id))
  },
  { immediate: true },
)

watch(() => [
  mapChallengeFilters.value.limit,
  mapChallengeFilters.value.steamId64,
  mapChallengeFilters.value.mapName,
  mapChallengeFilters.value.stage,
  mapChallengeFilters.value.mode,
], () => {
  if (!canViewRecentMapChallenges.value) return
  if (mapChallengeFilterTimer) clearTimeout(mapChallengeFilterTimer)
  mapChallengeFilterTimer = setTimeout(() => {
    void loadMapChallenges()
  }, 320)
})

watch(activeTab, async (nextTab) => {
  const previousScrollTop = capturePageSurfaceScroll()
  await ensureActiveTabLoaded(nextTab as ConsoleTab)
  await restorePageSurfaceScroll(previousScrollTop)
})

watch(logSubTab, (nextSubTab) => {
  if (activeTab.value !== 'logs') {
    return
  }

  if (nextSubTab === 'orders') {
    if (!canViewOrderLogs.value) {
      return
    }
    if (!consoleLoadState.value['logs-orders']) {
      void loadOrderLogs()
    }
    return
  }

  if (!canViewAuditLogs.value) {
    return
  }

  if (!consoleLoadState.value['logs-audit']) {
    void loadLogs()
  }
})

watch(manageSubTab, (nextSubTab) => {
  if (activeTab.value !== 'manage-cdks' || nextSubTab !== 'batch' || !canManageCdksBatch.value) {
    return
  }

  if (!consoleLoadState.value['manage-cdks']) {
    void loadManagedCdks()
  }
})

watch(mapChallengeSubTab, (nextSubTab) => {
  if (activeTab.value !== 'map-challenges' || nextSubTab !== 'recent' || !canViewRecentMapChallenges.value) {
    return
  }

  if (!consoleLoadState.value['map-challenges']) {
    void loadMapChallenges()
  }
})

watch(
  () => [productForm.value.productType, productForm.value.code],
  () => {
    syncProductFormByType(productForm.value, {
      lockOfficialDatabase: createWhitelistDatabaseLocked.value,
      applySuggestedSort: true,
    })
  },
  { immediate: true },
)

watch(
  () => [productEditor.value.productType, productEditor.value.code],
  () => {
    syncProductFormByType(productEditor.value, { lockOfficialDatabase: editWhitelistDatabaseLocked.value })
  },
)

watch(authAvatarSrc, () => {
  authAvatarFailed.value = false
}, { immediate: true })

onMounted(async () => {
  syncViewport()
  window.addEventListener('resize', syncViewport)
  const error = new URLSearchParams(window.location.search).get('error')
  const errorMap: Record<string, string> = {
    'too-many-requests': '请求过于频繁, 请稍后再试',
    'steam-verify-failed': 'Steam 登录验证失败',
    'steam-id-missing': '未读取到 SteamID64',
    'not-whitelisted': '当前 Steam 账号不在开水服白名单中',
    'steam-network-failed': 'Steam 网络请求失败, 请检查代理配置',
  }

  if (error && errorMap[error]) {
    pushToast(errorMap[error], 'error')
    const url = new URL(window.location.href)
    url.searchParams.delete('error')
    window.history.replaceState({}, '', url.toString())
  }

  await fetchMe()
  startOverviewRefresh()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncViewport)

  if (whitelistSearchTimer) {
    clearTimeout(whitelistSearchTimer)
    whitelistSearchTimer = null
  }

  if (manageFilterTimer) {
    clearTimeout(manageFilterTimer)
    manageFilterTimer = null
  }

  if (logFilterTimer) {
    clearTimeout(logFilterTimer)
    logFilterTimer = null
  }

  if (orderLogFilterTimer) {
    clearTimeout(orderLogFilterTimer)
    orderLogFilterTimer = null
  }

  if (mapChallengeFilterTimer) {
    clearTimeout(mapChallengeFilterTimer)
    mapChallengeFilterTimer = null
  }

  stopOverviewRefresh()
})
</script>

<template>
  <AppShell title="开水服后台管理" subtitle="CDK、日志、商品与管理员统一后台管理" badge="后台管理" :nav-items="navItems">
    <template v-if="auth.user" #header-actions>
      <NSpace align="center" justify="end" :size="12" class="w-full console-header-actions">
        <NTag :round="false" type="warning" size="small">{{ roleText }}</NTag>
        <NDropdown trigger="click" :options="userMenuOptions" @select="handleUserMenuSelect">
          <NButton secondary class="console-user-button app-shell__auth-chip">
            <div class="flex items-center gap-2.5">
              <div class="app-auth-avatar app-auth-avatar--sm">
                <img
                  v-if="authAvatarSrc && !authAvatarFailed"
                  :key="authAvatarSrc"
                  :src="authAvatarSrc"
                  alt=""
                  @error="authAvatarFailed = true"
                >
                <span v-else>{{ authAvatarLabel }}</span>
              </div>
              <div class="app-shell__auth-copy">
                <strong class="truncate text-[13px] text-white">{{ auth.user.displayName || auth.user.steamId }}</strong>
                <span class="truncate text-[11px] text-[#8f97a8]">{{ auth.user.steamId }}</span>
              </div>
            </div>
          </NButton>
        </NDropdown>
      </NSpace>
    </template>

    <div v-if="authLoading" class="hero-note min-h-[420px]">
      <NSpin size="large" />
    </div>

    <div v-else-if="!auth.user" class="grid min-h-[calc(100vh-210px)] place-items-center">
      <div class="hero-note__inner">
        <div class="hero-note__title">需要使用 Steam 登录</div>
        <div class="hero-note__desc">点击右上角登录，或从左侧进入后台管理时会自动弹出登录提示。</div>
      </div>
    </div>

    <div v-else class="console-wrap">
      <div class="console-hero-grid">
        <div class="console-overview-stack">
          <NCard
            v-for="card in consoleOverviewCards"
            :key="card.title"
            class="surface-card h-full console-chart-card"
            :title="card.title"
          >
            <NSpin :show="card.loading">
              <div class="console-overview-grid">
                <div
                  v-for="item in card.items"
                  :key="item.label"
                  class="console-stat-box"
                >
                  <div class="console-stat-box__label">{{ item.label }}</div>
                  <div class="console-stat-box__value">{{ item.value }}</div>
                </div>
              </div>
            </NSpin>
          </NCard>
        </div>

        <NCard class="surface-card h-full console-chart-card" title="CDK 状态概览">
          <div class="status-breakdown-panel">
            <div
              v-for="item in statusBreakdown"
              :key="item.label"
              class="status-breakdown-row"
            >
              <div class="status-breakdown-row__meta">
                <span class="status-breakdown-row__dot" :style="{ backgroundColor: item.color }" />
                <span class="status-breakdown-row__label">{{ item.label }}</span>
              </div>
              <div class="status-breakdown-row__value">
                <strong>{{ item.value }}</strong>
                <span>{{ item.percent }}%</span>
              </div>
              <div class="status-breakdown-row__track">
                <span
                  class="status-breakdown-row__fill"
                  :style="{ width: `${item.percent}%`, backgroundColor: item.color }"
                />
              </div>
            </div>
          </div>
        </NCard>
      </div>

      <NCard class="surface-card console-tabs-card">
        <NTabs v-model:value="activeTab" type="line" animated class="console-tabs">
          <NTabPane name="my-cdks" tab="我的 CDK">
            <div class="console-wrap">
              <ConsolePanelCard
                title="我的概览"
                description="用统一统计条带查看当前账号 CDK 的数量、可用状态和新增完成情况。"
              >
                <ConsoleMetricStrip :items="myOverviewStats" />
              </ConsolePanelCard>

              <ConsolePanelCard
                title="我的 CDK 列表"
                description="统一查看当前账号名下的 CDK，并按状态或时间快速筛选。"
              >
                <ConsoleSectionBlock title="列表筛选">
                  <NForm label-placement="top" class="console-field-grid cols-3 console-form-grid console-form-grid--balanced">
                    <NFormItem label="状态">
                      <NSelect v-model:value="myFilters.status" :options="statusOptions" />
                    </NFormItem>
                    <NFormItem label="排序">
                      <NSelect v-model:value="myFilters.sort" :options="sortOptions" />
                    </NFormItem>
                    <NFormItem label="操作">
                      <div class="console-inline-control">
                        <NButton secondary class="console-action-icon" title="刷新列表" @click="() => loadMyCdks()">↻</NButton>
                      </div>
                    </NFormItem>
                  </NForm>
                </ConsoleSectionBlock>
                <div v-if="!isMobileView" class="table-shell table-shell--stable">
                  <NDataTable
                    v-model:expanded-row-keys="myExpandedRowKeys"
                    :columns="myColumns"
                    :data="myCdkPagination.pagedRows.value"
                    :loading="myLoading"
                    :bordered="false"
                    :row-key="cdkRowKey"
                    :row-props="myTableRowProps"
                  />
                </div>
                <div v-else class="mobile-record-list">
                  <div v-if="myLoading" class="hero-note min-h-[220px]">
                    <NSpin size="large" />
                  </div>
                  <div v-else-if="myCdkPagination.pagedRows.value.length" class="mobile-record-list__stack">
                    <article
                      v-for="row in myCdkPagination.pagedRows.value"
                      :key="row.id"
                      class="fold-card mobile-record-card"
                    >
                      <button
                        type="button"
                        class="fold-card__trigger mobile-record-card__trigger"
                        @click="toggleMyExpandedRow(row.id)"
                      >
                        <div class="fold-card__title">
                          <strong>{{ row.code }}</strong>
                          <span>{{ row.note || '暂无备注' }}</span>
                        </div>
                        <div class="fold-card__meta">
                          <NTag :type="cdkStatusType(row)" :round="false">{{ cdkStatusText(row) }}</NTag>
                          <span class="fold-card__arrow" :class="{ 'is-open': isMyExpandedRow(row.id) }">⌄</span>
                        </div>
                      </button>
                      <div v-if="isMyExpandedRow(row.id)" class="fold-card__body mobile-record-card__body">
                        <div class="detail-grid mobile-record-card__grid">
                          <div
                            v-for="entry in buildCdkDetailEntries(row)"
                            :key="`${row.id}-${entry.label}`"
                            class="detail-tile"
                          >
                            <div class="detail-tile__label">{{ entry.label }}</div>
                            <div class="detail-tile__value">{{ entry.value }}</div>
                          </div>
                        </div>
                        <div class="mobile-record-card__actions">
                          <NButton
                            v-if="row.isValid"
                            type="primary"
                            block
                            @click.stop="openRedeemDialog(row)"
                          >
                            使用 CDK
                          </NButton>
                          <div v-else class="mobile-record-card__hint">
                            当前不可使用
                          </div>
                        </div>
                      </div>
                    </article>
                  </div>
                  <div v-else class="hero-note min-h-[220px]">
                    <div class="hero-note__inner">
                      <div class="hero-note__title">暂无 CDK</div>
                      <div class="hero-note__desc">当前条件下还没有可显示的 CDK 记录</div>
                    </div>
                  </div>
                </div>
                <div v-if="myCdkPagination.pageCount.value > 1" class="table-pagination">
                  <NPagination
                    :page="myCdkPagination.page.value"
                    :page-count="myCdkPagination.pageCount.value"
                    :page-slot="7"
                    @update:page="myCdkPagination.setPage"
                  />
                </div>
              </ConsolePanelCard>
            </div>
          </NTabPane>

          <NTabPane v-if="canManageCdks" name="manage-cdks" tab="CDK 管理">
            <div class="console-wrap">
              <ConsoleSegmentedTabs v-model="manageSubTab" :options="manageSubTabOptions" />

              <Transition name="console-panel-switch" mode="out-in">
                <div :key="manageSubTab">
                  <ConsolePanelCard
                    v-if="manageSubTab === 'create'"
                    title="新增 CDK"
                    description="按持有人和有效期生成新的 CDK，表单布局与后台其它新增面板保持一致。"
                  >
                    <NForm label-placement="top" class="console-field-grid cols-2 console-form-grid">
                      <NFormItem label="持有人 SteamID64">
                        <NAutoComplete
                          v-model:value="createForm.ownerSteamId"
                          :options="whitelistOptions"
                          @update:value="scheduleWhitelistSearch"
                        />
                      </NFormItem>
                      <NFormItem label="生成数量">
                        <NInputNumber v-model:value="createForm.count" :min="1" :max="50" :show-button="false" class="w-full" />
                      </NFormItem>
                      <NFormItem label="备注">
                        <NInput v-model:value="createForm.note" placeholder="可填写批次说明" />
                      </NFormItem>
                      <NFormItem label="永久生效">
                        <NSwitch v-model:value="createForm.permanent" />
                      </NFormItem>
                      <NFormItem label="过期时间" class="span-2">
                        <NDatePicker
                          v-model:value="createForm.expiresAt"
                          type="datetime"
                          clearable
                          class="w-full"
                          :disabled="createForm.permanent"
                        />
                      </NFormItem>
                    </NForm>
                    <NButton type="primary" block :loading="createSubmitting" @click="createCdks">创建 CDK</NButton>
                  </ConsolePanelCard>

                  <ConsolePanelCard
                    v-else-if="manageSubTab === 'self'"
                    title="给我自己生成"
                    description="快速给当前账号生成 CDK，使用和新增面板一致的字段节奏与按钮位置。"
                  >
                    <NForm label-placement="top" class="console-field-grid cols-2 console-form-grid">
                      <NFormItem label="本账号 SteamID64">
                        <NInput :value="auth.user.steamId" readonly />
                      </NFormItem>
                      <NFormItem label="生成数量">
                        <NInputNumber v-model:value="selfCreateForm.count" :min="1" :max="50" :show-button="false" class="w-full" />
                      </NFormItem>
                      <NFormItem label="备注">
                        <NInput v-model:value="selfCreateForm.note" placeholder="给自己生成的备注" />
                      </NFormItem>
                      <NFormItem label="永久生效">
                        <NSwitch v-model:value="selfCreateForm.permanent" />
                      </NFormItem>
                      <NFormItem label="过期时间" class="span-2">
                        <NDatePicker
                          v-model:value="selfCreateForm.expiresAt"
                          type="datetime"
                          clearable
                          class="w-full"
                          :disabled="selfCreateForm.permanent"
                        />
                      </NFormItem>
                    </NForm>
                    <NButton type="primary" block :loading="createSubmitting" @click="createMyCdks">生成给自己</NButton>
                  </ConsolePanelCard>

                  <div v-else class="console-panel-stack">
                    <ConsolePanelCard
                      title="批量管理"
                      description="先筛选目标列表，再对勾选 CDK 执行批量备注、转移、状态调整或删除。"
                    >
                      <div class="console-panel-stack">
                        <ConsoleSectionBlock title="列表筛选">
                          <NForm label-placement="top" class="console-field-grid cols-4 console-form-grid console-form-grid--balanced">
                            <NFormItem label="状态">
                              <NSelect v-model:value="manageFilters.status" :options="statusOptions" />
                            </NFormItem>
                            <NFormItem label="排序">
                              <NSelect v-model:value="manageFilters.sort" :options="sortOptions" />
                            </NFormItem>
                            <NFormItem label="持有人 SteamID64">
                              <NAutoComplete
                                v-model:value="manageFilters.ownerSteamId"
                                :options="whitelistOptions"
                                @update:value="scheduleWhitelistSearch"
                              />
                            </NFormItem>
                            <NFormItem label="操作">
                              <div class="console-inline-control">
                                <NButton secondary class="console-action-icon" title="刷新列表" @click="() => loadManagedCdks()">↻</NButton>
                              </div>
                            </NFormItem>
                          </NForm>
                        </ConsoleSectionBlock>

                        <ConsoleSectionBlock title="批量操作">
                          <NForm label-placement="top" class="console-field-grid cols-4 console-form-grid console-form-grid--balanced console-batch-form">
                            <NFormItem label="批量动作">
                              <NSelect v-model:value="batchForm.action" :options="batchActionOptions" />
                            </NFormItem>
                            <NFormItem
                              v-if="batchForm.action === 'set-note'"
                              label="备注内容"
                            >
                              <NInput v-model:value="batchForm.note" />
                            </NFormItem>
                            <NFormItem
                              v-else-if="batchForm.action === 'set-owner'"
                              label="新的持有人 SteamID64"
                            >
                              <NAutoComplete
                                v-model:value="batchForm.ownerSteamId"
                                :options="whitelistOptions"
                                @update:value="scheduleWhitelistSearch"
                              />
                            </NFormItem>
                            <NFormItem
                              v-else-if="batchForm.action === 'set-status'"
                              label="目标状态"
                            >
                              <NSelect
                                v-model:value="batchForm.status"
                                :options="[
                                  { label: '设为可用', value: 'ACTIVE' },
                                  { label: '设为撤销', value: 'REVOKED' },
                                ]"
                              />
                            </NFormItem>
                            <NFormItem v-else label="删除说明">
                              <NInput value="批量删除所选 CDK" readonly />
                            </NFormItem>
                            <NFormItem class="console-batch-form__summary">
                              <div class="selection-summary-box">
                                <span class="selection-summary-box__label">已选数量</span>
                                <div class="selection-summary-box__main">
                                  <strong class="selection-summary-box__value">{{ checkedIds.length }}</strong>
                                  <span class="selection-summary-box__unit">项</span>
                                </div>
                              </div>
                            </NFormItem>
                            <NFormItem label="执行">
                              <NButton type="primary" block :disabled="!checkedIds.length" :loading="batchSubmitting" @click="runBatchAction">
                                执行批量操作
                              </NButton>
                            </NFormItem>
                          </NForm>
                        </ConsoleSectionBlock>
                      </div>
                    </ConsolePanelCard>

                    <ConsolePanelCard
                      title="全部 CDK"
                      description="统一查看管理范围内的全部 CDK，桌面端和移动端共用同一套卡片节奏。"
                      class="console-manage-table-card"
                    >
                      <div v-if="!isMobileView" class="table-shell table-shell--stable">
                        <NDataTable
                          v-model:checked-row-keys="checkedRowKeys"
                          v-model:expanded-row-keys="manageExpandedRowKeys"
                          :columns="manageColumns"
                          :data="managedCdkPagination.pagedRows.value"
                          :loading="manageLoading"
                          :bordered="false"
                          :row-key="cdkRowKey"
                          :row-props="manageTableRowProps"
                        />
                      </div>
                      <div v-else class="mobile-record-list">
                        <div v-if="manageLoading" class="hero-note min-h-[220px]">
                          <NSpin size="large" />
                        </div>
                        <div v-else-if="managedCdkPagination.pagedRows.value.length" class="mobile-record-list__stack">
                          <article
                            v-for="row in managedCdkPagination.pagedRows.value"
                            :key="row.id"
                            class="fold-card mobile-record-card"
                          >
                            <div class="mobile-record-card__select-row">
                              <NCheckbox
                                :checked="isCheckedRow(row.id)"
                                @update:checked="(value) => setCheckedRow(row.id, value)"
                                @click.stop
                              >
                                勾选
                              </NCheckbox>
                            </div>
                            <button
                              type="button"
                              class="fold-card__trigger mobile-record-card__trigger"
                              @click="toggleManageExpandedRow(row.id)"
                            >
                              <div class="fold-card__title">
                                <strong>{{ row.code }}</strong>
                                <span>{{ row.ownerSteamId }}</span>
                              </div>
                              <div class="fold-card__meta">
                                <NTag :type="cdkStatusType(row)" :round="false">{{ cdkStatusText(row) }}</NTag>
                                <span class="fold-card__arrow" :class="{ 'is-open': isManageExpandedRow(row.id) }">⌄</span>
                              </div>
                            </button>
                            <div v-if="isManageExpandedRow(row.id)" class="fold-card__body mobile-record-card__body">
                              <div class="detail-grid mobile-record-card__grid">
                                <div
                                  v-for="entry in buildCdkDetailEntries(row)"
                                  :key="`${row.id}-${entry.label}`"
                                  class="detail-tile"
                                >
                                  <div class="detail-tile__label">{{ entry.label }}</div>
                                  <div class="detail-tile__value">{{ entry.value }}</div>
                                </div>
                              </div>
                              <div class="mobile-record-card__actions mobile-record-card__actions--dual">
                                <NButton type="warning" block @click.stop="confirmToggleCdkStatus(row)">
                                  {{ row.status === 'REVOKED' ? '恢复' : '撤销' }}
                                </NButton>
                                <NButton type="error" block @click.stop="confirmDeleteCdk(row)">
                                  删除
                                </NButton>
                              </div>
                            </div>
                          </article>
                        </div>
                        <div v-else class="hero-note min-h-[220px]">
                          <div class="hero-note__inner">
                            <div class="hero-note__title">暂无 CDK</div>
                            <div class="hero-note__desc">当前筛选条件下没有匹配的 CDK 记录</div>
                          </div>
                        </div>
                      </div>
                      <div v-if="managedCdkPagination.pageCount.value > 1" class="table-pagination">
                        <NPagination
                          :page="managedCdkPagination.page.value"
                          :page-count="managedCdkPagination.pageCount.value"
                          :page-slot="7"
                          @update:page="managedCdkPagination.setPage"
                        />
                      </div>
                    </ConsolePanelCard>
                  </div>
                </div>
              </Transition>
            </div>
          </NTabPane>

          <NTabPane v-if="canViewLogs" name="logs" tab="日志管理">
            <div class="console-wrap">
              <ConsoleSegmentedTabs v-model="logSubTab" :options="logSubTabOptions" />

              <Transition name="console-panel-switch" mode="out-in">
                <div :key="logSubTab">
                  <ConsolePanelCard
                    v-if="logSubTab === 'audit' && canViewAuditLogs"
                    title="操作日志"
                    description="统一查看后台操作流水，并按操作者、身份、动作和目标类型筛选。"
                  >
                    <ConsoleSectionBlock title="筛选条件">
                      <NForm label-placement="top" class="console-field-grid cols-4 console-form-grid">
                        <NFormItem label="操作者 SteamID64">
                          <NInput v-model:value="logFilters.actorSteamId" />
                        </NFormItem>
                        <NFormItem label="身份">
                          <NSelect v-model:value="logFilters.actorRole" clearable :options="logRoleOptions" />
                        </NFormItem>
                        <NFormItem label="动作">
                          <NInput v-model:value="logFilters.action" />
                        </NFormItem>
                        <NFormItem label="目标类型">
                          <NInput v-model:value="logFilters.targetType" />
                        </NFormItem>
                      </NForm>
                    </ConsoleSectionBlock>
                    <div v-if="!isMobileView" class="table-shell table-shell--stable table-shell--log-stable table-shell--page-12">
                      <NDataTable
                        :columns="logColumns"
                        :data="logPagination.pagedRows.value"
                        :loading="logLoading"
                        :bordered="false"
                      />
                    </div>
                    <div v-else class="mobile-record-list">
                      <div v-if="logLoading" class="hero-note min-h-[220px]">
                        <NSpin size="large" />
                      </div>
                      <div v-else-if="logPagination.pagedRows.value.length" class="mobile-record-list__stack">
                        <article
                          v-for="row in logPagination.pagedRows.value"
                          :key="row.id"
                          class="fold-card mobile-info-card"
                          :class="{ 'fold-card--expanded': isAuditLogExpanded(row.id) }"
                        >
                          <button type="button" class="fold-card__trigger" @click="toggleAuditLogExpanded(row.id)">
                            <div class="fold-card__title">
                              <strong>{{ row.action }}</strong>
                              <span>{{ formatMobileDateTime(row.createdAt) }}</span>
                              <span class="console-log-preview">{{ buildAuditLogPreview(row) }}</span>
                            </div>
                            <span class="fold-card__arrow" :class="{ 'is-open': isAuditLogExpanded(row.id) }">⌄</span>
                          </button>
                          <NCollapseTransition :show="isAuditLogExpanded(row.id)">
                            <div class="fold-card__body">
                              <div class="mobile-info-card__grid">
                                <div class="mobile-info-card__item">
                                  <span>操作者</span>
                                  <button type="button" class="log-copy-button" @click="copyText(row.actorSteamId, '操作者 SteamID64')">
                                    {{ row.actorSteamId }}
                                  </button>
                                </div>
                                <div class="mobile-info-card__item">
                                  <span>身份</span>
                                  <strong>{{ auditActorRoleText(row.actorRole) }}</strong>
                                </div>
                                <div
                                  v-for="entry in buildAuditLogEntries(row).slice(2)"
                                  :key="`${row.id}-${entry.label}`"
                                  class="mobile-info-card__item"
                                >
                                  <span>{{ entry.label }}</span>
                                  <strong>{{ entry.value }}</strong>
                                </div>
                              </div>
                              <div v-if="stringifyStructuredValue(row.detail) !== '-'" class="console-log-detail-block">
                                <div class="console-log-detail-block__label">详细内容</div>
                                <pre class="console-log-detail-block__content">{{ stringifyStructuredValue(row.detail) }}</pre>
                              </div>
                            </div>
                          </NCollapseTransition>
                        </article>
                      </div>
                      <div v-else class="hero-note min-h-[220px]">
                        <div class="hero-note__inner">
                          <div class="hero-note__title">暂无日志</div>
                        </div>
                      </div>
                    </div>
                    <div v-if="logPagination.pageCount.value > 1" class="table-pagination">
                      <NPagination
                        :page="logPagination.page.value"
                        :page-count="logPagination.pageCount.value"
                        :page-slot="7"
                        @update:page="logPagination.setPage"
                      />
                    </div>
                  </ConsolePanelCard>

                  <ConsolePanelCard
                    v-else-if="canViewOrderLogs"
                    title="订单日志"
                    description="按订单号、SteamID、邮箱、状态和商品类型统一检索支付订单。"
                  >
                    <ConsoleSectionBlock title="筛选条件">
                      <NForm label-placement="top" class="console-field-grid cols-5 console-form-grid">
                        <NFormItem label="订单号">
                          <NInput v-model:value="orderLogFilters.orderNo" />
                        </NFormItem>
                        <NFormItem label="SteamID64">
                          <NInput v-model:value="orderLogFilters.steamId64" />
                        </NFormItem>
                        <NFormItem label="Email">
                          <NInput v-model:value="orderLogFilters.email" />
                        </NFormItem>
                        <NFormItem label="状态">
                          <NSelect v-model:value="orderLogFilters.status" clearable :options="orderStatusOptions" />
                        </NFormItem>
                        <NFormItem label="商品类型">
                          <NSelect v-model:value="orderLogFilters.productType" clearable :options="orderProductTypeOptions" />
                        </NFormItem>
                      </NForm>
                    </ConsoleSectionBlock>
                    <div v-if="!isMobileView" class="table-shell table-shell--stable table-shell--log-stable table-shell--page-12">
                      <NDataTable
                        :columns="orderLogColumns"
                        :data="orderLogPagination.pagedRows.value"
                        :loading="orderLogLoading"
                        :bordered="false"
                      />
                    </div>
                    <div v-else class="mobile-record-list">
                      <div v-if="orderLogLoading" class="hero-note min-h-[220px]">
                        <NSpin size="large" />
                      </div>
                      <div v-else-if="orderLogPagination.pagedRows.value.length" class="mobile-record-list__stack">
                        <article
                          v-for="row in orderLogPagination.pagedRows.value"
                          :key="row.orderNo"
                          class="fold-card mobile-info-card"
                          :class="{ 'fold-card--expanded': isOrderLogExpanded(row.orderNo) }"
                        >
                          <button type="button" class="fold-card__trigger" @click="toggleOrderLogExpanded(row.orderNo)">
                            <div class="fold-card__title">
                              <strong>{{ row.subject || payProductTypeLabel(row.productType) }}</strong>
                              <span>{{ formatAmountYuan(row.amountFen) }} · {{ formatMobileDateTime(row.createdAt) }}</span>
                              <span class="console-log-preview">{{ buildOrderLogPreview(row) }}</span>
                            </div>
                            <div class="fold-card__meta">
                              <NTag :type="orderStatusTagType(row.status)" :round="false">{{ row.status }}</NTag>
                              <span class="fold-card__arrow" :class="{ 'is-open': isOrderLogExpanded(row.orderNo) }">⌄</span>
                            </div>
                          </button>
                          <NCollapseTransition :show="isOrderLogExpanded(row.orderNo)">
                            <div class="fold-card__body">
                              <div class="mobile-info-card__grid">
                                <div
                                  v-for="entry in buildOrderLogEntries(row)"
                                  :key="`${row.orderNo}-${entry.label}`"
                                  class="mobile-info-card__item"
                                >
                                  <span>{{ entry.label }}</span>
                                  <template v-if="entry.label === '订单号' || entry.label === 'SteamID64' || entry.label === 'Email'">
                                    <button type="button" class="log-copy-button" @click="copyText(entry.value, entry.label)">
                                      {{ entry.value }}
                                    </button>
                                  </template>
                                  <strong v-else>{{ entry.value }}</strong>
                                </div>
                              </div>
                              <div
                                v-for="[label, value] in [
                                  ['备注', row.remark],
                                  ['第三方订单号', row.providerOrderId],
                                  ['支付信息', row.payInfo],
                                  ['支付链接', row.paymentUrl],
                                  ['二维码', row.qrCode],
                                ]"
                                :key="`${row.orderNo}-${label}`"
                                v-show="stringifyStructuredValue(value) !== '-'"
                                class="console-log-detail-block"
                              >
                                <div class="console-log-detail-block__label">{{ label }}</div>
                                <pre class="console-log-detail-block__content">{{ stringifyStructuredValue(value) }}</pre>
                              </div>
                            </div>
                          </NCollapseTransition>
                        </article>
                      </div>
                      <div v-else class="hero-note min-h-[220px]">
                        <div class="hero-note__inner">
                          <div class="hero-note__title">暂无订单</div>
                        </div>
                      </div>
                    </div>
                    <div v-if="orderLogPagination.pageCount.value > 1" class="table-pagination">
                      <NPagination
                        :page="orderLogPagination.page.value"
                        :page-count="orderLogPagination.pageCount.value"
                        :page-slot="7"
                        @update:page="orderLogPagination.setPage"
                      />
                    </div>
                  </ConsolePanelCard>
                </div>
              </Transition>
            </div>
          </NTabPane>

          <NTabPane v-if="canManageMapChallenges" name="map-challenges" tab="魔怔数据">
            <div class="console-wrap">
              <ConsoleSegmentedTabs v-model="mapChallengeSubTab" :options="mapChallengeSubTabOptions" />

              <Transition name="console-panel-switch" mode="out-in">
                <ConsolePanelCard
                  v-if="mapChallengeSubTab === 'edit'"
                  key="map-challenges-edit"
                  title="新增 / 更新记录"
                  description="统一维护魔怔数据记录，新增和更新使用同一张表单。"
                >
                  <NForm label-placement="top" class="console-field-grid cols-4">
                    <NFormItem label="SteamID64">
                      <NInput v-model:value="mapChallengeForm.steamId64" />
                    </NFormItem>
                    <NFormItem label="地图">
                      <NInput v-model:value="mapChallengeForm.mapName" />
                    </NFormItem>
                    <NFormItem label="阶段">
                      <NInput v-model:value="mapChallengeForm.stage" />
                    </NFormItem>
                    <NFormItem label="模式">
                      <NSelect v-model:value="mapChallengeForm.mode" :options="mapChallengeModeOptions" />
                    </NFormItem>
                    <NFormItem v-if="mapChallengeForm.mode === 'survival'" label="存活时间 (秒)">
                      <NInputNumber v-model:value="mapChallengeForm.duration" :min="0" :max="864000" :show-button="false" class="w-full" />
                    </NFormItem>
                    <NFormItem label="操作">
                      <div class="console-inline-actions">
                        <NButton type="primary" :loading="mapChallengeSubmitting" @click="saveMapChallengeRecord">
                          新增 / 更新数据
                        </NButton>
                        <NButton secondary @click="resetMapChallengeForm">清空表单</NButton>
                      </div>
                    </NFormItem>
                  </NForm>
                </ConsolePanelCard>

                <ConsolePanelCard
                  v-else
                  key="map-challenges-recent"
                  title="最近记录"
                  description="按玩家、地图、阶段和模式筛选最近写入的魔怔数据。"
                >
                  <ConsoleSectionBlock title="筛选条件">
                    <NForm label-placement="top" class="console-field-grid cols-5 console-form-grid console-form-grid--balanced">
                      <NFormItem label="SteamID64">
                        <NInput v-model:value="mapChallengeFilters.steamId64" />
                      </NFormItem>
                      <NFormItem label="地图">
                        <NInput v-model:value="mapChallengeFilters.mapName" />
                      </NFormItem>
                      <NFormItem label="阶段">
                        <NInput v-model:value="mapChallengeFilters.stage" />
                      </NFormItem>
                      <NFormItem label="模式">
                        <NSelect v-model:value="mapChallengeFilters.mode" :options="mapChallengeFilterModeOptions" />
                      </NFormItem>
                      <NFormItem label="操作">
                        <div class="console-inline-control">
                          <NButton secondary class="console-action-icon" title="刷新列表" @click="loadMapChallenges">↻</NButton>
                        </div>
                      </NFormItem>
                    </NForm>
                  </ConsoleSectionBlock>

                  <div v-if="!isMobileView" class="table-shell table-shell--short-stable">
                    <NDataTable
                      :columns="mapChallengeColumns"
                      :data="mapChallengePagination.pagedRows.value"
                      :loading="mapChallengeLoading"
                      :bordered="false"
                    />
                  </div>
                  <div v-else class="mobile-record-list">
                    <div v-if="mapChallengeLoading" class="hero-note min-h-[200px]">
                      <NSpin size="large" />
                    </div>
                    <div v-else-if="mapChallengePagination.pagedRows.value.length" class="mobile-record-list__stack">
                      <article
                        v-for="row in mapChallengePagination.pagedRows.value"
                        :key="`${row.steamId}-${row.mapName}-${row.stage}-${row.mode}`"
                        class="mobile-info-card"
                      >
                        <div class="mobile-info-card__top">
                          <strong>{{ row.name }}</strong>
                          <span>{{ buildMapChallengeTarget(row.mapName, row.stage) }}</span>
                        </div>
                        <div class="mobile-info-card__grid">
                          <div
                            v-for="entry in buildMapChallengeEntries(row)"
                            :key="`${row.steamId}-${row.mapName}-${row.stage}-${entry.label}`"
                            class="mobile-info-card__item"
                          >
                            <span>{{ entry.label }}</span>
                            <template v-if="entry.label === 'SteamID64'">
                              <button type="button" class="log-copy-button" @click="copyText(entry.value, entry.label)">
                                {{ entry.value }}
                              </button>
                            </template>
                            <strong v-else>{{ entry.value }}</strong>
                          </div>
                        </div>
                        <div v-if="canEditMapChallenges" class="mobile-record-card__actions">
                          <NButton type="warning" block @click="fillMapChallengeForm(row)">载入编辑</NButton>
                        </div>
                      </article>
                    </div>
                    <div v-else class="hero-note min-h-[200px]">
                      <div class="hero-note__inner">
                        <div class="hero-note__title">暂无记录</div>
                      </div>
                    </div>
                  </div>

                  <div v-if="mapChallengePagination.pageCount.value > 1" class="table-pagination">
                    <NPagination
                      :page="mapChallengePagination.page.value"
                      :page-count="mapChallengePagination.pageCount.value"
                      :page-slot="7"
                      @update:page="mapChallengePagination.setPage"
                    />
                  </div>
                </ConsolePanelCard>
              </Transition>
            </div>
          </NTabPane>

          <NTabPane v-if="canManageAccess" name="admins" tab="权限管理">
            <AccessControlPanel
              v-if="activeTab === 'admins'"
              :active="activeTab === 'admins'"
              :can-manage-groups="canManageAccessGroups"
              :can-manage-users="canManageAccessUsers"
            />
          </NTabPane>

          <NTabPane v-if="canViewAgentTab" name="agents" tab="服务器控制">
            <AgentControlPanel
              v-if="activeTab === 'agents'"
              :active="activeTab === 'agents'"
              :can-view-node-list="canViewAgentNodeList"
              :can-manage-nodes="canManageAgentNodes"
              :can-view-control-groups="canViewAgentControlGroups"
              :can-view-control-servers="canViewAgentControlServers"
              :can-view-command-actions="canViewAgentCommandActions"
              :can-view-running-commands="canViewAgentCommandRunning"
              :can-view-rcon="canViewAgentRcon"
              :can-edit-schedules="canEditAgentSchedules"
              :can-view-schedule-list="canViewAgentScheduleList"
              :can-create-notifications="canCreateAgentNotifications"
              :can-manage-notifications="canManageAgentNotifications"
              :can-test-notifications="canTestAgentNotifications"
              :can-view-log-history="canViewAgentCommandHistory"
              :can-view-log-details="canViewAgentCommandLogDetails"
            />
          </NTabPane>

          <NTabPane v-if="canViewServerDataTools" name="server-catalog" tab="服务器数据">
            <div class="console-wrap">
              <ConsoleSegmentedTabs v-model="serverDataSubTab" :options="serverDataSubTabOptions" />

              <Transition name="console-panel-switch" mode="out-in">
                <div :key="serverDataSubTab">
                  <ServerCatalogPanel
                    v-if="serverDataSubTab === 'catalog' && canViewServerCatalog"
                    :active="activeTab === 'server-catalog' && serverDataSubTab === 'catalog'"
                    :can-view-kepcs="hasConsolePermission('console.server_catalog.kepcs')"
                    :can-view-default-map-monitor="hasConsolePermission('console.server_catalog.default_map')"
                    :can-view-idle-restart-monitor="hasConsolePermission('console.server_catalog.idle_restart')"
                    :can-view-community="hasConsolePermission('console.server_catalog.community')"
                  />

                  <ConsolePanelCard
                    v-else-if="serverDataSubTab === 'whitelist' && canCreateWhitelist"
                    title="后台直接新增白名单"
                    description="为后台场景直接补录白名单账号，这里统一归到服务器数据。"
                  >
                    <NForm label-placement="top" class="console-field-grid cols-3">
                      <NFormItem label="SteamID64">
                        <NInput v-model:value="manualWhitelistForm.steamId64" />
                      </NFormItem>
                      <NFormItem label="QQ">
                        <NInput v-model:value="manualWhitelistForm.qq" />
                      </NFormItem>
                      <NFormItem label="备注">
                        <NInput v-model:value="manualWhitelistForm.note" />
                      </NFormItem>
                    </NForm>
                    <NButton type="primary" block :loading="whitelistManualSubmitting" @click="createManualWhitelist">
                      新增白名单
                    </NButton>
                  </ConsolePanelCard>

                  <ConsolePanelCard
                    v-else-if="canMigrateWhitelist"
                    title="SteamID 数据迁移"
                    description="按旧 SteamID 和新 SteamID 执行迁移，统一收拢到服务器数据。"
                  >
                    <NForm label-placement="top" class="console-field-grid cols-2">
                      <NFormItem label="旧 SteamID64">
                        <NInput v-model:value="whitelistMigrationForm.oldSteamId64" />
                      </NFormItem>
                      <NFormItem label="新 SteamID64">
                        <NInput v-model:value="whitelistMigrationForm.newSteamId64" />
                      </NFormItem>
                    </NForm>
                    <NButton type="primary" block :loading="whitelistMigrationSubmitting" @click="migrateWhitelistSteamId">
                      执行迁移
                    </NButton>
                  </ConsolePanelCard>
                </div>
              </Transition>
            </div>
          </NTabPane>

          <NTabPane v-if="canManageProducts" name="products" tab="商品管理">
            <div class="console-wrap">
              <ConsolePanelCard
                v-if="canCreateProducts"
                title="新增支付商品"
                description="统一维护商品基础信息、价格、类型和上架状态。"
              >
                <NForm label-placement="top" class="console-field-grid cols-4">
                  <NFormItem label="商品编码">
                    <NInput v-model:value="productForm.code" placeholder="" />
                  </NFormItem>
                  <NFormItem label="商品名称">
                    <NInput v-model:value="productForm.name" placeholder="" />
                  </NFormItem>
                  <NFormItem label="填写说明">
                    <NInput
                      v-model:value="productForm.description"
                      type="textarea"
                      :autosize="{ minRows: 3, maxRows: 6 }"
                      placeholder="可留空"
                    />
                  </NFormItem>
                  <NFormItem label="商品类型">
                    <NSelect v-model:value="productForm.productType" :options="payProductTypeOptions" />
                  </NFormItem>
                  <NFormItem label="价格 (分)">
                    <NInputNumber v-model:value="productForm.amountFen" :min="1" :show-button="false" class="w-full" />
                  </NFormItem>
                  <NFormItem label="排序">
                    <NInputNumber v-model:value="productForm.sortOrder" :min="0" :show-button="false" class="w-full" />
                  </NFormItem>
                  <NFormItem v-if="productForm.productType === 'WHITELIST'" label="目标白名单数据库">
                    <NInput
                      v-model:value="productForm.targetDatabase"
                      placeholder="cs2_kepcore"
                      :readonly="createWhitelistDatabaseLocked"
                    />
                  </NFormItem>
                  <NFormItem v-if="productForm.productType === 'CDK'" label="CDK 类型标识">
                    <NInput v-model:value="productForm.cdkType" placeholder="vip_month" />
                  </NFormItem>
                  <NFormItem v-if="productForm.productType === 'WHITELIST_CDK'" label="CDK 数量">
                    <NInputNumber v-model:value="productForm.cdkQuantity" :min="1" :max="100" :show-button="false" class="w-full" />
                  </NFormItem>
                  <NFormItem label="上架">
                    <NSwitch v-model:value="productForm.isActive" />
                  </NFormItem>
                </NForm>
                <NButton type="primary" block :loading="productSubmitting" @click="createProduct">新增商品</NButton>
              </ConsolePanelCard>

              <ConsolePanelCard
                v-if="canViewProductList"
                title="商品列表"
                description="按统一卡片和列表节奏查看、编辑并切换商品上架状态。"
              >
                <div v-if="!isMobileView" class="table-shell table-shell--short-stable">
                  <NDataTable
                    :columns="productColumns"
                    :data="productPagination.pagedRows.value"
                    :loading="productLoading"
                    :bordered="false"
                  />
                </div>
                <div v-else class="mobile-record-list">
                  <div v-if="productLoading" class="hero-note min-h-[200px]">
                    <NSpin size="large" />
                  </div>
                  <div v-else-if="productPagination.pagedRows.value.length" class="mobile-record-list__stack">
                    <article
                      v-for="row in productPagination.pagedRows.value"
                      :key="row.id"
                      class="mobile-info-card"
                    >
                      <div class="mobile-info-card__top">
                        <strong>{{ row.name }}</strong>
                        <span>{{ formatAmountYuan(row.amountFen) }}</span>
                      </div>
                      <div class="mobile-info-card__grid">
                        <div
                          v-for="entry in buildProductEntries(row)"
                          :key="`${row.id}-${entry.label}`"
                          class="mobile-info-card__item"
                        >
                          <span>{{ entry.label }}</span>
                          <strong>{{ entry.value }}</strong>
                        </div>
                      </div>
                      <div class="mobile-product-card__controls">
                        <div class="mobile-product-card__switch">
                          <span>上架</span>
                          <NSwitch
                            :value="row.isActive"
                            :loading="isProductTogglePending(row.id)"
                            :disabled="isProductTogglePending(row.id)"
                            @update:value="(value) => { void toggleProductActive(row, value) }"
                          />
                        </div>
                        <NButton type="warning" block @click="openProductEditor(row)">编辑</NButton>
                      </div>
                    </article>
                  </div>
                  <div v-else class="hero-note min-h-[200px]">
                    <div class="hero-note__inner">
                      <div class="hero-note__title">暂无商品</div>
                      <div class="hero-note__desc">当前还没有可显示的支付商品</div>
                    </div>
                  </div>
                </div>
                <div v-if="productPagination.pageCount.value > 1" class="table-pagination">
                  <NPagination
                    :page="productPagination.page.value"
                    :page-count="productPagination.pageCount.value"
                    :page-slot="7"
                    @update:page="productPagination.setPage"
                  />
                </div>
              </ConsolePanelCard>
            </div>
          </NTabPane>

        </NTabs>
      </NCard>
    </div>

    <NModal v-model:show="redeemDialog.show" preset="card" title="使用 CDK" class="max-w-[520px]">
      <NForm label-placement="top" class="console-field-grid cols-2">
        <NFormItem label="CDK">
          <NInput :value="redeemDialog.code" readonly />
        </NFormItem>
        <NFormItem label="新增账号 SteamID64">
          <NInput v-model:value="redeemDialog.targetSteamId" placeholder="765611989687xxxxx" />
        </NFormItem>
        <NFormItem label="QQ">
          <NInput v-model:value="redeemDialog.qq" placeholder="248546xxx" />
        </NFormItem>
        <NFormItem label="Email">
                    <NInput v-model:value="redeemDialog.email" placeholder="xxx@example.com" />
        </NFormItem>
      </NForm>
      <NSpace justify="end">
        <NButton @click="redeemDialog.show = false">取消</NButton>
        <NButton type="primary" :loading="redeemSubmitting" @click="submitRedeem">确认使用</NButton>
      </NSpace>
    </NModal>

    <NModal v-model:show="productEditor.show" preset="card" title="编辑商品" class="max-w-[560px]">
      <NForm label-placement="top" class="console-field-grid cols-2">
        <NFormItem label="商品编码">
          <NInput :value="productEditor.code" readonly />
        </NFormItem>
        <NFormItem label="商品名称">
          <NInput v-model:value="productEditor.name" />
        </NFormItem>
        <NFormItem label="填写说明">
          <NInput
            v-model:value="productEditor.description"
            type="textarea"
            :autosize="{ minRows: 3, maxRows: 6 }"
            placeholder="可留空"
          />
        </NFormItem>
        <NFormItem label="商品类型">
          <NSelect v-model:value="productEditor.productType" :options="payProductTypeOptions" />
        </NFormItem>
        <NFormItem label="价格 (分)">
          <NInputNumber v-model:value="productEditor.amountFen" :min="1" :show-button="false" class="w-full" />
        </NFormItem>
        <NFormItem label="排序">
          <NInputNumber v-model:value="productEditor.sortOrder" :min="0" :show-button="false" class="w-full" />
        </NFormItem>
        <NFormItem v-if="productEditor.productType === 'WHITELIST'" label="目标白名单数据库">
          <NInput v-model:value="productEditor.targetDatabase" :readonly="editWhitelistDatabaseLocked" />
        </NFormItem>
        <NFormItem v-if="productEditor.productType === 'CDK'" label="CDK 类型标识">
          <NInput v-model:value="productEditor.cdkType" />
        </NFormItem>
        <NFormItem v-if="productEditor.productType === 'WHITELIST_CDK'" label="CDK 数量">
          <NInputNumber v-model:value="productEditor.cdkQuantity" :min="1" :max="100" :show-button="false" class="w-full" />
        </NFormItem>
        <NFormItem label="上架">
          <NSwitch v-model:value="productEditor.isActive" />
        </NFormItem>
      </NForm>
      <NSpace justify="end">
        <NButton @click="productEditor.show = false">取消</NButton>
        <NButton type="primary" :loading="productSubmitting" @click="saveProductEditor">保存</NButton>
      </NSpace>
    </NModal>
  </AppShell>
</template>

