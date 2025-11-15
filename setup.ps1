# PowerShell Setup Script for Oltu Belediyesi Platform
# This script helps set up the database and backend

Write-Host "🚀 Oltu Belediyesi Platform Setup" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is installed
Write-Host "Checking Docker installation..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Docker is installed: $dockerVersion" -ForegroundColor Green
        
        # Check if Docker is running
        Write-Host "Checking if Docker is running..." -ForegroundColor Yellow
        try {
            docker ps | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Host "✅ Docker is running" -ForegroundColor Green
                
                # Start database services
                Write-Host ""
                Write-Host "Starting PostgreSQL and Redis containers..." -ForegroundColor Yellow
                docker-compose -f infra/docker-compose.dev.yml up -d postgres redis
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "✅ Database containers started" -ForegroundColor Green
                    Write-Host "Waiting 15 seconds for containers to initialize..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 15
                    
                    # Run migrations
                    Write-Host ""
                    Write-Host "Running database migrations..." -ForegroundColor Yellow
                    Set-Location backend
                    pnpm db:migrate
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "✅ Database migrations completed" -ForegroundColor Green
                        
                        # Seed database
                        Write-Host ""
                        Write-Host "Seeding database with initial data..." -ForegroundColor Yellow
                        pnpm db:seed
                        
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host "✅ Database seeded successfully" -ForegroundColor Green
                            Write-Host ""
                            Write-Host "🎉 Setup Complete!" -ForegroundColor Green
                            Write-Host ""
                            Write-Host "Next steps:" -ForegroundColor Cyan
                            Write-Host "1. Start the backend: cd backend && pnpm dev" -ForegroundColor White
                            Write-Host "2. Frontend is already running on http://localhost:3000" -ForegroundColor White
                            Write-Host "3. Login with: admin@oltubelediyesi.gov.tr / admin123" -ForegroundColor White
                        } else {
                            Write-Host "❌ Database seeding failed" -ForegroundColor Red
                        }
                    } else {
                        Write-Host "❌ Database migrations failed" -ForegroundColor Red
                    }
                    Set-Location ..
                } else {
                    Write-Host "❌ Failed to start database containers" -ForegroundColor Red
                }
            } else {
                Write-Host "❌ Docker is installed but not running" -ForegroundColor Red
                Write-Host "Please start Docker Desktop and try again" -ForegroundColor Yellow
            }
        } catch {
            Write-Host "❌ Docker is installed but not running" -ForegroundColor Red
            Write-Host "Please start Docker Desktop and try again" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "❌ Docker is not installed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install Docker Desktop:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://www.docker.com/products/docker-desktop/" -ForegroundColor White
    Write-Host "2. Install and restart your computer" -ForegroundColor White
    Write-Host "3. Start Docker Desktop" -ForegroundColor White
    Write-Host "4. Run this script again" -ForegroundColor White
    Write-Host ""
    Write-Host "Or see SETUP_DATABASE_AND_BACKEND.md for manual setup instructions" -ForegroundColor Cyan
}

