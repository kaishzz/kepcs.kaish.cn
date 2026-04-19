# KepCs 官网与控制台

KepCs 是开水服官网与后台控制台项目，提供前台展示、订单与白名单业务、玩家查询、CDK 管理、服务器目录维护，以及与 `KepAgent` 配合使用的节点控制能力。

项目采用前后端同仓结构：

- 根目录 `src/` 为 Fastify 后端
- 根目录 `web/` 为 Vue 3 管理台与官网前端
- `prisma/` 维护 Prisma schema
- `test/` 存放后端单元测试

## 核心能力

- 官网服务器展示、支付下单、订单结果与订单查询
- Steam 登录后的后台控制台
- 白名单、CDK、商品、玩家查询与操作日志
- 开水服与社区服目录维护
- Agent 节点注册、心跳、命令下发、日志回传
- 节点服务器批量启停、重启、删除与版本维护
- 手动 RCON、定时任务、Gotify 通知渠道
- 空服自动换图、空服定时重启

## 技术栈

- 后端：`Node.js`、`Fastify`、`Prisma`、`MySQL`、`Redis`
- 前端：`Vue 3`、`Vite`、`TypeScript`、`Naive UI`、`UnoCSS`

## 目录结构

```text
.
|-- deploy/         部署示例
|-- prisma/         Prisma schema
|-- public/         后端静态资源
|-- src/            Fastify 后端
|-- test/           后端测试
|-- web/            Vue 3 前端
|-- .env.example    环境变量模板
`-- README.md
```

## 环境要求

- `Node.js 20+`
- `MySQL 8+`
- `Redis 6+`

## 快速开始

1. 安装根目录依赖

```bash
npm install
```

2. 安装前端依赖

```bash
npm run web:install
```

3. 复制环境变量模板

```bash
cp .env.example .env
```

4. 生成 Prisma Client

```bash
npm run prisma:generate
```

5. 初始化或同步数据库结构

```bash
npm run prisma:push
```

6. 启动后端与前端开发环境

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
```

前端单独检查：

```bash
npm --prefix web run type-check
npm --prefix web run lint
```

## 环境变量说明

完整字段见 [`.env.example`](./.env.example)。

常用配置分组如下：

- 站点与登录：`SESSION_SECRET`、`ROOT_STEAM_IDS`
- 数据库：`DATABASE_URL`
- Redis：`REDIS_URL`
- Steam：`STEAM_WEB_API_KEY`
- 支付：`ZHUPAY_*`
- 邮件：`SMTP_*`
- 上游接口：`WHITELIST_API_KEY`、`SERVER_LIST_API_KEY`
- 服务器目录数据库：`SERVER_CATALOG_DB_*`

敏感文件和本地部署目录不应提交：

- `.env`
- `keys/`
- `server_upload/`
- 构建产物与日志文件

## Agent 控制台

控制台内置了一套与 `KepAgent` 协作的控制平面，主要包含：

- 节点注册与令牌轮换
- Agent 心跳与服务器列表同步
- 节点命令、日志和定时任务
- Gotify 通知渠道
- 手动 RCON 与批量服务器操作

`KepAgent` 是独立部署在节点上的执行端项目，本仓库通过控制台 API 负责下发命令、记录日志和展示结果。

## RCON 说明

控制台中的手动 RCON 支持两种目标方式：

- 按分组发送
- 按单台或多台服务器发送

RCON 密码来源于官网服务器目录数据库 `cs2_serverlist.servers` 中保存的 `rcon_pwd`。控制台在下发命令前会按目标服务器解析密码并传递给 `KepAgent`，前端展示与审计记录会自动脱敏，不会在页面中明文显示密码。

`KepAgent` 仍保留自身全局 `rcon_password` 作为兼容性兜底，用于旧命令或未带密码覆盖的场景。

## 定时任务与 Gotify

定时任务支持绑定多个 Gotify 渠道，适合以下场景：

- 定时检查更新
- 定时读取版本
- 更新完成后提醒
- 失败告警推送

Gotify 渠道配置保存在站点设置中，任务保存时只记录渠道标识，执行时按标识解析对应渠道。

## 构建与部署

生产部署前建议执行：

```bash
npm install
npm run prepare:prod
npm start
```

如果使用 PM2：

```bash
pm2 start deploy/ecosystem.config.cjs
```

可参考：

- `deploy/ecosystem.config.cjs`
- `deploy/nginx.kepcs.kaish.cn.conf`

## 验证建议

开发或上线前建议至少执行：

```bash
npm test
npm --prefix web run type-check
npm --prefix web run build
```
