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

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating from .env.example..."
    cp .env.example .env
    echo ""
    echo "⚠️  IMPORTANT: Edit .env file with your production passwords!"
    echo "Run: nano .env"
    echo ""
    read -p "Press Enter after editing .env file..."
fi

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
