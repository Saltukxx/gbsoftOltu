#!/bin/bash

# 🚀 One-Command Production Deployment Script
# Run this on your server after installing Docker

set -e  # Exit on error

echo "=================================================="
echo "🚀 Oltu Platform Production Deployment"
echo "=================================================="
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed!"
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo apt-get install docker-compose-plugin -y
    echo "✅ Docker installed!"
fi

# Function to generate random password
generate_password() {
    openssl rand -hex 32
}

# Function to prompt for secret or generate if empty
prompt_or_generate() {
    local var_name=$1
    local prompt_text=$2
    local current_value=${!var_name}

    if [ -z "$current_value" ] || [[ "$current_value" == *"CHANGE_ME"* ]] || [[ "$current_value" == *"your-"* ]]; then
        echo ""
        echo "🔐 $prompt_text"
        read -p "   Enter value (or press Enter to auto-generate): " input
        if [ -z "$input" ]; then
            echo "$(generate_password)"
        else
            echo "$input"
        fi
    else
        echo "$current_value"
    fi
}

# Check if .env exists, create and populate it
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating production environment configuration..."
    echo ""
    echo "=================================================="
    echo "📝 Production Secrets Configuration"
    echo "=================================================="
    echo ""
    echo "This wizard will help you configure all required secrets."
    echo "Press Enter to auto-generate secure random passwords,"
    echo "or type your own values."
    echo ""

    # Prompt for all secrets
    read -p "🌐 Enter your domain name (e.g., yourdomain.com): " DOMAIN
    POSTGRES_PASSWORD=$(prompt_or_generate "POSTGRES_PASSWORD" "PostgreSQL Database Password")
    REDIS_PASSWORD=$(prompt_or_generate "REDIS_PASSWORD" "Redis Cache Password")
    JWT_SECRET=$(prompt_or_generate "JWT_SECRET" "JWT Secret Key")
    JWT_REFRESH_SECRET=$(prompt_or_generate "JWT_REFRESH_SECRET" "JWT Refresh Secret Key")
    MINIO_ROOT_USER=$(prompt_or_generate "MINIO_ROOT_USER" "MinIO Root User")
    MINIO_ROOT_PASSWORD=$(prompt_or_generate "MINIO_ROOT_PASSWORD" "MinIO Root Password")
    AI_SERVICE_API_KEY=$(prompt_or_generate "AI_SERVICE_API_KEY" "AI Service API Key")
    SESSION_SECRET=$(prompt_or_generate "SESSION_SECRET" "Session Secret")
    MQTT_PASSWORD=$(prompt_or_generate "MQTT_PASSWORD" "MQTT Broker Password")

    echo ""
    read -p "🗺️  Enter Mapbox Access Token (get from https://account.mapbox.com): " MAPBOX_TOKEN

    # Create .env file with all secrets
    cat > .env << EOF
# Production Environment Configuration
# Generated on $(date)

# Domain
DOMAIN=${DOMAIN:-localhost}

# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=gbsoft_oltu
DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/gbsoft_oltu
DIRECT_URL=postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/gbsoft_oltu
SHADOW_DATABASE_URL=postgresql://postgres:$POSTGRES_PASSWORD@postgres:5432/gbsoft_oltu_shadow

# Redis
REDIS_URL=redis://:$REDIS_PASSWORD@redis:6379
REDIS_PASSWORD=$REDIS_PASSWORD

# JWT
JWT_SECRET=$JWT_SECRET
JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# Session
SESSION_SECRET=$SESSION_SECRET

# MQTT
MQTT_URL=mqtt://mosquitto:1883
MQTT_USERNAME=backend-service
MQTT_PASSWORD=$MQTT_PASSWORD

# MinIO / S3
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=$MINIO_ROOT_USER
S3_SECRET_KEY=$MINIO_ROOT_PASSWORD
S3_BUCKET=oltu-platform
S3_REGION=us-east-1
MINIO_ROOT_USER=$MINIO_ROOT_USER
MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD

# Mapbox
MAPBOX_ACCESS_TOKEN=$MAPBOX_TOKEN
VITE_MAPBOX_ACCESS_TOKEN=$MAPBOX_TOKEN

# API URLs (production)
VITE_API_URL=https://${DOMAIN:-localhost}
VITE_WS_URL=wss://${DOMAIN:-localhost}
API_PORT=3001
FRONTEND_URL=https://${DOMAIN:-localhost}

# AI Service
AI_SERVICE_URL=http://ai-service:8000
AI_SERVICE_API_KEY=$AI_SERVICE_API_KEY

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Environment
NODE_ENV=production
EOF

    echo ""
    echo "✅ Environment file created!"
    echo "📄 Location: .env"
    echo ""
    echo "⚠️  IMPORTANT: Keep these credentials secure!"
    echo "   - Never commit .env to version control"
    echo "   - Back up these secrets in a secure location"
    echo ""
    read -p "Press Enter to continue with deployment..."
else
    echo "✅ .env file found, loading configuration..."
fi

# Load environment variables
set -a
source .env
set +a

echo ""
echo "📦 Building Docker containers..."
docker compose -f infra/docker-compose.prod.yml build

echo ""
echo "🚀 Starting all services..."
docker compose -f infra/docker-compose.prod.yml up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 10

echo ""
echo "🗄️  Running database migrations..."
docker compose -f infra/docker-compose.prod.yml exec -T api npm run db:migrate

echo ""
echo "🌱 Seeding database with initial data..."
docker compose -f infra/docker-compose.prod.yml exec -T api npm run db:seed

echo ""
echo "=================================================="
echo "✅ Deployment Complete!"
echo "=================================================="
echo ""
echo "🌐 Your app is now live at:"
echo "   Frontend: http://$(hostname -I | awk '{print $1}')"
echo "   API:      http://$(hostname -I | awk '{print $1}'):3001"
echo "   AI:       http://$(hostname -I | awk '{print $1}'):8000"
echo ""
echo "📊 Check status:"
echo "   docker ps"
echo ""
echo "📝 View logs:"
echo "   docker compose -f infra/docker-compose.prod.yml logs -f"
echo ""
echo "🛑 Stop services:"
echo "   docker compose -f infra/docker-compose.prod.yml down"
echo ""
echo "=================================================="
