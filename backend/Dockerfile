FROM node:20-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./

FROM base AS development
RUN npm install
COPY src ./src
EXPOSE 5000
CMD ["node", "--watch", "src/index.js"]

FROM base AS production
RUN npm install --omit=dev
COPY src ./src
EXPOSE 5000
CMD ["node", "src/index.js"]
