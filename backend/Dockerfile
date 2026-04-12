FROM node:20-alpine

# Güvenlik: root olmayan kullanıcı
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

# data/ klasörü oluştur ve sahipliği ver
RUN mkdir -p data && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3001

CMD ["node", "server.js"]
