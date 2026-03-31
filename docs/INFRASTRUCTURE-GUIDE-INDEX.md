# cycleCAD & ExplodeView Infrastructure Guide Index

Comprehensive documentation for deploying, testing, and maintaining Docker infrastructure and HTTPS configuration.

## Quick Navigation

### Docker & Local Development

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[DOCKER-QUICK-TEST.md](./DOCKER-QUICK-TEST.md)** | Get Docker infrastructure running locally | 10 min |
| **[scripts/test-docker.sh](../scripts/test-docker.sh)** | Automated testing of all services | 5 min to run |
| **[scripts/dev-setup.sh](../scripts/dev-setup.sh)** | One-command dev environment setup | 3 min to run |
| **[DOCKER-TUTORIAL.md](./DOCKER-TUTORIAL.md)** | Deep dive into containerization | 20 min |

### HTTPS & GitHub Pages

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[HTTPS-SETUP.md](../../exploreview/docs/HTTPS-SETUP.md)** | Enable HTTPS on exploreview.com | 15 min |
| DNS Configuration Examples | Step-by-step for GoDaddy, Namecheap, Google Domains | 5 min |
| Testing Checklist | Verify HTTPS is working correctly | 5 min |

### Development & Integration

| Document | Purpose | Time to Read |
|----------|---------|--------------|
| **[DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md)** | Architecture and codebase overview | 30 min |
| **[MCP-SERVER.md](./MCP-SERVER.md)** | Integration with AI via MCP | 15 min |
| **[CLI-INTEGRATION.md](./CLI-INTEGRATION.md)** | Command-line interface | 10 min |
| **[API-SERVER.md](./API-SERVER.md)** | REST API endpoints | 15 min |

## Getting Started (5 Minutes)

### Quick Start for Docker

```bash
# Clone and setup
cd ~/cyclecad
chmod +x scripts/*.sh

# Run automated tests (all Docker services)
./scripts/test-docker.sh

# Or start development environment
./scripts/dev-setup.sh

# Expected output:
# ✓ All tests passed!
# Services running at:
#   - cyclecad: http://localhost:8080/app/
#   - converter: http://localhost:8787/health
#   - signaling: http://localhost:8788/health
```

### Quick Start for HTTPS

```bash
# Read the setup guide
cat ~/exploreview/docs/HTTPS-SETUP.md

# Key steps:
# 1. Update DNS at your registrar (5-30 min)
# 2. Verify with: dig exploreview.com
# 3. Enable "Enforce HTTPS" in GitHub Settings
# 4. Test with: curl -I https://exploreview.com
```

## Common Tasks

### Docker Tasks

| Task | Command |
|------|---------|
| Test all services | `./scripts/test-docker.sh` |
| Start dev environment | `./scripts/dev-setup.sh` |
| View real-time logs | `docker-compose logs -f` |
| Stop all services | `docker-compose down` |
| Full cleanup | `docker-compose down -v` |
| Rebuild images | `docker-compose build --no-cache` |
| Check service health | `docker-compose ps` |
| Enter service shell | `docker-compose exec cyclecad sh` |

### HTTPS Tasks

| Task | Command |
|------|---------|
| Check DNS status | `dig exploreview.com` |
| Verify certificate | `curl -I https://exploreview.com` |
| Check cert expiry | `echo \| openssl s_client -servername exploreview.com -connect exploreview.com:443 2>/dev/null \| openssl x509 -noout -dates` |
| Test SSL validity | `openssl s_client -connect exploreview.com:443 -servername exploreview.com` |
| Monitor DNS globally | Visit: https://www.whatsmydns.net/ → search `exploreview.com` |

## File Structure

```
cyclecad/
├── docs/
│   ├── DOCKER-QUICK-TEST.md         ← Start here for Docker
│   ├── DOCKER-TUTORIAL.md           ← Deep dive into containers
│   ├── INFRASTRUCTURE-GUIDE-INDEX.md ← You are here
│   ├── DEVELOPER-GUIDE.md           ← Architecture overview
│   ├── MCP-SERVER.md                ← AI integration
│   ├── CLI-INTEGRATION.md           ← Command-line tools
│   ├── API-SERVER.md                ← REST API docs
│   └── [other docs...]
│
├── scripts/
│   ├── test-docker.sh               ← Automated Docker testing (executable)
│   └── dev-setup.sh                 ← One-command dev setup (executable)
│
├── server/
│   ├── api-server.js                ← REST API server
│   ├── mcp-server.js                ← MCP integration
│   ├── Dockerfile.converter         ← STEP→GLB converter
│   └── Dockerfile.signaling         ← WebSocket signaling
│
├── docker-compose.yml               ← All services definition
├── Dockerfile                       ← Main app container
└── package.json

exploreview/
├── docs/
│   ├── HTTPS-SETUP.md               ← Start here for HTTPS
│   ├── CNAME                        ← GitHub Pages domain (verified)
│   ├── demo/                        ← 3D viewer app
│   └── [other assets...]
│
└── [other files...]
```

## Service Architecture

