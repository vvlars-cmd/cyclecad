# Docker Quick Test Guide

## Overview

This guide walks you through testing the cycleCAD Docker Compose infrastructure locally. The setup includes:

- **cyclecad** (port 8080) — Main web application (nginx)
- **converter** (port 8787) — STEP/IGES to GLB conversion server (FastAPI)
- **signaling** (port 8788) — WebSocket signaling for real-time collaboration (Node.js)
- **explodeview** (port 3000) — Optional 3D viewer (nginx, requires profile flag)

## Prerequisites

Before starting, ensure you have:

- **Docker Desktop** installed and running (macOS/Windows) or **Docker + docker-compose** (Linux)
- **8 GB RAM** available (converter needs 4GB, app needs 512MB)
- **Ports 3000, 8080, 8787, 8788 free** (check with `lsof` or `netstat`)
- **curl** or Postman for testing API endpoints
- **wscat** for WebSocket testing (optional, install with `npm install -g wscat`)

### Check System Resources

```bash
# macOS/Linux: check available memory
free -h          # Linux
vm_stat           # macOS

# Check if ports are in use
lsof -i :8080
lsof -i :8787
lsof -i :8788

# Docker resources check
docker info | grep -E "Memory|CPUs"
```

## Quick Start (3 Minutes)

### 1. Start All Services

From the repository root:

```bash
cd ~/cyclecad
docker-compose up -d
```

This pulls images, builds containers, and starts all services in background mode.

### 2. Verify Services Are Running

```bash
# Check container status
docker-compose ps

# Expected output:
# NAME                STATUS              PORTS
# cyclecad-app        Up 30s (healthy)    0.0.0.0:8080->80/tcp
# cyclecad-converter  Up 25s (healthy)    0.0.0.0:8787->8787/tcp
# cyclecad-signaling  Up 20s (healthy)    0.0.0.0:8788->8788/tcp
```

### 3. Check Health Endpoints

```bash
# Web app
curl -I http://localhost:8080/

# Converter service
curl -I http://localhost:8787/health

# Signaling service
curl -I http://localhost:8788/health

# All should return 200 OK
```

### 4. Open in Browser

- **cycleCAD app:** http://localhost:8080/app/
- **ExplodeView (if enabled):** http://localhost:3000

## Testing Endpoints

### Web Application

```bash
# Main app (should return HTML)
curl -s http://localhost:8080/app/ | head -20

# Health check
curl http://localhost:8080/health
# Returns: {"status": "ok", "version": "0.8.6"}
```

### STEP Conversion Server

```bash
# Health check
curl http://localhost:8787/health
# Returns: {"status": "ok", "queue": 0, "workers": 2}

# Convert a STEP file (if you have one)
curl -X POST http://localhost:8787/convert \
  -F "file=@example.step" \
  -o output.glb

# Get conversion metadata
curl -X POST http://localhost:8787/convert/metadata \
  -F "file=@example.step"
```

### WebSocket Signaling

```bash
# Install wscat if needed
npm install -g wscat

# Connect to signaling server
wscat -c ws://localhost:8788

# In wscat session, type:
{"method": "ping"}
{"method": "join_room", "room": "test-room"}
{"method": "send_message", "data": {"text": "hello"}}

# Press Ctrl+C to exit
```

## Viewing Logs

```bash
# View all logs (last 50 lines)
docker-compose logs --tail 50

# Follow logs in real-time
docker-compose logs -f

# Follow specific service logs
docker-compose logs -f converter

# View last 100 lines from cyclecad service
docker-compose logs --tail 100 cyclecad

# Filter by timestamp (last 30 minutes)
docker-compose logs --since 30m

# Save logs to file
docker-compose logs > docker-logs.txt
```

## Troubleshooting

### Port Already in Use

If you get "Address already in use" errors:

```bash
# Find what's using the port
lsof -i :8080
lsof -i :8787

# Kill the process
kill -9 <PID>

# Or change ports in docker-compose.yml
# Edit the "ports:" section, e.g., "8090:80" instead of "8080:80"
```

### Out of Memory

If the converter crashes with out-of-memory errors:

```bash
# Check Docker Desktop memory allocation
docker info | grep Memory

# Increase memory:
# macOS/Windows: Open Docker Desktop > Settings > Resources > Memory
# Set to 8GB or more

# Or reduce converter container limit in docker-compose.yml:
# limits:
#   memory: 2G    # Changed from 4G
# reservations:
#   memory: 1G    # Changed from 2G
```

### Build Fails or Images Corrupt

```bash
# Rebuild all images from scratch
docker-compose build --no-cache

# Remove dangling images (free up space)
docker image prune

# Full clean (removes stopped containers, unused networks)
docker system prune
```

