FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY src ./src

# .env is NOT copied — mount it at runtime:
# docker run --env-file .env abdm-mcp-server
# Or set env vars via your cloud provider's secret manager

EXPOSE 3000

CMD ["node", "src/index.js"]
