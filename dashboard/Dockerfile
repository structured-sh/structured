FROM node:22-alpine AS builder

ARG VITE_API_URL=http://localhost:3001
ARG VITE_API_KEY=sk_structured_dev

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_KEY=$VITE_API_KEY

WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Serve ──────────────────────────
FROM node:22-alpine

RUN npm install -g serve

WORKDIR /app
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
