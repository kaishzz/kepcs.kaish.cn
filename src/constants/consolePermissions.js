function createPermissionItem({
  key,
  label,
  description,
  section,
  directoryPath,
  grantMode = "assignable",
}) {
  return {
    key,
    label,
    description,
    section,
    directoryPath,
    grantMode,
  };
}

const CONSOLE_PERMISSION_CATALOG = [
  createPermissionItem({
    key: "console.my_cdks",
    label: "我的 CDK",
    description: "白名单玩家登录后默认可访问",
    section: "基础功能",
    directoryPath: ["基础功能", "我的 CDK", "默认入口"],
    grantMode: "default",
  }),
  createPermissionItem({
    key: "console.manage_cdks.create",
    label: "CDK 管理 · 新增 CDK",
    description: "按持有人和有效期新增 CDK",
    section: "控制台功能",
    directoryPath: ["控制台功能", "CDK 管理", "新增 CDK"],
  }),
  createPermissionItem({
    key: "console.manage_cdks.self",
    label: "CDK 管理 · 给我自己生成",
    description: "只给当前账号快速生成 CDK",
    section: "控制台功能",
    directoryPath: ["控制台功能", "CDK 管理", "给我自己生成"],
  }),
  createPermissionItem({
    key: "console.manage_cdks.batch",
    label: "CDK 管理 · 批量管理",
    description: "批量筛选、编辑、转移和删除 CDK",
    section: "控制台功能",
    directoryPath: ["控制台功能", "CDK 管理", "批量管理"],
  }),
  createPermissionItem({
    key: "console.logs.audit",
    label: "日志管理 · 操作日志",
    description: "查看后台操作日志",
    section: "日志管理",
    directoryPath: ["日志管理", "日志列表", "操作日志"],
  }),
  createPermissionItem({
    key: "console.logs.orders",
    label: "日志管理 · 用户订单",
    description: "查看用户购买订单",
    section: "日志管理",
    directoryPath: ["日志管理", "日志列表", "用户订单"],
  }),
  createPermissionItem({
    key: "console.map_challenges.edit",
    label: "魔怔数据 · 新增 / 更新记录",
    description: "新增或更新魔怔排行榜记录",
    section: "控制台功能",
    directoryPath: ["控制台功能", "魔怔数据", "新增 / 更新记录"],
  }),
  createPermissionItem({
    key: "console.map_challenges.recent",
    label: "魔怔数据 · 记录管理",
    description: "查看和筛选全部魔怔数据记录",
    section: "控制台功能",
    directoryPath: ["控制台功能", "魔怔数据", "记录管理"],
  }),
  createPermissionItem({
    key: "console.access.groups",
    label: "权限管理 · 权限组",
    description: "管理权限组、组权限和组成员",
    section: "权限管理",
    directoryPath: ["权限管理", "权限分配", "权限组"],
  }),
  createPermissionItem({
    key: "console.access.users",
    label: "权限管理 · SteamID 直授",
    description: "管理 SteamID 直授权限",
    section: "权限管理",
    directoryPath: ["权限管理", "权限分配", "SteamID 直授"],
  }),
  createPermissionItem({
    key: "console.whitelist.manual",
    label: "服务器数据 · 新增白名单",
    description: "后台直接新增白名单记录",
    section: "服务器数据",
    directoryPath: ["服务器数据", "新增白名单", "后台直接新增"],
  }),
  createPermissionItem({
    key: "console.whitelist.migration",
    label: "服务器数据 · 数据迁移",
    description: "迁移白名单玩家 SteamID",
    section: "服务器数据",
    directoryPath: ["服务器数据", "数据迁移", "SteamID 迁移"],
  }),
  createPermissionItem({
    key: "console.agents.nodes.list",
    label: "服务器控制 · 节点列表",
    description: "查看节点状态和心跳摘要",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点管理", "节点列表"],
  }),
  createPermissionItem({
    key: "console.agents.nodes.manage",
    label: "服务器控制 · 节点配置",
    description: "新增节点、编辑节点和重置节点令牌",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点管理", "节点配置"],
  }),
  createPermissionItem({
    key: "console.agents.control.groups",
    label: "服务器控制 · 分组操作",
    description: "按节点分组执行启动、停止和重启",
    section: "服务器控制",
    directoryPath: ["服务器控制", "批量操作", "分组操作"],
  }),
  createPermissionItem({
    key: "console.agents.control.servers",
    label: "服务器控制 · 服务器批量操作",
    description: "勾选服务器并执行批量启停、重启和删除",
    section: "服务器控制",
    directoryPath: ["服务器控制", "批量操作", "服务器批量操作 / 服务器列表"],
  }),
  createPermissionItem({
    key: "console.agents.commands.maintain",
    label: "服务器控制 · 维护命令",
    description: "执行节点维护命令、版本检查和崩溃检查",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点操作", "维护命令"],
  }),
  createPermissionItem({
    key: "console.agents.rcon",
    label: "服务器控制 · RCON 操作",
    description: "执行 RCON 指令",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点操作", "RCON 操作"],
  }),
  createPermissionItem({
    key: "console.agents.commands.running",
    label: "服务器控制 · 进行中命令",
    description: "查看和终止进行中的节点命令",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点操作", "进行中命令"],
  }),
  createPermissionItem({
    key: "console.agents.schedules.edit",
    label: "服务器控制 · 编辑任务",
    description: "新增、编辑和删除节点定时任务",
    section: "服务器控制",
    directoryPath: ["服务器控制", "定时任务", "编辑任务"],
  }),
  createPermissionItem({
    key: "console.agents.schedules.list",
    label: "服务器控制 · 任务列表",
    description: "查看和筛选当前节点定时任务列表",
    section: "服务器控制",
    directoryPath: ["服务器控制", "定时任务", "任务列表"],
  }),
  createPermissionItem({
    key: "console.agents.notifications.create",
    label: "服务器控制 · 新增渠道",
    description: "新增 Gotify 通知渠道",
    section: "服务器控制",
    directoryPath: ["服务器控制", "通知管理", "新增渠道"],
  }),
  createPermissionItem({
    key: "console.agents.notifications.manage",
    label: "服务器控制 · 渠道管理",
    description: "管理通知渠道开关、内容和批量启停",
    section: "服务器控制",
    directoryPath: ["服务器控制", "通知管理", "渠道管理"],
  }),
  createPermissionItem({
    key: "console.agents.notifications.test",
    label: "服务器控制 · 发送测试",
    description: "发送 Gotify 测试通知",
    section: "服务器控制",
    directoryPath: ["服务器控制", "通知管理", "发送测试"],
  }),
  createPermissionItem({
    key: "console.agents.logs.history",
    label: "服务器控制 · 命令历史",
    description: "查看节点命令历史和执行摘要",
    section: "服务器控制",
    directoryPath: ["服务器控制", "日志管理", "命令历史"],
  }),
  createPermissionItem({
    key: "console.agents.logs.detail",
    label: "服务器控制 · 执行日志",
    description: "查看单条命令的详细执行日志",
    section: "服务器控制",
    directoryPath: ["服务器控制", "日志管理", "执行日志"],
  }),
  createPermissionItem({
    key: "console.server_catalog.kepcs",
    label: "服务器数据 · 开水服列表",
    description: "维护开水服服务器数据目录",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "开水服列表"],
  }),
  createPermissionItem({
    key: "console.server_catalog.community",
    label: "服务器数据 · 社区服列表",
    description: "维护社区服目录",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "社区服列表"],
  }),
  createPermissionItem({
    key: "console.server_catalog.default_map",
    label: "服务器数据 · 空服自动换图",
    description: "管理空服自动换图总开关与单服策略",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "空服自动换图"],
  }),
  createPermissionItem({
    key: "console.server_catalog.idle_restart",
    label: "服务器数据 · 空服自动重启",
    description: "管理空服自动重启总开关与单服策略",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "空服自动重启"],
  }),
  createPermissionItem({
    key: "console.products.create",
    label: "商品管理 · 新增商品",
    description: "新增支付商品",
    section: "控制台功能",
    directoryPath: ["控制台功能", "商品管理", "新增商品"],
  }),
  createPermissionItem({
    key: "console.products.list",
    label: "商品管理 · 商品列表",
    description: "查看、编辑和上下架商品",
    section: "控制台功能",
    directoryPath: ["控制台功能", "商品管理", "商品列表"],
  }),
  createPermissionItem({
    key: "console.manage_cdks",
    label: "CDK 管理（旧兼容权限）",
    description: "旧权限会自动展开到新增 CDK / 给我自己生成 / 批量管理",
    section: "控制台功能",
    directoryPath: ["控制台功能", "CDK 管理", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.map_challenges",
    label: "魔怔数据（旧兼容权限）",
    description: "旧权限会自动展开到新增 / 更新记录和记录管理",
    section: "控制台功能",
    directoryPath: ["控制台功能", "魔怔数据", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.access.manage",
    label: "权限管理（旧兼容权限）",
    description: "旧权限会自动展开到权限组和 SteamID 直授",
    section: "权限管理",
    directoryPath: ["权限管理", "权限分配", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.agents.nodes",
    label: "节点管理（旧兼容权限）",
    description: "旧权限会自动展开到节点列表和节点配置",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点管理", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.agents.control",
    label: "批量操作（旧兼容权限）",
    description: "旧权限会自动展开到分组操作和服务器批量操作",
    section: "服务器控制",
    directoryPath: ["服务器控制", "批量操作", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.agents.commands",
    label: "节点操作（旧兼容权限）",
    description: "旧权限会自动展开到维护命令和进行中命令",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点操作", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.agents.schedules",
    label: "定时任务 / 通知管理（旧兼容权限）",
    description: "旧权限会自动展开到任务编辑、任务列表和通知管理",
    section: "服务器控制",
    directoryPath: ["服务器控制", "定时任务 / 通知管理", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.agents.logs",
    label: "日志管理（旧兼容权限）",
    description: "旧权限会自动展开到命令历史和执行日志",
    section: "服务器控制",
    directoryPath: ["服务器控制", "日志管理", "旧兼容权限"],
    grantMode: "legacy",
  }),
  createPermissionItem({
    key: "console.products.manage",
    label: "商品管理（旧兼容权限）",
    description: "旧权限会自动展开到新增商品和商品列表",
    section: "控制台功能",
    directoryPath: ["控制台功能", "商品管理", "旧兼容权限"],
    grantMode: "legacy",
  }),
];

const CONSOLE_PERMISSION_LEGACY_EXPANSIONS = {
  "console.manage_cdks": [
    "console.manage_cdks.create",
    "console.manage_cdks.self",
    "console.manage_cdks.batch",
  ],
  "console.map_challenges": [
    "console.map_challenges.edit",
    "console.map_challenges.recent",
  ],
  "console.access.manage": [
    "console.access.groups",
    "console.access.users",
  ],
  "console.agents.nodes": [
    "console.agents.nodes.list",
    "console.agents.nodes.manage",
  ],
  "console.agents.control": [
    "console.agents.control.groups",
    "console.agents.control.servers",
  ],
  "console.agents.commands": [
    "console.agents.commands.maintain",
    "console.agents.commands.running",
  ],
  "console.agents.schedules": [
    "console.agents.schedules.edit",
    "console.agents.schedules.list",
    "console.agents.notifications.create",
    "console.agents.notifications.manage",
    "console.agents.notifications.test",
  ],
  "console.agents.logs": [
    "console.agents.logs.history",
    "console.agents.logs.detail",
  ],
  "console.products.manage": [
    "console.products.create",
    "console.products.list",
  ],
};

const ALL_CONSOLE_PERMISSION_KEYS = CONSOLE_PERMISSION_CATALOG.map((item) => item.key);

const CONSOLE_BASE_PERMISSION_KEYS = CONSOLE_PERMISSION_CATALOG
  .filter((item) => item.grantMode === "default")
  .map((item) => item.key);

const CONSOLE_EDITABLE_PERMISSION_KEYS = CONSOLE_PERMISSION_CATALOG
  .filter((item) => item.grantMode === "assignable")
  .map((item) => item.key);

const CONSOLE_PERMISSION_SECTIONS = Array.from(
  new Set(
    CONSOLE_PERMISSION_CATALOG
      .filter((item) => item.grantMode === "assignable")
      .map((item) => item.section),
  ),
).map((section) => ({
  section,
  items: CONSOLE_PERMISSION_CATALOG.filter(
    (item) => item.section === section && item.grantMode === "assignable",
  ),
}));

const CONSOLE_STAFF_PERMISSION_KEYS = [...CONSOLE_EDITABLE_PERMISSION_KEYS];

function expandPermissionKeys(values, { includeSource = false } = {}) {
  const expanded = new Set();
  const visiting = new Set();

  function visit(permissionKey, isSource) {
    const normalizedPermissionKey = String(permissionKey || "").trim();

    if (!normalizedPermissionKey || visiting.has(normalizedPermissionKey)) {
      return;
    }

    const nextKeys = CONSOLE_PERMISSION_LEGACY_EXPANSIONS[normalizedPermissionKey];
    const shouldIncludeKey = !nextKeys || includeSource || !isSource;

    if (shouldIncludeKey) {
      expanded.add(normalizedPermissionKey);
    }

    if (!nextKeys?.length) {
      return;
    }

    visiting.add(normalizedPermissionKey);
    nextKeys.forEach((nextKey) => visit(nextKey, false));
    visiting.delete(normalizedPermissionKey);
  }

  (Array.isArray(values) ? values : []).forEach((permissionKey) => visit(permissionKey, true));

  return Array.from(expanded).sort((left, right) => left.localeCompare(right, "en"));
}

function normalizePermissionList(values, { editableOnly = false, includeLegacy = false } = {}) {
  const normalizedSource = editableOnly
    ? CONSOLE_EDITABLE_PERMISSION_KEYS
    : includeLegacy
      ? ALL_CONSOLE_PERMISSION_KEYS
      : [...CONSOLE_BASE_PERMISSION_KEYS, ...CONSOLE_EDITABLE_PERMISSION_KEYS];
  const allowSet = new Set(normalizedSource);
  const expandedValues = expandPermissionKeys(values, { includeSource: includeLegacy });

  return Array.from(
    new Set(
      expandedValues.filter((value) => allowSet.has(String(value || "").trim())),
    ),
  ).sort((left, right) => left.localeCompare(right, "en"));
}

function isKnownConsolePermission(permissionKey) {
  return ALL_CONSOLE_PERMISSION_KEYS.includes(String(permissionKey || "").trim());
}

module.exports = {
  ALL_CONSOLE_PERMISSION_KEYS,
  CONSOLE_BASE_PERMISSION_KEYS,
  CONSOLE_EDITABLE_PERMISSION_KEYS,
  CONSOLE_PERMISSION_CATALOG,
  CONSOLE_PERMISSION_LEGACY_EXPANSIONS,
  CONSOLE_PERMISSION_SECTIONS,
  CONSOLE_STAFF_PERMISSION_KEYS,
  expandPermissionKeys,
  isKnownConsolePermission,
  normalizePermissionList,
};
