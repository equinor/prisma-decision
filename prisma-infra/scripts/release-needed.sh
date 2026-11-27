#!/usr/bin/env bash
set -euo pipefail

version=$(jq -er '."prisma-infra"' .release-please-manifest.json)
tag=$(git tag --list "prisma-infra-v$version")

# The imported baseline has no component tag. Later versions remain pending until tagged,
# so a new push cannot bypass a failed production deployment from an earlier workflow run.
if [ "$version" = "0.2.7" ] || [ -n "$tag" ]; then
  echo "infra-release=false" >> "$GITHUB_OUTPUT"
else
  echo "infra-release=true" >> "$GITHUB_OUTPUT"
fi
