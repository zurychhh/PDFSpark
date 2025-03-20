#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}PDFSpark Frontend API URL Updater${NC}"
echo "========================================"

# Check for the config file
CONFIG_FILE="src/config/config.ts"
if [ ! -f "$CONFIG_FILE" ]; then
    echo -e "${RED}Error: Config file not found at $CONFIG_FILE${NC}"
    exit 1
fi

# Get the Railway URL
echo -e "${YELLOW}Retrieving Railway deployment URL...${NC}"
if ! command -v railway &> /dev/null; then
    echo -e "${RED}Error: Railway CLI is not installed.${NC}"
    echo "Please install it by running: npm i -g @railway/cli"
    echo -e "${YELLOW}Enter the Railway deployment URL manually:${NC}"
    read -p "Railway URL: " railway_url
else
    # Check if logged in to Railway
    railway status &> /dev/null
    if [ $? -ne 0 ]; then
        echo -e "${RED}Not logged in to Railway. Please login first.${NC}"
        railway login
    fi
    
    # Get the deployment URL
    echo -e "${YELLOW}Getting current deployment URL...${NC}"
    railway_status=$(railway status)
    environment_url=$(echo "$railway_status" | grep -o 'https://[a-zA-Z0-9.-]*\.up\.railway\.app' | head -n 1)
    
    if [ -z "$environment_url" ]; then
        echo -e "${YELLOW}Couldn't automatically detect Railway URL. Please enter it manually:${NC}"
        read -p "Railway URL: " railway_url
    else
        railway_url=$environment_url
    fi
fi

if [ -z "$railway_url" ]; then
    echo -e "${RED}Error: No Railway URL provided${NC}"
    exit 1
fi

echo -e "${GREEN}Using Railway URL: $railway_url${NC}"

# Update the config file
echo -e "${YELLOW}Updating config file...${NC}"
# Backup the config file
cp "$CONFIG_FILE" "${CONFIG_FILE}.bak"

# Update the API_URL in the config file
sed -i.tmp "s|export const API_URL = [^;]*;|export const API_URL = '$railway_url';|" "$CONFIG_FILE"

# Check if the update was successful
if diff -q "$CONFIG_FILE" "${CONFIG_FILE}.tmp" > /dev/null; then
    echo -e "${RED}No changes made to config file. The URL might already be set or the file format is unexpected.${NC}"
    cat "$CONFIG_FILE" | grep "API_URL"
else
    rm "${CONFIG_FILE}.tmp"
    echo -e "${GREEN}Config file updated successfully!${NC}"
    echo -e "Original line (backup in ${CONFIG_FILE}.bak):"
    cat "${CONFIG_FILE}.bak" | grep "API_URL"
    echo -e "New line:"
    cat "$CONFIG_FILE" | grep "API_URL"
fi

# Ask if user wants to build the frontend with the new URL
echo ""
read -p "Do you want to build the frontend with the new API URL? (y/n): " build_frontend
if [[ $build_frontend == "y" || $build_frontend == "Y" ]]; then
    echo -e "${YELLOW}Building frontend...${NC}"
    npm run build
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}Frontend built successfully!${NC}"
        echo -e "You can now deploy the frontend build to your hosting service."
    else
        echo -e "${RED}Frontend build failed!${NC}"
    fi
fi

echo -e "${GREEN}Done!${NC}"