#!/bin/bash
# MaintainPro CMMS Development Server Startup Script

echo "🚀 Starting MaintainPro CMMS Development Server..."
echo "📦 Node.js version: $(node --version)"
echo "📦 NPM version: $(npm --version)"

# Set environment variables
export NODE_ENV=development
export PORT=5000

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install
fi

# Start the development server
echo "🌟 Starting server on port $PORT..."
npm run dev