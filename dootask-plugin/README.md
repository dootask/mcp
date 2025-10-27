# DooTask MCP Server

该插件将 DooTask MCP 工具集封装为独立服务，部署后即可通过 Claude 等支持 Model Context Protocol (MCP) 的助手访问您的 DooTask 工作区。

## 功能概览

- ⚙️ 保留 Electron 客户端同款 15 个工具（用户、项目、任务、消息等完整能力）
- 🔐 通过 DooTask Token 进行 API 鉴权，权限与 Token 所属账号保持一致
- 🚀 以 Docker 容器交付，可在 DooTask 平台或私有环境中快速部署

## 配置项

| 字段 | 说明 |
| --- | --- |
| `MCP_PORT` | 容器内 MCP 服务监听端口，默认 `7000` |
| `HEALTH_PORT` | 使用指南与健康检查端口，默认 `7001`，无需对外暴露 |
| `REQUEST_TIMEOUT` | 调用 DooTask API 的超时时间（毫秒），默认 `30000` |

## 部署步骤

1. 安装时可保持默认配置，如需自定义端口请同步修改 `MCP_PORT`/`HEALTH_PORT`。
2. 安装完成后，所有成员可在插件菜单进入 “MCP 使用指南”，页面会：
   - 自动读取当前登录用户的 Token；
   - 生成 MCP 服务器地址（`https://<应用域名>/mcp`）；
   - 提供 Claude / fastmcp 客户端的配置示例。
3. 用户在自己的 MCP 客户端中添加服务器时，务必设置请求头：
   ```
   Authorization: Bearer <DooTaskToken>
   ```
4. 任何工具调用失败时，可回到指南页重新复制 Token 并更新客户端配置。

> ℹ️ 说明页由 `guide/` 目录的 Vite 应用构建，执行 `npm run build --prefix guide` 后即可产出静态文件，并由容器的 7001 端口托管。

## 版本

- `0.1.0` - 初始版本，提供与 Electron 客户端等价的工具集合。

## 许可证

MIT
