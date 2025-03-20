FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash net-tools procps htop

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json with graceful error handling
COPY package*.json ./ || echo "No package.json found in current directory"

# Install app dependencies if package.json exists
RUN if [ -f "package.json" ]; then \
    npm ci --only=production --ignore-scripts && \
    npm cache clean --force; \
else \
    echo "Warning: package.json not found, skipping npm install"; \
fi

# Copy app source with graceful error handling
COPY . . || echo "Error copying source files"

# Verify app structure
RUN echo "=== App Directory Contents ===" && \
    ls -la . && \
    echo "=============================="

# Create required directories for file operations with proper permissions
RUN mkdir -p /tmp/uploads /tmp/temp /tmp/logs && \
    chmod 777 /tmp/uploads /tmp/temp /tmp/logs && \
    mkdir -p /app/uploads /app/temp /app/logs && \
    chmod 777 /app/uploads /app/temp /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV MEMORY_MANAGEMENT_AGGRESSIVE=true
ENV TEMP_DIR=/tmp
ENV UPLOAD_DIR=/tmp/uploads
ENV LOG_DIR=/tmp/logs
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Simple health check script
RUN echo '#!/bin/sh' > /app/health-check.sh && \
    echo 'curl -s http://localhost:$PORT/health || exit 1' >> /app/health-check.sh && \
    chmod +x /app/health-check.sh

# Expose the port app runs on
EXPOSE 3000

# Check for railway-entry.js and make it executable if it exists
RUN if [ -f "railway-entry.js" ]; then \
    echo "Found railway-entry.js, making it executable..." && \
    chmod +x railway-entry.js; \
else \
    echo "WARNING: railway-entry.js not found, will use index.js directly"; \
fi

# Start the app with memory optimizations - try railway-entry.js first, fall back to index.js
CMD if [ -f "railway-entry.js" ]; then \
    echo "Starting app with railway-entry.js..." && \
    node --expose-gc --max-old-space-size=2048 railway-entry.js; \
else \
    echo "Starting app with index.js..." && \
    node --expose-gc --max-old-space-size=2048 index.js; \
fi