### Service Won't Start / Health Check Failing

```bash
# View detailed container logs
docker-compose logs converter

# Inspect service health history
docker-compose ps

# Manually check if service is responding
docker-compose exec converter curl http://localhost:8787/health

# Shell into container for debugging
docker-compose exec cyclecad sh
# Inside container:
ps aux              # View running processes
curl localhost      # Test from inside
exit
```

### Converter Hangs on Large STEP Files

The converter can take 5-10 minutes for 100MB+ files:

```bash
# Monitor progress via logs
docker-compose logs -f converter

# If it truly hangs (no output for 5+ minutes), increase timeout:
# In docker-compose.yml, under converter healthcheck:
# timeout: 30s     # Changed from 10s
```

## Performance Testing

### Benchmark Conversion Speed

```bash
# Time a single conversion
time curl -X POST http://localhost:8787/convert \
  -F "file=@large-file.step" \
  -o output.glb

# Example output:
# real    2m 15s   (2 minutes 15 seconds)
# user    0m 0.123s
# sys     0m 0.045s
```

### Load Test Signaling

```bash
# With Apache Bench (install: brew install httpd)
ab -n 100 -c 10 http://localhost:8080/

# Expected: ~1000-2000 requests/sec for the web server
```

### Monitor Resource Usage

```bash
# View real-time CPU and memory per container
docker stats

# Specific service
docker stats cyclecad-converter

# Example output:
# CONTAINER           CPU %   MEM USAGE / LIMIT
# cyclecad-converter  45.2%   2.1G / 4G
# cyclecad-app       0.5%    45M / 512M
# cyclecad-signaling 1.2%    95M / 512M
```

## Environment Variables

You can override default settings without editing docker-compose.yml:

```bash
# Start with custom settings
CONVERTER_URL=http://localhost:8787 \
MAX_FILE_SIZE=1000 \
docker-compose up -d

# Or create a .env file
cat > .env << EOF
CONVERTER_URL=http://converter:8787
SIGNALING_URL=ws://signaling:8788
LOG_LEVEL=debug
WORKERS=4
MAX_FILE_SIZE=1000
EOF

docker-compose up -d
```

Available variables:
- `CONVERTER_URL` — URL of converter service (default: `http://converter:8787`)
- `SIGNALING_URL` — URL of signaling service (default: `ws://signaling:8788`)
- `LOG_LEVEL` — Logging level: `debug`, `info`, `warn`, `error` (default: `info`)
- `WORKERS` — Number of converter workers (default: 2)
- `MAX_FILE_SIZE` — Max file size in MB (default: 500)
- `TIMEOUT` — Request timeout in seconds (default: 300)

## Advanced: Starting with ExplodeView

To include the ExplodeView 3D viewer service:

```bash
docker-compose --profile with-explodeview up -d

# This will start all 4 services instead of 3
docker-compose ps

# Open ExplodeView at http://localhost:3000
```

## Cleanup

### Stop All Services (Keep Data)

```bash
docker-compose stop

# Restart without rebuilding
docker-compose start
```

### Stop and Remove Containers (Keep Images)

```bash
docker-compose down
```

### Full Cleanup (Remove Everything)

```bash
# Remove all containers, networks, and volumes
docker-compose down -v

# Also remove built images (if you want fresh builds)
docker-compose down -v --rmi all
```

## Next Steps

Once services are running:

1. **Open the app:** http://localhost:8080/app/
2. **Test sketch tools:** Create a 2D rectangle, extrude it
3. **Import a STEP file:** Use the import dialog (if you have a .step file)
4. **Check collaboration:** Open multiple browser tabs, edit in one tab, see changes in others
5. **Export geometry:** Draw something and export as STL/glTF
6. **View logs:** `docker-compose logs -f` to watch real-time activity

## Common Issues Reference

| Issue | Solution |
|-------|----------|
| `Cannot connect to Docker` | Start Docker Desktop / `sudo systemctl start docker` (Linux) |
| `Port 8080 already in use` | Change port in docker-compose.yml or kill process using port |
| `Converter out of memory` | Increase Docker memory to 8GB |
| `Health check failing` | Check logs: `docker-compose logs converter` |
| `STEP file not converting` | Check file size (<500MB default), check logs for errors |
| `Can't connect to signaling` | Ensure port 8788 is free, check firewall |
| `Services fail to start` | Run `docker-compose build --no-cache` to rebuild |

## Getting Help

- **View full logs:** `docker-compose logs --all`
- **Inspect container details:** `docker inspect cyclecad-app`
- **Check Docker version:** `docker --version`
- **Full docker-compose reference:** See `docker-compose.yml` comments or run `docker-compose --help`

