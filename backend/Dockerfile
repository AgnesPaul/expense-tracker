# Multi-stage: build TypeScript, then ship only what runs.
# Phase 9 pushes this image to ECR; Phase 3 builds it on the EC2 box.
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 3000
# Stateless: no writes to local disk. Required before an ASG can run two of these.
CMD ["node", "dist/index.js"]
