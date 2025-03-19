# Use official Node.js image as base
FROM node:18-alpine

# Install diagnostic tools
RUN apk add --no-cache curl iputils bash net-tools

# Set working directory
WORKDIR /app

# Copy package files 
COPY backend/package*.json ./

# Install dependencies with proper rebuild for platform
RUN npm install --omit=dev

# Create directories with proper permissions first
RUN mkdir -p /app/uploads /app/temp /app/logs
RUN chmod 777 /app/uploads /app/temp /app/logs

# Copy railway entry script first (it exists in both root and backend)
COPY railway-entry.js /app/
RUN chmod +x /app/railway-entry.js

# Copy all backend files
COPY backend/ /app/

# Create startup health check script
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "===== STARTUP DIAGNOSTICS ======"' >> /app/startup.sh && \
    echo 'echo "Node Version: $(node -v)"' >> /app/startup.sh && \
    echo 'echo "NPM Version: $(npm -v)"' >> /app/startup.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /app/startup.sh && \
    echo 'echo "Directory listing: $(ls -la)"' >> /app/startup.sh && \
    echo 'echo "Temp directory listing: $(ls -la /app/temp)"' >> /app/startup.sh && \
    echo 'echo "Uploads directory listing: $(ls -la /app/uploads)"' >> /app/startup.sh && \
    echo 'echo "Network interfaces: $(ip addr)"' >> /app/startup.sh && \
    echo 'echo "Listening ports: $(netstat -tulpn || ss -tulpn)"' >> /app/startup.sh && \
    echo 'echo "Environment variables: $(env | grep -v PASSWORD | grep -v SECRET | sort)"' >> /app/startup.sh && \
    echo 'echo "===== STARTING SERVER ======"' >> /app/startup.sh && \
    echo 'exec node --max-old-space-size=2048 railway-entry.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV USE_MEMORY_FALLBACK=true
ENV TEMP_DIR=/app/temp
ENV UPLOAD_DIR=/app/uploads
ENV LOG_DIR=/app/logs

# Expose port 3000 as primary port
EXPOSE 3000
# Also expose 8080 as fallback
EXPOSE 8080

# Start application with memory limit
CMD ["node", "--max-old-space-size=2048", "railway-entry.js"]