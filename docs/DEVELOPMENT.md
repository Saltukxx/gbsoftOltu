# 🛠️ Development Workflow Guide

## 📋 İçindekiler
- [Geliştirme Ortamı Kurulumu](#geliştirme-ortamı-kurulumu)
- [Günlük Geliştirme Workflow](#günlük-geliştirme-workflow)
- [Git Workflow](#git-workflow)
- [Testing Stratejisi](#testing-stratejisi)
- [Deployment Süreci](#deployment-süreci)
- [Troubleshooting](#troubleshooting)

## 🚀 Geliştirme Ortamı Kurulumu

### Önkoşullar
```bash
# Node.js (18+) ve pnpm
node --version  # v18+
pnpm --version  # 8+

# Docker ve Docker Compose
docker --version
docker-compose --version

# Python (3.11+) - AI servis için
python --version  # 3.11+
```

### İlk Kurulum
```bash
# Repository klonla
git clone <repository-url>
cd oltu-belediyesi-platform

# Dependencies yükle
pnpm install

# Environment dosyalarını kopyala
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ai-service/.env.example ai-service/.env

# Docker servisleri başlat (sadece infra)
docker compose -f infra/docker-compose.dev.yml up -d postgres redis

# Veritabanını hazırla
cd backend
pnpm db:migrate
pnpm db:seed

# AI servis dependencies
cd ../ai-service
pip install -r requirements.txt
```

## 🔄 Günlük Geliştirme Workflow

### Servisleri Başlatma

#### Option 1: Tüm servisleri Docker ile
```bash
docker compose -f infra/docker-compose.dev.yml up --build
```

#### Option 2: İnfra + Local development
```bash
# İnfra servisleri Docker ile
docker compose -f infra/docker-compose.dev.yml up -d postgres redis

# Backend local
cd backend
pnpm dev

# AI Service local  
cd ai-service
uvicorn main:app --reload

# Frontend (gelecekte)
cd frontend
pnpm dev
```

### Hot Reload & Development
- **Backend**: TypeScript watch mode ile otomatik reload
- **AI Service**: Uvicorn reload ile Python dosyalarını izler
- **Frontend**: Vite dev server ile instant reload

### Database İşlemleri
```bash
cd backend

# Schema değişikliği sonrası
pnpm db:migrate

# Prisma client güncelle
pnpm db:generate

# Veritabanını sıfırla ve seed et
pnpm db:push
pnpm db:seed

# Prisma Studio aç
pnpm db:studio
```

## 🔀 Git Workflow

### Branch Stratejisi
```
main           # Production branch
└── develop    # Integration branch
    ├── feature/vardiya-optimization
    ├── feature/vehicle-tracking  
    ├── bugfix/auth-token-expiry
    └── hotfix/critical-security-fix
```

### Commit Convention
```bash
# Format: type(scope): description
git commit -m "feat(backend): add shift optimization API endpoint"
git commit -m "fix(ai-service): correct fuel prediction algorithm"
git commit -m "docs(readme): update installation instructions"

# Types: feat, fix, docs, style, refactor, test, chore
```

### Development Cycle
```bash
# 1. Yeni feature başlat
git checkout develop
git pull origin develop
git checkout -b feature/new-feature

# 2. Geliştir ve test et
# ... kod yazma ...
pnpm lint
pnpm test
pnpm build

# 3. Commit ve push
git add .
git commit -m "feat(scope): description"
git push origin feature/new-feature

# 4. Pull Request oluştur
# GitHub/GitLab UI kullanarak PR aç

# 5. Code review sonrası merge
# develop branch'e merge edilir
```

## 🧪 Testing Stratejisi

### Test Türleri
```bash
# Unit tests - Her servis için
cd backend && pnpm test
cd ai-service && pytest

# Integration tests
npm run test:integration

# E2E tests (gelecekte)
npm run test:e2e

# Linting ve formatting
npm run lint
npm run format
```

### Test Coverage
- **Backend**: Jest ile %80+ coverage hedefi
- **AI Service**: Pytest ile %70+ coverage hedefi
- **Frontend**: Vitest ile %75+ coverage hedefi

### CI/CD Pipeline
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  - lint-and-test-backend
  - lint-and-test-frontend  
  - lint-and-test-ai-service
  - security-scan
  - build-and-validate
  - integration-test
```

## 🚀 Deployment Süreci

# Run the full stack locally
```bash
docker compose -f infra/docker-compose.dev.yml up --build
```

### Production Deployment
```bash
# Production build
docker compose -f infra/docker-compose.prod.yml up --build

# Health checks
curl http://localhost:5000/api/health
curl http://localhost:8001/health
curl http://localhost:3000
```

## 🔍 Troubleshooting

### Yaygın Sorunlar

#### Database Connection Issues
```bash
# PostgreSQL container status
docker compose -f infra/docker-compose.dev.yml ps postgres

# Connection test
cd backend
npx prisma studio  # Web UI açılıyor mu?

# Database reset
docker compose -f infra/docker-compose.dev.yml down
docker volume prune  # Dikkat: Tüm data silinir!
```

#### Port Conflicts
```bash
# Port kullanımını kontrol et
netstat -tulpn | grep :3001  # Backend
netstat -tulpn | grep :8000  # AI Service
netstat -tulpn | grep :5432  # PostgreSQL

# Docker port mapping
docker compose -f infra/docker-compose.dev.yml ps
```

#### AI Service Python Dependencies
```bash
cd ai-service

# Virtual environment oluştur
python -m venv venv
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Dependencies yeniden yükle
pip install --upgrade pip
pip install -r requirements.txt
```

#### Build Failures
```bash
# Node modules temizle
pnpm clean
pnpm install

# TypeScript build
cd backend
pnpm build

# Docker build cache temizle
docker builder prune
docker compose -f infra/docker-compose.dev.yml build --no-cache
```

### Debug Modes

#### Backend Debug
```bash
cd backend
# Debug mode ile başlat
npm run dev:debug
# Chrome DevTools: chrome://inspect
```

#### AI Service Debug  
```bash
cd ai-service
# Debug logging
export LOG_LEVEL=DEBUG
uvicorn main:app --reload
```

### Performance Monitoring
```bash
# Container resource usage
docker stats

# Database query performance
# Prisma Studio -> Metrics tab

# API response times
# Backend logs ya da APM tool kullan
```

### Environment Variables
```bash
# Environment kontrol
cd backend && pnpm run env:check
cd ai-service && python -c "import os; print(os.getenv('DATABASE_URL'))"

# Missing variables
grep -r "process.env" backend/src/  # Backend
grep -r "os.getenv" ai-service/     # AI Service
```

## 📊 Development Metrics

### Daily Checklist
- [ ] `npm run lint` tüm servislerde geçiyor
- [ ] `npm run test` tüm testler geçiyor  
- [ ] `docker compose up` tüm servisler başlıyor
- [ ] API health endpoints dönüt veriyor
- [ ] Database migration gerekli mi?
- [ ] `.env.example` dosyaları güncel mi?

### Weekly Checklist
- [ ] Dependencies güncellenme kontrolü
- [ ] Security audit (npm audit, safety check)
- [ ] Performance metric review
- [ ] Code coverage raporu
- [ ] Database backup test

Bu kılavuz, günlük geliştirme sürecinde karşılaşılabilecek durumları kapsar ve ekip üyelerinin verimli çalışmasını sağlamak için tasarlanmıştır.