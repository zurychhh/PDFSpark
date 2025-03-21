FROM node:18-alpine

# Install diagnostic and utility tools
RUN apk add --no-cache curl iputils bash net-tools procps htop

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Create health-endpoint.js before copying all other files
RUN echo '#!/usr/bin/env node' > health-endpoint.js && \
    echo 'const http = require("http");' >> health-endpoint.js && \
    echo 'const server = http.createServer((req, res) => {' >> health-endpoint.js && \
    echo '  if (req.url === "/health") {' >> health-endpoint.js && \
    echo '    const memUsage = process.memoryUsage();' >> health-endpoint.js && \
    echo '    const healthInfo = {' >> health-endpoint.js && \
    echo '      status: "ok",' >> health-endpoint.js && \
    echo '      timestamp: new Date().toISOString(),' >> health-endpoint.js && \
    echo '      uptime: process.uptime(),' >> health-endpoint.js && \
    echo '      memory: {' >> health-endpoint.js && \
    echo '        heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),' >> health-endpoint.js && \
    echo '        heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)' >> health-endpoint.js && \
    echo '      }' >> health-endpoint.js && \
    echo '    };' >> health-endpoint.js && \
    echo '    res.writeHead(200, {"Content-Type": "application/json"});' >> health-endpoint.js && \
    echo '    res.end(JSON.stringify(healthInfo, null, 2));' >> health-endpoint.js && \
    echo '  } else {' >> health-endpoint.js && \
    echo '    res.writeHead(404);' >> health-endpoint.js && \
    echo '    res.end("Not found");' >> health-endpoint.js && \
    echo '  }' >> health-endpoint.js && \
    echo '});' >> health-endpoint.js && \
    echo 'const PORT = process.env.PORT || 3000;' >> health-endpoint.js && \
    echo 'server.listen(PORT, "0.0.0.0", () => {' >> health-endpoint.js && \
    echo '  console.log(`Health check server running on port ${PORT}`);' >> health-endpoint.js && \
    echo '});' >> health-endpoint.js && \
    chmod +x health-endpoint.js

# Create railway-entry.js for startup
RUN echo '#!/usr/bin/env node' > railway-entry.js && \
    echo 'console.log("Starting PDFSpark with health check...");' >> railway-entry.js && \
    echo 'const express = require("express");' >> railway-entry.js && \
    echo 'const app = express();' >> railway-entry.js && \
    echo 'app.get("/health", (req, res) => {' >> railway-entry.js && \
    echo '  const memUsage = process.memoryUsage();' >> railway-entry.js && \
    echo '  res.status(200).json({' >> railway-entry.js && \
    echo '    status: "ok",' >> railway-entry.js && \
    echo '    timestamp: new Date().toISOString(),' >> railway-entry.js && \
    echo '    uptime: process.uptime(),' >> railway-entry.js && \
    echo '    memory: {' >> railway-entry.js && \
    echo '      heapUsedMB: Math.round(memUsage.heapUsed / 1024 / 1024),' >> railway-entry.js && \
    echo '      heapTotalMB: Math.round(memUsage.heapTotal / 1024 / 1024)' >> railway-entry.js && \
    echo '    }' >> railway-entry.js && \
    echo '  });' >> railway-entry.js && \
    echo '});' >> railway-entry.js && \
    echo 'const PORT = process.env.PORT || 3000;' >> railway-entry.js && \
    echo 'const server = app.listen(PORT, "0.0.0.0", () => {' >> railway-entry.js && \
    echo '  console.log(`Health check server running on port ${PORT}`);' >> railway-entry.js && \
    echo '  try {' >> railway-entry.js && \
    echo '    console.log("Starting main application...");' >> railway-entry.js && \
    echo '    require("./index.js");' >> railway-entry.js && \
    echo '  } catch (error) {' >> railway-entry.js && \
    echo '    console.error("Failed to start main app:", error);' >> railway-entry.js && \
    echo '  }' >> railway-entry.js && \
    echo '});' >> railway-entry.js && \
    chmod +x railway-entry.js

# Copy app source after creating essential files
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
ENV NODE_OPTIONS="--max-old-space-size=2048 --expose-gc"

# Create a proper health check script with explicit port
RUN echo '#!/bin/sh' > /app/health-check.sh && \
    echo 'PORT=${PORT:-3000}' >> /app/health-check.sh && \
    echo 'curl -s -f http://localhost:$PORT/health -H "Host: healthcheck" || exit 1' >> /app/health-check.sh && \
    chmod +x /app/health-check.sh

# Create a script to run the standalone health endpoint
RUN echo '#!/bin/sh' > /app/run-health-endpoint.sh && \
    echo 'node health-endpoint.js &' >> /app/run-health-endpoint.sh && \
    echo 'PID=$!' >> /app/run-health-endpoint.sh && \
    echo 'echo $PID > /tmp/health-endpoint.pid' >> /app/run-health-endpoint.sh && \
    echo 'echo "Health endpoint started with PID $PID"' >> /app/run-health-endpoint.sh && \
    chmod +x /app/run-health-endpoint.sh

# Create runtime diagnostic script 
RUN echo '#!/bin/sh' > /app/diagnostic.sh && \
    echo 'echo "===== Memory Status =====" && free -m && echo "\n===== Disk Space =====" && df -h && echo "\n===== Process List =====" && ps aux | sort -rn -k 4 | head -10 && echo "\n===== File Directory =====" && ls -la /tmp/' >> /app/diagnostic.sh && \
    chmod +x /app/diagnostic.sh

# Expose the port app runs on
EXPOSE 3000

# Health check configuration
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 CMD /app/health-check.sh

# Startup script that ensures health check is available
RUN echo '#!/bin/sh' > /app/startup.sh && \
    echo 'echo "Starting health endpoint first..."' >> /app/startup.sh && \
    echo 'node health-endpoint.js &' >> /app/startup.sh && \
    echo 'HEALTH_PID=$!' >> /app/startup.sh && \
    echo 'echo $HEALTH_PID > /tmp/health-endpoint.pid' >> /app/startup.sh && \
    echo 'echo "Health endpoint started with PID $HEALTH_PID"' >> /app/startup.sh && \
    echo 'echo "Waiting for health endpoint to be available..."' >> /app/startup.sh && \
    echo 'for i in $(seq 1 10); do' >> /app/startup.sh && \
    echo '  if curl -s http://localhost:$PORT/health > /dev/null; then' >> /app/startup.sh && \
    echo '    echo "Health endpoint is available"' >> /app/startup.sh && \
    echo '    break' >> /app/startup.sh && \
    echo '  fi' >> /app/startup.sh && \
    echo '  echo "Waiting for health endpoint... ($i/10)"' >> /app/startup.sh && \
    echo '  sleep 1' >> /app/startup.sh && \
    echo 'done' >> /app/startup.sh && \
    echo 'echo "Starting main application..."' >> /app/startup.sh && \
    echo 'exec node --max-old-space-size=2048 --expose-gc railway-entry.js' >> /app/startup.sh && \
    chmod +x /app/startup.sh

# Start the app with the startup script
CMD ["/app/startup.sh"]