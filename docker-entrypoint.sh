#!/bin/bash
set -e

# Set production environment variables
export NODE_ENV=production
export PORT=8080

# Start the server
node server.js 