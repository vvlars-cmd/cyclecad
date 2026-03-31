# cycleCAD Docker Testing Infrastructure

Comprehensive testing scripts and utilities for the cycleCAD multi-service Docker deployment.

## Overview

This testing infrastructure provides three complementary approaches to validate Docker services:

1. **Bash Health Check Script** — Quick CLI verification of service health
2. **Bash Integration Test Suite** — Comprehensive automated testing with JUnit XML output
3. **Browser Test Page** — Interactive visual testing with real-time status monitoring

## Quick Start

### Run a Quick Health Check

```bash
./scripts/docker-health-check.sh
```

Output shows all services with status indicators:
```
✓ cyclecad (OK)
✓ converter (OK)
✓ signaling (OK)
```

### Run Full Integration Tests

```bash
./scripts/integration-test.sh
```

Automatically:
1. Starts Docker Compose services
2. Waits for all services to become healthy
3. Runs 20+ integration tests
4. Generates JUnit XML results
5. Stops services (cleanup)

### Open Browser Test Page

1. Start Docker services: `docker-compose up -d`
2. Open browser: http://localhost:8080/app/tests/docker-integration-test.html
3. Click "Run All Tests" to execute comprehensive test suite
4. Export results as JSON or HTML

## Services Being Tested

| Service | Port | Role | Health Endpoint |
|---------|------|------|-----------------|
| cyclecad | 8080 | Main web app (nginx) | GET /health |
| converter | 8787 | STEP→GLB conversion (FastAPI) | GET /health |
| signaling | 8788 | WebSocket signaling (Node.js) | GET /health |

## Test Categories

### 1. Health Checks
- Service availability
- Health endpoint responsiveness
- Response timeout handling

### 2. Headers & Security
- CORS headers (Access-Control-Allow-*)
- COOP/COEP headers (Cross-Origin policies)
- Security headers (CSP, X-Frame-Options, etc.)
- Gzip compression

### 3. Static Content
- HTML file serving
- JavaScript/CSS asset loading
- Cache-Control headers
- WASM file handling

### 4. API Endpoints
- `/health` endpoint JSON response
- `/api/` routes via proxy
- `/converter/` routes via proxy
- Content-Type validation

### 5. SPA Routing
- Fallback to index.html for unknown routes
- App routing (trailing slash handling)
- 404 handling for static files

### 6. WebSocket
- WebSocket upgrade negotiation
- Connection establishment
- Long-running connections

### 7. STEP Converter
- Converter service health
- Conversion endpoint availability
- File upload handling

### 8. Proxy Routing
- nginx proxy to converter service
- nginx proxy to signaling service
- Header forwarding
- Timeout handling

## Script Details

### docker-health-check.sh

Quick CLI health check of all services.

**Usage:**
```bash
./scripts/docker-health-check.sh [OPTIONS]

OPTIONS:
  --verbose    Show detailed response data
  --timeout N  Wait up to N seconds per service (default: 30)
```

**Output:**
- Color-coded service status (✓ green, ✗ red)
- Response timing
- JSON health responses (with --verbose)
- Exit code 0 for all healthy, 1 for failures

**Example Output:**
```
=== cycleCAD Docker Health Check ===
Timeout: 30s, Interval: 5s

Checking cyclecad... OK
  └─ Response: {"status":"ok","app":"cyclecad","version":"0.8.6","timestamp":"1711869600"}
Checking converter... OK
Checking signaling... OK

=== Summary ===
Healthy:   3
Unhealthy: 0

All services healthy!
```

### integration-test.sh

Comprehensive automated test suite with full lifecycle management.

**Usage:**
```bash
./scripts/integration-test.sh [OPTIONS]

OPTIONS:
  --no-cleanup  Keep services running after tests
  --output FILE Write JUnit XML results to FILE (default: test-results.xml)
```

**Lifecycle:**
1. Checks Docker availability
2. Starts docker-compose (detached)
3. Waits up to 120s for all services to be healthy
4. Runs 20+ integration tests
5. Generates JUnit XML report
6. Stops services (unless --no-cleanup)

**Tests Include:**
- Health endpoints (3 tests)
- CORS headers (2 tests)
- Static content serving (2 tests)
- Cache headers (2 tests)
- Converter endpoints (2 tests)
- Signaling endpoints (1 test)
- Proxy routing (2 tests)
- SPA routing (2 tests)
- Gzip compression (2 tests)
- WebSocket upgrade (1 test)

