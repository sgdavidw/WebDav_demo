import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import Login from './components/Login';

const baseURL = process.env.NODE_ENV === 'production' 
    ? `/api`
    : 'http://localhost:8080';

const axiosInstance = axios.create({
    baseURL,
    withCredentials: true,
    maxBodyLength: Infinity,
    maxContentLength: Infinity
});

// Remove the default Content-Type header
delete axiosInstance.defaults.headers['Content-Type'];

// Utility function to format file sizes
const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

function App() {
    const [files, setFiles] = useState([]);
    const [selectedFile, setSelectedFile] = useState(null);
    const [folderName, setFolderName] = useState('');
    const [status, setStatus] = useState('');
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [authCredentials, setAuthCredentials] = useState(null);

    // Fetch directory listing
    const fetchFiles = async () => {
        console.log('Attempting to fetch files...');
        try {
            const response = await axiosInstance({
                url: '/',
                method: 'PROPFIND',
                headers: {
                    'Depth': '1'
                }
            });

            console.log('Raw response data:', response.data);

            // The response is already JSON, no need to parse
            const data = response.data;
            const responses = data['D:multistatus'][0]['D:response'];
            
            console.log('Number of responses found:', responses.length);

            const fileList = [];
            for (const response of responses) {
                // Get href from the response
                const href = response['D:href'][0]._text[0];
                
                // Skip the root directory
                if (href === 'http://localhost:8080/') continue;

                // Get the properties from propstat
                const propstat = response['D:propstat'][0];
                const prop = propstat['D:prop'][0];

                // Get display name or extract from href
                const displayName = prop['D:displayname']?.[0]?._text?.[0] || 
                                  decodeURIComponent(href.split('/').pop());

                // Check if it's a directory
                const isDirectory = !!prop['D:resourcetype']?.[0]?.['D:collection'];

                // Get last modified date
                const lastModified = prop['D:getlastmodified']?.[0]?._text?.[0];

                // Get content length
                const contentLength = prop['D:getcontentlength']?.[0]?._text?.[0];

                console.log('Processing item:', {
                    displayName,
                    href,
                    isDirectory,
                    lastModified,
                    contentLength
                });

                fileList.push({
                    name: displayName,
                    href,
                    isDirectory,
                    lastModified: lastModified ? new Date(lastModified).toLocaleString() : '',
                    size: contentLength ? parseInt(contentLength) : 0
                });
            }

            // Sort the file list (directories first)
            const sortedFiles = fileList.sort((a, b) => {
                if (a.isDirectory === b.isDirectory) {
                    return a.name.localeCompare(b.name);
                }
                return a.isDirectory ? -1 : 1;
            });

            console.log('Final processed file list:', sortedFiles);
            
            if (sortedFiles.length > 0) {
                setFiles(sortedFiles);
                setStatus('Files fetched successfully');
            } else {
                setStatus('No files or folders found');
            }

        } catch (err) {
            console.error('Fetch error:', err);
            if (err.response) {
                console.error('Error response:', err.response.data);
                setStatus(`Server error: ${err.response.status} - ${err.response.statusText}`);
            } else if (err.request) {
                setStatus('No response from server. Is the server running?');
            } else {
                setStatus(`Error: ${err.message}`);
            }
        }
    };

    // Handle file upload
    const uploadFile = async () => {
        if (!selectedFile) {
            setStatus('Please select a file first');
            return;
        }

        try {
            console.log('Starting file upload:', {
                name: selectedFile.name,
                type: selectedFile.type,
                size: selectedFile.size
            });

            // Read file as ArrayBuffer
            const fileReader = new FileReader();
            fileReader.onload = async (event) => {
                try {
                    const response = await axiosInstance({
                        method: 'PUT',
                        url: `/${selectedFile.name}`,
                        data: event.target.result,
                        headers: {
                            'Content-Type': selectedFile.type || 'application/octet-stream'
                        },
                        transformRequest: [(data) => data], // Prevent axios from transforming the data
                        maxContentLength: Infinity,
                        maxBodyLength: Infinity
                    });
                    
                    console.log('Upload successful:', response);
                    setStatus('File uploaded successfully!');
                    fetchFiles(); // Refresh the file list
                } catch (uploadError) {
                    console.error('Upload request failed:', uploadError);
                    setStatus(`Upload failed: ${uploadError.message}`);
                }
            };

            fileReader.onerror = (error) => {
                console.error('File reading failed:', error);
                setStatus('Failed to read file');
            };

            // Start reading the file
            console.log('Reading file...');
            fileReader.readAsArrayBuffer(selectedFile);
            
        } catch (err) {
            console.error('Upload setup error:', err);
            setStatus(`Upload error: ${err.message}`);
        }
    };

    // Handle create folder
    const createFolder = async () => {
        if (!folderName) {
            setStatus('Please enter a folder name');
            return;
        }

        try {
            await axiosInstance({
                method: 'MKCOL',
                url: `/${folderName}`
            });
            setStatus('Folder created successfully!');
            setFolderName('');
            fetchFiles();
        } catch (err) {
            setStatus(`Folder creation error: ${err.message}`);
        }
    };

    // Delete file or folder
    const deleteItem = async (name) => {
        try {
            await axiosInstance.delete(`/${name}`);
            setStatus(`${name} deleted successfully!`);
            fetchFiles();
        } catch (err) {
            setStatus(`Delete error: ${err.message}`);
        }
    };

    // Update the file input handler to log more information
    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        console.log('File selected:', {
            name: file?.name,
            type: file?.type,
            size: file?.size
        });
        setSelectedFile(file);
    };

    // Add a handler for the List Folder button
    const handleListFolder = () => {
        console.log('Manually refreshing folder contents...');
        fetchFiles();
    };

    const debugResponse = async () => {
        try {
            const response = await axiosInstance({
                url: '/',
                method: 'PROPFIND',
                headers: {
                    'Depth': '1'
                }
            });
            console.log('Raw XML response:', response.data);
            console.log('Response headers:', response.headers);
            console.log('Response status:', response.status);
        } catch (err) {
            console.error('Debug request failed:', err);
        }
    };

    // Handle login
    const handleLogin = async (username, password) => {
        try {
            console.log('Attempting login with username:', username);
            
            // Create base64 encoded credentials
            const base64Credentials = btoa(`${username}:${password}`);
            
            // Update axios instance with auth header
            axiosInstance.defaults.headers.common['Authorization'] = `Basic ${base64Credentials}`;
            
            // Test authentication with PROPFIND request
            const loginResponse = await axiosInstance({
                method: 'PROPFIND',
                url: '/',
                headers: {
                    'Depth': '1',
                    'Content-Type': 'application/xml',
                    'Accept': 'application/json'
                }
            });

            console.log('Login response:', loginResponse);

            // Check if we got a successful response (207 Multi-Status)
            if (loginResponse.status === 207 || loginResponse.status === 200) {
                console.log('Authentication successful');
                setAuthCredentials({ username, password });
                setIsAuthenticated(true);
                
                // Store credentials in localStorage for persistence
                localStorage.setItem('webdav_credentials', base64Credentials);
                
                // Fetch files after successful login
                await fetchFiles();
                return;
            }
            
            console.log('Unexpected response status:', loginResponse.status);
            throw new Error('Unexpected response status');
        } catch (error) {
            console.error('Login error:', error);
            // Clear auth header on error
            delete axiosInstance.defaults.headers.common['Authorization'];
            localStorage.removeItem('webdav_credentials');
            
            if (error.response?.status === 401) {
                throw new Error('Invalid credentials');
            }
            throw new Error(`Authentication failed: ${error.message}`);
        }
    };

    // Handle logout
    const handleLogout = () => {
        setIsAuthenticated(false);
        setAuthCredentials(null);
        setFiles([]);
        // Reset axios instance
        axiosInstance.defaults.auth = null;
    };

    useEffect(() => {
        fetchFiles();
    }, []);

    useEffect(() => {
        // Check for stored credentials
        const storedCredentials = localStorage.getItem('webdav_credentials');
        if (storedCredentials) {
            console.log('Found stored credentials, attempting to restore session');
            axiosInstance.defaults.headers.common['Authorization'] = `Basic ${storedCredentials}`;
            // Test the stored credentials
            axiosInstance({
                method: 'PROPFIND',
                url: '/',
                headers: {
                    'Depth': '1',
                    'Content-Type': 'application/xml',
                    'Accept': 'application/json'
                }
            })
            .then(response => {
                if (response.status === 207 || response.status === 200) {
                    console.log('Stored credentials are valid');
                    setIsAuthenticated(true);
                    fetchFiles();
                }
            })
            .catch(error => {
                console.error('Stored credentials are invalid:', error);
                localStorage.removeItem('webdav_credentials');
                delete axiosInstance.defaults.headers.common['Authorization'];
            });
        }
    }, []);

    return (
        <div className="App">
            {!isAuthenticated ? (
                <Login onLogin={handleLogin} />
            ) : (
                <div className="webdav-container">
                    <h1>WebDAV Client</h1>
                    
                    {/* File Upload Section */}
                    <div className="upload-section">
                        <input
                            type="file"
                            onChange={handleFileSelect}
                            className="file-input"
                        />
                        <button onClick={uploadFile} className="action-button">
                            Upload File
                        </button>
                    </div>

                    {/* Create Folder Section */}
                    <div className="folder-section">
                        <input
                            type="text"
                            value={folderName}
                            onChange={(e) => setFolderName(e.target.value)}
                            placeholder="Enter folder name"
                            className="folder-input"
                        />
                        <button onClick={createFolder} className="action-button">
                            Create Folder
                        </button>
                    </div>

                    {/* List Folder Button */}
                    <div className="list-section">
                        <button onClick={handleListFolder} className="action-button">
                            Refresh List
                        </button>
                    </div>

                    {/* Status Message */}
                    {status && <div className="status-message">{status}</div>}

                    {/* File List */}
                    <div className="file-list">
                        <h2>Files and Folders</h2>
                        <table>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Type</th>
                                    <th>Size</th>
                                    <th>Last Modified</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map((file) => (
                                    <tr key={file.href}>
                                        <td>{file.name}</td>
                                        <td>{file.isDirectory ? 'Folder' : 'File'}</td>
                                        <td>{file.isDirectory ? '-' : formatFileSize(file.size)}</td>
                                        <td>{file.lastModified}</td>
                                        <td>
                                            <button
                                                onClick={() => deleteItem(file.name)}
                                                className="delete-button"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