```
┌─────────────────────────────────────────────────────┐
│           User Browser (localhost:8080)              │
└─────────────────────────────────────────────────────┘
            ↓                    ↓
┌──────────────────┐    ┌──────────────────┐
│  Web App         │    │  3D Viewer       │
│  (nginx)         │    │  (Three.js)      │
│  Port 8080       │    │                  │
│  Files: /docs/   │    │  Feature panels  │
└──────────────────┘    └──────────────────┘
      ↓                        ↓
      ├────────────────────────┤
      ↓                        ↓
┌──────────────────┐    ┌──────────────────┐
│  Converter       │    │  Signaling       │
│  (FastAPI)       │    │  (Node.js)       │
│  Port 8787       │    │  Port 8788       │
│  STEP→GLB        │    │  WebSocket       │
│  4 GB memory     │    │  Collab signals  │
└──────────────────┘    └──────────────────┘
   OpenCascade.js       Redis (optional)
```

## Troubleshooting Quick Reference

### Docker Won't Start

```bash
# Check Docker is running
docker ps

# If not running: start Docker Desktop (macOS/Windows) or:
sudo systemctl start docker (Linux)

# Check for port conflicts
lsof -i :8080
lsof -i :8787
lsof -i :8788

# Free up ports or change in docker-compose.yml
```

### Health Checks Failing

```bash
# View detailed logs
docker-compose logs converter

# Check service is listening
curl http://localhost:8787/health
curl http://localhost:8788/health

# Increase memory if converter is OOM
# Docker Desktop Settings → Resources → Memory → 8GB+
```

### HTTPS Certificate Not Appearing

```bash
# Verify DNS is propagated first
dig exploreview.com | grep "185.199"

# Check CNAME file exists
cat docs/CNAME

# If DNS OK, wait 15-20 minutes for Let's Encrypt
# Then try removing/re-adding custom domain in GitHub Settings

# Monitor: curl -s https://api.github.com/repos/vvlars-cmd/exploreview/pages | jq .
```

### Test Script Failing

```bash
# Run with verbose mode to see what's failing
docker-compose logs -f

# Skip build if images already exist
./scripts/test-docker.sh --skip-build

# Clean rebuild
./scripts/test-docker.sh --cleanup
docker-compose build --no-cache
./scripts/test-docker.sh
```

## Performance Benchmarks

| Operation | Expected Time |
|-----------|----------------|
| Docker build (cold) | 5-10 min |
| Service startup | 30 sec |
| Health checks | 10 sec |
| Full test suite | 2-3 min |
| Dev server start | 5 sec |
| DNS propagation | 5 min - 48 hours |
| HTTPS cert issue | 5-15 min after DNS |

## Environment Variables

### Docker Compose (docker-compose.yml)

```bash
CONVERTER_URL=http://converter:8787
SIGNALING_URL=ws://signaling:8788
LOG_LEVEL=info
WORKERS=2
MAX_FILE_SIZE=500
TIMEOUT=300
```

### Dev Setup (dev-setup.sh)

```bash
DEV_PORT=8000          # Port for local dev server
OPEN_BROWSER=true      # Auto-open browser
USE_DOCKER=false       # Use Docker instead of local
CLEAN_INSTALL=false    # Remove node_modules
```

## Monitoring & Maintenance

### Regular Checks

```bash
# Daily: Monitor logs
docker-compose logs -f --tail 50

# Weekly: Check resource usage
docker stats

# Monthly: Verify HTTPS certificate
curl -I https://exploreview.com

# Monthly: Check GitHub Pages status
curl -I https://api.github.com/repos/vvlars-cmd/exploreview/pages
```

### Automated Monitoring (Optional)

Create a cron job to monitor services:

```bash
# Edit crontab
crontab -e

# Add: Check services every hour
0 * * * * cd ~/cyclecad && docker-compose ps | grep -q unhealthy && \
  echo "⚠️ Service unhealthy" | mail -s "cycleCAD Alert" your-email@example.com

# Add: Check HTTPS certificate monthly
0 0 1 * * echo | openssl s_client -servername exploreview.com \
  -connect exploreview.com:443 2>/dev/null | \
  openssl x509 -noout -dates | mail -s "ExploreView HTTPS Status" your-email@example.com
```

## Related Documentation

- **ExplodeView**: See exploreview/docs/ for 3D viewer documentation
- **cycleCAD**: See cyclecad/docs/ for modeler documentation
- **Deployment**: See docker-compose.yml comments for production config
- **API**: See server/api-server.js for endpoint definitions
- **CLI**: See bin/cyclecad-cli.js for CLI tool usage

## Support & Resources

| Resource | Link |
|----------|------|
| Docker Compose Docs | https://docs.docker.com/compose/ |
| GitHub Pages HTTPS | https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https |
| Let's Encrypt | https://letsencrypt.org/ |
| DNS Checker | https://www.whatsmydns.net/ |
| SSL Validator | https://www.ssllabs.com/ssltest/ |

## Last Updated

- **Infrastructure**: 2026-03-31
- **HTTPS Setup**: 2026-03-31
- **Docker Config**: 2026-03-26

## Contributing

When updating these docs:

1. Update this index if adding new guide
2. Include time estimates for readers
3. Provide copy-paste commands for quick start
4. Add troubleshooting for new features
5. Test all commands before committing

---

**Questions?** Check the relevant document above or open an issue on GitHub.
