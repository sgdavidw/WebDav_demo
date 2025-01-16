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

# Copy server files
COPY webdav-server/package*.json ./
RUN npm install --production

# Copy server code and verify
COPY webdav-server/server.js ./
RUN echo "=== Verifying server.js contents ===" && \
    cat server.js && \
    echo "=== Server.js verification complete ==="

# Copy built client files to server's public directory
COPY --from=client-builder /app/client/build ./public

# Create data directory
RUN mkdir -p data && \
    chmod 777 data

# Create startup script with environment variable
RUN echo '#!/bin/sh\n\
export NODE_ENV=production\n\
echo "=== Starting container ==="\n\
echo "=== Current directory ==="\n\
pwd\n\
echo "=== Directory contents ==="\n\
ls -la\n\
echo "=== Server.js contents ==="\n\
cat server.js\n\
echo "=== Starting Node.js ==="\n\
exec node server.js' > start.sh && \
    chmod +x start.sh

# Expose port
EXPOSE 8080

CMD ["./start.sh"] 