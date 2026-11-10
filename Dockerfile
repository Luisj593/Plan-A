FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY server.mjs index.html ./
COPY integrations ./integrations
COPY data ./data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
