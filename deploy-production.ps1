# 🚀 One-Command Production Deployment Script (Windows PowerShell)
# Run this on your server via SSH or locally with Docker Desktop

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "🚀 Oltu Platform Production Deployment" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running or not installed!" -ForegroundColor Red
    Write-Host "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if .env exists
if (-Not (Test-Path .env)) {
    Write-Host "⚠️  .env file not found!" -ForegroundColor Yellow
    Write-Host "Creating from .env.example..." -ForegroundColor Yellow
    Copy-Item .env.example .env
    Write-Host ""
    Write-Host "⚠️  IMPORTANT: Edit .env file with your production passwords!" -ForegroundColor Yellow
    Write-Host "Edit the .env file and run this script again." -ForegroundColor Yellow
    Write-Host ""
    pause
}

Write-Host ""
Write-Host "📦 Building Docker containers..." -ForegroundColor Cyan
docker compose -f infra/docker-compose.prod.yml build

Write-Host ""
Write-Host "🚀 Starting all services..." -ForegroundColor Cyan
docker compose -f infra/docker-compose.prod.yml up -d

Write-Host ""
Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 15

Write-Host ""
Write-Host "🗄️  Running database migrations..." -ForegroundColor Cyan
docker compose -f infra/docker-compose.prod.yml exec -T api npm run db:migrate

Write-Host ""
Write-Host "🌱 Seeding database with initial data..." -ForegroundColor Cyan
docker compose -f infra/docker-compose.prod.yml exec -T api npm run db:seed

Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Your app is now live at:" -ForegroundColor Cyan
Write-Host "   Frontend: http://localhost"
Write-Host "   API:      http://localhost:3001"
Write-Host "   AI:       http://localhost:8000"
Write-Host ""
Write-Host "📊 Check status:" -ForegroundColor Cyan
Write-Host "   docker ps"
Write-Host ""
Write-Host "📝 View logs:" -ForegroundColor Cyan
Write-Host "   docker compose -f infra/docker-compose.prod.yml logs -f"
Write-Host ""
Write-Host "🛑 Stop services:" -ForegroundColor Cyan
Write-Host "   docker compose -f infra/docker-compose.prod.yml down"
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
