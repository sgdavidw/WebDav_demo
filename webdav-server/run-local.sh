#!/bin/bash

echo "Building Docker image..."
docker build -t webdav-demo:local .

echo "Running container in production mode..."
docker run --rm \
    -p 8080:8080 \
    -e NODE_ENV=production \
    -e DEBUG=* \
    -e NODE_OPTIONS="--trace-warnings" \
    webdav-demo:local 