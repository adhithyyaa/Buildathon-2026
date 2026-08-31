# Sentinel AI — web (Vite build served by nginx; nginx reverse-proxies /api + /health to the API,
# so the app's same-origin relative fetches work with no CORS and no build-time API URL).
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Optional: enable real Google sign-in by passing --build-arg VITE_GOOGLE_CLIENT_ID=...
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

FROM nginx:1.27-alpine AS run
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
