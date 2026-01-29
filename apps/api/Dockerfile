# Dockerfile for Lingtin API - v1.3
# NestJS backend with FFmpeg support for audio processing
# Build from monorepo root: docker build -f apps/api/Dockerfile -t <image> .
# v1.3 - Fixed: Use --prod=false to include devDependencies for nest build

FROM node:18-alpine

# Install FFmpeg for audio conversion (WebM -> PCM)
RUN apk add --no-cache ffmpeg

# Set working directory
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy root package files for monorepo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy api and types package.json
COPY apps/api/package.json ./apps/api/
COPY packages/types/package.json ./packages/types/

# Install all dependencies including devDependencies (needed for nest build)
RUN pnpm install --frozen-lockfile --prod=false --filter @lingtin/api...

# Copy source code (api + shared types)
COPY apps/api ./apps/api
COPY packages/types ./packages/types

# Build the application
WORKDIR /app/apps/api
RUN pnpm build

# Prune devDependencies after build to reduce image size
RUN pnpm prune --prod

# Expose port
EXPOSE 3001

# Set environment
ENV NODE_ENV=production

# Start the application
CMD ["node", "dist/main.js"]
