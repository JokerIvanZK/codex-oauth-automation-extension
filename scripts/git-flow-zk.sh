#!/usr/bin/env bash

set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
DEV_BRANCH="${DEV_BRANCH:-dev-zk}"
MASTER_BRANCH="${MASTER_BRANCH:-master-zk}"

usage() {
  cat <<'EOF'
Usage:
  scripts/git-flow-zk.sh sync-dev
  scripts/git-flow-zk.sh start-feature <name>
  scripts/git-flow-zk.sh finish-feature <name>
  scripts/git-flow-zk.sh sync-master
  scripts/git-flow-zk.sh start-release <name>
  scripts/git-flow-zk.sh pick-release <commit...>
  scripts/git-flow-zk.sh finish-release <name>
  scripts/git-flow-zk.sh status

Notes:
  - feature branch format: feature/<name>
  - release branch format: release/<name>
  - pick-release must be run on a release/* branch
EOF
}

ensure_git_repo() {
  git rev-parse --is-inside-work-tree >/dev/null
}

ensure_clean_worktree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "Worktree is dirty. Commit/stash changes first."
    exit 1
  fi
}

ensure_remote_exists() {
  local remote="$1"
  if ! git remote get-url "$remote" >/dev/null 2>&1; then
    echo "Remote '$remote' not found. Please add it first."
    exit 1
  fi
}

current_branch() {
  git branch --show-current
}

cmd_sync_dev() {
  ensure_clean_worktree
  ensure_remote_exists "$UPSTREAM_REMOTE"
  git fetch "$UPSTREAM_REMOTE" --prune
  git switch "$DEV_BRANCH"
  git merge --ff-only "$UPSTREAM_REMOTE/dev"
}

cmd_start_feature() {
  local name="$1"
  ensure_clean_worktree
  git switch "$DEV_BRANCH"
  git switch -c "feature/$name"
}

cmd_finish_feature() {
  local name="$1"
  ensure_clean_worktree
  git switch "$DEV_BRANCH"
  git merge --no-ff "feature/$name"
}

cmd_sync_master() {
  ensure_clean_worktree
  ensure_remote_exists "$UPSTREAM_REMOTE"
  git fetch "$UPSTREAM_REMOTE" --prune
  git switch "$MASTER_BRANCH"
  git merge --ff-only "$UPSTREAM_REMOTE/master"
}

cmd_start_release() {
  local name="$1"
  ensure_clean_worktree
  git switch "$MASTER_BRANCH"
  git switch -c "release/$name"
}

cmd_pick_release() {
  ensure_clean_worktree
  local branch
  branch="$(current_branch)"
  if [[ "$branch" != release/* ]]; then
    echo "pick-release must run on a release/* branch. Current: $branch"
    exit 1
  fi
  git cherry-pick "$@"
}

cmd_finish_release() {
  local name="$1"
  ensure_clean_worktree
  git switch "$MASTER_BRANCH"
  git merge --no-ff "release/$name"
}

cmd_status() {
  git status --short --branch
  echo
  git branch -vv
}

main() {
  ensure_git_repo
  local cmd="${1:-}"
  case "$cmd" in
    sync-dev)
      [[ $# -eq 1 ]] || { usage; exit 1; }
      cmd_sync_dev
      ;;
    start-feature)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      cmd_start_feature "$2"
      ;;
    finish-feature)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      cmd_finish_feature "$2"
      ;;
    sync-master)
      [[ $# -eq 1 ]] || { usage; exit 1; }
      cmd_sync_master
      ;;
    start-release)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      cmd_start_release "$2"
      ;;
    pick-release)
      [[ $# -ge 2 ]] || { usage; exit 1; }
      shift
      cmd_pick_release "$@"
      ;;
    finish-release)
      [[ $# -eq 2 ]] || { usage; exit 1; }
      cmd_finish_release "$2"
      ;;
    status)
      [[ $# -eq 1 ]] || { usage; exit 1; }
      cmd_status
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
