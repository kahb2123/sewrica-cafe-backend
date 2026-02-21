FROM node:18-alpine

WORKDIR /app

# Install dependencies (production)
COPY package.json package-lock.json* ./
RUN npm ci --production

# Copy source
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "server.js"]
