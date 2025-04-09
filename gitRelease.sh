#!/bin/sh

# Replace placeholders with actual values
ORG_NAME="$1"
REPO_NAME="$2"
BRANCH_NAME="$3"
ACCESS_TOKEN="$4"
TAG_NAME="$5"
RELEASE_NAME="$6"
RELEASE_BODY="$7"

echo "+-----------------------------------------------------+"
echo "| 1. Getting Last Commit SHA                          |"  
echo "+-----------------------------------------------------+"
echo " "
shaId=`curl -s -H "Authorization: token $ACCESS_TOKEN" -H "Accept: application/vnd.github.v3+json" "https://api.github.com/repos/$ORG_NAME/$REPO_NAME/commits/$BRANCH_NAME" | jq -r '.sha'`
echo "Commit ID: $shaId";
echo " "

echo "+-----------------------------------------------------+"
echo "| 2. Taggging Respository                             |"
echo "+-----------------------------------------------------+"
echo " "

# Create a tag for the most recent commit
curl -X POST -H "Authorization: token $ACCESS_TOKEN" -H "Accept: application/vnd.github.v3+json" https://api/github.com/repos/$ORG_NAME/$REPO_NAME/git/refs -d "{\"ref\": \"refs/tags/$TAG_NAME\", \"sha\": \"$shaId\"}"

echo "+-----------------------------------------------------+"
echo "| 3. Creating Release                                 |"
echo "+-----------------------------------------------------+"
echo " "

# Create a release
releaseResp=`curl -s -X POST -H "Authorization: token $ACCESS_TOKEN" -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/$ORG_NAME/$REPO_NAME/releases -d "{\"tag_name\": \"$TAG_NAME\", \"name\": \"$RELEASE_NAME\", \"body\": \"$RELEASE_BODY\"}"` #| jq -r '.id'`

echo $releaseResp
releaseId=`echo $releaseResp | jq -r '.id'`
uploadUrl=`echo $releaseResp | jq -r '.upload_url'`
echo "Release ID: $releaseId"
echo " "

#echo "+-----------------------------------------------------+"
#echo "| 4. Attach Release Binaries                          |"
#echo "+-----------------------------------------------------+"
#echo " "
#
#RELEASE_ID="$releaseId" # Replace with the ID of the created release


