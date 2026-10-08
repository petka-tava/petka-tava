#!/bin/sh
# Publish guard: this repo is public. Internal planning notes must not be committed.
# Only README.md and CREDITS.md may be markdown files. Notes stay in the private notes repo.
# Usage: scripts/publish-guard.sh            (checks tracked + staged files)
set -e
bad=$( (git ls-files; git diff --cached --name-only --diff-filter=AM) | sort -u | while read -r f; do
  [ -e "$f" ] || continue
  case "$f" in
    README.md|CREDITS.md) ;;
    *.md|*.MD|*.markdown) echo "$f" ;;
    dev/notes/*|notes/*|private/*|INCIDENTS*|DECISIONS*|FRONTEND*|QA*) echo "$f" ;;
  esac
done)
if [ -n "$bad" ]; then
  echo "publish-guard: refusing - internal notes must stay private:" >&2
  echo "$bad" >&2
  exit 1
fi
echo "publish-guard: ok"
