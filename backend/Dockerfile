FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash net-tools procps htop

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json with graceful error handling
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# Copy app source
COPY . .

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
ENV NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"

# Create railway-entry.js if it doesn't exist
RUN if [ ! -f "railway-entry.js" ]; then \
    echo "#!/usr/bin/env node" > railway-entry.js && \
    echo "console.log('Starting application with memory-optimized settings...');" >> railway-entry.js && \
    echo "process.env.USE_MEMORY_FALLBACK = 'true';" >> railway-entry.js && \
    echo "process.env.MEMORY_MANAGEMENT_AGGRESSIVE = 'true';" >> railway-entry.js && \
    echo "process.env.TEMP_DIR = '/tmp';" >> railway-entry.js && \
    echo "process.env.UPLOAD_DIR = '/tmp/uploads';" >> railway-entry.js && \
    echo "process.env.LOG_DIR = '/tmp/logs';" >> railway-entry.js && \
    echo "process.env.NODE_OPTIONS = '--max-old-space-size=2048 --expose-gc';" >> railway-entry.js && \
    echo "process.env.MEMORY_WARNING_THRESHOLD = '0.60';" >> railway-entry.js && \
    echo "process.env.MEMORY_CRITICAL_THRESHOLD = '0.75';" >> railway-entry.js && \
    echo "process.env.MEMORY_EMERGENCY_THRESHOLD = '0.85';" >> railway-entry.js && \
    echo "require('./index.js');" >> railway-entry.js && \
    chmod +x railway-entry.js; \
    echo "Created basic railway-entry.js wrapper"; \
fi

# Make entry script executable
RUN chmod +x railway-entry.js

# Simple health check script
RUN echo '#!/bin/sh' > /app/health-check.sh && \
    echo 'curl -s http://localhost:$PORT/health || exit 1' >> /app/health-check.sh && \
    chmod +x /app/health-check.sh

# Create runtime diagnostic script 
RUN echo '#!/bin/sh' > /app/diagnostic.sh && \
    echo 'echo "===== Memory Status =====" && free -m && echo "\n===== Disk Space =====" && df -h && echo "\n===== Process List =====" && ps aux | sort -rn -k 4 | head -10 && echo "\n===== File Directory =====" && ls -la /tmp/' >> /app/diagnostic.sh && \
    chmod +x /app/diagnostic.sh

# Expose the port app runs on
EXPOSE 3000

# Start the app with memory optimizations
CMD echo "Starting app with railway-entry.js and enhanced memory settings..." && \
    NODE_OPTIONS="--max-old-space-size=2048 --expose-gc" \
    node --max-old-space-size=2048 --expose-gc railway-entry.js