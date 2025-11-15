# Quick Start: Deploying for 30 Users

**Target:** 30 belediye users  
**Timeline:** 2-3 weeks to production-ready  
**Status:** ⚠️ 3 Critical Security Fixes Required

---

## 🚨 CRITICAL: Must Fix Before Go-Live

### 1. Add Rate Limiting (30 min fix)

Create `backend/src/middleware/rateLimiting.ts`:
```typescript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: 'Too many requests, please try again later',
});
```

Update `backend/src/routes/auth.ts`:
```typescript
import { authLimiter } from '@/middleware/rateLimiting';

// Apply to login and refresh endpoints
router.post('/login', authLimiter, ...existingMiddleware);
router.post('/refresh', authLimiter, ...existingMiddleware);
```

Update `backend/src/app.ts`:
```typescript
import { apiLimiter } from '@/middleware/rateLimiting';

// Apply to all API routes
app.use('/api', apiLimiter);
```

### 2. Enable CSRF Protection (15 min fix)

Update `backend/src/app.ts`:
```typescript
import { csrfProtection } from '@/middleware/csrf';

// Apply CSRF to state-changing endpoints (already exists, just enable it)
app.use('/api', csrfProtection);
```

Update `frontend/src/services/api.ts`:
```typescript
// Add CSRF token handling
const getCsrfToken = async () => {
  const response = await fetch(`${API_BASE_URL}/csrf-token`, {
    credentials: 'include',
  });
  const { token } = await response.json();
  return token;
};

// Add to API client
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config) => {
  if (['post', 'put', 'patch', 'delete'].includes(config.method || '')) {
    const csrfToken = await getCsrfToken();
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});
```

### 3. Add Input Sanitization (20 min fix)

Install dependencies:
```bash
cd backend
npm install dompurify isomorphic-dompurify
npm install --save-dev @types/dompurify
```

Create `backend/src/middleware/sanitization.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  if (req.body) {
    Object.keys(req.body).forEach((key) => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = DOMPurify.sanitize(req.body[key]);
      }
    });
  }
  next();
};
```

Apply to message and shift routes:
```typescript
// backend/src/routes/messages.ts
import { sanitizeInput } from '@/middleware/sanitization';

router.post('/', authMiddleware, sanitizeInput, upload.single('audio'), ...);

// backend/src/routes/shifts.ts
router.patch('/:id', authMiddleware, requireSupervisorOrAbove, sanitizeInput, ...);
```

---

## ⚙️ HIGH Priority: Database Connection Pooling (10 min fix)

Update `backend/src/db.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: ['warn', 'error'],
});

// Configure connection pooling via DATABASE_URL
// Update backend/.env:
// DATABASE_URL="postgresql://user:pass@postgres:5432/gbsoft_oltu?connection_limit=20&pool_timeout=10&connect_timeout=10"

export default prisma;
```

---

## 🔒 Production Environment Setup (1 hour)

### 1. Update `backend/.env`
```bash
# Database
DATABASE_URL="postgresql://gbsoft_user:STRONG_PASSWORD_HERE@postgres:5432/gbsoft_oltu?connection_limit=20&pool_timeout=10"

# Redis
REDIS_URL="redis://:STRONG_REDIS_PASSWORD@redis:6379"

# JWT Secrets (generate with: openssl rand -base64 64)
JWT_SECRET="GENERATE_256_BIT_SECRET_HERE"
JWT_REFRESH_SECRET="GENERATE_DIFFERENT_256_BIT_SECRET_HERE"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# MinIO
MINIO_ROOT_USER="admin"
MINIO_ROOT_PASSWORD="STRONG_MINIO_PASSWORD"
S3_ENDPOINT="http://minio:9000"
S3_BUCKET="audio"

# MQTT
MQTT_BROKER_URL="mqtt://mosquitto:1883"
MQTT_USERNAME="gbsoft"
MQTT_PASSWORD="STRONG_MQTT_PASSWORD"

# Production Settings
NODE_ENV="production"
PORT=3001
```

