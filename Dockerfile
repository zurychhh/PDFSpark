# Use official Node.js image as base
FROM node:18-alpine

# Install diagnostic tools
RUN apk add --no-cache curl iputils bash net-tools

# Set working directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies with proper rebuild for platform
RUN npm install --omit=dev

# Copy all backend files
COPY backend/ ./

# Make sure upload directories exist with proper permissions
RUN mkdir -p uploads temp
RUN chmod 777 uploads temp

# Create startup health check script
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "===== STARTUP DIAGNOSTICS ======"' >> /app/startup.sh && \
    echo 'echo "Node Version: $(node -v)"' >> /app/startup.sh && \
    echo 'echo "NPM Version: $(npm -v)"' >> /app/startup.sh && \
    echo 'echo "Current directory: $(pwd)"' >> /app/startup.sh && \
    echo 'echo "Directory listing: $(ls -la)"' >> /app/startup.sh && \
    echo 'echo "Network interfaces: $(ip addr)"' >> /app/startup.sh && \
    echo 'echo "Listening ports: $(netstat -tulpn || ss -tulpn)"' >> /app/startup.sh && \
    echo 'echo "Environment variables: $(env | grep -v PASSWORD | grep -v SECRET | sort)"' >> /app/startup.sh && \
    echo 'echo "===== STARTING SERVER ======"' >> /app/startup.sh && \
    echo 'exec node index.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Clear any PORT settings to ensure Railway sets it
ENV PORT=8080
ENV NODE_ENV=production

# Expose both common ports
EXPOSE 8080
EXPOSE 3000

# Copy Railway-specific entry script
COPY railway-entry.js ./

# Set executable permissions
RUN chmod +x /app/railway-entry.js

# Expose port explicitly
ENV PORT=8080

# Start application - use direct node execution instead of shell script for Railway
CMD ["node", "/app/railway-entry.js"]