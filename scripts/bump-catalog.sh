#!/usr/bin/env bash
# Open the Hermes plugin-catalog SHA-bump PR for a published release.
# Usage: scripts/bump-catalog.sh v1.2.4   (needs an authenticated `gh`)
# The catalog requires an exact commit pin and a reviewed PR per bump; this
# only removes the manual editing. It never merges anything.
set -euo pipefail

TAG=${1:?usage: scripts/bump-catalog.sh vX.Y.Z}
REPO=${REPO:-AsoTora/hermes-context-overview}
UPSTREAM=${UPSTREAM:-NousResearch/hermes-agent}
FORK=${FORK:-AsoTora/hermes-agent}
AUTHOR_NAME=${AUTHOR_NAME:-$(git log -1 --format=%an)}
AUTHOR_EMAIL=${AUTHOR_EMAIL:-$(git log -1 --format=%ae)}
ENTRY=plugin-catalog/hermes-context-overview.yaml
VERSION=${TAG#v}
BRANCH=catalog/hermes-context-overview-$VERSION

[[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "tag must look like vX.Y.Z" >&2; exit 1; }
NEW=$(gh api "repos/$REPO/commits/$TAG" --jq .sha)
gh release view "$TAG" -R "$REPO" >/dev/null || { echo "$TAG has no published release" >&2; exit 1; }

BASE=$(gh api "repos/$UPSTREAM/git/ref/heads/main" --jq .object.sha)
CURRENT=$(gh api "repos/$UPSTREAM/contents/$ENTRY?ref=$BASE" -H 'Accept: application/vnd.github.raw')
OLD=$(sed -n 's/^sha: \([0-9a-f]\{40\}\)$/\1/p' <<<"$CURRENT")
[[ -n $OLD ]] || { echo "no pinned sha in $ENTRY on $UPSTREAM main" >&2; exit 1; }
[[ $OLD != "$NEW" ]] || { echo "catalog already pins $NEW" >&2; exit 0; }

# Bump the pin, the version label and every pinned screenshot URL together.
UPDATED=$(sed -e "s/$OLD/$NEW/g" -e "s/^version: .*/version: \"$VERSION\"/" <<<"$CURRENT")

gh api -X POST "repos/$FORK/git/refs" -f ref="refs/heads/$BRANCH" -f sha="$BASE" >/dev/null
BLOB=$(gh api "repos/$FORK/contents/$ENTRY?ref=$BRANCH" --jq .sha)
gh api -X PUT "repos/$FORK/contents/$ENTRY" \
  -f branch="$BRANCH" -f sha="$BLOB" \
  -f message="chore(catalog): bump hermes-context-overview to $VERSION" \
  -f "author[name]=$AUTHOR_NAME" -f "author[email]=$AUTHOR_EMAIL" \
  -f "committer[name]=$AUTHOR_NAME" -f "committer[email]=$AUTHOR_EMAIL" \
  -f content="$(printf '%s\n' "$UPDATED" | base64 | tr -d '\n')" >/dev/null

NOTES=$(gh release view "$TAG" -R "$REPO" --json body --jq .body)
gh pr create -R "$UPSTREAM" --base main --head "${FORK%%/*}:$BRANCH" \
  --title "chore(catalog): bump hermes-context-overview to $VERSION" \
  --body "Bumps the Context Overview pin to [$TAG](https://github.com/$REPO/releases/tag/$TAG).

Commit range for review: https://github.com/$REPO/compare/$OLD...$NEW

$NOTES

Disclosure: Desktop-only plugin. One existing RPC (\`session.context_breakdown\`), no network calls, file/credential reads, telemetry or background processes."
