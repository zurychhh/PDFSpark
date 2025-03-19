FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install app dependencies
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create required directories for file operations
RUN mkdir -p /app/temp /app/uploads /app/logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV USE_MEMORY_FALLBACK=true
ENV TEMP_DIR=/app/temp
ENV UPLOAD_DIR=/app/uploads
ENV LOG_DIR=/app/logs

# Expose the port app runs on
EXPOSE 3000

# Start the app with memory limit
CMD ["node", "--max-old-space-size=2048", "index.js"]