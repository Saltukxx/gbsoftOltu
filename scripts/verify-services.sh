#!/bin/bash

# Oltu Belediyesi Platform - Service Verification Script
# Bu script, tüm servislerin doğru şekilde başlayıp başlamadığını kontrol eder

set -e

echo "🚀 Oltu Belediyesi Platform - Service Verification"
echo "================================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check if a port is open
check_port() {
    local port=$1
    local service_name=$2
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✅ $service_name (port $port) is running${NC}"
        return 0
    else
        echo -e "${RED}❌ $service_name (port $port) is not accessible${NC}"
        return 1
    fi
}

# Function to check HTTP endpoint
check_http_endpoint() {
    local url=$1
    local service_name=$2
    
    if curl -s -f "$url" >/dev/null 2>&1; then
        echo -e "${GREEN}✅ $service_name HTTP endpoint is responding${NC}"
        return 0
    else
        echo -e "${RED}❌ $service_name HTTP endpoint is not responding${NC}"
        return 1
    fi
}

echo -e "${BLUE}📋 Checking prerequisites...${NC}"

# Check required commands
if ! command_exists docker; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

if ! command_exists python3; then
    echo -e "${RED}❌ Python 3 is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}"
echo ""

echo -e "${BLUE}🐳 Starting infrastructure services...${NC}"

# Start infrastructure services
docker compose -f infra/docker-compose.dev.yml up -d postgres redis mosquitto minio

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to start...${NC}"
sleep 10

echo ""
echo -e "${BLUE}🔍 Checking infrastructure services...${NC}"

# Check infrastructure services
INFRA_STATUS=0

check_port 5432 "PostgreSQL" || INFRA_STATUS=1
check_port 6379 "Redis" || INFRA_STATUS=1
check_port 1883 "MQTT" || INFRA_STATUS=1
check_port 9000 "MinIO" || INFRA_STATUS=1

if [ $INFRA_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ All infrastructure services are running${NC}"
else
    echo -e "${RED}❌ Some infrastructure services failed to start${NC}"
    echo -e "${YELLOW}💡 Try running: docker compose -f infra/docker-compose.dev.yml logs${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🚀 Starting application services...${NC}"

# Start backend service
echo -e "${YELLOW}📦 Starting backend service...${NC}"
cd backend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing backend dependencies...${NC}"
    npm install
fi

# Generate Prisma client
echo -e "${YELLOW}🔧 Generating Prisma client...${NC}"
npm run db:generate

# Run database migrations
echo -e "${YELLOW}🗄️ Running database migrations...${NC}"
npm run db:migrate

# Seed database
echo -e "${YELLOW}🌱 Seeding database...${NC}"
npm run db:seed

# Start backend in background
echo -e "${YELLOW}🚀 Starting backend server...${NC}"
npm run dev &
BACKEND_PID=$!

cd ..

# Start AI service
echo -e "${YELLOW}🤖 Starting AI service...${NC}"
cd ai-service

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}🐍 Creating Python virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment and install dependencies
source venv/bin/activate
pip install -r requirements.txt

# Start AI service in background
echo -e "${YELLOW}🚀 Starting AI server...${NC}"
uvicorn main:app --host 0.0.0.0 --port 8000 &
AI_PID=$!

cd ..

# Wait for application services to start
echo -e "${YELLOW}⏳ Waiting for application services to start...${NC}"
sleep 15

echo ""
echo -e "${BLUE}🔍 Checking application services...${NC}"

# Check application services
APP_STATUS=0

check_port 3001 "Backend API" || APP_STATUS=1
check_port 8000 "AI Service" || APP_STATUS=1

# Check HTTP endpoints
check_http_endpoint "http://localhost:3001/health" "Backend API" || APP_STATUS=1
check_http_endpoint "http://localhost:8000/health" "AI Service" || APP_STATUS=1

echo ""
echo -e "${BLUE}📊 Service Summary${NC}"
echo "==================="

if [ $APP_STATUS -eq 0 ]; then
    echo -e "${GREEN}✅ All services are running successfully!${NC}"
    echo ""
    echo -e "${BLUE}🌐 Service URLs:${NC}"
    echo "• Backend API: http://localhost:3001"
    echo "• AI Service: http://localhost:8000"
    echo "• MinIO Console: http://localhost:9090"
    echo "• Database: localhost:5432"
    echo "• Redis: localhost:6379"
    echo "• MQTT: localhost:1883"
    echo ""
    echo -e "${BLUE}📝 API Documentation:${NC}"
    echo "• Backend Health: http://localhost:3001/health"
    echo "• AI Service Health: http://localhost:8000/health"
    echo "• AI Service Docs: http://localhost:8000/docs"
    echo ""
    echo -e "${BLUE}🔐 Login Credentials:${NC}"
    echo "• Check your database seed script or contact your administrator for credentials"
    echo ""
    echo -e "${YELLOW}💡 To stop services: Ctrl+C and run 'docker compose -f infra/docker-compose.dev.yml down'${NC}"
else
    echo -e "${RED}❌ Some application services failed to start${NC}"
    echo -e "${YELLOW}💡 Check the logs for more information${NC}"
    
    # Kill background processes
    kill $BACKEND_PID 2>/dev/null || true
    kill $AI_PID 2>/dev/null || true
    
    exit 1
fi

# Keep the script running
echo -e "${GREEN}🎉 Platform is ready for development!${NC}"
echo -e "${YELLOW}📄 Press Ctrl+C to stop all services${NC}"

# Wait for interrupt
trap 'echo -e "\n${YELLOW}🛑 Stopping services...${NC}"; kill $BACKEND_PID $AI_PID 2>/dev/null; docker compose -f infra/docker-compose.dev.yml down; exit 0' INT

wait