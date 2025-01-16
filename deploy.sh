#!/bin/bash

# Exit on error
set -e

# Variables
SUBSCRIPTION_ID="a81359f6-058d-4697-aa3b-b2b7be8a8d02"
RESOURCE_GROUP="webdav-demo-rg"
LOCATION="southeastasia"
ACR_NAME="webdavdemoacr"
CONTAINER_APP_NAME="webdav-demo"

# Add the check_prerequisites function
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check if Docker Desktop is running
    if ! docker info > /dev/null 2>&1; then
        echo "Error: Docker Desktop is not running. Please start Docker Desktop and try again."
        exit 1
    fi
    
    # Check if Homebrew is installed (macOS package manager)
    if ! command -v brew &> /dev/null; then
        echo "Homebrew is not installed. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Check if Azure CLI is installed
    if ! command -v az &> /dev/null; then
        echo "Azure CLI is not installed. Installing..."
        brew update && brew install azure-cli
    fi

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        echo "Error: Docker is not installed. Please install Docker Desktop for Mac first."
        echo "Download from: https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    # Check if Bicep CLI is installed
    if ! az bicep version &> /dev/null; then
        echo "Installing Bicep CLI..."
        az bicep install
    fi
}

# Function to check if resource exists
resource_exists() {
    local resource_type=$1
    local resource_name=$2
    
    az resource show \
        --resource-group $RESOURCE_GROUP \
        --resource-type $resource_type \
        --name $resource_name \
        --query "id" \
        --output tsv 2>/dev/null
}

# Initialize Azure resources
initialize_azure() {
    echo "Checking Azure login status..."
    if ! az account show >/dev/null 2>&1; then
        echo "Logging in to Azure..."
        az login
    fi

    echo "Setting subscription..."
    az account set --subscription $SUBSCRIPTION_ID

    # Check if resource group exists
    if ! az group show -n $RESOURCE_GROUP >/dev/null 2>&1; then
        echo "Creating resource group..."
        az group create --name $RESOURCE_GROUP --location $LOCATION
    else
        echo "Resource group $RESOURCE_GROUP already exists, skipping creation..."
    fi
}

# Set up Azure Container Registry
setup_acr() {
    # Check if ACR exists
    if ! az acr show -n $ACR_NAME >/dev/null 2>&1; then
        echo "Creating Azure Container Registry..."
        az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic
    else
        echo "ACR $ACR_NAME already exists, skipping creation..."
    fi
    
    # Check if admin user is enabled
    if [[ $(az acr show -n $ACR_NAME --query adminUserEnabled) == "false" ]]; then
        echo "Enabling admin user for ACR..."
        az acr update -n $ACR_NAME --admin-enabled true
    else
        echo "Admin user already enabled for ACR..."
    fi
    
    echo "Getting ACR credentials..."
    ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query "username" -o tsv)
    ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)
    
    echo "Logging in to Docker with ACR credentials..."
    echo $ACR_PASSWORD | docker login webdavdemoacr.azurecr.io -u $ACR_USERNAME --password-stdin || {
        echo "Docker login failed, retrying after a short delay..."
        sleep 10
        echo $ACR_PASSWORD | docker login webdavdemoacr.azurecr.io -u $ACR_USERNAME --password-stdin
    }
}

# Build and push Docker image
build_and_push_image() {
    echo "Getting ACR login server..."
    LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)
    
    # Add timestamp to tag to force new build
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    IMAGE_TAG="latest-${TIMESTAMP}"
    
    echo "Building Docker image for linux/amd64 platform with tag: ${IMAGE_TAG}"
    # Enable Docker BuildKit
    export DOCKER_BUILDKIT=1
    
    # Remove existing builder if exists
    docker buildx rm webdav-builder || true
    
    # Create and use a new builder instance
    docker buildx create --name webdav-builder --use
    docker buildx inspect --bootstrap
    
    # Build the image locally first
    echo "Building image locally for inspection..."
    docker build -t webdav-demo:local .
    
    echo "Inspecting local image..."
    docker run --rm webdav-demo:local cat /app/server.js
    
    # Build and push the image with platform specification
    echo "Building and pushing image to ACR..."
    docker buildx build \
        --platform linux/amd64 \
        --tag ${LOGIN_SERVER}/${CONTAINER_APP_NAME}:${IMAGE_TAG} \
        --tag ${LOGIN_SERVER}/${CONTAINER_APP_NAME}:latest \
        --push \
        . || {
        echo "Docker build failed. Please check your Dockerfile and try again."
        exit 1
    }
    
    # Update the container app to use the new image
    echo "Updating container app to use new image..."
    az containerapp update \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --image ${LOGIN_SERVER}/${CONTAINER_APP_NAME}:${IMAGE_TAG} \
        --query "properties.latestRevisionName" \
        --output tsv
    
    echo "Image built and pushed successfully with tag: ${IMAGE_TAG}"
}

