# KepCs 官网与后台控制台

KepCs 是开水服官网与后台控制台项目，负责前台展示、支付与订单查询、CDK 与白名单管理、服务器数据维护，以及与 `KepAgent` 协作的节点控制能力。

当前仓库是网站与控制平面仓库。执行端 Agent 位于配套仓库：

- `E:\GitHubProjects\KepRepository\KepAgent`

## 核心能力

- 官网服务器展示、购买商品、支付结果与订单查询
- Steam 登录后台
- 我的 CDK、CDK 管理、商品管理
- 操作日志、订单日志
- 玩家查询、魔怔排行榜
- 权限组与 SteamID 直授
- KepAgent 节点管理、批量操作、节点操作、定时任务、通知管理、日志管理
- 开水服列表、社区服列表、空服自动换图、空服自动重启

## 仓库结构

```text
.
|-- deploy/                 部署示例
|-- prisma/                 Prisma schema
|-- public/                 后端静态资源
|-- scripts/                构建与同步脚本
|-- server_upload/          部署镜像目录
|-- src/                    Fastify 后端
|-- test/                   Node.js 测试
|-- web/                    Vue 3 前端
|-- .env.example            环境变量模板
`-- README.md
```

## 技术栈

- 后端：`Node.js`、`Fastify`、`Prisma`、`MySQL`、`Redis`
- 前端：`Vue 3`、`Vite`、`TypeScript`、`Naive UI`、`UnoCSS`

## 本地开发

### 1. 安装依赖

```bash
npm install
npm run web:install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

常用配置分组：

- 站点与登录：`SESSION_SECRET`、`ROOT_STEAM_IDS`
- 数据库：`DATABASE_URL`
- Redis：`REDIS_URL`
- Steam：`STEAM_WEB_API_KEY`
- 支付：`ZHUPAY_*`
- 邮件：`SMTP_*`
- 外部接口：`WHITELIST_API_KEY`、`SERVER_LIST_API_KEY`
- 服务器目录数据库：`SERVER_CATALOG_DB_*`

### 3. 初始化 Prisma

```bash
npm run prisma:generate
npm run prisma:push
```

### 4. 启动开发环境

```bash
npm run dev
npm run dev:web
```

## 常用脚本

```bash
npm run dev
npm run dev:web
npm run build:web
npm run prepare:prod
npm run prisma:generate
npm run prisma:push
npm test
npm --prefix web run type-check
npm --prefix web run lint
```

## KepAgent 对接

网站控制台负责：

- 节点注册与令牌轮换
- Agent 心跳接收与状态展示
- 命令下发、日志回传与结果记录
- 定时任务配置
- Gotify 通知渠道配置

当前网站与 `KepAgent` 对齐的命令集合包括：

- `agent.ping`
- `docker.list_servers`
- `docker.start_server`
- `docker.stop_server`
- `docker.restart_server`
- `docker.remove_server`
- `docker.start_group`
- `docker.stop_group`
- `docker.restart_group`
- `node.kill_all`
- `node.rcon_command`
- `node.check_update`
- `node.check_validate`
- `node.get_oldver`
- `node.get_nowver`
- `node.monitor_check`
- `node.monitor_start`

仓库内已经加入自动校验，测试会检查：

- 控制台前后端引用的权限键是否全部存在于权限目录
- 网站支持的节点命令集合是否和 `KepAgent` 的支持列表一致

## 定时任务与通知

节点定时任务当前支持以下规则：

- 每 N 分钟
- 每天固定时间
- 每 N 天固定时间
- 每 N 小时按时间窗执行

Gotify 支持多渠道配置、渠道级测试发送，以及任务触发/完成通知。

Gotify 实际发送格式：

```http
POST {serverUrl}/message?token=<AppToken>
Content-Type: application/json
```

```json
{
  "title": "KEPCS Gotify 测试通知",
  "message": "如果你收到了这条消息，说明当前 Gotify 渠道配置可用。",
  "priority": 5
}
```

## RCON 说明

手动 RCON 支持：

- 按分组发送
- 按单台或多台服务器发送

密码来源优先级：

1. 控制台命令 payload 中按服务器透传的密码
2. `KepAgent` 中 `servers[].rcon_password`
3. `KEPAGENT_RCON_PASSWORD`

控制台展示、日志与审计记录会自动脱敏，不会把明文密码直接显示在页面上。

## 安全与验证

建议在改动后至少执行：

```bash
npm test
npm --prefix web run type-check
npm run build:web
```

当前仓库已补充的检查包括：

- 权限目录覆盖检查
- 网站 / Agent 命令集合一致性检查
- npm 依赖安全扫描

## 部署

### 生产构建

```bash
npm install
npm run prepare:prod
npm start
```

### PM2

```bash
pm2 start deploy/ecosystem.config.cjs
```

### Nginx

参考：

- `deploy/nginx.kepcs.kaish.cn.conf`

## 部署镜像说明

`server_upload/` 是主项目的部署镜像目录。部署前后建议保持以下内容同步：

- 主项目源码变更对应文件
- `dist/` 与 `server_upload/dist/`
- `.env.example` 与 `.env` 结构
- 如存在 `server_upload/.env`，也应保持字段结构同步
