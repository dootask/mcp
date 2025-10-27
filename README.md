# DooTask MCP Server Plugin

This repository contains the DooTask app plugin that wraps the DooTask MCP server
as a standalone service. The plugin exposes the familiar Model Context Protocol
toolset that is already available in the Electron client, but delegates all API
calls to the official `dootask-tools` SDK. Every MCP request must provide the
current user’s DooTask token through the `Authorization: Bearer <token>` header.

## Structure

```
.
├── README.md
├── server/               # MCP server implementation (Node.js + TypeScript)
├── dootask-plugin/       # App Store packaging metadata
│   └── 0.1.0/            # First distributable version
└── .github/workflows/    # Release automation
```

## Development Workflow

1. Install dependencies for both the backend service and the guide page:
   ```bash
   cd server && npm install
   cd ../guide && npm install
   ```
2. Copy `server/.env.example` to `server/.env` and调整如下变量（默认值已满足 DooTask 插件运行）:
   - `API_BASE_URL`：DooTask 实例的接口地址（默认 `http://nginx`，由平台内部解析）
   - `MCP_PORT` / `HEALTH_PORT`：本地暴露端口（默认 7000/7001）
   - `REQUEST_TIMEOUT`：调用 DooTask API 的超时时间（毫秒）
3. Build the onboarding guide（生成静态资源，容器启动时会监听 `HEALTH_PORT` 提供说明页）:
   ```bash
   npm run build --prefix guide
   ```
4. Start the MCP server in watch mode（默认分别监听 7000/7001）:
   ```bash
   cd server
   npm run dev
   ```
5. Use an MCP-compatible client (e.g. `fastmcp` CLI) to connect to
   `http://localhost:7000/mcp`，客户端请求需携带
   `Authorization: Bearer <DooTaskToken>`。本地开发时说明页位于
   `http://localhost:7001/`（健康检查为 `/healthz`）。在插件部署后，两者均通过平台 Nginx 的同一入口对外提供。

## Packaging for DooTask

1. Update version metadata in `dootask-plugin/config.yml` and create the matching
   version directory (e.g. `dootask-plugin/0.1.1`).
2. Build the Docker image referenced in `dootask-plugin/0.1.0/docker-compose.yml`.
3. Create the tarball:
   ```bash
   cd dootask-plugin
   tar -czf ../dootask-plugin.tar.gz .
   ```
4. Upload the package through the DooTask App Store or trigger the GitHub Action
   in `.github/workflows/release.yml`.

Refer to `PUBLISHING_GUIDE.md` for CI credentials and release instructions.
