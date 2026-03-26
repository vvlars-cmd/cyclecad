# cycleCAD — Agent-First OS for Manufacturing
# Serves the landing page + app via nginx
#
# Build:  docker build -t cyclecad .
# Run:    docker run -p 3000:80 cyclecad
# Open:   http://localhost:3000 (landing) / http://localhost:3000/app/ (CAD app)

FROM nginx:alpine

# Copy landing page
COPY index.html /usr/share/nginx/html/
COPY screenshot.png /usr/share/nginx/html/
COPY competitive-analysis.html /usr/share/nginx/html/
COPY architecture.html /usr/share/nginx/html/

# Copy app
COPY app/ /usr/share/nginx/html/app/

# Copy docs if they exist
COPY docs/ /usr/share/nginx/html/docs/

# Custom nginx config
RUN cat > /etc/nginx/conf.d/default.conf << 'NGINX'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip
    gzip on;
    gzip_types text/plain text/css application/javascript application/json model/gltf-binary;
    gzip_min_length 1000;

    # CORS
    add_header Access-Control-Allow-Origin *;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";

    # Cross-Origin headers for SharedArrayBuffer
    add_header Cross-Origin-Opener-Policy same-origin;
    add_header Cross-Origin-Embedder-Policy require-corp;

    # Cache
    location ~* \.(js|css|png|jpg|svg|woff2|glb|stl|pptx)$ {
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback for app
    location /app/ {
        try_files $uri $uri/ /app/index.html;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Health check
    location /health {
        return 200 '{"status":"ok","app":"cyclecad"}';
        add_header Content-Type application/json;
    }
}
NGINX

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q -O /dev/null http://localhost:80/health || exit 1
