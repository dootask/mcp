---
name: release-plugin
description: 用于发布 DooTask MCP 插件新版本的完整流程。当用户提到"发布"、"打 tag"、"出新版本"、"release"、"上架"、"推到 DooTask AppStore"、"打标签发版"、"升级版本号"等任何与本仓库版本发布相关的意图时，必须使用本技能 —— 即使用户只是说"准备发版"或"该发新版了"也要触发。本技能会引导完成更新 CHANGELOG、提交、打 tag、推送、监控 GitHub Action 直至发布成功，避免遗漏步骤导致发布失败。
---

# 发布 DooTask MCP 插件

本仓库使用 gitflow 工作流，通过推送 tag 触发 GitHub Action 自动构建并发布到 Docker Hub 和 DooTask AppStore。

## ⚠️ 本项目特殊约定（容易踩坑）

1. **Tag 不带 `v` 前缀**：直接 `0.1.1`，不是 `v0.1.1`。
2. **CHANGELOG 在模板目录**：编辑 `dootask-plugin/version/CHANGELOG.md` 和 `_zh.md`。Workflow 在 runner 里把 `version/` 临时重命名为 tag 名（如 `0.1.1`）再打包，repo 里的 `version/` 永远不变 —— **不要**在 repo 里手动维护 `dootask-plugin/<具体版本号>/` 子目录。

## 触发条件回顾

只有 **推送 tag** 才会触发构建发布，普通 push 或 PR 不会跑 workflow。

## 发布流程

按顺序执行下面的步骤。每一步都先与用户确认再操作 —— 发布是公开行为且涉及多个外部系统（Docker Hub、DooTask AppStore），不可逆。

### 1. 确认当前状态干净

```bash
git status
git log --oneline -10
```

确认：
- 工作区干净，没有未提交的改动
- 当前在 `main` 分支
- 本地与远程同步（`git fetch && git status` 检查是否落后于 origin/main）

如果有未提交的改动，先和用户确认是要包含进本次发布、还是要 stash/丢弃。

### 2. 决定新版本号

```bash
git tag --sort=-creatordate | head -5
```

看最新 tag 后，与用户确认新版本号。遵循语义化版本（SemVer）：

- `0.x.Y` patch：bugfix
- `0.X.0` minor：新功能、不破坏兼容性的改动
- `X.0.0` major：破坏性变更

**版本号不带 `v` 前缀**，例如 `0.1.1`、`0.2.0`。

### 3. 更新 CHANGELOG（中英双语）

发版前必须同步更新这两个文件：
- `dootask-plugin/version/CHANGELOG.md`（英文）
- `dootask-plugin/version/CHANGELOG_zh.md`（中文）

**这两个文件是覆盖式的，不是追加式的** —— 每次发版直接把整个文件替换为本次的更新内容，**不保留上一版的条目**（AppStore 自己维护历史）。文件里也不写版本号和日期，版本号由 tag 隐式承载。

按分类列点，**只用本次涉及到的分类**。常用分类（中英对应必须严格一致）：

| 英文       | 中文 |
|----------|------|
| Added    | 新增 |
| Fixed    | 修复 |
| Updated  | 更新 |
| Changed  | 变更 |
| Improved | 优化 |
| Removed  | 移除 |

写法要求：

- 一句话一条，**写给最终用户看**，不是开发者 —— 说"新增图片 OCR 中英文识别"，不要说"集成 tessdata_fast 语言包"
- 涉及具体功能、工具名、配置项时写出名字方便用户判断
- 中英两个文件 **分类、条数、含义一一对应**（第 N 条说的是同一件事）
- 保持简洁，每条一行就够了

格式示例（按本次实际改动写，不要照抄文字）：

英文 `dootask-plugin/version/CHANGELOG.md`：

```markdown
### Added
- Added <feature>.

### Fixed
- Fixed <issue>.
```

中文 `dootask-plugin/version/CHANGELOG_zh.md`：

```markdown
### 新增
- 新增 <功能>。

### 修复
- 修复 <问题>。
```

### 4. 提交 CHANGELOG 并推送代码到远程

```bash
git add dootask-plugin/version/CHANGELOG.md dootask-plugin/version/CHANGELOG_zh.md
git commit -m "docs(changelog): notes for 0.1.1"   # 替换为实际版本号
git push origin main
```

如果同时还有其他待发版的代码改动，一起 commit 进同一次 push 也可以。

### 5. 打 tag 并推送

```bash
git tag 0.1.1                       # ⚠️ 不带 v 前缀
git push origin 0.1.1
```

> 注意：tag 一旦推送到远程，就会立即触发 Action。在推送前再次确认版本号无误，并确认 CHANGELOG 已经在 main 上了。
> 如果误推了 tag，可以用 `git push --delete origin 0.1.1 && git tag -d 0.1.1` 删除（但如果 Action 已经发布到 DooTask AppStore，删除 tag 不会撤回已发布的版本）。

### 6. 监控 GitHub Action

```bash
gh run list --workflow=release.yml --limit 3
gh run watch                        # 实时跟踪最新 run
```

或在浏览器打开：`https://github.com/dootask/mcp/actions`

### 7. 验证发布结果

Action 成功后，确认：
- Docker Hub 上 `mcp` 仓库出现新 tag
- DooTask AppStore 中 `mcp` 插件版本已更新，且更新说明显示本次 CHANGELOG 内容

## 常见问题

**Action 没触发**：检查是否真的把 tag 推到了远程（`git push origin <tag>` 或 `git push --tags`），仅 `git tag` 不会推送到远程。

**Tag 带了 `v` 前缀**：会成功发版但版本号变成 `v0.1.1`，破坏 Docker tag 排序和 AppStore 显示。误操作后立即删除 tag 重新打不带 v 的版本。

**workflow 的 `mv version <tag>` 失败**：如果 repo 里已存在 `dootask-plugin/<tag>` 目录（旧版本残留），mv 会冲突。**不要**在 repo 里维护 `dootask-plugin/<具体版本号>/` 子目录，只维护 `dootask-plugin/version/`。

**Docker 登录失败**：通常是 Secrets 过期或缺失，见下方"GitHub Secrets 配置"注释。注意本项目 secrets 名是 `DOCKER_USERNAME` / `DOCKER_PASSWORD`，不是 `DOCKERHUB_*`。

**DooTask AppStore 发布失败**：检查 `dootask-plugin/version/config.yml` 是否合法，特别是 `require_version` 字段；以及 `DOOTASK_USERNAME` / `DOOTASK_PASSWORD` 是否有效。

**版本号已存在**：DooTask AppStore 不允许重复版本号；要发布修复版本，须递增 patch 号（例如 `0.1.1` → `0.1.2`）。

<!--
================================================================================
GitHub Secrets 配置（仅供参考，本技能不会也无法配置这些密钥）
================================================================================

发布流程依赖以下 4 个 Repository Secrets，需在 GitHub 仓库的
  Settings -> Secrets and variables -> Actions -> Repository secrets
中预先配置完成。这是仓库管理员的一次性工作，不是每次发布都需要做：

  - DOOTASK_USERNAME : DooTask AppStore 用户名
  - DOOTASK_PASSWORD : DooTask AppStore 密码
  - DOCKER_USERNAME  : Docker Hub 用户名
  - DOCKER_PASSWORD  : Docker Hub 密码（或 Access Token）

如果首次发布或 Action 报登录失败，请提醒用户检查上述 Secrets 是否齐全且有效。
================================================================================
-->
