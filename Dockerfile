# Imagem de produção do Repositório GPAQE.
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# As dependências entram antes do código para aproveitar o cache de camadas.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# O armazenamento local só serve para teste. Em produção use STORAGE_DRIVER=s3.
RUN mkdir -p storage && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
