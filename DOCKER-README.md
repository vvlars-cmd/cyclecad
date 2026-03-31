# cycleCAD Docker Infrastructure

## Overview

Complete Docker infrastructure for cycleCAD, featuring:

- **4 Production-Ready Services** — Web app, STEP converter, real-time signaling, optional viewer
- **End-to-End Testing** — 15+ test categories with automated CI/CD
- **Comprehensive Documentation** — 600+ line tutorial + API reference + deployment guides
- **Resource Management** — Memory limits, health checks, logging, monitoring
- **CI/CD Pipeline** — GitHub Actions with build, test, and publish workflows

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Docker Infrastructure                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  cycleCAD        │  │  STEP Converter  │  │  Signaling   │  │
│  │  (Nginx)         │  │  (FastAPI)       │  │  (Node.js)   │  │
│  │  Port 8080       │  │  Port 8787       │  │  Port 8788   │  │
│  │  512MB RAM       │  │  4GB RAM         │  │  512MB RAM   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                  │
│  ┌──────────────────┐                                            │
│  │  ExplodeView     │  (Optional, Port 3000)                    │
│  │  (Nginx - viewer)│                                            │
│  │  256MB RAM       │                                            │
│  └──────────────────┘                                            │
│                                                                  │
│  Docker Network: cyclecad-network (172.28.0.0/16)              │
│  Volumes: db-data, redis-data (future)                         │
│  Health Checks: All services with 30s intervals                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Prerequisites

