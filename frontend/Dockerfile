FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DATA_SOURCE=api
RUN npm run build
FROM nginx:stable-alpine
COPY frontend/nginx.conf /etc/nginx/aegisearth.conf.template
COPY frontend/start-nginx.sh /usr/local/bin/start-aegisearth
COPY --from=build /app/dist /usr/share/nginx/html
ENV AEGISEARTH_API_UPSTREAM=http://api:8000
USER 1000:1000
EXPOSE 7860
ENTRYPOINT ["/bin/sh", "/usr/local/bin/start-aegisearth"]
