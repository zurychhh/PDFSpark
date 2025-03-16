FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy backend package.json and package-lock.json
COPY backend/package*.json ./

# Install app dependencies
RUN npm ci --only=production

# Copy backend files
COPY backend/ ./

# Create required directories
RUN mkdir -p uploads temp

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port app runs on
EXPOSE 3000

# Start the app
CMD ["node", "index.js"]