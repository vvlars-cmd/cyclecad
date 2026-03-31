# cycleCAD — Agent-First OS for Manufacturing
# Production-ready Dockerfile for cyclecad.com
#
# Build:   docker build -t cyclecad:latest .
# Tag:     docker tag cyclecad:latest cyclecad:v0.8.6
# Run:     docker run -p 8080:80 --name cyclecad cyclecad:latest
# Health:  curl http://localhost:8080/health
#
# Features:
# - Gzip compression (JS, CSS, JSON, WASM, SVG)
# - CORS headers (all origins, GET/POST/OPTIONS)
# - COOP/COEP headers (SharedArrayBuffer for Web Workers)
# - Aggressive caching (1 year for static assets)
# - Security headers (CSP, X-Frame-Options, X-Content-Type-Options)
# - SPA fallback (all routes → index.html except /api/ & /health)
# - Max upload size: 500MB (for STEP file imports)
# - Health check endpoint: GET /health

FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy landing page + assets
COPY index.html /usr/share/nginx/html/
COPY screenshot.png /usr/share/nginx/html/
COPY CNAME /usr/share/nginx/html/

# Copy all reference HTML files
COPY competitive-analysis.html /usr/share/nginx/html/ 2>/dev/null || true
COPY architecture.html /usr/share/nginx/html/ 2>/dev/null || true

# Copy CAD app (all JS modules, assets, etc.)
COPY app/ /usr/share/nginx/html/app/

# Copy documentation
COPY docs/ /usr/share/nginx/html/docs/ 2>/dev/null || true

# Copy example Inventor project files (optional, for demos)
COPY example/ /usr/share/nginx/html/example/ 2>/dev/null || true

# Copy our production nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health || exit 1
