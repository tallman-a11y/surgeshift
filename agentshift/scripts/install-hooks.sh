#!/usr/bin/env bash
# Install the parking-lot commit hook.
#
# AGENTS.md across the family says "commits & deploys auto-log". This wires that up
# for AgentShift. Opt-in rather than automatic, because a repo that installs git hooks
# behind your back is a repo you stop trusting.
#
#   bash scripts/install-hooks.sh
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir="$(git rev-parse --git-path hooks)"
mkdir -p "$hooks_dir"

cat > "$hooks_dir/post-commit" <<'HOOK'
#!/usr/bin/env bash
# Log every AgentShift commit to the shared Shift parking lot. Never blocks: the
# bridge exits 0 when the helper is not installed.
subject="$(git log -1 --pretty=%s)"
sha="$(git log -1 --pretty=%h)"
root="$(git rev-parse --show-toplevel)"
if [ -f "$root/agentshift/scripts/shiftlog.mjs" ]; then
  node "$root/agentshift/scripts/shiftlog.mjs" log "commit $sha: $subject" >/dev/null 2>&1 || true
elif [ -f "$root/scripts/shiftlog.mjs" ]; then
  node "$root/scripts/shiftlog.mjs" log "commit $sha: $subject" >/dev/null 2>&1 || true
fi
HOOK

chmod +x "$hooks_dir/post-commit"
echo "Installed post-commit hook at $hooks_dir/post-commit"
echo "Repo: $repo_root"
