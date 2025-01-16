# WebDAV Demo on Azure Container Apps

This project demonstrates a WebDAV server implementation with a React-based web client, deployed on Azure Container Apps. The application allows users to upload files, create folders, and manage their WebDAV storage through a modern web interface.

## Features

- WebDAV server with basic authentication
- React-based web client interface
- File upload and download capabilities
- Folder creation and management
- Secure authentication
- Containerized deployment on Azure

## Architecture

The application consists of two main components:

1. **Backend (WebDAV Server)**
   - Node.js Express server
   - webdav-server v2 library
   - Basic authentication
   - Physical file system storage

2. **Frontend (React Client)**
   - React-based web interface
   - Axios for HTTP requests
   - Modern UI with responsive design
   - Session management

## Prerequisites

- Node.js 18 or later
- Docker Desktop
- Azure CLI
- Azure subscription
- Git

## Local Development Setup

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd webdav-demo
   ```

2. Install dependencies:
   ```bash
   # Install server dependencies
   cd webdav-server
   npm install

   # Install client dependencies
   cd ../webdav-client
   npm install
   ```

3. Start the development servers:
   ```bash
   # Terminal 1: Start the WebDAV server
   cd webdav-server
   node server.js

   # Terminal 2: Start the React development server
   cd webdav-client
   npm start
   ```

4. Access the application at `http://localhost:3000`

## Docker Build

The application uses a multi-stage Dockerfile to build both the client and server components:

```dockerfile
# Build stage for client
FROM node:18 as client-builder
WORKDIR /app/client
COPY webdav-client/package*.json ./
RUN npm install
COPY webdav-client/ ./
RUN npm run build

# Final stage
FROM node:18-slim
WORKDIR /app
COPY webdav-server/package*.json ./
RUN npm install --production
COPY webdav-server/server.js ./
COPY --from=client-builder /app/client/build ./public
RUN mkdir -p data && chmod 777 data
```

## Azure Deployment

1. Install required tools:
   ```bash
   # Install Azure CLI
   brew update && brew install azure-cli
   ```

2. Login to Azure:
   ```bash
   az login
   ```

3. Deploy using the provided script:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

The deployment script handles:
- Resource group creation
- Azure Container Registry setup
- Container build and push
- Azure Container App deployment

## Infrastructure as Code (Bicep)

The project uses Azure Bicep for infrastructure deployment. The Bicep template (`main.bicep`) defines all necessary Azure resources and their configurations.

### Bicep Resources

```bicep
// Container Apps Environment
resource environment 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: 'webdav-demo-env'
  location: location
  properties: {
    // Environment configuration
  }
}

// Container App
resource containerApp 'Microsoft.App/containerApps@2023-05-01' = {
  name: 'webdav-demo'
  location: location
  properties: {
    // Container configuration
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
      }
    }
    template: {
      containers: [
        {
          // Container settings
          name: 'webdav-demo'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
          ]
        }
      ]
    }
  }
}
```

### Deployment Parameters

The Bicep deployment uses parameters defined in `main.parameters.json`:

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": {
      "value": "eastus"
    },
    "containerImage": {
      "value": "webdavdemoacr.azurecr.io/webdav-demo:latest"
    }
  }
}
```

### Deployment Process

The Bicep template is deployed through the `deploy.sh` script, which:
1. Creates or updates the resource group
2. Builds and pushes the container image
3. Deploys the Bicep template with parameters
4. Configures the Container App with environment variables

### Infrastructure Updates

To modify the infrastructure:
1. Update the Bicep template (`main.bicep`)
2. Modify parameters if needed (`main.parameters.json`)
3. Run the deployment script:
   ```bash
   ./deploy.sh --resume
   ```

## Configuration

### Environment Variables

Copy the example environment file and update it with your values:
```bash
cp .env.example .env
```

Required environment variables:
- `AZURE_SUBSCRIPTION_ID`: Your Azure subscription ID
- `AZURE_TENANT_ID`: Your Azure tenant ID
- `REGISTRY_LOGIN_SERVER`: Azure Container Registry login server (automatically set during deployment)
- `REGISTRY_USERNAME`: ACR username (automatically set during deployment)
- `REGISTRY_PASSWORD`: ACR password (automatically set during deployment)

The deployment script will automatically configure the registry-related variables, but you must provide your Azure subscription and tenant IDs.

### Authentication

Default credentials:
- Username: `WebDavDemo`
- Password: `WebDavPassword`

## Project Structure

```
webdav-demo/
├── webdav-server/
│   ├── server.js
│   ├── package.json
│   └── data/
├── webdav-client/
│   ├── src/
│   │   ├── App.js
│   │   └── components/
│   └── package.json
├── Dockerfile
├── deploy.sh
└── README.md
```

## Azure Resources

The deployment creates the following Azure resources:
- Resource Group: `webdav-demo-rg`
- Container Registry: `webdavdemoacr`
- Container App: `webdav-demo`
- Container App Environment

## Security Considerations

- CORS is configured for production environment
- Basic authentication is implemented
- HTTPS is enabled by default in Azure Container Apps
- File system permissions are properly set

## Troubleshooting

1. Check container logs:
   ```bash
   az containerapp logs show \
       --name webdav-demo \
       --resource-group webdav-demo-rg \
       --tail 100
   ```

2. Connect to container:
   ```bash
   az containerapp exec \
       --name webdav-demo \
       --resource-group webdav-demo-rg \
       --command sh
   ```

## Known Issues and Limitations

- Basic authentication is used for demonstration purposes
- File size limits are determined by Azure Container Apps configuration
- Session persistence relies on browser local storage

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [webdav-server](https://github.com/OpenMarshal/npm-webdav-server) - WebDAV server implementation
- [React](https://reactjs.org/) - Frontend framework
- [Azure Container Apps](https://azure.microsoft.com/en-us/services/container-apps/) - Hosting platform 