**Output:**
```
=== cycleCAD Docker Integration Test Suite ===
Starting Docker Compose services...
Waiting for services to be healthy...
All services healthy

Running integration tests...

✓ GET /health (main app) (156ms)
✓ GET /health (converter) (234ms)
✓ GET /health (signaling) (89ms)
...

=== Test Summary ===
Total:    20
Passed:   19
Failed:   1

Results written to: test-results.xml
```

**JUnit XML Format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="cycleCAD Docker Integration Tests" tests="20" failures="1" time="2500">
  <testsuite name="Docker Services" tests="20" failures="1" time="2500">
    <testcase name="GET /health (main app)" time="156"/>
    <testcase name="GET /health (converter)" time="234">
      <failure>Connection refused</failure>
    </testcase>
    ...
  </testsuite>
</testsuites>
```

### docker-integration-test.html

Interactive browser-based test page with real-time visualization.

**Access:**
1. Start services: `docker-compose up -d`
2. Open: http://localhost:8080/app/tests/docker-integration-test.html
3. Browser auto-loads and runs quick health check on page load

**Features:**
- Real-time status updates with visual indicators
- Live test execution with progress
- Color-coded results (green pass, red fail, yellow pending)
- Statistics dashboard (total, passed, failed, success rate)
- Export capabilities:
  - **Export as JSON** — Machine-readable test results
  - **Export as HTML** — Standalone report page
  - **Copy to Clipboard** — Paste into docs/issues

**Test Buttons:**
- **Run All Tests** — Execute complete 25+ test suite
- **Quick Health Check** — Just service status (30s)
- **Clear Results** — Reset all test output

**Test Suites:**
1. Service Status — Direct connectivity to services
2. Headers & Security — CORS, COOP, COEP, gzip
3. Endpoint Tests — /health, /api/, /converter/
4. Proxy Routing — nginx proxy validation
5. WebSocket & Real-time — WS connection tests
6. STEP Converter — Converter-specific endpoints

**Visual Indicators:**
- Green (✓) — Test passed
- Red (✗) — Test failed
- Yellow (●) — Test pending/loading
- Colored boxes — Service status cards

## nginx.conf Validation

The nginx configuration at `/sessions/sharp-modest-allen/mnt/cyclecad/nginx.conf` includes:

### Security Headers
- ✓ `Cross-Origin-Opener-Policy: same-origin`
- ✓ `Cross-Origin-Embedder-Policy: require-corp`
- ✓ `X-Content-Type-Options: nosniff`
- ✓ `X-Frame-Options: SAMEORIGIN`
- ✓ Content Security Policy with CDN allowlist

### CORS
- ✓ `Access-Control-Allow-Origin: *`
- ✓ `Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT, DELETE, PATCH`
- ✓ `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-API-Key`

### Compression
- ✓ Gzip enabled for 15+ content types
- ✓ Compression level 6 (balanced)
- ✓ Applies to JS, CSS, JSON, WASM, SVG, glTF

### Caching
- ✓ **Immutable assets** (1 year): .js, .css, .wasm, .ttf, .woff, .eot
- ✓ **3D models** (7 days): .glb, .gltf, .stl, .obj
- ✓ **Documents** (7 days): .pptx, .docx, .xlsx, .pdf
- ✓ **HTML** (no cache): Always validate
- ✓ **JSON** (5 min): Manifest files
- ✓ **Service Worker** (no cache): Always fresh

### Routing
- ✓ Health endpoint at `/health`
- ✓ API proxy: `/api/` → converter:8787
- ✓ Converter proxy: `/converter/` → converter:8787
- ✓ WebSocket proxy: `/ws/` → signaling:8788
- ✓ Signaling proxy: `/signal/` → signaling:8788
- ✓ SPA fallback: `/app/` → index.html
- ✓ Root fallback: `/` → index.html
- ✓ Max upload: 500M (STEP files)

### Client Limits
- ✓ Max upload size: 500MB (for large STEP files)
- ✓ Gzip min length: 500 bytes
- ✓ Proxy timeouts: 300s (converter), 3600s (signaling)

## Common Issues & Solutions

### "Docker not found"
**Problem:** docker or docker-compose not installed
**Solution:** Install Docker Desktop or Docker Engine from docker.com

### "Services did not become healthy"
**Problem:** Services take too long to start
**Solution:** Run with increased timeout:
```bash
./scripts/docker-health-check.sh --timeout 60
```

### "Connection refused" in tests
**Problem:** Services started but not listening yet
**Solution:** Wait longer before testing:
```bash
sleep 10
./scripts/docker-health-check.sh
```

### "WebSocket timeout" in browser test
**Problem:** WebSocket endpoint not accessible from browser origin
**Solution:** Check nginx configuration routing at `/ws/` and `/signal/`

### "CORS errors in browser console"
**Problem:** Browser test page can't access converter service
**Solution:** Verify nginx CORS headers:
```bash
curl -H "Origin: http://localhost:8080" http://localhost:8080/converter/health -i
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Docker Tests

