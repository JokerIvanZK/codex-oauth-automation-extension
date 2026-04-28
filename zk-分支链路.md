# ZK 分支链路（上游同步 + 本地开发）

## 1. 你的当前链路是否合理

你现在的想法：

1. 拉取上游 `dev`，合并到 `dev-zk`
2. 新功能从 `dev`（或 `dev-zk`）拉分支，完成后并回 `dev-zk`
3. 拉取上游 `master`，合并到 `master-zk`
4. 再把 `dev-zk`（或功能分支）合并到 `master-zk`

结论：

- 前 3 步是合理的。
- 第 4 步要谨慎，默认不建议“经常把 `dev-zk` 直接并到 `master-zk`”。
- 原因是 `dev` 常常包含尚未进入 `master` 的内容，直接合到 `master-zk` 会让你的 `master-zk` 偏离上游发布节奏。

## 2. 推荐的准确做法

采用“两条长期跟踪分支 + 功能短分支”的模型：

1. `dev-zk`：只跟踪上游 `dev`，用于日常开发集成。
2. `master-zk`：只跟踪上游 `master`，用于稳定基线/发布基线。
3. `feature/*`：从 `dev-zk` 拉出，开发后合回 `dev-zk`。

关键规则：

- 日常开发只走 `dev-zk`。
- `master-zk` 默认只吸收上游 `master`，不要自动吃进 `dev-zk` 全量改动。
- 若确实要提前在稳定线使用某个开发提交，优先从 `master-zk` 拉 `release/*`，再按需 `cherry-pick` 指定提交，而不是整支 `merge dev-zk`。

## 3. 标准操作命令

```bash
# 0) 建议先配置上游远端（只做一次）
git remote add upstream <上游仓库地址>
git fetch upstream

# 1) 同步 dev-zk
git switch dev-zk
git fetch upstream
git merge --ff-only upstream/dev

# 2) 开发新功能（从 dev-zk 拉分支）
git switch -c feature/<name> dev-zk
# ...开发提交...
git switch dev-zk
git merge --no-ff feature/<name>

# 3) 同步 master-zk
git switch master-zk
git fetch upstream
git merge --ff-only upstream/master
```

按需把某个功能带到稳定线（可选）：

```bash
git switch -c release/<name> master-zk
git cherry-pick <commitA> <commitB>
```

## 4. 什么时候可以把 dev-zk 合到 master-zk

只有在你明确接受以下前提时才做：

1. 你就是要让 `master-zk` 提前承载“未发布到上游 master 的 dev 内容”。
2. 你能接受之后与上游 `master` 的差异扩大、冲突概率升高。
3. 你把 `master-zk` 当“个人集成主线”，而不是“上游 master 的稳定镜像”。

如果不是这三个目标，建议不要这样做。

## 5. 一键脚本（推荐）

已提供脚本：`scripts/git-flow-zk.sh`

先给可执行权限（已做过可跳过）：

```bash
chmod +x scripts/git-flow-zk.sh
```

### 5.1 日常开发集成线（dev-zk）

```bash
# 同步上游 dev 到 dev-zk
scripts/git-flow-zk.sh sync-dev

# 从 dev-zk 创建功能分支 feature/<name>
scripts/git-flow-zk.sh start-feature <name>

# 功能完成后合回 dev-zk
scripts/git-flow-zk.sh finish-feature <name>
```

### 5.2 稳定镜像线（master-zk）

```bash
# 同步上游 master 到 master-zk
scripts/git-flow-zk.sh sync-master
```

### 5.3 把部分开发改动提前带到稳定线（cherry-pick）

```bash
# 从 master-zk 创建 release/<name>
scripts/git-flow-zk.sh start-release <name>

# 在 release/<name> 上挑指定提交
scripts/git-flow-zk.sh pick-release <commit1> <commit2> ...

# 验证后把 release/<name> 合回 master-zk
scripts/git-flow-zk.sh finish-release <name>
```

### 5.4 状态查看

```bash
scripts/git-flow-zk.sh status
```

脚本内置约束：

- 工作区不干净会拒绝执行（避免误操作）。
- `pick-release` 只能在 `release/*` 分支执行。
- `master-zk` 不提供“整支合并 dev-zk”的命令入口。
