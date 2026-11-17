FROM node:20-alpine

# sharp benoetigt vips zur Laufzeit
RUN apk add --no-cache vips

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p /app/data

ENV PORT=3005
EXPOSE 3005

CMD ["node", "src/server.js"]
