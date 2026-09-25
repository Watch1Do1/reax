FROM node:20-alpine

# Install system ffmpeg and ffprobe
RUN apk add --no-cache ffmpeg ca-certificates curl

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