### 2. Update `infra/docker-compose.prod.yml`
Add password to Redis service:
```yaml
redis:
  image: redis:7
  command: redis-server --requirepass ${REDIS_PASSWORD}
  # ... rest of config
```

### 3. Generate Secure Passwords
```bash
# Generate strong passwords
openssl rand -base64 32  # PostgreSQL
openssl rand -base64 32  # Redis
openssl rand -base64 64  # JWT_SECRET
openssl rand -base64 64  # JWT_REFRESH_SECRET
openssl rand -base64 32  # MinIO
openssl rand -base64 32  # MQTT
```

---

## 👥 Create 30 Users (Script)

Create `backend/scripts/createUsers.ts`:
```typescript
import prisma from '../src/db';
import bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';

interface UserData {
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  employeeNumber?: string;
  department?: string;
  position?: string;
}

const users: UserData[] = [
  // 2 Admins
  { email: 'admin@oltu.bel.tr', firstName: 'Ahmet', lastName: 'Yılmaz', role: 'ADMIN' },
  { email: 'sekreter@oltu.bel.tr', firstName: 'Ayşe', lastName: 'Demir', role: 'ADMIN' },
  
  // 5 Supervisors
  { email: 'fenisleri@oltu.bel.tr', firstName: 'Mehmet', lastName: 'Kaya', role: 'SUPERVISOR' },
  { email: 'cevrekoruma@oltu.bel.tr', firstName: 'Fatma', lastName: 'Şahin', role: 'SUPERVISOR' },
  { email: 'parkbahce@oltu.bel.tr', firstName: 'Ali', lastName: 'Yıldız', role: 'SUPERVISOR' },
  { email: 'ulasim@oltu.bel.tr', firstName: 'Zeynep', lastName: 'Özkan', role: 'SUPERVISOR' },
  { email: 'teknik@oltu.bel.tr', firstName: 'Hasan', lastName: 'Çelik', role: 'SUPERVISOR' },
  
  // 18 Operators (sample, expand to 18)
  { email: 'operator1@oltu.bel.tr', firstName: 'Mustafa', lastName: 'Aydın', role: 'OPERATOR', employeeNumber: 'EMP-001', department: 'Fen İşleri', position: 'Kamyon Şoförü' },
  { email: 'operator2@oltu.bel.tr', firstName: 'Elif', lastName: 'Kara', role: 'OPERATOR', employeeNumber: 'EMP-002', department: 'Fen İşleri', position: 'İş Makinesi Operatörü' },
  { email: 'operator3@oltu.bel.tr', firstName: 'Can', lastName: 'Yılmaz', role: 'OPERATOR', employeeNumber: 'EMP-003', department: 'Çevre', position: 'Temizlik Görevlisi' },
  // ... add 15 more operators
  
  // 5 Messengers
  { email: 'dispatch1@oltu.bel.tr', firstName: 'Deniz', lastName: 'Aksoy', role: 'MESSENGER' },
  { email: 'dispatch2@oltu.bel.tr', firstName: 'Selin', lastName: 'Acar', role: 'MESSENGER' },
  { email: 'fieldcoord1@oltu.bel.tr', firstName: 'Emre', lastName: 'Koç', role: 'MESSENGER' },
  { email: 'fieldcoord2@oltu.bel.tr', firstName: 'Gül', lastName: 'Yıldırım', role: 'MESSENGER' },
  { email: 'emergency@oltu.bel.tr', firstName: 'Burak', lastName: 'Aslan', role: 'MESSENGER' },
];

async function createUsers() {
  console.log('Creating 30 users...');
  
  // Default password (users must change on first login)
  const defaultPassword = 'OltuBel2025!';
  const hashedPassword = await bcrypt.hash(defaultPassword, 10);
  
  for (const userData of users) {
    try {
      const user = await prisma.user.create({
        data: {
          email: userData.email,
          password: hashedPassword,
          firstName: userData.firstName,
          lastName: userData.lastName,
          role: userData.role,
          isActive: true,
        },
      });
      
      console.log(`✓ Created user: ${userData.email} (${userData.role})`);
      
      // Create employee profile for operators
      if (userData.role === 'OPERATOR' && userData.employeeNumber) {
        await prisma.employee.create({
          data: {
            userId: user.id,
            employeeNumber: userData.employeeNumber,
            department: userData.department!,
            position: userData.position!,
            skills: [],
            performanceScore: 0,
            maxHoursPerWeek: 40,
            availability: {
              monday: true,
              tuesday: true,
              wednesday: true,
              thursday: true,
              friday: true,
              saturday: false,
              sunday: false,
            },
          },
        });
        console.log(`  ✓ Created employee profile: ${userData.employeeNumber}`);
      }
    } catch (error: any) {
      if (error.code === 'P2002') {
        console.log(`  ⚠ User already exists: ${userData.email}`);
      } else {
        console.error(`  ✗ Error creating user ${userData.email}:`, error.message);
      }
    }
  }
  
  console.log('\nDone! Default password: OltuBel2025!');
  console.log('Users must change password on first login.');
}

createUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

Run the script:
```bash
cd backend
npx ts-node scripts/createUsers.ts
```

---

## 🚀 Deployment Steps

### 1. Server Preparation
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin

# Create application directory
sudo mkdir -p /opt/oltu-platform
sudo chown $USER:$USER /opt/oltu-platform
```

