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

# 预下载 Tesseract OCR 语言包（tessdata_fast 版本，体积小）
FROM base AS tessdata
RUN apk add --no-cache wget \
 && mkdir -p /tessdata \
 && wget -q -O /tessdata/eng.traineddata \
      https://github.com/tesseract-ocr/tessdata_fast/raw/main/eng.traineddata \
 && wget -q -O /tessdata/chi_sim.traineddata \
      https://github.com/tesseract-ocr/tessdata_fast/raw/main/chi_sim.traineddata

FROM base AS runner
ENV NODE_ENV=production
ENV TESSDATA_PREFIX=/app/tessdata
ENV TESSDATA_CACHE=/app/tessdata-cache
WORKDIR /app
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/package.json ./package.json
COPY --from=build /app/server/node_modules ./node_modules
COPY --from=build /app/guide/dist ./guide/dist
COPY --from=tessdata /tessdata ./tessdata
RUN mkdir -p /app/tessdata-cache

CMD ["node", "dist/index.js"]
