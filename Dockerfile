FROM node:18-alpine

WORKDIR /app

# Install dependencies (production)
COPY package.json package-lock.json* ./
RUN echo "Installing dependencies..." && \
    npm ci --production && \
    echo "Dependencies installed successfully"

# Copy source
COPY . .

# Create uploads directory with proper permissions
RUN mkdir -p uploads && \
    chmod 755 uploads

ENV NODE_ENV=production
EXPOSE 5000

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})" || exit 1

# Start with logging
CMD ["sh", "-c", "node server.js 2>&1 | tee /proc/1/fd/1"]