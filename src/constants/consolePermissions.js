const CONSOLE_PERMISSION_CATALOG = [
  {
    key: "console.my_cdks",
    label: "我的 CDK",
    description: "白名单玩家登录后默认可访问",
    section: "基础功能",
    directoryPath: ["基础功能", "我的 CDK", "默认入口"],
    editable: false,
  },
  {
    key: "console.manage_cdks",
    label: "CDK 管理",
    description: "新增、编辑、批量管理 CDK",
    section: "控制台功能",
    directoryPath: ["控制台功能", "CDK 管理", "新增 / 给我自己生成 / 批量管理"],
    editable: true,
  },
  {
    key: "console.logs.audit",
    label: "日志管理 · 操作日志",
    description: "查看后台操作日志",
    section: "日志管理",
    directoryPath: ["日志管理", "日志列表", "操作日志"],
    editable: true,
  },
  {
    key: "console.logs.orders",
    label: "日志管理 · 用户订单",
    description: "查看用户购买订单",
    section: "日志管理",
    directoryPath: ["日志管理", "日志列表", "用户订单"],
    editable: true,
  },
  {
    key: "console.map_challenges",
    label: "魔怔数据",
    description: "录入与管理魔怔排行榜数据",
    section: "控制台功能",
    directoryPath: ["控制台功能", "魔怔数据", "新增 / 更新记录 + 最近记录"],
    editable: true,
  },
  {
    key: "console.access.manage",
    label: "权限管理",
    description: "管理权限组与 SteamID 直授",
    section: "权限管理",
    directoryPath: ["权限管理", "权限分配", "权限组 + SteamID 直授"],
    editable: true,
  },
  {
    key: "console.whitelist.manual",
    label: "服务器数据 · 新增白名单",
    description: "后台直接新增白名单记录",
    section: "服务器数据",
    directoryPath: ["服务器数据", "新增白名单", "后台直接新增"],
    editable: true,
  },
  {
    key: "console.whitelist.migration",
    label: "服务器数据 · 数据迁移",
    description: "迁移白名单玩家 SteamID",
    section: "服务器数据",
    directoryPath: ["服务器数据", "数据迁移", "SteamID 迁移"],
    editable: true,
  },
  {
    key: "console.agents.nodes",
    label: "服务器控制 · 节点管理",
    description: "查看和维护 KepAgent 节点",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点管理", "节点列表 + 节点配置"],
    editable: true,
  },
  {
    key: "console.agents.control",
    label: "服务器控制 · 批量操作",
    description: "批量控制服务器启停、重启与同步",
    section: "服务器控制",
    directoryPath: ["服务器控制", "批量操作", "分组操作 + 服务器批量操作"],
    editable: true,
  },
  {
    key: "console.agents.commands",
    label: "服务器控制 · 节点操作",
    description: "执行节点级维护命令并管理进行中命令",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点操作", "维护命令 + RCON 操作 + 进行中命令"],
    editable: true,
  },
  {
    key: "console.agents.rcon",
    label: "服务器控制 · RCON 操作",
    description: "执行 RCON 指令并管理 RCON 定时任务",
    section: "服务器控制",
    directoryPath: ["服务器控制", "节点操作", "RCON 操作"],
    editable: true,
  },
  {
    key: "console.agents.schedules",
    label: "服务器控制 · 定时任务",
    description: "管理节点定时任务与 Gotify 通知渠道",
    section: "服务器控制",
    directoryPath: ["服务器控制", "定时任务 / 通知管理", "编辑任务 / 任务列表 / 新增渠道 / 渠道管理 / 发送测试"],
    editable: true,
  },
  {
    key: "console.agents.logs",
    label: "服务器控制 · 日志管理",
    description: "查看命令与执行日志",
    section: "服务器控制",
    directoryPath: ["服务器控制", "日志管理", "命令历史 + 执行日志"],
    editable: true,
  },
  {
    key: "console.server_catalog.kepcs",
    label: "服务器数据 · 开水服列表",
    description: "维护开水服服务器数据目录",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "开水服列表"],
    editable: true,
  },
  {
    key: "console.server_catalog.community",
    label: "服务器数据 · 社区服列表",
    description: "维护社区服目录",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "社区服列表"],
    editable: true,
  },
  {
    key: "console.server_catalog.default_map",
    label: "服务器数据 · 空服自动换图",
    description: "管理空服自动换图总开关与单服策略",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "空服自动换图"],
    editable: true,
  },
  {
    key: "console.server_catalog.idle_restart",
    label: "服务器数据 · 空服自动重启",
    description: "管理空服自动重启总开关与单服策略",
    section: "服务器数据",
    directoryPath: ["服务器数据", "服务器目录", "空服自动重启"],
    editable: true,
  },
  {
    key: "console.products.manage",
    label: "商品管理",
    description: "维护支付商品",
    section: "控制台功能",
    directoryPath: ["控制台功能", "商品管理", "新增商品 + 商品列表"],
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
