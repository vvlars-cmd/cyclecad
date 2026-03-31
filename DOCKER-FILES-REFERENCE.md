# cycleCAD Docker Files — Reference Guide

## Complete File Listing

### 1. Core Docker Files (3)

#### `Dockerfile` (1.7 KB)
```
Location: ~/cyclecad/Dockerfile
Purpose:  Main web application image (nginx-based)
Uses:     Base image nginx:alpine
Builds:   Landing page + CAD app SPA
Exposes:  Port 80 (mapped to 8080 in docker-compose)
```

**Key Components:**
- ✅ Copy landing page (index.html, screenshot.png, CNAME)
- ✅ Copy app directory (entire CAD application)
- ✅ Copy docs directory (if exists)
- ✅ Copy example directory (optional, for demos)
- ✅ Include production nginx.conf
- ✅ Health check: curl /health

**Built Size:** ~15 MB

#### `server/Dockerfile.converter` (1.5 KB)
```
Location: ~/cyclecad/server/Dockerfile.converter
Purpose:  STEP/IGES file conversion service (FastAPI)
Uses:     Base image python:3.11-slim
Installs: cadquery, pythonocc-core, fastapi, uvicorn
Exposes:  Port 8787
```

**Key Components:**
- ✅ Install system dependencies (libgl1, libglu1-mesa, etc.)
- ✅ Install Python dependencies from requirements-converter.txt
- ✅ Copy converter.py script
- ✅ Create non-root user (converter:1000)
- ✅ Health check: curl /health
- ✅ Start: uvicorn with 2 workers

**Built Size:** ~500 MB (large due to OpenCASCADE libs)

#### `server/Dockerfile.signaling` (624 B)
```
Location: ~/cyclecad/server/Dockerfile.signaling
Purpose:  WebSocket signaling server for real-time collaboration
Uses:     Base image node:20-alpine
Installs: ws (WebSocket library), express, cors
Exposes:  Port 8788
```

**Key Components:**
- ✅ Install curl for health checks
- ✅ Copy package.json and install dependencies
- ✅ Copy signaling-server.js
- ✅ Create non-root user (nodejs:1001)
- ✅ Health check: curl /health
- ✅ Start: node signaling-server.js

**Built Size:** ~250 MB

---

### 2. Configuration Files (2)

#### `nginx.conf` (7.8 KB)
```
Location: ~/cyclecad/nginx.conf
Purpose:  Production-grade nginx configuration
Used by:  Copied into main Dockerfile during build
```

**Contents (300+ lines):**

1. **Gzip Compression**
   - Level 6 compression
   - 8 content types (text, css, js, json, svg, wasm, etc.)
   - Min length 500 bytes

2. **Headers**
   - CORS: Access-Control-Allow-Origin *
   - COOP: Cross-Origin-Opener-Policy same-origin
   - COEP: Cross-Origin-Embedder-Policy require-corp
   - Security: CSP, X-Frame-Options, X-Content-Type-Options

3. **Caching Strategy**
   - Static assets (JS/CSS/WASM): 1 year, immutable
   - HTML files: no-cache
   - JSON: 5 minutes
   - Versioned assets: 7 days

