export interface ProductItem {
  id: string
  code: string
  name: string
  description?: string | null
  productType: 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK'
  amountFen: number
  amountYuan: string
  targetDatabase?: string | null
  cdkType?: string | null
  cdkQuantity?: number
  isActive: boolean
  sortOrder: number
}

export interface CdkProductItem extends ProductItem {
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  orderNo: string
  productCode?: string | null
  productType?: 'WHITELIST' | 'WHITELIST_CDK' | 'CUSTOM' | 'CDK' | null
  targetDatabase?: string | null
  cdkType?: string | null
  cdkQuantity?: number
  steamId64: string
  subject: string
  qq?: string | null
  email?: string | null
  remark?: string | null
  paymentType: 'alipay' | 'wxpay'
  amountFen: number
  status: string
  paidAt?: string | null
  providerOrderId?: string | null
  createdAt: string
  paymentUrl?: string | null
  qrCode?: string | null
  payType?: string | null
  payInfo?: string | null
}

export interface SessionUser {
  steamId: string
  role: 'root' | 'staff' | 'user'
  isRoot: boolean
  isStaff: boolean
  permissions: string[]
  groupCodes: string[]
  groupNames: string[]
  displayRoleName?: string | null
  displayName?: string | null
  avatarUrl?: string | null
  profileUrl?: string | null
}

export interface CdkItem {
  id: string
  code: string
  status: 'ACTIVE' | 'USED' | 'REVOKED'
  createdBySteamId: string
  ownerSteamId: string
  note?: string | null
  cdkType?: string | null
  isRedeemable: boolean
  sourceProductCode?: string | null
  sourceOrderNo?: string | null
  expiresAt?: string | null
  usedAt?: string | null
  usedBySteamId?: string | null
  redeemedTargetSteamId?: string | null
  redeemedTargetQq?: string | null
  redeemedTargetEmail?: string | null
  createdAt: string
  updatedAt: string
  isValid: boolean
  isExpired: boolean
  __dialog?: boolean
  __steamId?: string
  __qq?: string
  __email?: string
  __toSteamId?: string
}

export interface AuditLogItem {
  id: string
  actorSteamId: string
  actorRole: string
  action: string
  targetType: string
  targetId?: string | null
  detail?: unknown
  createdAt: string
}

export interface AccessPermissionCatalogItem {
  key: string
  label: string
  description: string
  section: string
  editable: boolean
}

export interface AccessGroupMemberItem {
  steamId: string
  note?: string | null
  createdAt: string
  updatedAt: string
}

export interface AccessGroupItem {
  id: string
  code: string
  name: string
  note?: string | null
  isSystem: boolean
  createdBySteamId: string
  createdAt: string
  updatedAt: string
  permissions: string[]
  members: AccessGroupMemberItem[]
}

export interface DirectAccessUserItem {
  steamId: string
  note?: string | null
  createdBySteamId: string
  createdAt: string
  updatedAt: string
  permissions: string[]
}

export interface WhitelistSearchItem {
  steamId: string
  note?: string | null
}

export interface AppNavItem {
  label: string
  to: string
  current?: boolean
  icon?: string
  requiresAuth?: boolean
}

export interface ServerListItem {
  id: string
  shotid: string
  mode: string
  name: string
  serverName: string
  host: string
  port: number
  map: string
  currentPlayers: number
  maxPlayers: number
  status: string
  connectUrl: string
}

export interface PlayerProfileItem {
  userId: number
  name: string
  steamId: string
  joinTime: string | null
  totalPlayTime: number
  lastSeen: string | null
  note: string | null
  memberOpenId: string | null
  bindingStatus: string
  todayPlayTime: number
  challengeRecords: PlayerChallengeItem[]
}

export interface PlayerChallengeItem {
  mapName: string
  stage: string
  mode: MapChallengeMode
  duration: number
  updatedAt: string | null
}

export interface PlayerStatsTrendItem {
  date: string
  activePlayers: number
  totalPlayTime: number
}

export interface PlayerStatsSnapshot {
  todayDate: string
  todayActivePlayers: number
  last7DaysActivePlayers: number
  totalPlayers: number
  todayTotalPlayTime: number
  trend: PlayerStatsTrendItem[]
  todayRanking: PlayerProfileItem[]
}

export interface ServerTrendPoint {
  bucketAt: string
  practiceTotal: number
  zeTotal: number
  practiceOccupied: number
  zeOccupied: number
  onlinePlayers: number
}

export interface ServerTrendSnapshot {
  hours: number
  sampleMinutes: number
  points: ServerTrendPoint[]
}

export type MapChallengeMode = 'pass' | 'survival'

export interface MapChallengeRecordItem {
  steamId: string
  userId: number | null
  name: string
  mapName: string
  stage: string
  mode: MapChallengeMode
  duration: number
  updatedAt: string | null
}

export interface MapChallengeStageOption {
  mapName: string
  stage: string
}

export interface MapChallengeLeaderboardSnapshot {
  filters: {
    selectedMode: 'ALL' | MapChallengeMode
    selectedMap: string
    selectedStage: string
    selectedSortDirection: 'default' | 'asc' | 'desc'
    mapOptions: string[]
    stageOptions: MapChallengeStageOption[]
  }
  summary: {
    recordCount: number
    playerCount: number
    mapCount: number
    passCount: number
    survivalCount: number
  }
  records: MapChallengeRecordItem[]
}

