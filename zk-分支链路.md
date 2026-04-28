# ZK 分支链路（标准推荐做法）

## 1. 分支职责

1. `dev-zk`：只做开发集成（同步上游 `dev`、合并 `feature/*`）。
2. `master-zk`：只跟踪上游 `master`（稳定镜像）。
3. 需要把某些开发改动提前带到稳定线时，从 `master-zk` 拉 `release/*`，对 `dev-zk` 的具体提交做 `cherry-pick`，不要整支合并。

## 2. 标准操作（命令版）

```bash
# A) 同步开发集成线
git switch dev-zk
git pull --ff-only

# B) 新功能开发
git switch -c feature/<name> dev-zk
# ...开发并提交...
git switch dev-zk
git merge --no-ff feature/<name>

# C) 同步稳定镜像线
git switch master-zk
git pull --ff-only

# D) 按需提前带改动到稳定线（只挑提交）
git switch -c release/<name> master-zk
git cherry-pick <commit1> <commit2> ...
git switch master-zk
git merge --no-ff release/<name>
```

## 3. 标准操作（脚本版）

已提供脚本：`scripts/git-flow-zk.sh`

```bash
# 开发集成线
scripts/git-flow-zk.sh sync-dev
scripts/git-flow-zk.sh start-feature <name>
scripts/git-flow-zk.sh finish-feature <name>

# 稳定镜像线
scripts/git-flow-zk.sh sync-master

# 稳定线按需挑提交
scripts/git-flow-zk.sh start-release <name>
scripts/git-flow-zk.sh pick-release <commit1> <commit2> ...
scripts/git-flow-zk.sh finish-release <name>
```

## 4. 硬规则

1. 不把 `dev-zk` 整支 merge 到 `master-zk`。
2. 新功能只从 `dev-zk` 拉 `feature/*`。
3. `master-zk` 只接收上游 `master` 和明确挑选的 `cherry-pick` 提交。
