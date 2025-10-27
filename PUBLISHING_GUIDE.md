# 发布指南

本仓库使用 GitHub Actions 自动化构建 Docker 镜像并推送 DooTask 插件包。发布流程如下：

1. 在 `server/package.json`、`dootask-plugin/config.yml` 和版本目录中更新版本号。
2. 提交代码并推送到远程仓库。
3. 打标签（如 `0.1.0`，不带 `v` 前缀）并推送标签：
   ```bash
   git tag 0.1.0
   git push origin 0.1.0
   ```
4. 等待 GitHub Actions 完成构建与发布流程。
5. 在 DooTask App Store 后台确认插件发布状态。

## GitHub Secrets

请在仓库 `Settings -> Secrets and variables -> Actions` 中配置下列 Secrets：

- `DOOTASK_USERNAME`：DooTask AppStore 账号
- `DOOTASK_PASSWORD`：DooTask AppStore 密码
- `DOCKER_USERNAME`：Docker Hub 用户名
- `DOCKER_PASSWORD`：Docker Hub 密码

## 本地构建调试

若需在本地调试容器，可执行：

```bash
docker build -t dootask-mcp:dev .
docker run --rm -p 7000:7000 \
  dootask-mcp:dev
```

容器启动后，访问 `http://localhost:7001/` 查看使用指南，`/healthz` 用于健康检查。MCP 客户端接入 `http://localhost:7000/mcp` 时需携带 `Authorization: Bearer <DooTaskToken>`。
