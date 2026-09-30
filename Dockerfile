# syntax=docker/dockerfile:1
# The Mela admin console, for production (and `docker compose up -d --build`
# here, locally): the static build behind nginx, which also proxies /v1 to the API
# so the console and the API share one origin and the refresh cookie stays
# first-party (docs/features/admin.md). Runs as nginx's unprivileged user.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine
# Set by whoever runs the image (no defaults - nginx won't start without them):
# API_UPSTREAM, where /v1 goes; CSP_IMG_SRC, where avatars may load from
# besides this origin - the object storage's public URL (S3_PUBLIC_URL_BASE).
# Only those two are substituted into the template; nginx's own $variables
# are left alone.
ENV NGINX_ENVSUBST_FILTER="^(API_UPSTREAM|CSP_IMG_SRC)\$"
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
