#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}PDFSpark Railway Backend Deployment Script${NC}"
echo "=========================================="

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Error: Railway CLI is not installed.${NC}"
    echo "Please install it by running: npm i -g @railway/cli"
    exit 1
fi

# Check if logged in to Railway
echo -e "${YELLOW}Checking Railway login status...${NC}"
railway status &> /dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}Not logged in to Railway. Please login first.${NC}"
    railway login
fi

# Confirm current project
echo -e "${YELLOW}Checking current Railway project...${NC}"
CURRENT_PROJECT=$(railway project)
echo "Current project: $CURRENT_PROJECT"

# Ask if user wants to continue with this project
read -p "Continue with this project? (y/n): " continue_project
if [[ $continue_project != "y" && $continue_project != "Y" ]]; then
    echo "Please select the project to use:"
    railway project
    echo -e "${YELLOW}Please run this script again after selecting the project.${NC}"
    exit 0
fi

# Ask if we need to set environment variables
read -p "Do you need to set or update environment variables? (y/n): " update_env
if [[ $update_env == "y" || $update_env == "Y" ]]; then
    echo -e "${YELLOW}Setting environment variables...${NC}"
    
    # Cloudinary variables
    read -p "Enter CLOUDINARY_CLOUD_NAME: " cloud_name
    read -p "Enter CLOUDINARY_API_KEY: " api_key
    read -s -p "Enter CLOUDINARY_API_SECRET: " api_secret
    echo ""
    
    # Set the variables
    railway variables set CLOUDINARY_CLOUD_NAME="$cloud_name" CLOUDINARY_API_KEY="$api_key" CLOUDINARY_API_SECRET="$api_secret" USE_MEMORY_FALLBACK=true NODE_OPTIONS="--max-old-space-size=2048"
    
    echo -e "${GREEN}Environment variables set successfully!${NC}"
fi

# Deploy to Railway
echo -e "${YELLOW}Deploying to Railway...${NC}"
railway up

if [ $? -eq 0 ]; then
    echo -e "${GREEN}Deployment successful!${NC}"
    
    # Get the deployment URL
    echo -e "${YELLOW}Fetching deployment URL...${NC}"
    railway status
    
    echo ""
    echo -e "${GREEN}Backend deployment completed!${NC}"
    echo -e "${YELLOW}Remember to update your frontend configuration with the new API URL.${NC}"
    echo "frontend/src/config/config.ts → API_URL variable"
else
    echo -e "${RED}Deployment failed!${NC}"
    echo "Please check the logs for more information."
fi