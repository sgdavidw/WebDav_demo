FROM node:18-slim

WORKDIR /app

# Copy only package files first
COPY package*.json ./
RUN npm install --production

# Remove any existing server.js (just in case)
RUN rm -f server.js

# Copy only the server file
COPY server.js ./

# Create startup script
RUN echo '#!/bin/sh\n\
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

EXPOSE 8080

CMD ["./start.sh"] 