### 2. Clone and Configure
```bash
cd /opt/oltu-platform
git clone <repository-url> .

# Copy and configure environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp ai-service/.env.example ai-service/.env

# Edit with production values
nano backend/.env
# (Add all secure passwords and tokens)
```

### 3. Build and Start Services
```bash
# Build all images
docker compose -f infra/docker-compose.prod.yml build

# Start services
docker compose -f infra/docker-compose.prod.yml up -d

# Check status
docker compose -f infra/docker-compose.prod.yml ps

# View logs
docker compose -f infra/docker-compose.prod.yml logs -f
```

### 4. Initialize Database
```bash
# Run migrations
docker compose -f infra/docker-compose.prod.yml exec api npm run db:migrate

# Create initial users
docker compose -f infra/docker-compose.prod.yml exec api npx ts-node scripts/createUsers.ts
```

### 5. Configure Nginx (SSL)
```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Copy Nginx config from USER_PLAN_30_USERS.md section 4.2
sudo nano /etc/nginx/sites-available/oltu-platform
sudo ln -s /etc/nginx/sites-available/oltu-platform /etc/nginx/sites-enabled/

# Obtain SSL certificate
sudo certbot --nginx -d controlpanel.oltu.bel.tr

# Test and reload
sudo nginx -t
sudo systemctl reload nginx
```

### 6. Setup Monitoring
```bash
# Create health check script
sudo nano /opt/oltu-platform/scripts/health_check.sh
# (Copy content from USER_PLAN_30_USERS.md section 4.3)

sudo chmod +x /opt/oltu-platform/scripts/health_check.sh

# Setup cron job for health checks
crontab -e
# Add:
# */5 * * * * /opt/oltu-platform/scripts/health_check.sh >> /var/log/oltu-health.log 2>&1
```

### 7. Setup Backups
```bash
# Create backup script
sudo nano /opt/oltu-platform/scripts/backup.sh
# (Copy content from USER_PLAN_30_USERS.md section 6.2)

sudo chmod +x /opt/oltu-platform/scripts/backup.sh

# Create backup directory
sudo mkdir -p /backups/postgresql

# Setup cron job for daily backups
sudo crontab -e
# Add:
# 0 3 * * * /opt/oltu-platform/scripts/backup.sh >> /var/log/oltu-backup.log 2>&1
```

---

## ✅ Pre-Launch Checklist

