#!/bin/bash

################################################################################
# cycleCAD Development Setup Script
#
# Quick setup for local development:
# - Checks prerequisites
# - Installs Node.js dependencies
# - Starts local dev server (if applicable)
# - Opens app in default browser
#
# Usage:
#   ./scripts/dev-setup.sh              # Full setup and start
#   ./scripts/dev-setup.sh --no-browser # Setup but don't open browser
#   ./scripts/dev-setup.sh --docker     # Use Docker Compose instead of local
#   ./scripts/dev-setup.sh --clean      # Clean install (remove node_modules)
################################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPEN_BROWSER=true
USE_DOCKER=false
CLEAN_INSTALL=false
DEV_PORT=8000

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

print_step() {
    echo -e "${YELLOW}→${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

open_browser() {
    local url=$1

    if command_exists open; then
        # macOS
        open "$url"
    elif command_exists xdg-open; then
        # Linux
        xdg-open "$url"
    elif command_exists start; then
        # Windows
        start "$url"
    else
        print_step "Cannot auto-open browser. Visit: $url"
    fi
}

check_prerequisites() {
    print_header "CHECKING PREREQUISITES"

    print_step "Node.js version"
    if command_exists node; then
        local version=$(node --version)
        echo "  $version"
        print_success "Node.js installed"
    else
        print_error "Node.js not found"
        echo ""
        echo "  Install from: https://nodejs.org/"
        echo "  Or: brew install node (macOS)"
        echo "          apt-get install nodejs npm (Ubuntu/Debian)"
        exit 1
    fi

    print_step "npm version"
    if command_exists npm; then
        local version=$(npm --version)
        echo "  $version"
        print_success "npm installed"
    else
        print_error "npm not found"
        exit 1
    fi

    if [ "$USE_DOCKER" = true ]; then
        print_step "Docker installed"
        if command_exists docker; then
            print_success "Docker found"
        else
            print_error "Docker not found (required for --docker mode)"
            exit 1
        fi

        print_step "docker-compose installed"
        if command_exists docker-compose; then
            print_success "docker-compose found"
        else
            print_error "docker-compose not found"
            exit 1
        fi
    fi

    echo ""
}

install_dependencies() {
    print_header "INSTALLING DEPENDENCIES"

    if [ "$CLEAN_INSTALL" = true ]; then
        print_step "Removing existing node_modules"
        if [ -d "$REPO_ROOT/node_modules" ]; then
            rm -rf "$REPO_ROOT/node_modules"
            print_success "Removed node_modules"
        fi
    fi

    print_step "Running npm install"
    cd "$REPO_ROOT"
    npm install

    print_success "Dependencies installed"
    echo ""
}

start_dev_server() {
    print_header "STARTING DEVELOPMENT SERVER"

    cd "$REPO_ROOT"

    # Check if package.json has a dev script
    if grep -q '"dev"' package.json 2>/dev/null; then
        print_step "Starting npm dev server"
        npm run dev &
        local server_pid=$!

        # Wait for server to start
        sleep 3

        print_success "Dev server started (PID: $server_pid)"
        echo ""
        echo -e "${BLUE}Dev Server:${NC} http://localhost:$DEV_PORT"
        echo ""

        return
    else
        print_step "No dev script found in package.json"
        print_step "Starting static server on port $DEV_PORT"

        # Check if Python is available for quick server
        if command_exists python3; then
            cd "$REPO_ROOT/app"
            python3 -m http.server $DEV_PORT &
            local server_pid=$!
            sleep 1
            print_success "Static server started (PID: $server_pid)"
            echo ""
            echo -e "${BLUE}Static Server:${NC} http://localhost:$DEV_PORT/app/"
            echo ""
            return
        fi

        # Fallback to Node.js http-server if available
        if command_exists http-server; then
            http-server "$REPO_ROOT/app" -p $DEV_PORT &
            local server_pid=$!
            sleep 1
            print_success "http-server started (PID: $server_pid)"
            echo ""
            echo -e "${BLUE}Server:${NC} http://localhost:$DEV_PORT"
            echo ""
            return
        fi

        print_error "No dev server available"
        echo ""
        echo "Options:"
        echo "  1. Install http-server: npm install -g http-server"
        echo "  2. Use Docker: ./scripts/dev-setup.sh --docker"
        echo "  3. Add a 'dev' script to package.json"
    fi
}

start_docker() {
    print_header "STARTING DOCKER ENVIRONMENT"

    print_step "Building Docker images"
    cd "$REPO_ROOT"
    docker-compose build

    print_success "Images built"
    echo ""

    print_step "Starting docker-compose"
    docker-compose up -d

    # Wait for services
    sleep 3

    print_success "Docker services started"
    echo ""
    echo -e "${BLUE}Services:${NC}"
    echo "  • Web App: http://localhost:8080/app/"
    echo "  • Converter: http://localhost:8787/health"
    echo "  • Signaling: http://localhost:8788/health"
    echo ""
    echo "View logs: docker-compose logs -f"
    echo "Stop services: docker-compose down"
    echo ""
}

print_usage() {
    print_header "USAGE"

    echo "Development Setup Options:"
    echo ""
    echo "  ./scripts/dev-setup.sh              # Full setup + open browser"
    echo "  ./scripts/dev-setup.sh --no-browser # Setup but don't open browser"
    echo "  ./scripts/dev-setup.sh --docker     # Use Docker instead of local dev"
    echo "  ./scripts/dev-setup.sh --clean      # Clean install (remove node_modules)"
    echo "  ./scripts/dev-setup.sh --help       # Show this help"
    echo ""
}

################################################################################
# Main Script
################################################################################

main() {
    # Parse command-line arguments
    while [ $# -gt 0 ]; do
        case "$1" in
            --no-browser)
                OPEN_BROWSER=false
                shift
                ;;
            --docker)
                USE_DOCKER=true
                shift
                ;;
            --clean)
                CLEAN_INSTALL=true
                shift
                ;;
            --help)
                print_usage
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done

    # Welcome message
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  cycleCAD Development Setup                       ║${NC}"
    echo -e "${BLUE}║  Quick local development environment              ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites

    if [ "$USE_DOCKER" = true ]; then
        start_docker
    else
        install_dependencies
        start_dev_server
    fi

    # Open browser if requested
    if [ "$OPEN_BROWSER" = true ]; then
        if [ "$USE_DOCKER" = true ]; then
            sleep 2
            open_browser "http://localhost:8080/app/"
        else
            sleep 1
            open_browser "http://localhost:$DEV_PORT/app/"
        fi
    fi

    print_header "DEVELOPMENT ENVIRONMENT READY"

    echo "Next steps:"
    echo "  1. Open your browser and start developing"
    echo "  2. Make changes to files in the app/ directory"
    echo "  3. Refresh browser to see changes"
    echo ""

    if [ "$USE_DOCKER" = true ]; then
        echo "Useful Docker commands:"
        echo "  docker-compose logs -f           # View all logs"
        echo "  docker-compose logs -f converter # View converter logs"
        echo "  docker-compose ps                # Service status"
        echo "  docker-compose down              # Stop services"
        echo ""
    else
        echo "Useful development commands:"
        echo "  npm run build       # Build for production"
        echo "  npm test            # Run tests (if configured)"
        echo "  npm run lint        # Lint code (if configured)"
        echo ""
    fi

    echo "Documentation:"
    echo "  • Quick start: docs/DOCKER-QUICK-TEST.md"
    echo "  • Full guide: docs/README.md"
    echo ""
}

# Run main if script is executed directly
if [ "${BASH_SOURCE[0]}" == "${0}" ]; then
    main "$@"
fi
