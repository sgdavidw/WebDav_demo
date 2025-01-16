const express = require('express');
const webdav = require('webdav-server').v2;
const path = require('path');
const fs = require('fs');

// Create Express app
const app = express();

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Create WebDAV server
const userManager = new webdav.SimpleUserManager();
const user = userManager.addUser('WebDavDemo', 'WebDavPassword', false);

// Create WebDAV server with physical file system
const server = new webdav.WebDAVServer({
    httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, 'Default realm'),
    rootFileSystem: new webdav.PhysicalFileSystem(dataDir)
});

// Initialize WebDAV server
server.start(() => {
    console.log('WebDAV server initialized');
});

// CORS middleware
app.use((req, res, next) => {
    const origin = req.headers.origin || `https://${req.headers.host}`;
    console.log('Request origin:', origin);
    
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PROPFIND, MKCOL, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Depth, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
    if (req.headers.authorization) {
        console.log('Authorization header present');
    }
    next();
});

// Authentication middleware for API routes
app.use('/api', (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        console.log('No auth header provided for API route');
        res.status(401).json({ error: 'Authentication required' });
        return;
    }

    const base64Credentials = authHeader.split(' ')[1];
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    console.log('Login attempt:', { username });

    if (username === 'WebDavDemo' && password === 'WebDavPassword') {
        console.log('Authentication successful');
        next();
    } else {
        console.log('Authentication failed');
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === 'production') {
    console.log('Serving static files from:', path.join(__dirname, 'public'));
    app.use(express.static(path.join(__dirname, 'public')));
}

// Mount WebDAV server
app.use('/api', (req, res) => {
    const originalUrl = req.url;
    req.url = req.url.replace(/^\/api/, '') || '/';
    
    console.log('WebDAV request:', {
        method: req.method,
        originalUrl,
        newUrl: req.url
    });
    
    server.executeRequest(req, res);
});

// Handle React routing in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });
}

// Start server
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    console.log('Environment:', process.env.NODE_ENV);
    if (process.env.NODE_ENV === 'production') {
        console.log('Serving React app from:', path.join(__dirname, 'public'));
    }
}); 