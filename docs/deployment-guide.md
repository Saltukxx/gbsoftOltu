# Deployment Guide - Oltu Belediyesi Platformu

Bu rehber, platformu Oltu Belediyesi’nin kendi veri merkezinde (on-prem) veya bulut ortamında üretime alırken izlenecek adımları anlatır.

## 1. Ön Koşullar
- **Sunucu Kaynakları** (minimum öneri)
  - API + Frontend: 4 CPU / 8 GB RAM
  - PostgreSQL: 4 CPU / 16 GB RAM / NVMe SSD
  - Redis + MQTT + MinIO: 2 CPU / 4 GB RAM (tek node)
  - FastAPI AI Servisi: 4 CPU / 8 GB RAM (GPU opsiyonel)
- **İşletim Sistemi**: Ubuntu 22.04 LTS veya Debian 12
- **Container Runtime**: Docker 24+ ve Docker Compose 2+
- **Alan Adı**: `controlpanel.oltu.bel.tr` (örnek)
- **TLS**: Let’s Encrypt / kurum sertifikası

## 2. Repository ve Çevre Değişkenleri
```bash
git clone git@github.com:gbsoft/oltu-platform.git
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ai-service/.env.example ai-service/.env
```
### Kritik ENV Anahtarları
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`
- `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`
- `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `S3_ENDPOINT`
- `MAPBOX_TOKEN`
- `AI_SERVICE_URL`

# Run the full stack locally
```bash
docker compose -f infra/docker-compose.dev.yml up --build
```

## 4. Production Deployment
Use the production compose file for production deployment:
```bash
docker compose -f infra/docker-compose.prod.yml up --build
```

### Sağlık Kontrolleri
- `curl http://localhost:5000/api/health` - Backend API
- `curl http://localhost:8001/health` - AI Service  
- `curl http://localhost:3000` - Frontend
- Database: `docker exec postgres pg_isready`
- Redis: `docker exec redis redis-cli ping`

## 5. Veri Katmanı
- **PostgreSQL**: Patroni veya managed (AWS RDS) → `init.sql` çalıştırılır.
- **Redis**: Sentinel devrede; password `redis.conf` içerisinde.
- **MinIO**: `mc alias set local http://minio:9000 $MINIO_ROOT_USER $MINIO_ROOT_PASSWORD`
  - Bucket’lar: `audio`, `models`, `backups`
  - Lifecycle policy: `audio` → 90 gün sonra arşiv, `models` → versiyonlu.
- **Backup**: pgBackRest ile günlük incremental, haftalık full; MinIO `backups/` klasörüne yazılır.

## 6. AI Servisi Model Yönetimi
- `ai-service/utils/model_registry.py` otomatik olarak XGBoost + Prophet modellerini `models/artifacts/` altına üretir.
- Kurum verisiyle yeniden eğitmek için:
  ```bash
  docker exec -it ai-service bash
  python scripts/train_fuel_model.py --dataset /data/fuel.csv
  python scripts/train_emission_model.py --dataset /data/emissions.csv
  ```
- Eğitilen modeller MinIO’ya yüklenir, pod restart’ında otomatik indirilir.

## 7. Güvenlik Sertifikaları ve Ağ
- Reverse proxy: Nginx → backend (3001), frontend (5173), ai-service (8000)
- Zorunlu HTTPS, TLS1.2+, `SECURITY_DATA.md` gereksinimleri uygulanır.
- VPN veya özel VLAN üzerinden erişim; DB/Redis/MQTT dış dünyaya kapalı.
- JWT anahtarları HashiCorp Vault / SSM Parameter Store’da tutulur.

## 8. E2E Smoke Test Planı
1. **Auth**: `POST /api/auth/login` → dashboard’a yönlendirme
2. **Shift**: `POST /api/shifts/generate` → UI’da drag-drop kontrolü
3. **Vehicle telemetry**: `node scripts/send_telemetry.ts --vehicle 34ABC123 --interval 2`
4. **Voice message**: push-to-talk → `/api/messages/audio` 201 → WebSocket bildirimi
5. **Dashboard**: `/api/dashboard/summary`, `/metrics`, `/emissions` → 200

## 9. Monitoring & Alerting
- Prometheus scrape (backend, ai-service) → `/metrics`
- Grafana panelleri: vardiya performansı, telemetri gecikmesi, AI inference süresi
- Loki loglama + Winston JSON output
- Alertmanager -> Ops e-posta/Slack

## 10. Bakım & Güncellemeler
- Release pipeline: GitHub Actions → container build → Helm upgrade
- Veri tabanı migration: `pnpm --filter backend prisma migrate deploy`
- Rolling restart: `kubectl rollout restart deployment/api`
- Disaster Recovery: MinIO + pgBackRest restore prosedürü `docs/dr-runbook.md` (gelecek sprint)

Bu belge, Go-Live öncesi ve sonrası referans alınacak temel dağıtım adımlarını kapsar.
