# Simplified Railway Deployment Dockerfile for PDFSpark Backend
# Uses a single-stage build for better reliability in Railway environment

FROM node:18-alpine

# Install diagnostic tools
RUN apk add --no-cache curl iputils bash net-tools procps

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV TEMP_DIR=/app/temp
ENV UPLOAD_DIR=/app/uploads
ENV LOG_DIR=/app/logs

# Create app directory
WORKDIR /app

# Display build context for diagnostics
RUN echo "=== Dockerfile Build Context ===" && \
    pwd && \
    echo "=== End Dockerfile Context ==="

# Create required directories
RUN mkdir -p /app/uploads /app/temp /app/logs && \
    chmod 777 /app/uploads /app/temp /app/logs

# First copy package.json files to optimize build caching
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Now copy the railway entry script (this is our startup script)
COPY railway-entry.js ./
RUN chmod +x ./railway-entry.js

# Copy backend source code
COPY backend/ ./

# Create a diagnostic script to help troubleshoot 
RUN echo '#!/bin/sh' > /app/diagnostic.sh && \
    echo 'echo "=== PDFSpark Startup Diagnostics ==="' >> /app/diagnostic.sh && \
    echo 'echo "Timestamp: $(date)"' >> /app/diagnostic.sh && \
    echo 'echo "Node Version: $(node -v)"' >> /app/diagnostic.sh && \
    echo 'echo "NPM Version: $(npm -v)"' >> /app/diagnostic.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /app/diagnostic.sh && \
    echo 'echo "Directory listing:"' >> /app/diagnostic.sh && \
    echo 'ls -la' >> /app/diagnostic.sh && \
    echo 'echo "Backend files:"' >> /app/diagnostic.sh && \
    echo 'find . -type f -name "*.js" | grep -v "node_modules" | sort' >> /app/diagnostic.sh && \
    echo 'echo "=== End Diagnostics ==="' >> /app/diagnostic.sh && \
    chmod +x /app/diagnostic.sh

# Health check to verify the app is running properly
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

# Expose the application port
EXPOSE 3000

# Start the application with diagnostic information
CMD ["/bin/sh", "-c", "/app/diagnostic.sh && node --max-old-space-size=2048 /app/railway-entry.js"]