```markdown
Security:
- [ ] Rate limiting enabled on auth endpoints
- [ ] CSRF protection applied
- [ ] Input sanitization added to message/shift routes
- [ ] All default passwords changed
- [ ] JWT secrets generated (256-bit)
- [ ] HTTPS certificate installed
- [ ] Firewall configured (only 80, 443, 22 open)

Database:
- [ ] Connection pooling configured (20 max)
- [ ] PostgreSQL password set
- [ ] Migrations run successfully
- [ ] 30 users created with default password
- [ ] Backup script configured and tested

Infrastructure:
- [ ] All services running (docker compose ps)
- [ ] Health checks passing (/health endpoints)
- [ ] Redis password set
- [ ] MQTT authentication enabled
- [ ] MinIO buckets created
- [ ] Nginx reverse proxy configured

Monitoring:
- [ ] Health check cron job configured
- [ ] Backup cron job configured
- [ ] Log rotation enabled
- [ ] Disk space monitoring setup

Testing:
- [ ] Test login with all 4 role types
- [ ] Test shift generation (AI service)
- [ ] Test vehicle tracking (WebSocket)
- [ ] Test voice messaging
- [ ] Test with 10 concurrent users
- [ ] Verify backup restoration

Documentation:
- [ ] Admin documentation prepared
- [ ] User training materials ready
- [ ] Password policy communicated
- [ ] Support contact information shared
```

---

## 📊 Quick System Check Commands

```bash
# Check all services
docker compose -f infra/docker-compose.prod.yml ps

# Check logs for errors
docker compose -f infra/docker-compose.prod.yml logs --tail=50

# Check database connections
docker compose -f infra/docker-compose.prod.yml exec postgres psql -U postgres -d gbsoft_oltu -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Check Redis sessions
docker compose -f infra/docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD keys "refresh_token:*" | wc -l

# Check disk usage
df -h

# Check memory usage
free -h

# Check API health
curl https://controlpanel.oltu.bel.tr/api/health

# Check AI service health
curl https://controlpanel.oltu.bel.tr/ai/health
```

---

## 🆘 Common Issues and Solutions

### Issue: Database connection errors
**Solution:**
```bash
# Check database is running
docker compose exec postgres pg_isready

# Check connection string in backend/.env
# Ensure connection_limit=20 is in DATABASE_URL
```

### Issue: WebSocket disconnections
**Solution:**
```bash
# Check Redis is running
docker compose exec redis redis-cli ping

# Check REDIS_URL in backend/.env
# Ensure password matches
```

### Issue: AI service timeout
**Solution:**
```bash
# Check AI service logs
docker compose logs ai-service

# Increase timeout in backend/.env
AI_SERVICE_TIMEOUT=60000  # 60 seconds
```

### Issue: High memory usage
**Solution:**
```bash
# Restart services
docker compose -f infra/docker-compose.prod.yml restart

# Check for memory leaks in logs
docker compose logs --tail=100 | grep -i "memory"
```

---

## 📞 Go-Live Support

**Pre-Launch Testing:** 1 week before go-live
- Invite 5 test users from each role
- Test all major workflows
- Fix any issues discovered

**Soft Launch:** First 3 days
- Start with 10 users (2 per role)
- Monitor closely for issues
- Gather feedback

**Full Launch:** Day 4+
- Onboard remaining 20 users
- Continue monitoring
- Schedule training sessions

**Post-Launch:** First 30 days
- Daily health checks
- Weekly performance reviews
- Address user feedback
- Plan for next phase (50 users)

---

## 📚 Reference Documents

- **Full User Plan:** `docs/USER_PLAN_30_USERS.md`
- **Deployment Guide:** `docs/deployment-guide.md`
- **Security Review:** `backend/lastcheck.md`
- **API Documentation:** `docs/API.md`

---

**Estimated Total Setup Time:** 4-6 hours  
**Go-Live Ready:** After completing all critical fixes  
**Support Period:** 30 days intensive monitoring

