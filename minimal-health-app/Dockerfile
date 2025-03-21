FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and health app
COPY package.json health-app.js ./

# Install diagnostic tools
RUN apk add --no-cache curl iputils bash

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create health check script
RUN echo '#!/bin/sh' > /app/health-check.sh && \
    echo 'PORT=${PORT:-3000}' >> /app/health-check.sh && \
    echo 'curl -s -f http://localhost:$PORT/health || exit 1' >> /app/health-check.sh && \
    chmod +x /app/health-check.sh

# Docker healthcheck
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 CMD /app/health-check.sh

# Expose port
EXPOSE 3000

# Start health app
CMD ["node", "health-app.js"]