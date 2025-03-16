# Use official Node.js image as base
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy all backend files
COPY backend/ ./

# Make sure upload directories exist
RUN mkdir -p uploads temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "index.js"]