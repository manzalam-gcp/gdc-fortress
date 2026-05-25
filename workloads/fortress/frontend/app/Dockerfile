FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Bake the API URL into the Vite bundle at build time
ARG VITE_API_URL=http://10.200.32.58:8000
ENV VITE_API_URL=$VITE_API_URL

# Build the production bundle
RUN npm run build

# Install a lightweight static file server
RUN npm install -g serve

EXPOSE 3000

CMD ["serve", "-s", "dist", "-l", "3000"]
