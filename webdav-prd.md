# WebDAV Client-Server Demo Environment - Product Requirements Document (PRD)

## 1. Overview
This document describes how to build a minimal **WebDAV** client-server testing environment to verify the compatibility of a CDN product with the **WebDAV** protocol. We will provide:
1. An outline of the components (frontend + backend) required
2. Step-by-step instructions to stand up a **WebDAV** server
3. A simple sample **WebDAV** client/demo application
4. An evaluation of whether **Nginx**'s native WebDAV support can be adopted for this use case

The instructions in this PRD are optimized as input for **Cursor Code Editor** to generate scaffolding and code for both the **frontend** and **backend**.   

## 2. Goals and Requirements

### 2.1 Goals
1. **Demonstrate basic WebDAV functionalities** (CRUD operations on files/folders) to confirm your CDN service correctly handles WebDAV traffic.
2. **Provide a simple UI** for uploading, downloading, listing, and managing files via WebDAV.
3. **Test essential features** such as:
   - Basic/Advanced WebDAV methods: `PROPFIND`, `PROPPATCH`, `MKCOL`, `COPY`, `MOVE`, `LOCK`, `UNLOCK`
   - Read/Write requests over HTTP/HTTPS

### 2.2 Functional Requirements
1. **WebDAV Server**  
   - Must accept **HTTP** and optionally **HTTPS** requests.  
   - Must support basic authentication (username/password).  
   - Must allow uploading, downloading, renaming, deleting, creating folders, etc.

2. **WebDAV Client**  
   - Must allow basic file operations (upload, download, move, copy, rename, delete).  
   - Provide a simple web UI to demonstrate the functionalities.  

3. **Logging & Observability**  
   - Provide server logs for request/response for debugging.  

4. **Ease of Deployment**  
   - Provide a Docker-based or simple local environment setup for quick spin-up.

### 2.3 Non-Functional Requirements
1. The solution should be easy to run cross-platform (Linux, macOS, Windows).  
2. Proper error handling and status messages in logs.  
3. Code consistency and clarity to facilitate quick modifications.

## 3. Architecture & Technology Choices

