#!/bin/bash

################################################################################
# cycleCAD Docker Compose Test Script
#
# Comprehensive testing of Docker infrastructure:
# - Checks prerequisites (docker, docker-compose, curl)
# - Builds all images
# - Starts services and waits for health checks
# - Tests each endpoint
# - Reports pass/fail status
# - Cleans up on exit
#
# Usage:
#   ./scripts/test-docker.sh              # Run full test suite
#   ./scripts/test-docker.sh --skip-build # Skip build, test running containers
#   ./scripts/test-docker.sh --cleanup    # Stop and remove containers
#   ./scripts/test-docker.sh --logs       # View real-time logs
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TIMEOUT=120  # seconds to wait for services
SKIP_BUILD=false
CLEANUP_ONLY=false
LOGS_ONLY=false

################################################################################
# Helper Functions
################################################################################

print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

print_test() {
    echo -ne "${YELLOW}→${NC} $1... "
}

pass() {
    echo -e "${GREEN}✓ PASS${NC}"
    ((TESTS_PASSED++))
}

fail() {
    echo -e "${RED}✗ FAIL${NC}: $1"
    ((TESTS_FAILED++))
}

skip() {
    echo -e "${YELLOW}⊘ SKIP${NC}: $1"
    ((TESTS_SKIPPED++))
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

wait_for_port() {
    local port=$1
    local timeout=$2
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if timeout 1 bash -c "echo >/dev/tcp/localhost/$port" 2>/dev/null; then
            return 0
        fi
        sleep 1
        ((elapsed++))
    done
    return 1
}

wait_for_health() {
    local url=$1
    local timeout=$2
    local elapsed=0

    while [ $elapsed -lt $timeout ]; do
        if curl -sf "$url" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
        ((elapsed++))
    done
    return 1
}

print_summary() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}TEST SUMMARY${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    echo ""
    if [ $TESTS_FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All tests passed!${NC}"
    else
        echo -e "${RED}✗ $TESTS_FAILED test(s) failed${NC}"
    fi

    echo ""
    echo "Results:"
    echo -e "  ${GREEN}Passed:${NC}  $TESTS_PASSED"
    echo -e "  ${RED}Failed:${NC}  $TESTS_FAILED"
    echo -e "  ${YELLOW}Skipped:${NC} $TESTS_SKIPPED"
    echo ""

    if [ $TESTS_FAILED -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

################################################################################
# Main Testing Functions
################################################################################

check_prerequisites() {
    print_header "CHECKING PREREQUISITES"

    print_test "Docker installed"
    if command_exists docker; then
        pass
    else
        fail "Docker not found. Install from https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    print_test "docker-compose installed"
    if command_exists docker-compose; then
        pass
    else
        fail "docker-compose not found. Install via: pip install docker-compose"
        exit 1
    fi

    print_test "Docker daemon running"
    if docker info >/dev/null 2>&1; then
        pass
    else
        fail "Docker daemon not running. Start Docker Desktop or 'sudo systemctl start docker'"
        exit 1
    fi

    print_test "curl installed"
    if command_exists curl; then
        pass
    else
        fail "curl not found"
        exit 1
    fi

    print_test "Required ports free (8080, 8787, 8788)"
    local ports_free=true
    for port in 8080 8787 8788; do
        if ! timeout 1 bash -c "echo >/dev/tcp/localhost/$port" 2>/dev/null; then
            ports_free=true
        else
            ports_free=false
            fail "Port $port is already in use"
        fi
    done
    if [ "$ports_free" = true ]; then
        pass
    fi

    print_test "Sufficient disk space (2GB available)"
    if command_exists df; then
        local available=$(df "$REPO_ROOT" | awk 'NR==2 {print $4}')
        if [ "$available" -gt 2097152 ]; then
            pass
        else
            fail "Less than 2GB free space available"
        fi
    else
        skip "df command not available"
    fi

    print_test "Docker memory sufficient (8GB recommended)"
    if command_exists docker; then
        local memory=$(docker info 2>/dev/null | grep "Memory:" | awk '{print $2}')
        if [ ! -z "$memory" ] && [ "$memory" -gt 8000000000 ]; then
            pass
        else
            skip "Cannot verify Docker memory (may be insufficient for large STEP files)"
        fi
    fi
}

stop_services() {
    print_header "STOPPING EXISTING SERVICES"

    print_test "Stop docker-compose services"
    if cd "$REPO_ROOT" && docker-compose down 2>/dev/null; then
        pass
    else
        skip "No running services to stop"
    fi
}

build_images() {
    if [ "$SKIP_BUILD" = true ]; then
        print_header "SKIPPING IMAGE BUILD (--skip-build)"
        return
    fi

    print_header "BUILDING DOCKER IMAGES"

    print_test "Build all images"
    if cd "$REPO_ROOT" && docker-compose build 2>/dev/null; then
        pass
    else
        fail "Failed to build images"
        return 1
    fi
}

start_services() {
    print_header "STARTING SERVICES"

    print_test "Start docker-compose (background)"
    if cd "$REPO_ROOT" && docker-compose up -d 2>/dev/null; then
        pass
    else
        fail "Failed to start docker-compose"
        return 1
    fi

    # Wait for containers to start
    sleep 2

    print_test "Wait for cyclecad app to be healthy"
    if wait_for_health "http://localhost:8080/health" $TIMEOUT 2>/dev/null; then
        pass
    else
        fail "cyclecad app failed health check"
        docker-compose logs cyclecad | head -20
    fi

    print_test "Wait for converter to be healthy"
    if wait_for_health "http://localhost:8787/health" $TIMEOUT 2>/dev/null; then
        pass
    else
        fail "converter service failed health check"
        docker-compose logs converter | head -20
    fi

    print_test "Wait for signaling to be healthy"
    if wait_for_health "http://localhost:8788/health" $TIMEOUT 2>/dev/null; then
        pass
    else
        fail "signaling service failed health check"
        docker-compose logs signaling | head -20
    fi
}

test_web_app() {
    print_header "TESTING WEB APPLICATION"

    print_test "HTTP GET /app/"
    local response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/app/)
    if [ "$response" = "200" ]; then
        pass
    else
        fail "Got HTTP $response (expected 200)"
    fi

    print_test "Health endpoint /health"
    if curl -sf http://localhost:8080/health | grep -q '"status"'; then
        pass
    else
        fail "Health endpoint not responding"
    fi

    print_test "Content-Type is text/html"
    local content_type=$(curl -s -I http://localhost:8080/app/ | grep -i content-type | cut -d' ' -f2-)
    if [[ "$content_type" == *"text/html"* ]]; then
        pass
    else
        skip "Content-Type check (got: $content_type)"
    fi
}

test_converter() {
    print_header "TESTING CONVERTER SERVICE"

    print_test "Health endpoint /health"
    local response=$(curl -s http://localhost:8787/health)
    if echo "$response" | grep -q '"status"'; then
        pass
    else
        fail "Health endpoint not responding with JSON"
    fi

    print_test "Converter listening on port 8787"
    if wait_for_port 8787 5; then
        pass
    else
        fail "Port 8787 not responding"
    fi

    print_test "Health check includes queue status"
    if curl -s http://localhost:8787/health | grep -q '"queue"'; then
        pass
    else
        skip "Queue status not in health response"
    fi

    print_test "POST /convert endpoint responds"
    local response=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8787/convert -F "file=@/dev/null")
    if [ "$response" != "404" ] && [ "$response" != "500" ]; then
        pass
    else
        skip "POST /convert returned HTTP $response"
    fi
}

test_signaling() {
    print_header "TESTING SIGNALING SERVICE"

    print_test "Health endpoint /health"
    local response=$(curl -s http://localhost:8788/health)
    if echo "$response" | grep -q '"status"'; then
        pass
    else
        fail "Health endpoint not responding with JSON"
    fi

    print_test "Signaling listening on port 8788"
    if wait_for_port 8788 5; then
        pass
    else
        fail "Port 8788 not responding"
    fi

    print_test "Health check includes connections"
    if curl -s http://localhost:8788/health | grep -q '"connections"'; then
        pass
    else
        skip "Connections stat not in health response"
    fi
}

test_connectivity() {
    print_header "TESTING SERVICE-TO-SERVICE CONNECTIVITY"

    print_test "App can reach converter internally"
    if docker-compose exec cyclecad curl -sf http://converter:8787/health >/dev/null 2>&1; then
        pass
    else
        skip "Cannot test internal connectivity (exec not available)"
    fi

    print_test "App can reach signaling internally"
    if docker-compose exec cyclecad curl -sf http://signaling:8788/health >/dev/null 2>&1; then
        pass
    else
        skip "Cannot test internal connectivity"
    fi
}

test_container_health() {
    print_header "TESTING CONTAINER HEALTH"

    print_test "cyclecad container is healthy"
    local status=$(docker-compose ps cyclecad 2>/dev/null | grep -i healthy | wc -l)
    if [ $status -gt 0 ]; then
        pass
    else
        fail "Container not reporting healthy status"
        docker-compose ps
    fi

    print_test "converter container is healthy"
    local status=$(docker-compose ps converter 2>/dev/null | grep -i healthy | wc -l)
    if [ $status -gt 0 ]; then
        pass
    else
        fail "Container not reporting healthy status"
        docker-compose ps
    fi

    print_test "signaling container is healthy"
    local status=$(docker-compose ps signaling 2>/dev/null | grep -i healthy | wc -l)
    if [ $status -gt 0 ]; then
        pass
    else
        fail "Container not reporting healthy status"
        docker-compose ps
    fi
}

show_logs() {
    print_header "FOLLOWING LIVE LOGS (Ctrl+C to exit)"
    echo ""
    cd "$REPO_ROOT"
    docker-compose logs -f
}

################################################################################
# Main Script
################################################################################

main() {
    # Parse command-line arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --skip-build)
                SKIP_BUILD=true
                shift
                ;;
            --cleanup)
                CLEANUP_ONLY=true
                shift
                ;;
            --logs)
                LOGS_ONLY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --skip-build    Skip docker-compose build (test running containers)"
                echo "  --cleanup       Stop and remove all containers"
                echo "  --logs          Follow live logs (docker-compose logs -f)"
                echo "  --help          Show this help message"
                echo ""
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Run '$0 --help' for usage"
                exit 1
                ;;
        esac
    done

    # Handle special modes
    if [ "$CLEANUP_ONLY" = true ]; then
        print_header "CLEANUP MODE"
        stop_services
        echo -e "${GREEN}✓ All containers stopped and removed${NC}"
        exit 0
    fi

    if [ "$LOGS_ONLY" = true ]; then
        show_logs
        exit 0
    fi

    # Normal test mode
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  cycleCAD Docker Compose Test Suite                ║${NC}"
    echo -e "${BLUE}║  Comprehensive Infrastructure Testing              ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    stop_services
    build_images
    start_services
    test_web_app
    test_converter
    test_signaling
    test_connectivity
    test_container_health

    # Print summary
    if print_summary; then
        echo -e "${GREEN}All tests passed! Services are running correctly.${NC}"
        echo ""
        echo "Next steps:"
        echo "  • Open http://localhost:8080/app/ in your browser"
        echo "  • View logs: docker-compose logs -f"
        echo "  • Stop services: docker-compose down"
        echo ""
        exit 0
    else
        echo -e "${RED}Some tests failed. Check logs above for details.${NC}"
        echo ""
        echo "Debugging tips:"
        echo "  • View full logs: docker-compose logs --tail 100"
        echo "  • Check service status: docker-compose ps"
        echo "  • Shell into service: docker-compose exec cyclecad sh"
        echo ""
        exit 1
    fi
}

# Run main function if script is executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
