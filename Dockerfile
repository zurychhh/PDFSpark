# Memory-Optimized Railway Deployment Dockerfile for PDFSpark
# Configured for ephemeral Railway filesystem with memory fallback

FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash net-tools procps htop

# Critical environment variables for Railway
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV MEMORY_MANAGEMENT_AGGRESSIVE=true
ENV TEMP_DIR=/tmp
ENV UPLOAD_DIR=/tmp/uploads
ENV LOG_DIR=/tmp/logs
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Explicitly create app directory 
WORKDIR /app

# Create required directories with proper permissions
# Using /tmp instead of /app for Railway's ephemeral filesystem
RUN mkdir -p /tmp/uploads /tmp/temp /tmp/logs && \
    chmod 777 /tmp/uploads /tmp/temp /tmp/logs && \
    mkdir -p /app/uploads /app/temp /app/logs && \
    chmod 777 /app/uploads /app/temp /app/logs

# Create a staging directory for proper copying
RUN mkdir -p /app/staging

# We'll first copy files to a staging directory to check file existence
WORKDIR /app/staging

# First copy package files
COPY package*.json ./
# Create backend directory if it doesn't exist yet
RUN mkdir -p ./backend

# Try to copy backend package files (with error handling)
COPY backend/package*.json ./backend/ || echo "No backend package.json found, will create later"

# Copy any railway entry scripts (with a fallback mechanism)
COPY railway*.js ./ || echo "No railway-entry.js found in root, will check backend dir"
COPY backend/railway*.js ./ || echo "No railway-entry.js found in backend dir either"

# Copy backend source code if it exists
COPY backend/ ./backend/ || echo "Backend directory not found at expected location"

# Verify file existence (debugging)
RUN echo "=== FILES IN STAGING ROOT ===" && ls -la . && echo "=== FILES IN BACKEND DIR ===" && ls -la ./backend/ || echo "Backend directory not accessible"

# Now set up the actual app directory
WORKDIR /app

# Install backend dependencies if the directory exists and has package.json
WORKDIR /app/staging
RUN if [ -f "./backend/package.json" ]; then \
      echo "Installing backend dependencies..." && \
      cd ./backend && \
      npm ci --only=production --ignore-scripts && \
      npm cache clean --force; \
    elif [ -f "./package.json" ]; then \
      echo "Installing root dependencies..." && \
      npm ci --only=production --ignore-scripts && \
      npm cache clean --force; \
    else \
      echo "No package.json found in expected locations"; \
    fi

# Copy files from staging to the actual app directory
WORKDIR /app
RUN if [ -d "/app/staging/backend" ] && [ "$(ls -A /app/staging/backend)" ]; then \
      echo "Copying backend files to app directory..." && \
      cp -r /app/staging/backend/* /app/; \
    fi && \
    if [ -f "/app/staging/railway-entry.js" ]; then \
      echo "Copying railway-entry.js from staging root..." && \
      cp /app/staging/railway-entry.js /app/ && \
      chmod +x /app/railway-entry.js; \
    elif [ -f "/app/railway-entry.js" ]; then \
      echo "railway-entry.js already exists in app directory, making executable..." && \
      chmod +x /app/railway-entry.js; \
    else \
      echo "WARNING: railway-entry.js not found, creating minimal version..." && \
      echo '#!/bin/node\nconsole.log("Starting application...");\nrequire("./index.js");' > /app/railway-entry.js && \
      chmod +x /app/railway-entry.js; \
    fi

# Create memory monitoring script
RUN echo '#!/bin/sh' > /app/monitor-memory.sh && \
    echo 'echo "=== PDFSpark Memory Monitor ==="' >> /app/monitor-memory.sh && \
    echo 'echo "Timestamp: $(date)"' >> /app/monitor-memory.sh && \
    echo 'free -m' >> /app/monitor-memory.sh && \
    echo 'node -e "console.table(process.memoryUsage())"' >> /app/monitor-memory.sh && \
    chmod +x /app/monitor-memory.sh

# Health check that includes memory status
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || (echo "Health check failed"; /app/monitor-memory.sh; exit 1)

# Expose the application port
EXPOSE 3000

# Start the application with more memory
# Use --expose-gc to allow manual garbage collection
CMD ["node", "--expose-gc", "--max-old-space-size=2048", "railway-entry.js"]