# Deployment Guide

> Three deploy modes — static, full Docker, embedded. Plus production
> targets (Cloudflare Pages, Fly.io, Kubernetes).

## 1. Static-only (no backend)

The simplest mode. The kernel falls back to localStorage for the meter.

```bash
git clone https://github.com/vvlars-cmd/cyclecad-suite.git
cd cyclecad-suite
make serve              # python3 -m http.server 8765
```

Visit:
- http://localhost:8765/apps/cyclecad/
- http://localhost:8765/apps/admin/         *(read-only, no real ledger)*
- http://localhost:8765/tests/

Use this for kernel + widget development. Nothing to install, nothing
to break.

## 2. Full Docker stack (recommended)

Brings up Postgres + Redis + MinIO + meter + bridge + apps.

```bash
make up                 # docker compose up -d --build
make health             # smoke-test every service
make logs               # tail meter
make down               # stop everything
```

Services and ports:

| Service | Port | Purpose |
|---|---|---|
| `apps` (nginx) | 8080 | static `/apps` + `/tests` + proxies `/api` to meter |
| `meter` (Fastify) | 8787 | the real REST surface |
| `bridge` (Python) | 8788 | LinuxCNC mock WS — Pentacad |
| `postgres` | 5432 | ledger + identity |
| `redis` | 6379 | sessions + rate limit |
| `minio` | 9000 / 9001 | S3-compatible blob store |

Visit http://localhost:8080/apps/cyclecad/ — the apps are now backed
by the real meter. The footer of the admin app shows `meter: up · db: up`.

### 2.1 Required env vars

`docker-compose.yml` ships with sane dev defaults. For production:

```bash
# .env (next to docker-compose.yml)
POSTGRES_PASSWORD=<long random>
ADMIN_KEY=<long random — replace rk_dev_local>
S3_BUCKET=cyclecad-prod
S3_ACCESS_KEY=<…>
S3_SECRET_KEY=<…>
REDIS_PASSWORD=<long random>
LOG_LEVEL=info
LEDGER_ENFORCE=false   # set true at Phase 10 to gate insufficient balances
```

### 2.2 Persistence

Volumes:
- `postgres-data` — the ledger
- `minio-data` — uploaded files
- `redis-data` — sessions

Back them up daily:

```bash
docker compose exec postgres pg_dump -U cyclecad cyclecad \
  > /backups/cyclecad-$(date +%F).sql
docker run --rm -v cyclecad_minio-data:/data alpine \
  tar czf /backups/minio-$(date +%F).tar.gz /data
```

Restore is the inverse — `psql … < backup.sql` and `tar xzf … -C /data`.

## 3. Embedded mode

cycleCAD widgets can drop into another web app via `<iframe>` + postMessage:

```html
<iframe id="cyclecad" src="https://cyclecad.com/apps/cyclecad/?embed=1"
        style="width:100%;height:600px;border:0"></iframe>
<script>
  document.getElementById('cyclecad').addEventListener('load', () => {
    document.getElementById('cyclecad').contentWindow.postMessage({
      kind: 'load-model',
      url:  'https://my-cdn/widget.step',
    }, '*');
  });
</script>
```

The cycleCAD shell listens for postMessage events and dispatches them
through the same `dispatch(action)` system the in-app menus use.

## 4. Production targets

### 4.1 Cloudflare Pages + Fly.io meter (Phase 8 plan)

```
Static (Cloudflare Pages):
  apps/, shared/, widgets/, tests/    ← built-in CDN, free SSL, $0
                              ↓
                          /api proxied to:
                              ↓
Fly.io app:
  meter container             ← cheap autoscale ($5-20/mo)
  Fly Postgres (managed)
  Tigris S3 / R2

Pentacad bridge:
  on-prem, customer's machine ← Rockhopper integration
```

Pricing: ~$0 fixed (Pages free) + ~$5-20/mo (Fly meter) + per-request DB.

### 4.2 Self-hosted (single VM)

For an enterprise customer, single 4-vCPU / 16GB / 100GB-SSD VM is enough
for ~50 concurrent users:

```bash
# Provision (Ubuntu 22.04):
sudo apt update && sudo apt install -y docker.io docker-compose-v2
git clone https://github.com/vvlars-cmd/cyclecad-suite.git /opt/cyclecad-suite
cd /opt/cyclecad-suite

cat > .env <<EOF
POSTGRES_PASSWORD=$(openssl rand -base64 32)
ADMIN_KEY=$(openssl rand -base64 32)
S3_BUCKET=cyclecad
S3_ACCESS_KEY=$(openssl rand -base64 16)
S3_SECRET_KEY=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
EOF

# Bring up + start on boot:
docker compose up -d --build
sudo systemctl enable docker
```

Add a TLS terminator in front (nginx-proxy + acme-companion or Caddy):

```caddy
# Caddyfile
cyclecad.acme.local {
  reverse_proxy localhost:8080
}
```

### 4.3 Kubernetes (large deployments)

Each Docker service maps 1:1 to a Deployment + Service. Use the
Postgres operator (e.g., zalando/postgres-operator) for HA.
Helm chart is on the roadmap (Phase 9).

## 5. Scaling notes

| Pressure point | First sign | First fix |
|---|---|---|
| Meter CPU | charge p99 > 50ms | scale meter horizontally — it's stateless |
| Postgres | ledger inserts > 1k/s | partition `ledger` by month, then by tenant |
| Redis | session lookups slow | redis cluster |
| MinIO/S3 | upload throughput | switch to R2 / S3 native |
| Apps (nginx) | high egress | put Cloudflare in front |

The kernel is designed so widgets do most of the compute on the client.
The meter container should never be CPU-bound until ledger inserts top
10k/s — and that's a 100M call/day system, well past first product fit.

## 6. Monitoring

Phase 8 wires:

- Prometheus exporter on `/api/metrics` (currently 404 — Phase 8)
- Grafana dashboard packs (suite/, ledger/, infra/)
- Alert rules (chain mismatched, balance < 10% of monthly burn, p95 > SLA)

Until then, `admin-realtime` + `admin-health` are the operator's eyes.

## 7. Backups & disaster recovery

See [`ADMIN-GUIDE.md §6`](ADMIN-GUIDE.md#6-backups) for the runbook.
TL;DR: nightly `pg_dump`, weekly chain verify on a restored copy,
30-day retention to `/backups/` then offsite.

## 8. Updating

```bash
cd /opt/cyclecad-suite
git pull
docker compose pull            # if you're using prebuilt images
docker compose up -d --build   # rebuild local services
make health                    # verify
```

Schema migrations apply automatically — `server/meter/schema.sql` is
idempotent and runs on every meter container boot.

## 9. Hardening checklist (before exposing to internet)

- [ ] Long random `ADMIN_KEY` (and rotated)
- [ ] Strong `POSTGRES_PASSWORD` / `REDIS_PASSWORD`
- [ ] TLS in front (Caddy / nginx-proxy)
- [ ] Postgres + Redis NOT exposed on the public network
- [ ] MinIO accessed only via signed URLs from the meter
- [ ] Daily backups, weekly restore tests
- [ ] Audit chain verified weekly (cron'd `curl … audit/verify | jq`)
- [ ] Phase 3 — OAuth wired, single admin key retired
- [ ] Phase 9 — SSO for enterprise customers