- **Mac/Windows**: Docker Desktop v4.0+ ([Download](https://www.docker.com/products/docker-desktop))
- **Linux**: Docker Engine + docker-compose
- **Resources**: 4GB RAM minimum, 8GB recommended
- **Ports**: 8080, 8787, 8788 available

### 2. Start Services

```bash
cd ~/cyclecad
docker-compose up -d
docker-compose ps  # Check status (should show 3 healthy services)
```

### 3. Access Applications

| Service | URL | Purpose |
|---------|-----|---------|
| **cycleCAD** | http://localhost:8080 | CAD modeler + landing page |
| **Converter API** | http://localhost:8787/docs | OpenAPI documentation |
| **Signaling** | ws://localhost:8788 | WebSocket for real-time features |
| **ExplodeView** | http://localhost:3000 | 3D viewer (optional) |

### 4. Verify Health

```bash
curl http://localhost:8080/health
curl http://localhost:8787/health
curl http://localhost:8788/health
```

Each returns JSON: `{"status":"ok","app":"cyclecad"}`

### 5. Stop Services

```bash
docker-compose down          # Stop and remove containers
docker-compose down -v       # Also remove volumes
```

## File Structure

```
cyclecad/
├── Dockerfile                      # Main web app image
├── nginx.conf                      # Production nginx config (gzip, CORS, security)
├── docker-compose.yml              # Multi-service orchestration
│
├── server/
│   ├── Dockerfile.converter        # STEP→GLB conversion service
│   ├── Dockerfile.signaling        # WebSocket signaling server
│   ├── requirements-converter.txt   # Python dependencies
│   ├── converter.py                # FastAPI STEP converter
│   └── signaling-server.js         # Node.js signaling server
│
├── tests/
│   └── docker-tests.sh             # E2E test suite (15+ tests)
│
├── docs/
│   ├── DOCKER-TUTORIAL.md          # 600+ line guide (all topics)
│   ├── DOCKER-HELP.json            # JSON help entries (15+ commands)
│   ├── DEPLOYMENT-K8S.md           # Kubernetes setup
│   └── DEPLOYMENT-ECS.md           # AWS ECS setup
│
├── .github/workflows/
│   └── docker-test.yml             # CI/CD pipeline (build + test + publish)
│
└── app/, index.html, etc.          # Application files
```

## Key Files

### 1. **Dockerfile** (Production-Ready Web App)
- Base: `nginx:alpine` (11.5 MB)
- Serves: Landing page + CAD app (SPA)
- Features: Gzip, CORS, COOP/COEP headers, caching, security headers
- Size: ~15 MB when built
- Health check: `GET /health` → JSON

### 2. **nginx.conf** (Production Nginx Config)
- Gzip compression on JS, CSS, JSON, WASM, SVG (6+ types)
- CORS headers: Allow all origins, methods, headers
- COOP/COEP: Enable SharedArrayBuffer for Web Workers
- Cache strategy:
  - Static assets (JS/CSS/WASM): 1 year (immutable)
  - HTML: No cache (always validate)
  - API: No cache
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options
- Max upload: 500MB (for STEP files)
- SPA routing: `/app/*` → `/app/index.html`

### 3. **docker-compose.yml** (Multi-Service Orchestration)
- **cyclecad** (8080) — Nginx web app, 512MB, depends on converter + signaling
- **converter** (8787) — FastAPI STEP converter, 4GB, 300s timeout
- **signaling** (8788) — Node.js WebSocket, 512MB, 1000 max connections
- **explodeview** (3000, optional) — 3D viewer, 256MB
- Health checks: 30s interval, 5-10s timeout
- Resource limits: CPU and memory for each service
- Networks: Isolated `cyclecad-network`
- Logging: JSON driver with rotation (10-50 MB)

### 4. **docker-tests.sh** (End-to-End Test Suite)
Comprehensive testing with 30+ tests covering:

**Build & Infrastructure:**
- ✓ docker-compose installed
- ✓ Docker daemon running
- ✓ Services startup
- ✓ Health checks passing

**cycleCAD (Port 8080):**
- ✓ Landing page (/)
- ✓ CAD app (/app/)
- ✓ Health endpoint (/health)
- ✓ CORS headers present
- ✓ COOP/COEP headers
- ✓ Gzip compression
- ✓ Static asset caching
- ✓ SPA routing (/app/*)

**Converter (Port 8787):**
- ✓ Health check
- ✓ API documentation (/docs)
- ✓ /convert endpoint
- ✓ STEP file upload
- ✓ GLB response

**Signaling (Port 8788):**
- ✓ Health check
- ✓ WebSocket upgrade headers
- ✓ Connection handling

**Docker:**
- ✓ Resource limits
- ✓ Health check configuration
- ✓ Network isolation
- ✓ Service cleanup

### 5. **GitHub Actions Workflow** (docker-test.yml)
Automated CI/CD pipeline:

**On Push to main:**
1. Build all images
2. Start services with health checks
3. Run E2E test suite
4. Collect logs and report results
5. Publish images to Docker Hub + GitHub Container Registry
6. Deploy to VPS (if credentials configured)

**Features:**
- Caching for faster rebuilds
- Artifact uploads (test logs)
- Status notifications
- Conditional deployment
- 30-minute timeout

## Commands

### Start/Stop

```bash
docker-compose up -d              # Start all services (background)
docker-compose up                 # Start all services (foreground, see logs)
docker-compose stop               # Stop services
docker-compose restart            # Restart services
docker-compose down               # Stop and remove containers
docker-compose down -v            # Stop and remove volumes
```

### Logs & Monitoring

```bash
docker-compose logs -f            # Stream all logs
docker-compose logs -f converter  # Stream specific service
docker-compose logs --tail 100    # Last 100 lines
docker stats                      # CPU/memory usage
docker-compose ps                 # Service status
```

### Testing

```bash
bash tests/docker-tests.sh        # Run E2E tests
curl http://localhost:8080/health # Test health endpoint
curl -X POST http://localhost:8787/convert \
  -F "file=@model.stp"            # Test STEP conversion
```

### Development

```bash
docker-compose exec cyclecad sh   # Shell into service
docker-compose build              # Rebuild images
docker-compose build --no-cache   # Full rebuild
docker images | grep cyclecad     # View built images
```

### Configuration

```bash
# Create .env file with custom variables
cat > .env << EOF
APP_ENV=production
LOG_LEVEL=info
WORKERS=4
MAX_FILE_SIZE=500
EOF

# Use custom environment file
docker-compose --env-file custom.env up -d

# Override at command line
WORKERS=8 docker-compose up -d
```

## Documentation

### Full Guides

1. **[DOCKER-TUTORIAL.md](docs/DOCKER-TUTORIAL.md)** (600+ lines)
   - Complete reference for all operations
   - Development workflow
   - Production deployment (VPS, AWS, K8S)
   - SSL/TLS with Let's Encrypt
   - Scaling and performance
   - Troubleshooting

2. **[DOCKER-HELP.json](docs/DOCKER-HELP.json)**
   - 15+ help entries (JSON format)
   - Usage examples for each command
   - Searchable for integration with CLIs

3. **[DEPLOYMENT-K8S.md](docs/DEPLOYMENT-K8S.md)** (future)
   - Kubernetes manifests
   - Helm charts
   - Auto-scaling setup
   - Service mesh integration

4. **[DEPLOYMENT-ECS.md](docs/DEPLOYMENT-ECS.md)** (future)
   - AWS ECS task definitions
   - Fargate launch configuration
   - Load balancer setup
   - CI/CD with CodePipeline

## Deployment

### Local Development
```bash
docker-compose up
# Edit code, see changes instantly (with volume mounts)
```

### VPS (DigitalOcean, AWS EC2, Linode)
```bash
ssh user@your-vps
git clone https://github.com/vvlars-cmd/cyclecad.git
cd cyclecad
docker-compose up -d
```

### Production with HTTPS
```bash
# With nginx-proxy + ACME (automatic SSL)
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
```

### Kubernetes
```bash
kubectl apply -f k8s/
kubectl rollout status deployment/cyclecad
```

### AWS Fargate (Managed)
```bash
# See DEPLOYMENT-ECS.md for full setup
ecs-cli compose service up
```

## Troubleshooting

### Services won't start
```bash
docker-compose logs converter
docker-compose down -v && docker-compose build --no-cache
```

### Health checks failing
```bash
curl -v http://localhost:8787/health  # Test each service
docker-compose ps                      # Check status
```

### STEP conversion failing
```bash
docker-compose logs converter -f       # Watch converter logs
# Check file size: < 500MB recommended
# Check: WORKERS=2, TIMEOUT=300
```

### Out of memory
```bash
docker stats                           # Check usage
# Increase in docker-compose.yml: memory: 8G
```

### Port conflicts
```bash
sudo lsof -i :8080                    # Find process using port
kill -9 <PID>                         # Kill process
# Or change ports in docker-compose.yml
```

## Performance Tips

1. **Enable BuildKit** for faster builds:
   ```bash
   DOCKER_BUILDKIT=1 docker build .
   ```

2. **Use volume mounts** for hot reload in development:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
   ```

3. **Scale converter** for heavy STEP processing:
   - Add multiple converter instances in docker-compose.yml
   - Use load balancer (HAProxy, nginx-upstream)

4. **Enable caching** in GitHub Actions:
   ```yaml
   cache:
     path: /tmp/.buildx-cache
     key: ${{ runner.os }}-buildx-${{ github.sha }}
   ```

5. **Monitor resource usage**:
   ```bash
   docker stats --no-stream
   docker system df
   ```

## Security

- **Isolation**: Services run on isolated network (`cyclecad-network`)
- **Non-root**: Converter runs as `converter:converter` user (UID 1000)
- **Memory limits**: Prevents DoS attacks and runaway processes
- **Headers**: CORS, COOP, COEP, CSP, X-Frame-Options configured
- **Secrets**: Use `.env` file (add to `.gitignore`)
- **SSL/TLS**: Use with nginx-proxy for automatic HTTPS

## CI/CD

### GitHub Actions Workflow
- Triggered on: `push` to main/develop, `pull_request` to main
- Builds: All images with caching
- Tests: E2E suite with 30+ tests
- Publishes: To Docker Hub + GitHub Container Registry
- Deploys: To VPS (if credentials configured)

**Add secrets to GitHub repository:**
- `DOCKER_USERNAME` — Docker Hub username
- `DOCKER_PASSWORD` — Docker Hub password
- `DEPLOY_KEY` — SSH private key (optional)
- `DEPLOY_USER` — SSH user (optional)
- `DEPLOY_HOST` — SSH host (optional)
- `WEBHOOK_URL` — Notification webhook (optional)

## Future Enhancements

- [ ] Kubernetes deployment with Helm charts
- [ ] Database service (PostgreSQL) for user accounts
- [ ] Redis caching layer
- [ ] Prometheus metrics and Grafana dashboards
- [ ] ELK stack for centralized logging
- [ ] Multi-region deployment strategy
- [ ] Blue-green deployment for zero-downtime updates

## Support & Contributing

- **Issues**: https://github.com/vvlars-cmd/cyclecad/issues
- **Discussions**: https://github.com/vvlars-cmd/cyclecad/discussions
- **Email**: vvlars@googlemail.com
- **Discord**: [Join community](https://discord.gg/cyclecad) (future)

## License

MIT License. See LICENSE file in repository.

---

**Last Updated**: 2026-03-31
**Version**: 0.8.6
**Maintainer**: vvlars (vvlars@googlemail.com)
