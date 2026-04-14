# KepCs 开水服自助系统

KepCs 是一个基于 `Fastify + Prisma + Vue 3` 的自助服务系统，覆盖商品购买、支付结果查询、订单查询、玩家查询、后台管理，以及与 `KepAgent` 配合使用的节点控制能力。

这个仓库适合公开托管源码。真实环境变量、支付私钥、部署镜像目录等敏感内容应保留在本地或服务器上，不应提交到 GitHub。

## 功能概览

- 商品购买与支付结果页
- 订单查询与玩家查询
- 数据统计与后台管理
- 白名单、CDK、服务器目录相关业务
- Agent 节点注册、心跳、任务下发与日志回传
- 空服自动换图、空服定时重启

## 技术栈

- 后端：`Node.js`、`Fastify`、`Prisma`、`MySQL`、`Redis`
- 前端：`Vue 3`、`Vite`、`Pinia`、`Vue Router`、`Naive UI`、`UnoCSS`、`SCSS`、`ECharts`

## 目录结构

```text
.
|-- deploy/                Nginx / PM2 部署示例
|-- prisma/                Prisma schema
|-- public/                静态资源
|-- src/                   后端源码
|-- test/                  后端测试
|-- web/                   前端源码
|-- .env.example           环境变量模板
|-- package.json
`-- README.md
```

说明：

- `keys/` 为本地支付密钥目录，应保留在本地并加入忽略。
- `server_upload/` 为本地部署镜像目录，包含构建产物与敏感配置，不建议纳入公开仓库。
- `dist/` 为前端构建输出，应由构建流程生成。

## 环境要求

- `Node.js 20+`
- `MySQL 8+`
- `Redis 6+`（推荐）

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板并填写真实配置

```bash
cp .env.example .env
```

3. 生成 Prisma Client

```bash
npm run prisma:generate
```

4. 初始化或同步数据库结构

```bash
npm run prisma:push
```

5. 启动开发环境

```bash
npm run dev
npm run dev:web
```

## 环境变量

完整变量清单见 [`.env.example`](./.env.example)。

重点配置项：

- `SESSION_SECRET`：必须替换为高强度随机值
- `DATABASE_URL`：MySQL 连接串
- `WHITELIST_API_KEY`、`SERVER_LIST_API_KEY`：上游接口密钥
- `STEAM_WEB_API_KEY`：Steam Web API Key
- `SMTP_*`：邮件发送配置
- `ZHUPAY_*`：支付网关配置
- `ZHUPAY_MERCHANT_PRIVATE_KEY_PATH`：本地商户私钥路径

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

## Agent 控制能力

控制平面已内置 Agent 节点管理接口，可与独立部署的 `KepAgent` 配合使用，用于服务器控制、任务下发和日志采集。

主要能力：

- 节点注册与密钥轮换
- Agent 心跳与任务领取
- 命令开始、结束、日志上传
- 控制台查看节点与执行记录

## 部署说明

- `deploy/ecosystem.config.cjs` 提供 `PM2` 启动示例
- `deploy/nginx.kepcs.kaish.cn.conf` 提供 `Nginx` 反向代理示例
- 生产启动前建议执行：

```bash
npm install
npm run prepare:prod
npm start
```

如果使用 PM2：

```bash
pm2 start deploy/ecosystem.config.cjs
```

## 安全建议

- 不要提交 `.env`、`keys/`、`server_upload/`、构建产物和日志文件
- 如果历史上已经泄露过真实密钥或数据库连接串，公开仓库前请先轮换
- 生产环境建议在反向代理层继续配置限流、连接数限制和缓存策略
