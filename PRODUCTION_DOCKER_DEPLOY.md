# 🚀 Production Deployment with Docker - Quick Guide

## Prerequisites
- A server with Ubuntu (DigitalOcean, AWS, Hetzner, etc.)
- Docker installed
- Your code on the server

## Step 1: Install Docker on Your Server

```bash
# SSH into your server
ssh root@your-server-ip

# Install Docker (one command)
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin -y
```

## Step 2: Get Your Code on the Server

```bash
# Option A: Clone from Git
git clone <your-repo-url> /opt/oltu-platform
cd /opt/oltu-platform

# Option B: Upload via SCP from your local machine
# (Run this on your Windows machine, not the server)
scp -r "C:\Users\satog\OneDrive\Desktop\gbsoftOltu" root@your-server-ip:/opt/oltu-platform
```

## Step 3: Create Production Environment File

```bash
cd /opt/oltu-platform

# Copy the example file
cp .env.example .env

# Edit with production values
nano .env
```

**Minimal .env for production:**
```bash
# Database
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change-this-strong-password-123
POSTGRES_DB=gbsoft_oltu

# Redis
REDIS_PASSWORD=change-this-redis-password-456

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-in-production

# MinIO (S3 Storage)
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=change-this-minio-password-789

# Mapbox (get free token from https://mapbox.com)
VITE_MAPBOX_ACCESS_TOKEN=pk.your-mapbox-token-here

# URLs (use your server IP or domain)
FRONTEND_URL=http://your-server-ip
DATABASE_URL=postgresql://postgres:change-this-strong-password-123@postgres:5432/gbsoft_oltu
```

Save with `Ctrl+X`, then `Y`, then `Enter`

## Step 4: Start Everything with One Command

```bash
cd /opt/oltu-platform

# Start all services
docker compose -f infra/docker-compose.prod.yml up -d
```

This will start:
- PostgreSQL database
- Redis cache
- MQTT broker
- MinIO (file storage)
- Backend API
- AI service
- Frontend

## Step 5: Setup Database

```bash
# Run database migrations
docker compose -f infra/docker-compose.prod.yml exec api npm run db:migrate

# Seed initial data
docker compose -f infra/docker-compose.prod.yml exec api npm run db:seed
```

## Step 6: Access Your App

Your app is now live at:
- **Frontend**: `http://your-server-ip` (port 80)
- **Backend API**: `http://your-server-ip:3001`
- **AI Service**: `http://your-server-ip:8000`

## Useful Commands

### Check Status
```bash
# See all running containers
docker ps

# View logs
docker compose -f infra/docker-compose.prod.yml logs -f

# View logs for specific service
docker compose -f infra/docker-compose.prod.yml logs -f frontend
docker compose -f infra/docker-compose.prod.yml logs -f api
```

### Restart Services
```bash
# Restart all
docker compose -f infra/docker-compose.prod.yml restart

# Restart specific service
docker compose -f infra/docker-compose.prod.yml restart api
```

### Stop Everything
```bash
docker compose -f infra/docker-compose.prod.yml down
```

### Update & Redeploy
```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose -f infra/docker-compose.prod.yml down
docker compose -f infra/docker-compose.prod.yml up -d --build
```

## Auto-Restart on Server Reboot

Create this file to auto-start on boot:
```bash
sudo nano /etc/systemd/system/oltu-platform.service
```

Paste this:
```ini
[Unit]
Description=Oltu Platform
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/oltu-platform
ExecStart=/usr/bin/docker compose -f infra/docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker compose -f infra/docker-compose.prod.yml down

[Install]
WantedBy=multi-user.target
```

Enable it:
```bash
sudo systemctl daemon-reload
sudo systemctl enable oltu-platform
sudo systemctl start oltu-platform
```

Now your app will automatically start when the server reboots!

## Troubleshooting

### If services won't start:
```bash
# Check what's wrong
docker compose -f infra/docker-compose.prod.yml logs

# Check disk space
df -h

# Clean up Docker
docker system prune -a
```

### If you can't access the app:
```bash
# Check if firewall is blocking (open port 80)
sudo ufw allow 80/tcp
sudo ufw allow 3001/tcp
sudo ufw allow 8000/tcp
```

### Database connection issues:
```bash
# Check if postgres is running
docker compose -f infra/docker-compose.prod.yml ps postgres

# Access postgres directly
docker compose -f infra/docker-compose.prod.yml exec postgres psql -U postgres -d gbsoft_oltu
```

## Security Tips

1. **Change all passwords** in `.env` to strong random passwords
2. **Enable firewall**:
   ```bash
   sudo ufw allow 22    # SSH
   sudo ufw allow 80    # HTTP
   sudo ufw allow 443   # HTTPS (if using SSL)
   sudo ufw enable
   ```
3. **Get a domain name** and set up SSL with Let's Encrypt
4. **Don't expose database ports** - they're internal only in production config

## That's It!

Your app is now running 24/7 in production using Docker. Everything is containerized and will restart automatically if something crashes.
