#!/bin/bash
# Double-click to commit & push this project to:
#   git@github.com:thephotocrm/retirement-buckets.git
#
# Safe to re-run — initializes git on first run, then just commits + pushes
# any new changes on subsequent runs. Never commits .env.local (gitignored).

set -e
cd "$(dirname "$0")"

REMOTE_URL="git@github.com:thephotocrm/retirement-buckets.git"
DEFAULT_BRANCH="main"

# --- Prereqs ----------------------------------------------------------------

if ! command -v git >/dev/null 2>&1; then
  echo "❌ git is not installed. Install Xcode command line tools first:"
  echo "   xcode-select --install"
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

# --- Sanity: never push secrets --------------------------------------------

if [ -f .env.local ]; then
  if ! grep -qE "^\.env(\.\*)?$" .gitignore 2>/dev/null; then
    echo "❌ .env.local exists but isn't covered by .gitignore. Aborting."
    read -n 1 -s -r -p "Press any key to close..."
    exit 1
  fi
fi

# --- Git init / commit -----------------------------------------------------

if [ -d ".git" ] && ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  # Half-initialized repo (e.g. left over from setup) — start clean.
  echo "🧹 Cleaning incomplete .git folder..."
  rm -rf .git
fi

if [ ! -d ".git" ]; then
  echo "📦 Initializing git repo on branch '$DEFAULT_BRANCH'..."
  git init -b "$DEFAULT_BRANCH" >/dev/null
fi

# Use existing host git identity if set, otherwise sensible defaults.
if [ -z "$(git config user.email)" ]; then
  git config user.email "austinpacholek2014@gmail.com"
fi
if [ -z "$(git config user.name)" ]; then
  git config user.name "ausbig"
fi

# Ensure the remote is set to the requested URL.
if git remote get-url origin >/dev/null 2>&1; then
  CURRENT_REMOTE=$(git remote get-url origin)
  if [ "$CURRENT_REMOTE" != "$REMOTE_URL" ]; then
    echo "🔗 Updating origin: $CURRENT_REMOTE → $REMOTE_URL"
    git remote set-url origin "$REMOTE_URL"
  fi
else
  git remote add origin "$REMOTE_URL"
fi

git add -A

# Last-ditch check: scan staged content for anything that looks like an API key.
if git diff --cached | grep -qE "ELEVENLABS_API_KEY=sk|OPENAI_API_KEY=sk-proj"; then
  echo "❌ A staged file contains what looks like an API key. Aborting."
  echo "   Run 'git status' in this folder to see what got staged unexpectedly."
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if git rev-parse --verify HEAD >/dev/null 2>&1; then
  if git diff --cached --quiet; then
    echo "ℹ️  Nothing new to commit."
  else
    git commit -m "Update project files" >/dev/null
    echo "✅ New commit created."
  fi
else
  git commit -m "Initial commit: income & growth bucket diagram with cached ElevenLabs voice" >/dev/null
  echo "✅ Initial commit created."
fi

# --- Push ------------------------------------------------------------------

# Quick SSH probe so we fail fast with a useful error message instead of a
# cryptic git push timeout.
echo "🔑 Verifying SSH access to GitHub..."
SSH_OUT=$(ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 || true)
if echo "$SSH_OUT" | grep -q "successfully authenticated"; then
  echo "   ✓ SSH OK ($(echo "$SSH_OUT" | head -1))"
else
  echo "❌ GitHub SSH authentication failed:"
  echo "$SSH_OUT"
  echo
  echo "If you don't have an SSH key set up for GitHub, run:"
  echo "   ssh-keygen -t ed25519 -C \"austinpacholek2014@gmail.com\""
  echo "   pbcopy < ~/.ssh/id_ed25519.pub"
  echo "Then paste the key into https://github.com/settings/keys"
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

echo "🚀 Pushing to $REMOTE_URL..."
git push -u origin "$DEFAULT_BRANCH"

echo
echo "✅ Done. View it at: https://github.com/thephotocrm/retirement-buckets"
echo
read -n 1 -s -r -p "Press any key to close..."
