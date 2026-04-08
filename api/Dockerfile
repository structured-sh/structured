FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY . .

# Create data directory
RUN mkdir -p /app/data/parquet

EXPOSE 3001

CMD ["node", "index.js"]
