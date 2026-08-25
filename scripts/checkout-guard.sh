#!/bin/bash
# THE CONTAINER REVERTS THIS CHECKOUT. It has happened four times in one
# session, silently rolling app/src back several releases — and a test suite
# run against a reverted tree still says "ALL PASS", just with fewer checks.
# Run this before trusting any result, and after any long gap.
#
#   bash scripts/checkout-guard.sh
#
# Exits non-zero and restores from the remote if the tree has rolled back.
set -u
BRANCH=claude/social-animals-world-replacement-lru1fl
cd "$(dirname "$0")/.." || exit 2
git fetch -q origin "$BRANCH" 2>/dev/null || git fetch -q origin main
REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null || git rev-parse origin/main)
LOCAL=$(git rev-parse HEAD)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "checkout OK — $(git log --oneline -1)"
  exit 0
fi
if git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then
  echo "CHECKOUT REVERTED — local $(git rev-parse --short "$LOCAL") is behind"
  echo "restoring to $(git rev-parse --short "$REMOTE")"
  git checkout -B "$BRANCH" "$REMOTE" >/dev/null 2>&1
  echo "restored — $(git log --oneline -1)"
  exit 1
fi
echo "local has commits the remote does not — leaving it alone"
git log --oneline "$REMOTE".."$LOCAL" | head -5
exit 0
