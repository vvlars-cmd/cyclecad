# cycleCAD Docker Infrastructure — Complete Guide

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Service Architecture](#service-architecture)
4. [Building Images](#building-images)
5. [Running Services](#running-services)
6. [Environment Configuration](#environment-configuration)
7. [Development Workflow](#development-workflow)
8. [Production Deployment](#production-deployment)
9. [SSL/TLS with Let's Encrypt](#ssltls-with-lets-encrypt)
10. [Scaling & Performance](#scaling--performance)
11. [Monitoring & Logging](#monitoring--logging)
12. [Troubleshooting](#troubleshooting)
13. [CI/CD Pipeline](#cicd-pipeline)

---

## Overview

cycleCAD Docker infrastructure consists of 4 microservices:

| Service | Tech | Port | Role |
|---------|------|------|------|
| **cyclecad** | Nginx | 8080 | Web application (landing + CAD app) |
| **converter** | FastAPI (Python) | 8787 | STEP/IGES → GLB conversion |
| **signaling** | Node.js/Express | 8788 | WebSocket for real-time collaboration |
| **explodeview** | Nginx | 3000 | 3D viewer (optional) |

### Resource Requirements
- **Minimum**: 4GB RAM, 2 CPU cores
- **Recommended**: 8GB RAM, 4 CPU cores
- **Production**: 16GB RAM, 8 CPU cores (with load balancer)

---

## Quick Start

### Prerequisites
- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- docker-compose v2.0+
- 4GB free disk space
- Port 8080, 8787, 8788 available (or modify docker-compose.yml)

### Installation

**Mac/Windows:**
1. Download [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Install and start Docker Desktop
3. Open Terminal and verify:
   ```bash
   docker --version
   docker-compose --version
   ```

**Linux (Ubuntu/Debian):**
```bash
# Install Docker
sudo apt-get update
sudo apt-get install docker.io docker-compose

# Add user to docker group (avoid sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify
docker --version
docker-compose --version
```

### Start All Services

```bash
cd ~/cyclecad
docker-compose up -d
```

Wait 30 seconds for health checks to pass. Then:

```bash
# Check status
docker-compose ps

# Should show 3 services as (healthy)
```

### Access Services

- **cycleCAD**: http://localhost:8080
- **Converter API**: http://localhost:8787/docs (OpenAPI Swagger)
- **Signaling**: ws://localhost:8788
- **ExplodeView** (optional): http://localhost:3000

### Stop All Services

```bash
docker-compose down
```

To also remove all volumes and data:
```bash
docker-compose down -v
```

---

## Service Architecture

### cycleCAD Web Application (Port 8080)
**Image**: `nginx:alpine`
**Role**: Static file serving + SPA routing

- Serves landing page (`/`)
- Serves CAD app (`/app/`)
- Reverse proxies API calls to converter and signaling
- Enables CORS, COOP/COEP headers for Web Workers
- Gzip compression for JS, CSS, WASM, JSON
- Health check: `GET /health` → JSON

**Features:**
- SPA routing: all `/app/*` routes → `/app/index.html`
- Max upload: 500MB (for STEP files)
- Cache strategy:
  - Static assets (JS/CSS/WASM): 1 year
  - HTML: no cache
  - API responses: no cache

### STEP Converter Service (Port 8787)
**Image**: `python:3.11 + FastAPI`
**Role**: Server-side STEP/IGES import

- Accepts POST requests with STEP file
- Parses using CadQuery (powered by OpenCASCADE)
- Returns GLB (binary glTF 2.0) format
- Extracts metadata: parts, assemblies, properties
- Handles large files (tested up to 500MB)
- Health check: `GET /health` → JSON

**Memory**: 2GB reserved, 4GB limit
**Timeout**: 300 seconds
**Workers**: 2 concurrent requests

**Endpoints:**
- `POST /convert` — Convert STEP → GLB
- `GET /health` — Health check
- `GET /docs` — OpenAPI documentation

### Signaling Server (Port 8788)
**Image**: `node:20-alpine + Express + WebSocket`
**Role**: Real-time collaboration and cursor tracking

- Manages WebSocket connections
- Broadcasts cursor positions and selections
- Handles document state sync
- User presence tracking
- Connection pooling

**Features:**
- Max 1,000 concurrent connections
- Auto cleanup on disconnect
- JSON message protocol
- Health check: `GET /health` → JSON

**Endpoints:**
- `GET /health` — Health check
- `WS /ws` — WebSocket upgrade

### ExplodeView Viewer (Port 3000, Optional)
**Image**: `nginx:alpine`
**Role**: 3D CAD viewer for STEP/Inventor files

- Read-only viewer for assemblies
- Share and embed functionality
- Lightweight (40+ features)

**To enable**: `docker-compose --profile with-explodeview up -d`

---

## Building Images

### Build All Images

```bash
cd ~/cyclecad
docker-compose build
```

**Output**: Pulls base images, installs deps, builds 3-4 images (~10 minutes first run)

### Build Specific Service

```bash
# Build only converter (useful for development)
docker-compose build converter

# Build with no cache (force full rebuild)
docker-compose build --no-cache converter
```

### View Built Images

```bash
docker images | grep cyclecad

# Output:
# cyclecad                 latest      abc123def456   2 minutes ago
# cyclecad-converter       latest      def456ghi789   1 minute ago
# cyclecad-signaling       latest      ghi789jkl012   30 seconds ago
```

---

## Running Services

### Start All Services (Foreground)

```bash
docker-compose up
```

Shows real-time logs from all services. Press `Ctrl+C` to stop.

### Start All Services (Background)

```bash
docker-compose up -d
```

Returns immediately. Services run in background.

### Check Status

```bash
docker-compose ps
```

**Output:**
```
NAME                      STATUS              PORTS
cyclecad-app              Up 2 minutes (healthy)   0.0.0.0:8080->80/tcp
cyclecad-converter        Up 2 minutes (healthy)   0.0.0.0:8787->8787/tcp
cyclecad-signaling        Up 2 minutes (healthy)   0.0.0.0:8788->8788/tcp
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f converter

# Last 100 lines
docker-compose logs --tail 100

# Since specific time
docker-compose logs --since 2024-03-31 --until 2024-03-31T12:00:00
```

### Execute Commands in Service

```bash
# Shell into service
docker-compose exec cyclecad sh

# Run single command
docker-compose exec converter python -V

# Run with specific user
docker-compose exec -u root cyclecad apt-get update
```

### Stop Services

```bash
# Stop (can restart with docker-compose up)
docker-compose stop

# Stop specific service
docker-compose stop converter

# Stop and remove containers
docker-compose down

# Stop, remove containers, and remove volumes
docker-compose down -v
```

### Restart Service

```bash
# Restart all
docker-compose restart

# Restart specific service
docker-compose restart converter
```

---

## Environment Configuration

### Default Environment Variables

Create `.env` file in project root:

```env
# Application
APP_VERSION=0.8.6
APP_ENV=production
LOG_LEVEL=info

# Services
CONVERTER_URL=http://converter:8787
SIGNALING_URL=ws://signaling:8788

# Converter (FastAPI)
WORKERS=2
MAX_FILE_SIZE=500
TIMEOUT=300

# Signaling (Node.js)
NODE_ENV=production
MAX_CONNECTIONS=1000

# Nginx
NGINX_WORKER_PROCESSES=auto
NGINX_WORKER_CONNECTIONS=2048

# Database (optional, for future use)
DB_HOST=db
DB_PORT=5432
DB_NAME=cyclecad
DB_USER=cyclecad
```

### Load Environment Variables

Docker Compose automatically loads `.env` file. To override:

```bash
# Override on command line
WORKERS=4 docker-compose up -d

# Or create environment file
docker-compose --env-file custom.env up -d
```

### Pass Environment to Service

In `docker-compose.yml`:
```yaml
services:
  converter:
    environment:
      - WORKERS=${WORKERS:-2}
      - LOG_LEVEL=${LOG_LEVEL:-info}
```

---

## Development Workflow

### Local Development (No Docker)

For testing code changes without Docker:

```bash
# Install dependencies locally
cd server
pip install -r requirements-converter.txt

# Run converter
python converter.py

# In another terminal, build and test CAD app
cd ../app
npm install  # if using Node build tools
npm start
```

### Docker Development (with Hot Reload)

For rapid iteration on containerized code:

```bash
# Mount source code as volume
docker-compose -f docker-compose.yml \
  -f docker-compose.dev.yml \
  up -d
```

Create `docker-compose.dev.yml`:
```yaml
version: '3.8'
services:
  converter:
    volumes:
      - ./server:/app  # Mount source, code changes auto-reload
    environment:
      - RELOAD=true   # Enable uvicorn reload

  signaling:
    volumes:
      - ./server:/app
    environment:
      - NODE_ENV=development
```

### Testing Converter Service

```bash
# Health check
curl http://localhost:8787/health

# View API docs (Swagger UI)
open http://localhost:8787/docs

# Test STEP upload
curl -X POST http://localhost:8787/convert \
  -F "file=@model.stp"

# Check response
# Returns GLB file in response body
```

### Testing Signaling Service

```bash
# Health check
curl http://localhost:8788/health

# Connect with websocat (install: brew install websocat)
websocat ws://localhost:8788/ws

# Type JSON and send
{"type":"cursor","x":100,"y":200}
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All services pass health checks locally
- [ ] Environment variables set correctly
- [ ] Database backups in place
- [ ] SSL/TLS certificates ready (for HTTPS)
- [ ] Firewall rules configured (only expose 443, 22 for SSH)
- [ ] Resource limits verified (CPU, memory, disk)
- [ ] Logging configured (centralized logging service)
- [ ] Monitoring enabled (Prometheus, DataDog, etc.)

### VPS Deployment (DigitalOcean, AWS EC2, Linode)

**Step 1: Provision VM**
```bash
# Ubuntu 22.04 LTS, 8GB RAM, 4 CPU, 80GB SSD

# SSH into server
ssh root@your-vps-ip
```

**Step 2: Install Docker**
```bash
apt-get update
apt-get install -y docker.io docker-compose git

# Add user
adduser deploy
usermod -aG docker deploy
su - deploy
```

**Step 3: Clone Repository**
```bash
cd /home/deploy
git clone https://github.com/vvlars-cmd/cyclecad.git
cd cyclecad
```

**Step 4: Configure Environment**
```bash
# Create .env for production
cat > .env << EOF
APP_ENV=production
LOG_LEVEL=warn
CONVERTER_URL=https://cyclecad.com/converter
SIGNALING_URL=wss://cyclecad.com/signal
EOF

# Create production override file
cat > docker-compose.prod.yml << EOF
version: '3.8'
services:
  cyclecad:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
    logging:
      driver: awslogs
      options:
        awslogs-group: cyclecad
        awslogs-region: us-east-1
EOF
```

**Step 5: Start Services**
```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

**Step 6: Verify**
```bash
docker-compose ps
curl http://localhost:8080/health
```

### AWS Elastic Container Service (ECS)

See `docs/DEPLOYMENT-ECS.md` for detailed ECS setup with Fargate.

### Kubernetes Deployment

For large-scale deployments with auto-scaling:

```bash
# Create Kubernetes manifests in k8s/ directory
ls k8s/

# Deploy
kubectl apply -f k8s/
kubectl rollout status deployment/cyclecad
```

See `docs/DEPLOYMENT-K8S.md` for full Kubernetes setup.

---

## SSL/TLS with Let's Encrypt

### Using Nginx-Proxy + ACME Companion

For automatic SSL certificate management:

```yaml
version: '3.8'
services:
  # Reverse proxy with automatic SSL
  nginx-proxy:
    image: nginxproxy/nginx-proxy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - certs:/etc/nginx/certs:ro
      - vhost:/etc/nginx/vhost.d
      - html:/usr/share/nginx/html
    networks:
      - cyclecad-network

  # Automatic SSL certificate generation
  acme:
    image: nginxproxy/acme-companion
    environment:
      - DEFAULT_EMAIL=your-email@cyclecad.com
    volumes_from:
      - nginx-proxy
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - acme:/etc/acme.sh
    networks:
      - cyclecad-network

  cyclecad:
    build: .
    environment:
      - VIRTUAL_HOST=cyclecad.com,www.cyclecad.com
      - LETSENCRYPT_HOST=cyclecad.com,www.cyclecad.com
      - LETSENCRYPT_EMAIL=your-email@cyclecad.com
    networks:
      - cyclecad-network

volumes:
  certs:
  vhost:
  html:
  acme:

networks:
  cyclecad-network:
    driver: bridge
```

**Start with SSL:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
```

Certificates auto-generated and auto-renewed. Traffic redirected HTTP → HTTPS.

---

## Scaling & Performance

### Horizontal Scaling (Multiple Converters)

For heavy STEP processing load:

```yaml
services:
  converter-1:
    build: ./server/Dockerfile.converter
    ports: ["8787:8787"]
    deploy:
      resources:
        limits:
          memory: 4G

  converter-2:
    build: ./server/Dockerfile.converter
    ports: ["8787:8787"]
    deploy:
      resources:
        limits:
          memory: 4G

  # Load balancer
  converter-lb:
    image: haproxy:2.8-alpine
    ports: ["8787:8787"]
    volumes:
      - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
    depends_on:
      - converter-1
      - converter-2
```

### Vertical Scaling (More Resources)

Increase resource limits in `docker-compose.yml`:
```yaml
deploy:
  resources:
    limits:
      cpus: '8'
      memory: 16G
```

### Caching Strategy

Use Redis for caching converter results:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    volumes:
      - redis-data:/data

  converter:
    environment:
      - REDIS_URL=redis://redis:6379
```

### Database (Future)

For user accounts and project storage:

```yaml
services:
  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: cyclecad
      POSTGRES_USER: cyclecad
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "cyclecad"]
```

---

## Monitoring & Logging

### View Real-Time Logs

```bash
# All services
docker-compose logs -f --timestamps

# Specific service with color
docker-compose logs -f --timestamps converter

# Filter by pattern
docker-compose logs converter | grep ERROR
```

### Docker Events

```bash
# Monitor all Docker events
docker events --filter 'label=com.docker.compose.project=cyclecad'
```

### Performance Monitoring

```bash
# CPU and memory usage
docker stats

# Check disk usage
docker system df
```

### Send Logs to Central Service (AWS CloudWatch)

Configure in `docker-compose.yml`:
```yaml
services:
  converter:
    logging:
      driver: awslogs
      options:
        awslogs-group: /cyclecad/converter
        awslogs-region: us-east-1
        awslogs-stream-prefix: ecs
```

### Prometheus Metrics (Optional)

Add metrics endpoint to services:

```bash
# View Prometheus metrics
curl http://localhost:8787/metrics
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs converter

# Common issues:
# 1. Port already in use
sudo lsof -i :8787  # Find process using port
kill -9 <PID>

# 2. Image not found
docker-compose pull
docker-compose build

# 3. Out of memory
# Increase Docker memory limit in settings
```

### Health Check Failing

```bash
# Test manually
curl -v http://localhost:8080/health
curl -v http://localhost:8787/health

# If timeout, check firewall
sudo ufw allow 8080
sudo ufw allow 8787
```

### Service Crashes on Startup

```bash
# View detailed error
docker-compose logs -f converter

# Common fixes:
# 1. Rebuild without cache
docker-compose build --no-cache converter

# 2. Increase timeout
# Edit docker-compose.yml healthcheck start_period

# 3. Check system resources
docker system df
docker stats
```

### WebSocket Connection Issues

```bash
# Check signaling service
curl http://localhost:8788/health

# Test WebSocket (requires websocat)
websocat ws://localhost:8788/ws

# If connection refused:
# 1. Firewall blocking
# 2. Service not running
# 3. Port mapping incorrect
```

### STEP Conversion Fails

```bash
# Check converter logs
docker-compose logs converter

# Test converter API
curl -X POST http://localhost:8787/convert \
  -F "file=@test.stp" \
  -v

# If timeout:
# 1. Increase TIMEOUT in .env
# 2. Increase memory: limits.memory: 8G
# 3. Increase workers: WORKERS=4
```

### Disk Space Issues

```bash
# Check disk usage
docker system df

# Clean up unused images/containers/volumes
docker system prune -a

# Remove specific volume
docker volume rm cyclecad_db-data
```

---

## CI/CD Pipeline

### GitHub Actions

Create `.github/workflows/docker-test.yml`:

```yaml
name: Docker E2E Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2

      - name: Build images
        run: docker-compose build

      - name: Start services
        run: docker-compose up -d

      - name: Wait for health
        run: sleep 30

      - name: Run tests
        run: bash tests/docker-tests.sh

      - name: Check logs
        if: failure()
        run: docker-compose logs

      - name: Cleanup
        run: docker-compose down

  publish:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}

      - name: Push to Docker Hub
        run: |
          docker tag cyclecad:latest cyclecad:$(git rev-parse --short HEAD)
          docker push cyclecad:latest
          docker push cyclecad:$(git rev-parse --short HEAD)
```

### Deploy on Push to Main

```yaml
      - name: Deploy to VPS
        if: success()
        run: |
          ssh -i ~/.ssh/deploy_key deploy@cyclecad.com << EOF
          cd /home/deploy/cyclecad
          git pull origin main
          docker-compose pull
          docker-compose up -d
          EOF
```

---

## Maintenance

### Regular Backups

```bash
# Backup database
docker-compose exec db pg_dump cyclecad > backup.sql

# Backup all volumes
docker run --rm -v cyclecad_db-data:/data \
  -v $(pwd):/backup ubuntu tar czf /backup/db-backup.tar.gz /data
```

### Update Services

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Verify
docker-compose ps
```

### Clean Up Old Images

```bash
# Remove dangling images
docker image prune

# Remove all unused images
docker image prune -a
```

---

## Further Reading

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Nginx Best Practices](https://nginx.org/en/docs/)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)

## Support

For issues or questions:
- GitHub Issues: https://github.com/vvlars-cmd/cyclecad/issues
- Email: vvlars@googlemail.com
