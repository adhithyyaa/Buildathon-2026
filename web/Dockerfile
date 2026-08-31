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
# The API upstream is templated: the nginx image's envsubst step fills ${API_UPSTREAM} at container
# start. Default = the compose `api` service; on Azure Container Apps set API_UPSTREAM to the API app's
# internal FQDN. The filter restricts substitution to API_UPSTREAM so nginx's own $host/$uri/$scheme
# runtime variables are left untouched.
ENV API_UPSTREAM=http://api:8787
ENV NGINX_ENVSUBST_FILTER=API_UPSTREAM
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