on: [push]

jobs:
  docker-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Install Docker
        uses: docker/setup-buildx-action@v2
      - name: Run integration tests
        run: ./scripts/integration-test.sh --output test-results.xml
      - name: Upload test results
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: test-results.xml
```

### Pre-deployment Checklist

Before deploying to production:

1. Run health check:
   ```bash
   ./scripts/docker-health-check.sh --verbose
   ```

2. Run integration tests:
   ```bash
   ./scripts/integration-test.sh
   ```

3. Open browser test page and verify all pass

4. Check nginx config:
   ```bash
   docker-compose exec cyclecad nginx -t
   ```

5. Monitor logs:
   ```bash
   docker-compose logs -f
   ```

## Performance Benchmarking

Test execution times (on healthy system):

| Test | Time |
|------|------|
| Health check | 3-5s |
| Quick health check (browser) | 5-10s |
| Full integration test suite | 30-60s |
| Full browser test suite | 2-5 min |

Expected service startup times:

| Service | First Start | Subsequent |
|---------|------------|------------|
| cyclecad | 5-10s | 2-3s |
| converter | 15-20s | 5-10s |
| signaling | 3-5s | 1-2s |

## Testing Best Practices

1. **Always cleanup:** Run integration tests without `--no-cleanup` to avoid port conflicts
2. **Check logs:** If test fails, inspect logs with `docker-compose logs -f SERVICE_NAME`
3. **Isolate issues:** Use health-check script first, then integration tests
4. **Browser tests last:** Use CLI tests first; browser tests are for validation only
5. **Export results:** Export test results for CI/CD and reporting
6. **Monitor services:** Keep `docker-compose logs -f` running during testing

## Troubleshooting

### View detailed logs:
```bash
docker-compose logs -f cyclecad
docker-compose logs -f converter
docker-compose logs -f signaling
```

### Restart specific service:
```bash
docker-compose restart converter
```

### Force rebuild:
```bash
docker-compose down -v
docker-compose up --build -d
```

### Check service status:
```bash
docker-compose ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

### Test endpoint directly:
```bash
curl -v http://localhost:8080/health
curl -v http://localhost:8787/health
curl -v http://localhost:8788/health
```

## File Locations

```
/sessions/sharp-modest-allen/mnt/cyclecad/
├── docker-compose.yml                           # Docker service definitions
├── Dockerfile                                   # Main app container
├── nginx.conf                                   # nginx routing & headers
├── server/
│   ├── Dockerfile.converter                     # Converter service container
│   ├── Dockerfile.signaling                     # Signaling service container
│   ├── converter.py                             # STEP→GLB FastAPI server
│   └── signaling-server.js                      # WebSocket signaling server
├── scripts/
│   ├── docker-health-check.sh                   # Quick health check CLI
│   └── integration-test.sh                      # Full test suite with cleanup
├── app/
│   └── tests/
│       └── docker-integration-test.html         # Browser-based test page
└── DOCKER-TESTING.md                            # This file
```

## References

- [Docker Documentation](https://docs.docker.com/)
- [nginx Documentation](https://nginx.org/en/docs/)
- [FastAPI Health Checks](https://fastapi.tiangolo.com/)
- [Docker Compose Health Checks](https://docs.docker.com/compose/compose-file/compose-file-v3/#healthcheck)
- [Cross-Origin Resource Sharing](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [JUnit XML Format](https://github.com/junit-team/junit5/blob/main/platform-tests/src/test/resources/junit-platform-suite-engine/JUnit4SampleTest-result.xml)
