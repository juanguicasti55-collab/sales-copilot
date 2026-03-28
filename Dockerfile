FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3001
ENV COPILOT_PORT=3001
CMD ["node", "src/sales-copilot.js"]