export type ManagedNodeStatus = 'ONLINE' | 'OFFLINE' | 'DISABLED'

export interface ManagedNodeHeartbeatServerItem {
  key: string
  containerName?: string | null
  state?: string | null
  status?: string | null
  id?: string | null
  groups?: string[]
  image?: string[] | string | null
}

export interface ManagedNodeHeartbeatSummary {
  configuredServers?: number
  runningServers?: number
  missingServers?: number
}

export interface ManagedNodeHeartbeatItem {
  hostname?: string | null
  platform?: string | null
  capabilities?: string[]
  summary?: ManagedNodeHeartbeatSummary | null
  stats?: Record<string, unknown> | null
  servers?: ManagedNodeHeartbeatServerItem[]
  metadata?: Record<string, unknown> | null
}

export interface KepcsCatalogServerItem {
  id: string
  shotId: string
  mode: string
  name: string
  host: string
  port: number
  defaultMap: string
  defaultMapId: string
  hasRconPassword: boolean
  isActive: boolean
  defaultMapMonitorEnabled: boolean
  defaultMapIdleThresholdSeconds: number
  idleRestartEnabled: boolean
  idleRestartWindowStart: string
  idleRestartWindowEnd: string
  idleRestartThresholdSeconds: number
  idleRestartCooldownSeconds: number
}

export interface CommunityCatalogServerItem {
  id: string
  community: string
  name: string
  host: string
  port: number
  sortOrder: number
  isActive: boolean
}

export interface DefaultMapMonitorConfig {
  enabled: boolean
  checkIntervalSeconds: number
  createdAt?: string | null
  updatedAt?: string | null
}

export interface DefaultMapMonitorRuntimeSummary {
  inspectedCount: number
  eligibleCount: number
  switchedCount: number
  trackedIdleCount: number
}

export interface DefaultMapMonitorSwitchItem {
  serverId: string
  name: string
  endpoint: string
  previousMap: string
  targetMap: string
  workshopId: string
  switchedAt: string
}

export interface DefaultMapMonitorRuntime {
  lastCheckedAt?: string | null
  lastSwitchAt?: string | null
  lastError?: string | null
  lastSummary: DefaultMapMonitorRuntimeSummary
  recentSwitches: DefaultMapMonitorSwitchItem[]
}

export interface IdleRestartMonitorConfig {
  enabled: boolean
  checkIntervalSeconds: number
  timezone?: string
  createdAt?: string | null
  updatedAt?: string | null
}

export interface IdleRestartMonitorRuntimeSummary {
  inspectedCount: number
  eligibleCount: number
  matchedCount: number
  queuedCount: number
  windowActiveCount: number
  trackedIdleCount: number
}

export interface IdleRestartMonitorRestartItem {
  serverId: string
  name: string
  shotId: string
  endpoint: string
  nodeId: string
  nodeName: string
  serverKey: string
  restartedAt: string
}

export interface IdleRestartMonitorRuntime {
  lastCheckedAt?: string | null
  lastRestartAt?: string | null
  lastError?: string | null
  windowActive?: boolean
  lastSummary: IdleRestartMonitorRuntimeSummary
  recentRestarts: IdleRestartMonitorRestartItem[]
}

export type NodeCommandStatus =
  | 'PENDING'
  | 'CLAIMED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'

export interface ManagedNodeItem {
  id: string
  code: string
  name: string
  host?: string | null
  note?: string | null
  isActive: boolean
  status: ManagedNodeStatus
  isOnline: boolean
  lastSeenAt?: string | null
  lastIp?: string | null
  agentVersion?: string | null
  lastHeartbeat?: ManagedNodeHeartbeatItem | null
  createdAt: string
  updatedAt: string
}

export interface NodeCommandItem {
  id: string
  nodeId: string
  commandType: string
  payload: Record<string, unknown>
  status: NodeCommandStatus
  createdBySteamId: string
  createdByRole?: string | null
  claimedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  expiresAt?: string | null
  result?: unknown
  errorMessage?: string | null
  notificationChannelKeys?: string[]
  sourceScheduleId?: string | null
  sourceScheduleName?: string | null
  createdAt: string
  updatedAt: string
  node?: ManagedNodeItem
}

export interface NodeCommandLogItem {
  id: string
  nodeId: string
  commandId: string
  level: string
  message: string
  createdAt: string
}

export interface NodeScheduleConfig {
  type: 'interval_minutes' | 'daily' | 'every_n_days' | 'every_n_hours'
  intervalMinutes?: number
  time?: string
  intervalDays?: number
  anchorDate?: string
  intervalHours?: number
  windowStart?: string
  windowEnd?: string
  timezone?: string
}

export interface NodeCommandScheduleItem {
  id: string
  nodeId: string
  name: string
  commandType: string
  payload: Record<string, unknown>
  notificationChannelKeys?: string[]
  intervalMinutes: number
  scheduleConfig?: NodeScheduleConfig | null
  scheduleSummary?: string
  nextRunAt: string | null
  lastQueuedAt?: string | null
  lastCommandId?: string | null
  isActive: boolean
  createdBySteamId: string
  createdAt: string
  updatedAt: string
  node?: ManagedNodeItem
}

export interface GotifyChannelItem {
  key: string
  name: string
  serverUrl: string
  token?: string
  description?: string
  enabled: boolean
  priority: number
}

export interface GotifyConfig {
  channels: GotifyChannelItem[]
}
