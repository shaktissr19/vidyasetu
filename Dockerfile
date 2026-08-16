FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY next.config.js ./
COPY postcss.config.js* ./
COPY tailwind.config.js* ./
COPY public ./public
COPY src ./src
EXPOSE 3000
CMD ["npm", "run", "dev"]
