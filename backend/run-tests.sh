#!/bin/bash

echo "Starting backend with memory fallback mode enabled..."
USE_MEMORY_FALLBACK=true PORT=3000 node index.js > server.log 2>&1 &
SERVER_PID=$!

echo "Server started with PID: $SERVER_PID"
echo "Waiting for server to initialize..."
sleep 3

echo "Running diagnostic tests..."
node test-diagnostic.js

echo "Running file upload tests..."
node test-upload.js

echo "Tests completed. Stopping server..."
kill $SERVER_PID

echo "Server stopped. Test results can be found in server.log"
echo "===== SERVER LOG ====="
cat server.log