# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY server/package.json server/package-lock.json* ./server/
COPY guide/package.json ./guide/
RUN cd server \
 && npm install
RUN cd guide \
 && npm install

FROM deps AS build
COPY server ./server
COPY guide ./guide
WORKDIR /app/server
RUN npm run build \
 && npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/guide/dist ./guide/dist
COPY server/.env.example ./
EXPOSE 7000
EXPOSE 7001
CMD ["node", "dist/index.js"]