### 3.1 Proposed Architecture
1. **Backend (WebDAV Server)**  
   - We will use **Node.js** or **Express** with a WebDAV library (e.g., [`webdav-server` package](https://github.com/OpenMarshal/node-webdav)) or [`webdav` npm package](https://github.com/perry-mitchell/webdav-client).  
   - Expose endpoints that can be tested with a standalone WebDAV client (e.g., [Cyberduck](https://cyberduck.io/), [WinSCP](https://winscp.net/eng/index.php), or your own custom UI).

2. **Frontend (WebDAV Client UI)**  
   - A simple **React** or **Vue** app, or even a minimal **HTML/JavaScript** page, that will consume the WebDAV server endpoints for file operations.  
   - This app should allow:
     - Listing directories/files
     - Uploading files
     - Downloading files
     - Creating/moving/deleting files/folders

3. **Docker Configuration**  
   - Provide a **Dockerfile** and a **docker-compose.yml** for easy environment setup.  

### 3.2 Evaluation of Using Nginx for WebDAV
- **Nginx** does have a [WebDAV module](http://nginx.org/en/docs/http/ngx_http_dav_module.html), allowing you to enable WebDAV methods.  
- However, the out-of-the-box Nginx WebDAV support provides only a subset of WebDAV methods (e.g. `PUT`, `DELETE`, `MKCOL`, `COPY`, `MOVE`). It lacks more advanced features like `PROPFIND`, `PROPPATCH`, `LOCK`, and `UNLOCK` unless you apply patches or use additional modules.  
- If all you need is basic file upload, download, create, move, delete, you can consider **Nginx** (with its DAV module). But if you want full WebDAV specification coverage, you might need to:
  - Compile Nginx with extra patches and modules.
  - Or use a dedicated WebDAV server library that fully supports advanced operations.

**Conclusion**: **For a full-featured demo** that covers all key WebDAV methods, a **Node.js** or **Apache**-based solution is preferable to avoid additional Nginx module patching. If your CDN tests only basic WebDAV operations, Nginx might be sufficient.

## 4. System Design

### 4.1 Components
1. **WebDAV Server** – Node.js server  
   - Receives WebDAV HTTP methods and manipulates files in a local or mounted directory.
2. **Front-End** – A minimal React or Vue app (or an HTML+JS page)  
   - Invokes WebDAV methods to test file/folder operations.

### 4.2 Data Flow
1. A user interacts with the web-based UI, e.g., clicking **upload** or **create folder**.
2. The front-end calls the appropriate **WebDAV** method on the Node.js server (e.g. `PUT` for uploading).
3. The server processes the request, updates files on disk, and returns appropriate responses or errors.
4. Logs are recorded on the server side to observe all WebDAV operations.

## 5. Detailed Setup & Implementation Steps

### 5.1 Prerequisites
- **Docker** and **Docker Compose** installed (or an equivalent container tool).  
- **Node.js** (if you plan to run locally outside of Docker).  
- A local or cloud environment that can open HTTP/HTTPS ports.

### 5.2 Backend (WebDAV Server) Setup

#### 5.2.1 Node.js/Express + WebDAV Library
1. **Initialize a new Node.js project**  
   ```bash
   mkdir webdav-server
   cd webdav-server
   npm init -y
   ```
2. **Install Dependencies**  
   ```bash
   npm install express basic-auth webdav-server @types/node --save
   ```
   - **express**: Web framework to handle requests.
   - **basic-auth**: For simple user authentication (optional).
   - **webdav-server**: Provides WebDAV support in Node.js.
   - **@types/node**: TypeScript definitions (if using TypeScript).

3. **Create `server.js`** (or `index.js`)  
   ```javascript
   const express = require('express');
   const { v2: webdav } = require('webdav-server'); // v2 for the last stable major version
   const basicAuth = require('basic-auth');

   // Create an Express app
   const app = express();

   // Create a WebDAV server instance
   const wfs = new webdav.WebDAVServer({
     // Optionally, define custom settings here
   });

   // Optional: Setup Basic Auth
   app.use((req, res, next) => {
     const user = basicAuth(req);
     if (!user || user.name !== 'testuser' || user.pass !== 'testpassword') {
       res.set('WWW-Authenticate', 'Basic realm="WebDAV Test"');
       return res.status(401).send('Authentication required.');
     }
     return next();
   });

   // Start the WebDAV server
   wfs.setFileSystem('/', new webdav.PhysicalFileSystem('./data'), (success) => {
     if (!success) {
       console.log('Failed to set file system');
     }
   });

   // Use the WebDAV server as middleware in Express
   app.use(webdav.extensions.express('/', wfs));

   // Start server
   const PORT = process.env.PORT || 8080;
   app.listen(PORT, () => {
     console.log(`WebDAV server is running on port ${PORT}`);
   });
   ```
4. **Create Data Directory**  
   ```bash
   mkdir data
   ```
   This will be the root directory for all files and folders accessible via WebDAV.

5. **Test**  
   ```bash
   node server.js
   ```
   Access your server at `http://localhost:8080`. Use the credentials `testuser` / `testpassword` for Basic Auth.

### 5.3 Frontend Setup

#### 5.3.1 React App Setup
1. **Configure npm for legacy peer dependencies**
   ```bash
   # This is required to avoid dependency conflicts with React and testing libraries
   npm config set legacy-peer-deps true
   ```

2. **Initialize a new React App**:
   ```bash
   npx create-react-app webdav-client
   cd webdav-client
   ```

3. **Install and configure dependencies**:
   ```bash
   # Remove existing dependencies to ensure clean install
   rm -rf node_modules package-lock.json
   
   # Clear npm cache
   npm cache clean --force
   
   # Install specific versions of React and required dependencies
   npm install --save react@^18.2.0 react-dom@^18.2.0
   npm install --save ajv@^8.12.0 ajv-keywords@^5.1.0
   npm install axios
   ```

4. **Implement a minimal UI**:
   - A file upload button
   - A listing of files/folders
   - Buttons for create folder / delete / rename, etc.

   **Example**: `App.js`
   ```javascript
   import React, { useState, useEffect } from 'react';
   import axios from 'axios';

   const App = () => {
     const [files, setFiles] = useState([]);
     const [selectedFile, setSelectedFile] = useState(null);
     const [folderName, setFolderName] = useState('');
     const [status, setStatus] = useState('');

     const serverURL = 'http://localhost:8080'; 
     const auth = {
       username: 'testuser',
       password: 'testpassword'
     };

     // Fetch directory listing
     const fetchFiles = async () => {
       try {
         const response = await axios({
           url: serverURL, // PROPFIND request
           method: 'PROPFIND',
           auth: auth,
           headers: {
             Depth: 1
           }
         });
         // You may have to parse XML response from the WebDAV server
         // For a simple approach, you might look for <d:href> tags or use a webdav client library
         setFiles(parsePropfindResponse(response.data));
       } catch (err) {
         setStatus(`Error fetching files: ${err.message}`);
       }
     };

     // Example parse function (stub)
     const parsePropfindResponse = (xmlString) => {
       // parse the XML string and extract file/folder names
       // return an array of file/folder objects
       return []; 
     };

     // Handle file upload
     const uploadFile = async () => {
       if (!selectedFile) return;
       try {
         await axios.put(
           `${serverURL}/${selectedFile.name}`,
           selectedFile,
           { auth: auth }
         );
         setStatus('File uploaded successfully!');
         fetchFiles();
       } catch (err) {
         setStatus(`Upload error: ${err.message}`);
       }
     };

     // Handle create folder
     const createFolder = async () => {
       if (!folderName) return;
       try {
         await axios({
           method: 'MKCOL',
           url: `${serverURL}/${folderName}`,
           auth: auth
         });
         setStatus('Folder created successfully!');
         fetchFiles();
       } catch (err) {
         setStatus(`Folder creation error: ${err.message}`);
       }
     };

     useEffect(() => {
       fetchFiles();
     }, []);

     return (
       <div>
         <h1>WebDAV Client Demo</h1>
         <div>
           <input
             type="file"
             onChange={(e) => setSelectedFile(e.target.files[0])}
           />
           <button onClick={uploadFile}>Upload File</button>
         </div>

         <div>
           <input
             type="text"
             placeholder="Folder Name"
             value={folderName}
             onChange={(e) => setFolderName(e.target.value)}
           />
           <button onClick={createFolder}>Create Folder</button>
         </div>

         <div>
           <h2>File/Folder List</h2>
           <ul>
             {files.map((f) => (
               <li key={f.name}>{f.name}</li>
             ))}
           </ul>
         </div>

         {status && <p>{status}</p>}
       </div>
     );
   };

   export default App;
   ```

4. **Run the Client**:
   ```bash
   npm start
   ```
   Access at `http://localhost:3000` (default create-react-app port).

### 5.4 Dockerizing the Setup

#### 5.4.1 Dockerfile for the WebDAV Server
Create a file named `Dockerfile` in the **webdav-server** directory:
```dockerfile
FROM node:16-alpine

WORKDIR /app

COPY package*.json /app/
RUN npm install

COPY . /app

# Expose port
EXPOSE 8080

CMD [ "node", "server.js" ]
```

#### 5.4.2 Dockerfile for the Frontend
Create a file named `Dockerfile` in the **webdav-client** directory:
```dockerfile
FROM node:16-alpine as build

WORKDIR /app
COPY package*.json /app/
RUN npm install

COPY . /app
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### 5.4.3 docker-compose.yml
Create a `docker-compose.yml` in the **parent folder** containing both `webdav-server` and `webdav-client` folders:

```yaml
version: '3.8'
services:
  webdav-server:
    build: 
      context: ./webdav-server
    ports:
      - "8080:8080"
    volumes:
      - ./webdav-server/data:/app/data
    container_name: webdav-server

  webdav-client:
    build:
      context: ./webdav-client
    ports:
      - "3000:80"
    container_name: webdav-client
    depends_on:
      - webdav-server
```

#### 5.4.4 Start the Environment
```bash
docker-compose up --build
```
- The WebDAV server will be on `http://localhost:8080`.
- The frontend app will be on `http://localhost:3000`.

## 6. Testing & Validation

1. **Smoke Test**  
   - Browse to `http://localhost:3000` (frontend).  
   - Upload a file.  
   - Check if it appears in the server's `data` folder.

2. **WebDAV Client Tools**  
   - Use a tool such as **Cyberduck** or **WinSCP**:
     - Connect to `http://localhost:8080` with username: `testuser` password: `testpassword`.
     - Perform basic file operations (upload, download, rename, delete).  

3. **CDN Integration Test**  
   - Point your CDN to the WebDAV server origin (e.g., `http://<host>:8080`).  
   - Confirm that requests to your CDN domain properly proxy WebDAV methods and responses.

4. **Advanced WebDAV Features**  
   - If required, test `PROPFIND`, `LOCK`, `UNLOCK`, etc., to confirm advanced operations are supported.

## 7. Maintenance & Future Enhancements

1. **HTTPS Support**  
   - Incorporate certificates (self-signed or real) into the Node.js server or Nginx (if used in front).  
2. **Enhanced Authentication**  
   - Integrate OAuth or JWT-based authentication (though less common with WebDAV, some use cases exist).  
3. **Advanced Logging**  
   - Add Winston or Morgan logs for better request/response tracking.  
4. **Scaling**  
   - For load testing, replicate this environment in multiple containers behind a load balancer.  

## 8. Conclusion
This PRD outlines a **WebDAV** client-server