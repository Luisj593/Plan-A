FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs index.html login.html admin-images.html super-admin.html my-session.html ./
COPY integrations ./integrations
COPY data ./data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.mjs"]
