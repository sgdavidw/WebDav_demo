const express = require('express');
const { v2: webdav } = require('webdav-server');
const basicAuth = require('basic-auth');
const fs = require('fs');
const path = require('path');

// Create Express app
const app = express();

// Define CORS settings
const corsOrigin = process.env.NODE_ENV === 'production' 
    ? process.env.CORS_ORIGIN || 'https://webdav.yourdomain.com'
    : 'http://localhost:3000';
const corsMethods = 'GET, PUT, POST, DELETE, PROPFIND, MKCOL, COPY, MOVE, OPTIONS';
const corsHeaders = 'Authorization, Content-Type, Depth, If-Match, If-None-Match, Lock-Token, Content-Length';
const corsExposeHeaders = 'DAV, content-length, Allow, WWW-Authenticate, ETag';

// Add this function for directory listing
const listDataDirectory = () => {
    console.log('\n=== Data Directory Contents ===');
    console.log('Timestamp:', new Date().toISOString());
    const dataPath = path.join(process.cwd(), 'data');
    try {
        const items = fs.readdirSync(dataPath);
        console.log('Total items:', items.length);
        items.forEach(item => {
            const itemPath = path.join(dataPath, item);
            const stats = fs.statSync(itemPath);
            console.log({
                name: item,
                type: stats.isDirectory() ? 'directory' : 'file',
                size: `${(stats.size / 1024).toFixed(2)} KB`,
                modified: stats.mtime.toLocaleString()
            });
        });
        console.log('=== End of Directory Contents ===\n');
    } catch (err) {
        console.error('Error listing directory:', err);
    }
};

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'public')));
}

// CORS middleware - must be before WebDAV server setup
app.use((req, res, next) => {
    // Remove any existing CORS headers that might have been set
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Credentials');
    res.removeHeader('Access-Control-Allow-Methods');
    res.removeHeader('Access-Control-Allow-Headers');
    res.removeHeader('Access-Control-Expose-Headers');

    // Set correct CORS headers
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', corsMethods);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders);
    res.setHeader('Access-Control-Expose-Headers', corsExposeHeaders);

    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Add body parsing middleware for file uploads
app.use(express.raw({ type: '*/*', limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log('\n=== Incoming Request ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Headers:', {
        ...req.headers,
        authorization: req.headers.authorization ? '[REDACTED]' : undefined
    });
    
    const credentials = basicAuth(req);
    console.log('Parsed Credentials:', credentials ? { 
        name: credentials.name, 
        passProvided: !!credentials.pass,
        validUser: credentials.name === 'WebDavDemo',
        validPass: credentials.pass === 'WebDavPassword'
    } : 'No credentials');

    res.on('finish', () => {
        console.log('\n=== Response Finished ===');
        console.log('Status Code:', res.statusCode);
        console.log('Status Message:', res.statusMessage);
        console.log('Response Headers:', res.getHeaders());
    });

    res.on('error', (error) => {
        console.error('\n=== Response Error ===');
        console.error('Error:', error);
    });

    next();
});

// Basic Auth middleware
app.use((req, res, next) => {
    console.log('\n=== Auth Middleware ===');
    const credentials = basicAuth(req);
    if (!credentials || credentials.name !== 'WebDavDemo' || credentials.pass !== 'WebDavPassword') {
        console.log('Authentication failed:', {
            credentialsProvided: !!credentials,
            username: credentials?.name,
            passwordMatch: credentials?.pass === 'WebDavPassword'
        });
        res.set('WWW-Authenticate', 'Basic realm="WebDAV Test"');
        return res.status(401).send('Authentication required.');
    }
    console.log('Authentication successful');
    return next();
});

// Update the user credentials in the WebDAV server configuration
const userManager = new webdav.SimpleUserManager();
userManager.addUser('WebDavDemo', 'WebDavPassword', false);

// Create WebDAV server instance with updated authentication
const wfs = new webdav.WebDAVServer({
    httpAuthentication: new webdav.HTTPBasicAuthentication(userManager, 'WebDAV Server'),
    headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Credentials': 'true'
    }
});

// File upload middleware
app.use((req, res, next) => {
    if (req.method === 'PUT') {
        console.log('\n=== File Upload Request ===');
        console.log('File size:', req.headers['content-length']);
        console.log('Content type:', req.headers['content-type']);
        console.log('URL (file name):', req.url);
        
        res.on('finish', () => {
            if (res.statusCode === 200 || res.statusCode === 201) {
                setTimeout(listDataDirectory, 100);
            }
        });
    }
    next();
});

// Start the WebDAV server
wfs.setFileSystem('/', new webdav.PhysicalFileSystem('./data'), (success) => {
    if (!success) {
        console.error('Failed to set file system');
        process.exit(1);
    }
    console.log('FileSystem set up successfully at ./data');
    listDataDirectory();
});

// Use WebDAV server as middleware
app.use(webdav.extensions.express('/', wfs));

// Handle React routing in production
if (process.env.NODE_ENV === 'production') {
    app.get('*', (req, res, next) => {
        if (req.accepts('html')) {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        } else {
            next();
        }
    });
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('\n=== Error Occurred ===');
    console.error('Timestamp:', new Date().toISOString());
    console.error('Error:', {
        message: err.message,
        name: err.name,
        code: err.code,
        stack: err.stack
    });
    res.status(500).send('Internal Server Error');
});

// Start server
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
    console.log('\n=== Server Started ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log(`Server is running on port ${PORT}`);
    console.log(`CORS enabled for origin: ${corsOrigin}`);
    console.log(`Data directory: ${process.cwd()}/data`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('\n=== Server Error ===');
    console.error('Error:', error);
}); 