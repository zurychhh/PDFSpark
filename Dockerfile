FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache curl

# Create application directory
WORKDIR /app

# Install dependencies first (for better caching)
COPY backend-package.json ./package.json
RUN npm install --production

# Copy our files
COPY railway-entry.js ./
COPY advanced-conversion.js ./index.js
RUN chmod +x railway-entry.js

# Create temporary directories
RUN mkdir -p /tmp/uploads /tmp/results && \
    chmod 777 /tmp/uploads /tmp/results

# Expose port
EXPOSE 3000

# Set environment variable for memory fallback
ENV USE_MEMORY_FALLBACK=true
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Run application
CMD ["node", "railway-entry.js"]