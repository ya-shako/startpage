FROM node:18-slim

WORKDIR /app

# Копируем package.json и устанавливаем зависимости
COPY package*.json ./
RUN npm install --only=production

# Копируем код
COPY server.js ./
COPY public/ ./public/

# Создаём папку для state.json
RUN mkdir -p /app/data
ENV STATE_FILE=/app/data/state.json

EXPOSE 3001

CMD ["node", "server.js"]
