# Robust Railway Deployment Dockerfile for PDFSpark Backend
# Uses a multi-stage build for reliability

# STAGE 1: Base image with system dependencies
FROM node:18-alpine AS base
# Install diagnostic and troubleshooting tools
RUN apk add --no-cache curl iputils bash net-tools procps

# Set environment variables for better Node.js performance
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=error
ENV NPM_CONFIG_PRODUCTION=true 

# Working directory for the application
WORKDIR /app

# STAGE 2: Initial diagnostics
FROM base AS diagnostics
# Create a diagnostic script to check build context
RUN echo '#!/bin/sh' > /inspect-context.sh && \
    echo 'echo "=== Build Context Inspection ==="' >> /inspect-context.sh && \
    echo 'pwd' >> /inspect-context.sh && \
    echo 'echo "Current directory contents:"' >> /inspect-context.sh && \
    echo 'ls -la' >> /inspect-context.sh && \
    echo 'echo "Parent directory contents:"' >> /inspect-context.sh && \
    echo 'ls -la ..' >> /inspect-context.sh && \
    echo 'echo "=== End Inspection ==="' >> /inspect-context.sh && \
    chmod +x /inspect-context.sh

# Run the diagnostic script
RUN /inspect-context.sh

# STAGE 3: Dependencies installation 
FROM base AS dependencies
# Copy package files
COPY backend/package*.json ./

# Install production dependencies
RUN npm ci --only=production --ignore-scripts && \
    # Create app directories with proper permissions
    mkdir -p /app/uploads /app/temp /app/logs && \
    chmod 777 /app/uploads /app/temp /app/logs

# STAGE 4: Application copy and setup
FROM dependencies AS app-setup
# Copy entry script first
COPY railway-entry.js /app/railway-entry.js
RUN chmod +x /app/railway-entry.js

# Copy all backend files
COPY backend/ /app/

# Create startup diagnostic script
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "=== PDFSpark Startup Diagnostics ==="' >> /app/startup.sh && \
    echo 'echo "Timestamp: $(date)"' >> /app/startup.sh && \
    echo 'echo "Node Version: $(node -v)"' >> /app/startup.sh && \
    echo 'echo "NPM Version: $(npm -v)"' >> /app/startup.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /app/startup.sh && \
    echo 'echo "Environment variables:"' >> /app/startup.sh && \
    echo 'env | grep -v PASSWORD | grep -v SECRET | sort' >> /app/startup.sh && \
    echo 'echo "Directory listing:"' >> /app/startup.sh && \
    echo 'ls -la' >> /app/startup.sh && \
    echo 'echo "Checking required directories..."' >> /app/startup.sh && \
    echo 'for dir in /app/uploads /app/temp /app/logs; do' >> /app/startup.sh && \
    echo '  if [ -d "$dir" ]; then' >> /app/startup.sh && \
    echo '    echo "$dir: ✓ Exists"' >> /app/startup.sh && \
    echo '    echo "  Permissions: $(ls -ld $dir)"' >> /app/startup.sh && \
    echo '    touch "$dir/test-file-$(date +%s).txt" && echo "  ✓ Writable" || echo "  ✗ Not writable"' >> /app/startup.sh && \
    echo '  else' >> /app/startup.sh && \
    echo '    echo "$dir: ✗ Not found"' >> /app/startup.sh && \
    echo '    mkdir -p "$dir" && chmod 777 "$dir" && echo "  ✓ Created" || echo "  ✗ Failed to create"' >> /app/startup.sh && \
    echo '  fi' >> /app/startup.sh && \
    echo 'done' >> /app/startup.sh && \
    echo 'echo "Verifying railway-entry.js:"' >> /app/startup.sh && \
    echo 'if [ -f "/app/railway-entry.js" ]; then' >> /app/startup.sh && \
    echo '  echo "✓ File exists"' >> /app/startup.sh && \
    echo '  if [ -x "/app/railway-entry.js" ]; then' >> /app/startup.sh && \
    echo '    echo "✓ File is executable"' >> /app/startup.sh && \
    echo '  else' >> /app/startup.sh && \
    echo '    echo "✗ File is not executable, fixing..."' >> /app/startup.sh && \
    echo '    chmod +x /app/railway-entry.js' >> /app/startup.sh && \
    echo '  fi' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  echo "✗ File not found!"' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo 'echo "Checking for index.js:"' >> /app/startup.sh && \
    echo 'if [ -f "/app/index.js" ]; then' >> /app/startup.sh && \
    echo '  echo "✓ index.js exists"' >> /app/startup.sh && \
    echo 'else' >> /app/startup.sh && \
    echo '  echo "✗ index.js not found!"' >> /app/startup.sh && \
    echo '  echo "Checking other locations:"' >> /app/startup.sh && \
    echo '  for path in ./backend/index.js /app/backend/index.js; do' >> /app/startup.sh && \
    echo '    if [ -f "$path" ]; then' >> /app/startup.sh && \
    echo '      echo "  Found at: $path"' >> /app/startup.sh && \
    echo '    fi' >> /app/startup.sh && \
    echo '  done' >> /app/startup.sh && \
    echo 'fi' >> /app/startup.sh && \
    echo 'echo "=== End Diagnostics ==="' >> /app/startup.sh && \
    echo 'echo "Starting application..."' >> /app/startup.sh && \
    echo 'exec node --max-old-space-size=2048 /app/railway-entry.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# STAGE 5: Final image
FROM app-setup AS final

# Health check to verify the app is running properly
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Define environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV USE_MEMORY_FALLBACK=true
ENV TEMP_DIR=/app/temp
ENV UPLOAD_DIR=/app/uploads
ENV LOG_DIR=/app/logs

# Expose ports
EXPOSE 3000
EXPOSE 8080

# Use the diagnostic startup script to improve troubleshooting
CMD ["/bin/sh", "/app/startup.sh"]