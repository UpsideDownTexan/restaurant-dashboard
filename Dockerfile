# Multi-stage build for Restaurant Dashboard

# Stage 1: Build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Production server
FROM node:20-alpine AS production
WORKDIR /app

# Install production dependencies for backend
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

# Install puppeteer dependencies
RUN apk add --no-cache \
    chromium \
        nss \
            freetype \
                harfbuzz \
                    ca-certificates \
                        ttf-freefont

                        # Set puppeteer to use installed chromium
                        ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
                        ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

                        # Copy backend source
                        COPY backend/ ./

                        # Copy built frontend
                        COPY --from=frontend-builder /app/frontend/dist ./dist/frontend

                        # Create database directory
                        RUN mkdir -p /app/backend/database

                        # Set environment variables
                        ENV NODE_ENV=production
                        ENV PORT=3001

                        EXPOSE 3001

                        CMD ["node", "src/index.js"]
