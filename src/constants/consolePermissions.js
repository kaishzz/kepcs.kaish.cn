const CONSOLE_PERMISSION_CATALOG = [
  {
    key: "console.my_cdks",
    label: "我的 CDK",
    description: "白名单玩家登录后默认可访问",
    section: "基础功能",
    editable: false,
  },
  {
    key: "console.manage_cdks",
    label: "CDK 管理",
    description: "新增、编辑、批量管理 CDK",
    section: "控制台功能",
    editable: true,
  },
  {
    key: "console.logs.audit",
    label: "日志管理 · 操作日志",
    description: "查看后台操作日志",
    section: "日志管理",
    editable: true,
  },
  {
    key: "console.logs.orders",
    label: "日志管理 · 用户订单",
    description: "查看用户购买订单",
    section: "日志管理",
    editable: true,
  },
  {
    key: "console.map_challenges",
    label: "魔怔数据",
    description: "录入与管理魔怔排行榜数据",
    section: "控制台功能",
    editable: true,
  },
  {
    key: "console.access.manage",
    label: "权限分配",
    description: "管理权限组与 SteamID 直授",
    section: "新增管理",
    editable: true,
  },
  {
    key: "console.whitelist.manual",
    label: "新增管理 · 新增白名单",
    description: "后台直接新增白名单记录",
    section: "新增管理",
    editable: true,
  },
  {
    key: "console.whitelist.migration",
    label: "新增管理 · 数据迁移",
    description: "迁移白名单玩家 SteamID",
    section: "新增管理",
    editable: true,
  },
  {
    key: "console.agents.nodes",
    label: "服务器控制 · 节点列表",
    description: "查看和维护 Agent 节点",
    section: "服务器控制",
    editable: true,
  },
  {
    key: "console.agents.control",
    label: "服务器控制 · 服务器操作",
    description: "批量控制服务器启停与同步",
    section: "服务器控制",
    editable: true,
  },
  {
    key: "console.agents.commands",
    label: "服务器控制 · 节点指令",
    description: "执行节点级维护指令与 RCON 指令",
    section: "服务器控制",
    editable: true,
  },
  {
    key: "console.agents.schedules",
    label: "服务器控制 · 定时任务",
    description: "管理节点定时执行计划",
    section: "服务器控制",
    editable: true,
  },
  {
    key: "console.agents.logs",
    label: "服务器控制 · 日志管理",
    description: "查看命令与执行日志",
    section: "服务器控制",
    editable: true,
  },
  {
    key: "console.server_catalog.kepcs",
    label: "服务器目录 · 开水服列表",
    description: "维护开水服服务器目录",
    section: "服务器目录",
    editable: true,
  },
  {
    key: "console.server_catalog.default_map",
    label: "服务器目录 · 空服自动换图",
    description: "管理空服自动换图总开关与单服策略",
    section: "服务器目录",
    editable: true,
  },
  {
    key: "console.server_catalog.idle_restart",
    label: "服务器目录 · 空服自动重启",
    description: "管理空服自动重启总开关与单服策略",
    section: "服务器目录",
    editable: true,
  },
  {
    key: "console.server_catalog.community",
    label: "服务器目录 · 社区服列表",
    description: "维护社区服目录",
    section: "服务器目录",
    editable: true,
  },
  {
    key: "console.products.manage",
    label: "商品管理",
    description: "维护支付商品",
    section: "控制台功能",
    editable: true,
  },
];

const CONSOLE_BASE_PERMISSION_KEYS = CONSOLE_PERMISSION_CATALOG
  .filter((item) => item.editable === false)
  .map((item) => item.key);

const CONSOLE_EDITABLE_PERMISSION_KEYS = CONSOLE_PERMISSION_CATALOG
  .filter((item) => item.editable !== false)
  .map((item) => item.key);

const ALL_CONSOLE_PERMISSION_KEYS = CONSOLE_PERMISSION_CATALOG.map((item) => item.key);

const CONSOLE_PERMISSION_SECTIONS = Array.from(
  new Set(CONSOLE_PERMISSION_CATALOG.map((item) => item.section)),
).map((section) => ({
  section,
  items: CONSOLE_PERMISSION_CATALOG.filter((item) => item.section === section),
}));

const CONSOLE_STAFF_PERMISSION_KEYS = CONSOLE_EDITABLE_PERMISSION_KEYS;

function normalizePermissionList(values, { editableOnly = false } = {}) {
  const source = editableOnly ? CONSOLE_EDITABLE_PERMISSION_KEYS : ALL_CONSOLE_PERMISSION_KEYS;
  const allowSet = new Set(source);

  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter((value) => allowSet.has(value)),
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
  CONSOLE_PERMISSION_SECTIONS,
  CONSOLE_STAFF_PERMISSION_KEYS,
  isKnownConsolePermission,
  normalizePermissionList,
};
