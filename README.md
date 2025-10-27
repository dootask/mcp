# MCP 远程服务器插件

本仓库提供一套可部署在 DooTask 插件平台上的 MCP（Model Context Protocol）服务端及配套说明页，便于远程客户端（如 Claude Desktop、fastmcp CLI 等）访问工作区工具集。

- `server/`：使用 TypeScript + [`fastmcp`](https://www.npmjs.com/package/fastmcp) 实现的 MCP Server，通过官方 `@dootask/tools` SDK 转发所有接口调用。
- `guide/`：基于 Vite + React 的说明页面，为最终用户展示 Token、远程地址与示例配置。
- `dootask-plugin/`：插件打包配置（元数据、Nginx 反向代理配置、Docker Compose 示例）。
- `Dockerfile`：多阶段构建脚本，产出可直接运行的容器镜像。

## 目录结构

```
.
├── Dockerfile                 # 构建远程服务镜像
├── guide/                     # 7001 端口的前端说明页
├── server/                    # MCP Server 源码（Node.js + TypeScript）
├── dootask-plugin/            # 插件打包与发布配置
├── PUBLISHING_GUIDE.md        # 发布指引（请勿自动修改）
└── README.md
```

## 开发环境依赖

- Node.js 20.x
- npm 10.x
- Docker（可选，用于本地或生产环境运行镜像）

默认假定服务运行在 DooTask 插件网络内部；本地调试沿用同样的内置参数，如需改动请直接编辑源码配置。

## 内置配置

`server/src/config.ts` 将运行参数直接写入源码，部署后无需再准备 `.env` 或暴露端口。默认值如下：

| 配置 | 说明 |
| --- | --- |
| `BASE_URL = http://nginx` | 由插件容器内的 Nginx 解析，指向工作区 API。 |
| `MCP_PORT = 7000` | HTTP Stream 监听端口，容器内部使用，最终由平台转发为 `/apps/mcp_server/mcp`、`/apps/mcp_server/sse`。 |
| `HEALTH_PORT = 7001` | 指南页与健康检查端口，同样只在容器内部暴露。 |
| `REQUEST_TIMEOUT = 30000` | 对 `@dootask/tools` 的调用超时时间（毫秒）。 |
| `LOG_LEVEL = info` | 日志级别。 |

如需调整参数，可直接修改 `server/src/config.ts` 后重新构建镜像。

## 本地开发流程

1. 安装依赖：
   ```bash
   npm install --prefix server
   npm install --prefix guide
   ```
2. 构建说明页（容器构建时也会执行）：
   ```bash
   npm run build --prefix guide
   ```
3. 启动 MCP 服务（开发模式）：
   ```bash
   npm run dev --prefix server
   ```
   - MCP Endpoint: `http://localhost:7000/mcp`
   - SSE Endpoint: `http://localhost:7000/sse`
   - 指南页面 / 健康检查: `http://localhost:7001/`

使用支持 MCP 的客户端（如 Claude Desktop、`fastmcp-client`），并在请求头中携带指南页面提供的 Token：

```
Authorization: Bearer <YourToken>
```

## 构建与运行镜像

```bash
docker build -t mcp-remote-server .
docker run --rm -p 7000:7000 -p 7001:7001 mcp-remote-server
```

容器内部端口由平台 Nginx 代理，无需额外暴露或配置环境变量。部署到插件平台后，Nginx 通常会按以下方式转发：

- `/apps/mcp_server/mcp` → 容器 7000 端口
- `/apps/mcp_server/sse` → 容器 7000 端口
- `/apps/mcp_server/`    → 容器 7001 端口

参见 `dootask-plugin/0.0.1/nginx.conf` 获取示例配置。

## 发布新版本

1. 修改 `dootask-plugin/config.yml` 中的版本信息，并新增对应的版本目录（如 `dootask-plugin/0.0.2/`）。
2. 构建并推送新的 Docker 镜像。
3. 重新运行 `npm run build --prefix guide`，确保说明页资源更新。
4. 如需手动分发，可生成归档：
   ```bash
   cd dootask-plugin
   tar -czf ../dootask-plugin.tar.gz .
   ```
5. 按 `PUBLISHING_GUIDE.md` 的指引或 CI 流程完成发布。

## 常用脚本

| 命令                               | 作用 |
|-----------------------------------|------|
| `npm run build --prefix server`   | 编译 MCP Server，输出至 `server/dist/`。 |
| `npm run dev --prefix server`     | 开发模式热重载。 |
| `npm run build --prefix guide`    | 构建指南页面，输出至 `guide/dist/`。 |
| `npm run lint --prefix server`    | 执行 ESLint。 |

## 贡献说明

1. Fork 或创建分支。
2. 完成修改后重新构建 `guide/dist`。
3. 执行 lint / build，并在需要时本地验证 Docker 镜像。
4. 提交 Pull Request 并关联相应任务。

除非流程有变动，请勿修改 `PUBLISHING_GUIDE.md`。针对插件使用者的说明位于 `dootask-plugin/README.md`。
