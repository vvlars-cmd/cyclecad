#!/bin/bash
#
# cycleCAD Docker Health Check Script
# Verifies all services are running and healthy
#
# Usage:
#   ./scripts/docker-health-check.sh
#   ./scripts/docker-health-check.sh --verbose
#   ./scripts/docker-health-check.sh --timeout 60
#
# Exit codes:
#   0 — All services healthy
#   1 — One or more services unhealthy
#   2 — Docker not available
#

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
VERBOSE=false
TIMEOUT=30
INTERVAL=5

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --verbose|-v)
      VERBOSE=true
      shift
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--verbose] [--timeout SECONDS]"
      exit 1
      ;;
  esac
done

# Check if docker is available
if ! command -v docker &> /dev/null; then
  echo -e "${RED}Error: Docker is not installed or not in PATH${NC}"
  exit 2
fi

if ! command -v docker-compose &> /dev/null && ! command -v docker compose &> /dev/null; then
  echo -e "${RED}Error: Docker Compose is not installed or not in PATH${NC}"
  exit 2
fi

# Determine docker-compose command
if command -v docker-compose &> /dev/null; then
  DC_CMD="docker-compose"
else
  DC_CMD="docker compose"
fi

echo -e "${BLUE}=== cycleCAD Docker Health Check ===${NC}"
echo -e "${BLUE}Timeout: ${TIMEOUT}s, Interval: ${INTERVAL}s${NC}"
echo ""

# Service definitions
declare -A SERVICES=(
  [cyclecad]="cyclecad-app:80:/health"
  [converter]="cyclecad-converter:8787:/health"
  [signaling]="cyclecad-signaling:8788:/health"
)

# Check if docker-compose project is running
echo -e "${BLUE}Checking Docker Compose project status...${NC}"
if ! $DC_CMD ps --services &> /dev/null; then
  echo -e "${RED}Error: No Docker Compose project found. Run 'docker-compose up -d' first.${NC}"
  exit 1
fi

HEALTHY_COUNT=0
UNHEALTHY_COUNT=0
ELAPSED=0

# Check each service
echo ""
for SERVICE in "${!SERVICES[@]}"; do
  IFS=':' read -r CONTAINER PORT ENDPOINT <<< "${SERVICES[$SERVICE]}"

  echo -n "Checking ${SERVICE}... "

  # Check if container is running
  if ! docker ps --filter "name=${CONTAINER}" --format "{{.Names}}" | grep -q "^${CONTAINER}$"; then
    echo -e "${RED}FAILED${NC} (container not running)"
    UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
    continue
  fi

  # Try to connect to health endpoint
  HEALTH_URL="http://localhost:${PORT}${ENDPOINT}"
  RESPONSE=""

  ELAPSED=0
  while [ $ELAPSED -lt $TIMEOUT ]; do
    if RESPONSE=$(curl -s -f "$HEALTH_URL" 2>/dev/null); then
      # Check response status
      if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        echo -e "${GREEN}OK${NC}"
        HEALTHY_COUNT=$((HEALTHY_COUNT + 1))

        if [ "$VERBOSE" = true ]; then
          echo "  └─ Response: $RESPONSE"
        fi
        break
      else
        echo -e "${YELLOW}PARTIAL${NC} (responded but status not ok)"
        UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
        break
      fi
    fi

    ELAPSED=$((ELAPSED + INTERVAL))
    if [ $ELAPSED -lt $TIMEOUT ]; then
      sleep $INTERVAL
    fi
  done

  if [ $ELAPSED -ge $TIMEOUT ] && [ -z "$RESPONSE" ]; then
    echo -e "${RED}TIMEOUT${NC} (no response after ${TIMEOUT}s)"
    UNHEALTHY_COUNT=$((UNHEALTHY_COUNT + 1))
  fi
done

echo ""
echo -e "${BLUE}=== Summary ===${NC}"
echo -e "Healthy:   ${GREEN}${HEALTHY_COUNT}${NC}"
echo -e "Unhealthy: ${RED}${UNHEALTHY_COUNT}${NC}"
echo ""

# Check Docker Compose health status
if [ "$VERBOSE" = true ]; then
  echo -e "${BLUE}=== Docker Compose Status ===${NC}"
  $DC_CMD ps
  echo ""
fi

# Exit with appropriate code
if [ $UNHEALTHY_COUNT -gt 0 ]; then
  echo -e "${RED}Health check FAILED${NC}"
  exit 1
else
  echo -e "${GREEN}All services healthy!${NC}"
  exit 0
fi