# Deploy infrastructure
deploy_infrastructure() {
    echo "Getting ACR credentials..."
    ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query "username" -o tsv)
    ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query "passwords[0].value" -o tsv)
    LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer -o tsv)

    # Check if Container App exists
    if az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP >/dev/null 2>&1; then
        echo "Updating existing Container App..."
    else
        echo "Creating new Container App..."
    fi

    echo "Updating parameters file..."
    cat > main.parameters.temp.json << EOF
{
    "\$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
    "contentVersion": "1.0.0.0",
    "parameters": {
        "containerAppName": {
            "value": "$CONTAINER_APP_NAME"
        },
        "containerImage": {
            "value": "${LOGIN_SERVER}/${CONTAINER_APP_NAME}:latest"
        },
        "containerRegistryServer": {
            "value": "$LOGIN_SERVER"
        },
        "containerRegistryUsername": {
            "value": "$ACR_USERNAME"
        },
        "containerRegistryPassword": {
            "value": "$ACR_PASSWORD"
        }
    }
}
EOF

    echo "Deploying infrastructure using Bicep..."
    az deployment group create \
        --resource-group $RESOURCE_GROUP \
        --template-file main.bicep \
        --parameters @main.parameters.temp.json

    # Clean up temporary parameters file
    rm main.parameters.temp.json
}

# Get deployment outputs
get_deployment_outputs() {
    echo "Getting Container App FQDN..."
    FQDN=$(az deployment group show \
        --resource-group $RESOURCE_GROUP \
        --name main \
        --query "properties.outputs.containerAppFQDN.value" \
        -o tsv)
    
    echo "Deployment complete!"
    echo "Container App URL: https://$FQDN"
}

# Function to troubleshoot container app
troubleshoot_container_app() {
    echo "Starting Container App diagnostics..."
    
    echo "1. Checking Container App status..."
    az containerapp show \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --query "properties.latestRevisionName" \
        -o tsv
    
    echo "2. Getting Container App logs..."
    az containerapp logs show \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --tail 50
    
    echo "3. Checking Container App revision status..."
    az containerapp revision list \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --output table
}

# Function to connect to container for debugging
connect_container() {
    echo "Connecting to Container App for debugging..."
    
    # Get the latest revision
    REVISION=$(az containerapp revision list \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --query "[?active].name" -o tsv)
    
    if [ -z "$REVISION" ]; then
        echo "Error: No active revision found"
        exit 1
    fi
    
    echo "Connecting to revision: $REVISION"
    az containerapp exec \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --revision $REVISION \
        --command sh
}

# Function to view file contents in container
view_container_file() {
    echo "Viewing file in Container App..."
    
    # Get the latest revision
    REVISION=$(az containerapp revision list \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --query "[?active].name" -o tsv)
    
    if [ -z "$REVISION" ]; then
        echo "Error: No active revision found"
        exit 1
    fi
    
    echo "Reading file content using container app logs..."
    az containerapp exec \
        --name $CONTAINER_APP_NAME \
        --resource-group $RESOURCE_GROUP \
        --revision $REVISION \
        --command "cat /app/server.js" || {
        echo "Failed to read file directly, trying with logs..."
        az containerapp logs show \
            --name $CONTAINER_APP_NAME \
            --resource-group $RESOURCE_GROUP \
            --follow \
            --tail 1000
    }
}

# Main execution with resume capability
main() {
    echo "Starting deployment..."
    
    # Check if we should view file
    if [ "$1" = "--view-file" ]; then
        echo "Viewing file contents..."
        check_prerequisites
        initialize_azure
        view_container_file
        exit 0
    fi
    
    # Check if we should connect to container
    if [ "$1" = "--connect" ]; then
        echo "Connecting to container..."
        check_prerequisites
        initialize_azure
        connect_container
        exit 0
    fi
    
    # Check if we should troubleshoot
    if [ "$1" = "--troubleshoot" ]; then
        echo "Running diagnostics..."
        check_prerequisites
        initialize_azure
        troubleshoot_container_app
        exit 0
    fi
    
    # Check if we should resume from a specific point
    if [ "$1" = "--resume" ]; then
        echo "Resuming deployment..."
        check_prerequisites
        initialize_azure
        setup_acr
        build_and_push_image
        deploy_infrastructure
        get_deployment_outputs
        troubleshoot_container_app
        exit 0
    fi
    
    # Normal execution
    check_prerequisites
    initialize_azure
    setup_acr
    build_and_push_image
    deploy_infrastructure
    get_deployment_outputs
    troubleshoot_container_app
}

# Run the script with resume flag
main --resume 