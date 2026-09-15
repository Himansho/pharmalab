# ---- build stage: compile the SPA ------------------------------
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime: API + static UI, no dev tools ---------------------
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server ./server
COPY --from=build /app/dist ./dist
RUN mkdir -p logs
EXPOSE 8787
USER node
CMD ["node", "server/index.mjs"]
