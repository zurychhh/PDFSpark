FROM node:18-alpine

# Install system dependencies
RUN apk add --no-cache curl

# Create application directory
WORKDIR /app

# Copy our files
COPY railway-entry.js ./
COPY advanced-conversion.js ./index.js
RUN chmod +x railway-entry.js

# Create temporary directories
RUN mkdir -p /tmp/uploads /tmp/results && \
    chmod 777 /tmp/uploads /tmp/results

# Install dependencies including conversion libraries
RUN npm init -y && \
    npm install express cors cloudinary multer uuid pdf-lib docx sharp axios --save

# Expose port
EXPOSE 3000

# Run application
CMD ["node", "railway-entry.js"]