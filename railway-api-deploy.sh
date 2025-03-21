#!/bin/bash

# Railway API Deployment Script
# This script uses the Railway API to deploy PDFSpark without using the CLI

set -e  # Exit on error

# Check for required tools
command -v curl >/dev/null 2>&1 || { echo "Error: curl is required but not installed"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq is required but not installed"; exit 1; }

# Configuration
API_TOKEN=${RAILWAY_API_TOKEN:-}
PROJECT_NAME=${PROJECT_NAME:-"PDFSpark API"}
ENVIRONMENT_NAME=${ENVIRONMENT_NAME:-"production"}
DEPLOYMENT_PACKAGE=${DEPLOYMENT_PACKAGE:-"minimal-health-app.zip"}

# Validate the API token is available
if [ -z "$API_TOKEN" ]; then
  echo "Error: RAILWAY_API_TOKEN not set. Please set this environment variable."
  echo "You can get an API token by running 'railway login' in an interactive terminal"
  echo "and checking ~/.railway/config.json"
  exit 1
fi

# Validate the deployment package exists
if [ ! -f "$DEPLOYMENT_PACKAGE" ]; then
  echo "Error: Deployment package $DEPLOYMENT_PACKAGE not found."
  echo "Please run ./create-railway-deployment-packages.sh first."
  exit 1
fi

echo "Starting Railway API deployment..."
echo "Project: $PROJECT_NAME"
echo "Environment: $ENVIRONMENT_NAME"
echo "Package: $DEPLOYMENT_PACKAGE"

# Base API URL
API_URL="https://backboard.railway.app/graphql/v2"

# Function to make GraphQL requests
function graphql_request() {
  local query="$1"
  local variables="$2"
  
  if [ -z "$variables" ]; then
    variables="{}"
  fi
  
  curl -s -X POST "$API_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $API_TOKEN" \
    -d "{\"query\":\"$query\",\"variables\":$variables}"
}

# Step 1: Create or get project
echo "Step 1: Creating or finding project..."

# Check if project exists
PROJECT_QUERY="query { projects { edges { node { id name } } } }"
PROJECTS_JSON=$(graphql_request "$PROJECT_QUERY")

# Extract project ID if it exists
PROJECT_ID=$(echo "$PROJECTS_JSON" | jq -r ".data.projects.edges[] | select(.node.name == \"$PROJECT_NAME\") | .node.id")

if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
  # Create a new project
  echo "Project not found, creating new project: $PROJECT_NAME"
  
  CREATE_PROJECT_MUTATION="mutation createProject(\$input: ProjectCreateInput!) { projectCreate(input: \$input) { id name } }"
  CREATE_PROJECT_VARS="{\"input\":{\"name\":\"$PROJECT_NAME\"}}"
  
  CREATE_PROJECT_RESULT=$(graphql_request "$CREATE_PROJECT_MUTATION" "$CREATE_PROJECT_VARS")
  PROJECT_ID=$(echo "$CREATE_PROJECT_RESULT" | jq -r '.data.projectCreate.id')
  
  if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" == "null" ]; then
    echo "Error creating project"
    echo "$CREATE_PROJECT_RESULT"
    exit 1
  fi
  
  echo "Project created with ID: $PROJECT_ID"
else
  echo "Found existing project with ID: $PROJECT_ID"
fi

# Step 2: Get or create environment
echo "Step 2: Getting or creating environment..."

ENV_QUERY="query(\$projectId: String!) { environments(projectId: \$projectId) { edges { node { id name } } } }"
ENV_VARS="{\"projectId\":\"$PROJECT_ID\"}"

ENVS_JSON=$(graphql_request "$ENV_QUERY" "$ENV_VARS")
ENV_ID=$(echo "$ENVS_JSON" | jq -r ".data.environments.edges[] | select(.node.name == \"$ENVIRONMENT_NAME\") | .node.id")

if [ -z "$ENV_ID" ] || [ "$ENV_ID" == "null" ]; then
  # Create a new environment
  echo "Environment not found, creating new environment: $ENVIRONMENT_NAME"
  
  CREATE_ENV_MUTATION="mutation createEnvironment(\$input: EnvironmentCreateInput!) { environmentCreate(input: \$input) { id name } }"
  CREATE_ENV_VARS="{\"input\":{\"name\":\"$ENVIRONMENT_NAME\",\"projectId\":\"$PROJECT_ID\"}}"
  
  CREATE_ENV_RESULT=$(graphql_request "$CREATE_ENV_MUTATION" "$CREATE_ENV_VARS")
  ENV_ID=$(echo "$CREATE_ENV_RESULT" | jq -r '.data.environmentCreate.id')
  
  if [ -z "$ENV_ID" ] || [ "$ENV_ID" == "null" ]; then
    echo "Error creating environment"
    echo "$CREATE_ENV_RESULT"
    exit 1
  fi
  
  echo "Environment created with ID: $ENV_ID"
else
  echo "Found existing environment with ID: $ENV_ID"
fi

# Step 3: Create a service
echo "Step 3: Creating a service..."

# Create a temporary location for artifact upload
ARTIFACT_URL="https://backboard.railway.app/api/upload"
echo "Generating upload URL for artifact..."

UPLOAD_RESPONSE=$(curl -s -X POST "$ARTIFACT_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{}')

UPLOAD_URL=$(echo "$UPLOAD_RESPONSE" | jq -r '.url')
ARTIFACT_ID=$(echo "$UPLOAD_RESPONSE" | jq -r '.artifactId')

if [ -z "$UPLOAD_URL" ] || [ "$UPLOAD_URL" == "null" ]; then
  echo "Failed to get upload URL"
  echo "$UPLOAD_RESPONSE"
  exit 1
fi

# Upload the deployment package
echo "Uploading deployment package..."
curl -s -X PUT "$UPLOAD_URL" --upload-file "$DEPLOYMENT_PACKAGE"

# Create a service using the uploaded artifact
echo "Creating service from artifact..."

CREATE_SERVICE_MUTATION="mutation deployOnUploads(\$input: DeployOnUploadsInput!) { deployOnUploads(input: \$input) { deployments { id } } }"
CREATE_SERVICE_VARS="{\"input\":{\"projectId\":\"$PROJECT_ID\",\"environmentId\":\"$ENV_ID\",\"artifactId\":\"$ARTIFACT_ID\"}}"

CREATE_SERVICE_RESULT=$(graphql_request "$CREATE_SERVICE_MUTATION" "$CREATE_SERVICE_VARS")
DEPLOYMENT_IDS=$(echo "$CREATE_SERVICE_RESULT" | jq -r '.data.deployOnUploads.deployments[].id')

if [ -z "$DEPLOYMENT_IDS" ] || [ "$DEPLOYMENT_IDS" == "null" ]; then
  echo "Error creating service"
  echo "$CREATE_SERVICE_RESULT"
  exit 1
fi

echo "Service created successfully with deployment IDs:"
echo "$DEPLOYMENT_IDS"

# Step 4: Monitor deployment status
echo "Step 4: Monitoring deployment status..."

for DEPLOYMENT_ID in $DEPLOYMENT_IDS; do
  echo "Checking status of deployment: $DEPLOYMENT_ID"
  
  STATUS="BUILDING"
  ATTEMPTS=0
  MAX_ATTEMPTS=20
  
  while [ "$STATUS" == "BUILDING" ] && [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
    DEPLOYMENT_QUERY="query(\$id: String!) { deployment(id: \$id) { id status } }"
    DEPLOYMENT_VARS="{\"id\":\"$DEPLOYMENT_ID\"}"
    
    DEPLOYMENT_STATUS=$(graphql_request "$DEPLOYMENT_QUERY" "$DEPLOYMENT_VARS")
    STATUS=$(echo "$DEPLOYMENT_STATUS" | jq -r '.data.deployment.status')
    
    echo "Deployment status: $STATUS (attempt $((ATTEMPTS+1))/$MAX_ATTEMPTS)"
    
    if [ "$STATUS" != "BUILDING" ]; then
      break
    fi
    
    ATTEMPTS=$((ATTEMPTS+1))
    sleep 10
  done
  
  if [ "$STATUS" == "SUCCESS" ]; then
    echo "Deployment successful!"
  else
    echo "Deployment ended with status: $STATUS"
    if [ "$STATUS" != "SUCCESS" ]; then
      echo "Deployment may have failed, check the Railway dashboard for details."
    fi
  fi
done

echo "Deployment process completed."
echo "Please check the Railway dashboard for more details and to generate a public domain."