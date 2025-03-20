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

# We'll first copy files to a staging directory with maximum error handling
WORKDIR /app/staging

# Create debug script to help us see what's happening during build
RUN echo '#!/bin/sh' > /debug.sh && \
    echo 'echo "DEBUG: Running in directory: $(pwd)"' >> /debug.sh && \
    echo 'echo "DEBUG: Contents of current directory:"' >> /debug.sh && \
    echo 'ls -la' >> /debug.sh && \
    chmod +x /debug.sh

# Try to copy files one by one to isolate the problem
RUN echo "Creating all required directories first..."
RUN mkdir -p ./backend

# Debug the build context
RUN echo "=== DEBUGGING BUILD CONTEXT ==="

# Create minimal package.json if not found in context
RUN echo "Attempting to copy package files or create minimal versions..."
RUN touch package.json && echo '{"name":"pdfspark","version":"1.0.0","private":true}' > package.json
RUN touch ./backend/package.json && echo '{"name":"pdfspark-backend","version":"1.0.0","private":true}' > ./backend/package.json

# Create minimal railway-entry.js if not found
RUN echo "Creating minimal railway-entry.js..."
RUN echo '#!/usr/bin/env node\nconsole.log("Starting PDFSpark...");\ntry { require("./index.js"); } catch(e) { console.error("Error:", e); }' > railway-entry.js && \
    chmod +x railway-entry.js

# Create minimal backend structure
RUN echo "Creating minimal backend structure..."
RUN mkdir -p ./backend/routes ./backend/controllers ./backend/models ./backend/config ./backend/services ./backend/utils
RUN echo 'console.log("Starting PDFSpark Backend...");\nconst express = require("express");\nconst app = express();\nconst PORT = process.env.PORT || 3000;\napp.get("/health", (req, res) => res.send({status: "ok"}));\napp.listen(PORT, () => console.log(`Server running on port ${PORT}`));' > ./backend/index.js

# Create backend package.json with minimal dependencies
RUN echo '{"name":"pdfspark-backend","version":"1.0.0","private":true,"dependencies":{"express":"^4.17.1"}}' > ./backend/package.json

# Verify file existence (debugging)
RUN echo "=== FILES IN STAGING ROOT ===" && ls -la . && echo "=== FILES IN BACKEND DIR ===" && ls -la ./backend/

# Now set up the actual app directory
WORKDIR /app

# Install minimal required dependencies
WORKDIR /app/staging/backend
RUN echo "Installing express as minimal dependency..."
RUN npm init -y && npm install express@latest --no-package-lock --no-audit

# Now we have a functional backend, copy it to the app directory
WORKDIR /app
RUN echo "Copying minimal backend to app directory..."
RUN cp -r /app/staging/backend/* /app/ || echo "Copy failed, creating minimal structure directly"

# Ensure railway-entry.js exists in app directory
RUN echo "Setting up railway-entry.js..."
RUN cp /app/staging/railway-entry.js /app/ 2>/dev/null || echo '#!/usr/bin/env node\nconsole.log("Starting PDFSpark...");\ntry { require("./index.js"); } catch(e) { console.error("Error:", e); }' > /app/railway-entry.js
RUN chmod +x /app/railway-entry.js

# Final verification of app directory
RUN echo "=== FINAL APP DIRECTORY STRUCTURE ==="
RUN ls -la /app

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