FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy app source
COPY . .

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

# Start the app with memory optimizations
CMD ["node", "--expose-gc", "--max-old-space-size=2048", "index.js"]