4. **Routing**
   - Health check: /health → JSON
   - API proxy: /api/* → converter (port 8787)
   - API proxy: /converter/* → converter
   - WebSocket: /ws/* → signaling (port 8788)
   - SPA routing: /app/* → /app/index.html

5. **Security**
   - Max upload: 500 MB
   - Hidden files blocked (/.*)
   - Proper MIME types

#### `docker-compose.yml` (5.7 KB)
```
Location: ~/cyclecad/docker-compose.yml
Purpose:  Multi-service orchestration file
Used by:  docker-compose up/down/ps/logs etc.
```

**Services Defined:**
1. `cyclecad` (nginx)
   - Port: 8080
   - Memory: 512 MB limit, 256 MB reserved
   - CPU: 2 limit, 0.5 reserved
   - Depends on: converter, signaling

2. `converter` (FastAPI)
   - Port: 8787
   - Memory: 4 GB limit, 2 GB reserved
   - CPU: 4 limit, 2 reserved
   - Workers: 2

3. `signaling` (Node.js)
   - Port: 8788
   - Memory: 512 MB limit, 256 MB reserved
   - CPU: 1 limit, 0.25 reserved

4. `exploreview` (optional, nginx)
   - Port: 3000
   - Enabled with: --profile with-exploreview

**Network:**
- `cyclecad-network` (172.28.0.0/16)
- Bridge driver (isolated)

**Volumes:**
- None defined (stateless services)
- Future: db-data, redis-data

**Logging:**
- Driver: json-file
- Rotation: 10-50 MB per file, 3 files max

**Health Checks:**
- All services: 30s interval, 5-10s timeout
- Retries: 3 attempts before unhealthy

---

### 3. Dependency Management (1)

#### `server/requirements-converter.txt` (524 B)
```
Location: ~/cyclecad/server/requirements-converter.txt
Purpose:  Python package dependencies for converter service
Used by:  Dockerfile.converter during build
```

**Packages (15):**
- fastapi==0.104.1
- uvicorn[standard]==0.24.0
- python-multipart==0.0.6
- pydantic==2.5.0
- cadquery==2.4.0
- OCP==7.7.2.dev0
- pythonocc-core==7.7.2
- trimesh==3.24.2
- pygltflib==1.15.2
- numpy==1.26.2
- scipy==1.11.4
- python-json-logger==2.0.7
- python-dotenv==1.0.0

---

### 4. Testing (1)

#### `tests/docker-tests.sh` (12 KB)
```
Location: ~/cyclecad/tests/docker-tests.sh
Purpose:  End-to-end testing suite (executable bash script)
Used by:  GitHub Actions, manual testing
```

**Permissions:** 755 (executable)

**Test Categories:**
1. Prerequisites (docker-compose, Docker daemon)
2. Service startup (3+ services running)
3. Health checks (all endpoints respond)
4. cycleCAD app (/, /app/, /health, headers, caching)
5. Converter (health, API docs, upload, conversion)
6. Signaling (health, WebSocket)
7. Docker config (limits, checks, networking)
8. Integration (cross-service, file limits)
9. Cleanup (stop/restart operations)

**Total Tests:** 30+

**Output Format:**
- Color-coded: Green (pass), Red (fail), Yellow (skip), Blue (info)
- Summary: Tests passed/failed/skipped, pass rate %
- Exit code: 0 (all pass), 1 (any fail)

---

### 5. CI/CD Pipeline (1)

#### `.github/workflows/docker-test.yml` (11 KB)
```
Location: ~/cyclecad/.github/workflows/docker-test.yml
Purpose:  GitHub Actions workflow for automated testing/publishing
Used by:  GitHub Actions on push/PR events
```

**Triggers:**
- Push to main or develop
- Pull request to main
- Changes to Docker/app files

**Jobs:**
1. **build-and-test** (30 min timeout)
   - Checkout, setup Buildx, cache layers
   - Build images
   - Start services
   - Wait for health checks
   - Run docker-tests.sh
   - Upload logs as artifacts
   - Cleanup

2. **publish** (on main push, if tests pass)
   - Login to Docker Hub
   - Login to GitHub Container Registry
   - Build and push 3 images
   - Tag with version, latest, SHA

3. **deploy** (optional, if credentials)
   - SSH to VPS
   - Pull new images
   - Restart services

4. **notify** (always)
   - Report status
   - Send webhook notification

---

### 6. Documentation (4)

#### `DOCKER-README.md` (14 KB)
```
Location: ~/cyclecad/DOCKER-README.md
Purpose:  Quick reference and getting started guide
Audience: Developers, DevOps engineers
```

**Sections:**
- Overview
- Quick start (5 steps)
- Architecture diagram
- File structure
- Key files explanation
- Commands reference
- Documentation links
- Deployment strategies
- Troubleshooting
- Performance tips
- Security
- CI/CD info
- Future enhancements

**Usage:** Start here for overview and quick commands.

#### `docs/DOCKER-TUTORIAL.md` (19 KB, 600+ lines)
```
Location: ~/cyclecad/docs/DOCKER-TUTORIAL.md
Purpose:  Comprehensive guide covering all Docker operations
Audience: All users, from beginners to DevOps
```

**Sections (13):**
1. Overview
2. Quick Start (prerequisites, installation, verification)
3. Service Architecture (detailed for each service)
4. Building Images (build commands, caching)
5. Running Services (start, logs, exec, stop, restart)
6. Environment Configuration (.env file, variables)
7. Development Workflow (hot reload, testing)
8. Production Deployment (VPS, AWS, Kubernetes)
9. SSL/TLS with Let's Encrypt (automatic HTTPS)
10. Scaling & Performance (horizontal/vertical)
11. Monitoring & Logging (real-time, centralized)
12. Troubleshooting (7 detailed scenarios)
13. CI/CD Pipeline (GitHub Actions setup)

**Usage:** Complete reference for all Docker operations.

#### `docs/DOCKER-HELP.json` (7.4 KB)
```
Location: ~/cyclecad/docs/DOCKER-HELP.json
Purpose:  Structured help entries for CLI integration
Format:   JSON
```

**Structure:**
- 15+ help entries
- Each entry has: id, title, category, description, commands, example, output
- 5 tips with categories
- Searchable for integration with CLI tools or IDEs

**Entries:**
- docker-start, docker-stop
- docker-logs, docker-status, docker-health
- docker-exec, docker-build
- docker-step-convert, docker-converter-api
- docker-restart, docker-env, docker-volume
- docker-cleanup, docker-logs-persistent
- docker-profile, docker-network

**Usage:** Integrate with CLI autocomplete or help systems.

#### `DOCKER-INFRASTRUCTURE.md` (This file, ~100 KB)
```
Location: ~/cyclecad/DOCKER-INFRASTRUCTURE.md
Purpose:  Complete build summary and file manifest
Audience: Project leads, documentation, archival
```

**Contents:**
- What was built (overview)
- File manifest
- Quick start copy-paste
- Key features (architecture, performance, security)
- Deployment paths
- Success metrics
- Next steps
- Commands reference
- Support info
- Version history

**Usage:** Project documentation and reference.

---

## File Relationships

```
docker-compose.yml
├── Dockerfile (builds cyclecad image)
│   └── nginx.conf (copied into image)
│
├── server/Dockerfile.converter (builds converter image)
│   └── server/requirements-converter.txt
│
├── server/Dockerfile.signaling (builds signaling image)
│   └── server/package.json (referenced, auto-created if missing)
│
└── .github/workflows/docker-test.yml (CI/CD)
    ├── tests/docker-tests.sh (runs tests)
    │   └── docker-compose commands (uses docker-compose.yml)
    │
    └── Docker build/push commands (uses Dockerfiles)
```

---

## Size Summary

| File | Size | Type |
|------|------|------|
| Dockerfile | 1.7 KB | Configuration |
| server/Dockerfile.converter | 1.5 KB | Configuration |
| server/Dockerfile.signaling | 624 B | Configuration |
| nginx.conf | 7.8 KB | Configuration |
| docker-compose.yml | 5.7 KB | Configuration |
| server/requirements-converter.txt | 524 B | Dependency |
| tests/docker-tests.sh | 12 KB | Script |
| .github/workflows/docker-test.yml | 11 KB | Configuration |
| DOCKER-README.md | 14 KB | Documentation |
| docs/DOCKER-TUTORIAL.md | 19 KB | Documentation |
| docs/DOCKER-HELP.json | 7.4 KB | Reference |
| DOCKER-INFRASTRUCTURE.md | (this) | Documentation |
| **TOTAL** | **~110 KB** | **Code + Docs** |

---

## Image Build Sizes

| Image | Base | Size | Services |
|-------|------|------|----------|
| cyclecad | nginx:alpine | 15 MB | Web app (port 8080) |
| cyclecad-converter | python:3.11-slim | 500 MB | STEP converter (port 8787) |
| cyclecad-signaling | node:20-alpine | 250 MB | WebSocket (port 8788) |
| **Total** | — | **765 MB** | **3 services** |

---

## Getting Started

**Step 1: Review Files**
1. Read DOCKER-README.md (10 min)
2. Skim DOCKER-INFRASTRUCTURE.md (5 min)

**Step 2: Start Services**
```bash
cd ~/cyclecad
docker-compose up -d
docker-compose ps
```

**Step 3: Test**
```bash
bash tests/docker-tests.sh
```

**Step 4: Access Apps**
- cycleCAD: http://localhost:8080
- Converter API: http://localhost:8787/docs
- Signaling: ws://localhost:8788

**Step 5: Learn More**
- Command reference: DOCKER-README.md
- Detailed guide: docs/DOCKER-TUTORIAL.md
- Help entries: docs/DOCKER-HELP.json

---

## Support

- **Issues**: https://github.com/vvlars-cmd/cyclecad/issues
- **Docs**: All files in this directory
- **Contact**: vvlars@googlemail.com

---

Generated: 2026-03-31
Version: 0.8.6
