#!/bin/bash
# Outputs a version string in the format yyyy.mm.dd.XX, incrementing XX if tags exist for today.
# Usage: ./_get-version.sh <github_token>

set -e

gh_token="$1"
repo="${GITHUB_REPOSITORY:-dpembo/BackupHub}"
today=$(date +'%Y.%m.%d')

echo "DEBUG: Fetching tags from ${repo}..." >&2
echo "DEBUG: Today's date: ${today}" >&2

# Get all tags for today, sort, and find the highest counter
# Use GitHub API v3 with proper authentication
api_response=$(curl -s -H "Authorization: token $gh_token" "https://api.github.com/repos/$repo/tags?per_page=100")

# Check if API call succeeded
if [ $? -ne 0 ] || [ -z "$api_response" ]; then
  echo "ERROR: Failed to fetch tags from GitHub API" >&2
  echo "DEBUG: Response: $api_response" >&2
  next_counter="01"
else
  # Extract tag names and filter for today's date
  today_tags=$(echo "$api_response" | jq -r '.[].name' 2>/dev/null | grep "^${today}\." | sort -V)
  
  if [ -z "$today_tags" ]; then
    echo "DEBUG: No tags found for today (${today})" >&2
    next_counter="01"
  else
    echo "DEBUG: Found tags for today: $today_tags" >&2
    latest_tag=$(echo "$today_tags" | tail -n1)
    echo "DEBUG: Latest tag: $latest_tag" >&2
    
    # Extract counter from latest tag
    if [[ "$latest_tag" =~ ^${today}\.([0-9]{2})$ ]]; then
      counter="${BASH_REMATCH[1]}"
      echo "DEBUG: Extracted counter: $counter" >&2
      next_counter=$(printf "%02d" $((10#$counter + 1)))
      echo "DEBUG: Next counter: $next_counter" >&2
    else
      echo "DEBUG: Latest tag doesn't match expected format: $latest_tag" >&2
      next_counter="01"
    fi
  fi
fi

version="${today}.${next_counter}"
echo "INFO: Generated version: $version" >&2
echo "$version"
