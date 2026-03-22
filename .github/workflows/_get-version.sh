#!/bin/bash
# Outputs a version string in the format yyyy.mm.dd.XX, incrementing XX if tags exist for today.
# Usage: ./_get-version.sh <github_token>

set -e

gh_token="$1"
repo="${GITHUB_REPOSITORY:-dpembo/BackupHub}"
today=$(date +'%Y.%m.%d')

# Get all tags for today, sort, and find the highest counter
latest_tag=$(curl -s -H "Authorization: token $gh_token" "https://api.github.com/repos/$repo/tags?per_page=100" | jq -r '.[].name' | grep "^${today}" | sort -V | tail -n1)

if [[ "$latest_tag" =~ ^${today}\.([0-9]{2})$ ]]; then
  counter=$(echo "$latest_tag" | sed -E "s/^${today}\.([0-9]{2})$/\1/")
  next_counter=$(printf "%02d" $((10#$counter + 1)))
else
  next_counter="01"
fi

version="${today}.${next_counter}"
echo "$version"
