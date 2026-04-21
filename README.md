# KepCs 官网与控制台

这个仓库是 KepCs 的网站与控制平面仓库，负责前台页面、后台控制台、支付与订单、CDK 与权限管理，以及和 `KepAgent` 的节点控制联动。

配套执行端仓库：

- `E:\GitHubProjects\KepRepository\KepAgent`

## 当前标识约定

当前系统统一使用以下官方服务器标识：

- 开水服 `mode`：`ze_xl`、`ze_pt`
- 节点服务器键值：`ze_xl_1..6`、`ze_pt_1..6`、`ze_xl_test`、`ze_pt_test`
- 节点趋势字段：`xlTotal`、`ptTotal`、`xlOccupied`、`ptOccupied`

## 当前能力

官网：

- 服务器列表
- 商品购买
- 支付结果
- 订单查询
- 玩家查询
- 数据统计
- 魔怔排行榜

控制台：

- Steam 登录
- 商品管理
- 订单日志
- CDK 与我的 CDK
- 权限组与 SteamID 直授
- 开水服列表与社区服列表维护
- 空闲自动换图
- 空闲自动重启
- 节点管理
- 批量操作
- 节点命令
- 定时任务
- Gotify 通知
- 命令日志

## 技术栈

- 后端：`Node.js`、`Fastify`、`Prisma`、`MySQL`、`Redis`
- 前端：`Vue 3`、`Vite`、`TypeScript`、`Naive UI`、`UnoCSS`

## 目录

```text
.
|-- prisma/
|-- public/
|-- scripts/
|-- server_upload/
|-- src/
|-- test/
|-- web/
|-- .env.example
`-- README.md
```

## 本地开发

安装依赖：

```bash
npm install
npm run web:install
```

准备环境变量：

```bash
cp .env.example .env
```

常用配置项可直接查看 `.env.example`，主要覆盖：

- 站点与登录
- MySQL / Prisma
- Redis
- Steam
- 支付
- 邮件
- KepApi 外部接口
- 服务器目录数据库

初始化 Prisma：

```bash
npm run prisma:generate
npm run prisma:push
```

启动：

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
npm run sync:server-upload
```

## KepAgent 对接

控制台当前支持的节点命令包括：

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

控制台负责：

- 节点注册与令牌轮换
- 心跳接收与状态展示
- 命令下发
- 日志回传
- 结果记录
- 定时任务配置
- Gotify 通知渠道配置

## 验证

建议改动后执行：

```bash
npm test
npm --prefix web run type-check
npm run build:web
```

## 部署镜像

`server_upload/` 是主项目的部署镜像目录。

当前约定：

- 部署相关源码变更后同步到 `server_upload/`
- `dist/` 与 `server_upload/dist/` 保持一致
- 使用 `npm run sync:server-upload` 完成镜像同步
