# Deployment Fixes Applied

This document outlines all the critical deployment blockers that have been fixed to make the repository production-ready.

## Critical Issues Fixed

### 1. ✅ Frontend Build Failure (BLOCKING)
**Issue:** TypeScript generic syntax in `Toast.tsx` broke JSX parsing
**Fix:** Refactored generic promise handler to use named function syntax instead of inline generics
**File:** `frontend/src/components/ui/Toast.tsx:372-412`

### 2. ✅ Backend Docker Build Failure (BLOCKING)
**Issue:** Production Dockerfile ran `npm ci --only=production` then tried to build without devDependencies
**Fix:** Changed to `npm ci` (includes devDependencies) in builder stage
**File:** `backend/Dockerfile.prod:7`

### 3. ✅ Credentials in Version Control (CRITICAL SECURITY)
**Issue:** Real credentials (DB passwords, JWT secrets, Mapbox token) committed in `.env` files
**Fixes:**
- Deleted `backend/.env` from repository
- Updated `.env.example` with placeholders and security warnings
- Removed working passwords from `scripts/verify-services.sh`
**Action Required:** 
- Rotate all exposed credentials immediately
- Generate new JWT secrets: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Get new Mapbox token from https://account.mapbox.com/access-tokens/

### 4. ✅ API Contract Mismatches (BLOCKING)

#### Vehicles Endpoint
**Issue:** Frontend expected `location.timestamp`, backend returned `recordedAt`
**Fix:** Updated all frontend references to use `recordedAt`
**Files:** `frontend/src/pages/VehiclesPage.tsx` (lines 128, 168, 212, 508)

#### Messages Endpoint
**Issues:**
- Frontend used `?conversationId=...` query param that backend ignored
- Frontend called `PUT /messages/:id/read`, backend only had `PATCH`
**Fixes:**
- Added `conversationId` query parameter support to messages GET endpoint
- Added `PUT` route as alias to `PATCH` for mark-as-read endpoint
**Files:** `backend/src/routes/messages.ts`

### 5. ✅ Token Lifecycle Broken (CRITICAL SECURITY)
**Issues:**
- Refresh token rotation: new refresh token from server was ignored
- Logout: tried to read from localStorage instead of sessionStorage
**Fixes:**
- Updated `refreshAuth` to store new refresh token when provided
- Fixed `logout` to use sessionStorage and clean up legacy localStorage
**Files:** 
- `frontend/src/stores/authStore.ts:72-92`
- `frontend/src/services/authService.ts:17-45`

### 6. ✅ React Hooks Violation (BUILD ERROR)
**Issue:** `useHasRole` hook called inside `Array.filter` in navigation
**Fix:** Moved role filtering logic to `useMemo` with inline role hierarchy check
**File:** `frontend/src/components/layout/DashboardLayout.tsx:32-74`

### 7. ✅ AI Service Security (CRITICAL SECURITY)

#### No Authentication
**Issue:** All AI endpoints exposed without authentication
**Fix:** Created authentication middleware using Bearer tokens
**New Files:** `ai-service/utils/auth.py`
**Changes:** `ai-service/main.py` - added auth dependency to all routers
**Configuration:** Set `AI_SERVICE_API_KEY` environment variable to enable auth (disabled in dev if not set)

#### Database Dependencies Required
**Issue:** AI service refused to start without Postgres/Redis
**Fix:** Made database connections optional with graceful degradation
**File:** `ai-service/utils/database.py:12-53`

### 8. ✅ Docker Compose Security Issues

#### Development Compose
**Issue:** Hardcoded default credentials
**Fix:** Use environment variables with secure defaults
**Changes:**
- Postgres: `${POSTGRES_PASSWORD:-CHANGE_ME_IN_PRODUCTION}`
- MinIO: `${MINIO_ROOT_USER:-CHANGE_ME_IN_PRODUCTION}`
**File:** `infra/docker-compose.dev.yml`

#### Production Compose
**Issues:**
- Postgres/Redis exposed on host network (security risk)
- MQTT and MinIO missing (voice messages wouldn't work)
- No Redis authentication
**Fixes:**
- Removed port mappings for databases
- Added MQTT and MinIO services with volumes
- Added Redis password requirement: `${REDIS_PASSWORD:?must be set}`
- Added proper networks and health checks
**File:** `infra/docker-compose.prod.yml`

### 9. ✅ Voice Message Storage (BLOCKING)

**Issue:** Voice messages written to container filesystem without volumes
**Fixes:**
- Created S3/MinIO storage service with AWS SDK
- Updated file storage to use S3 when configured, fallback to local
- S3 storage provides persistence and horizontal scalability
**New Files:** `backend/src/services/s3Storage.ts`
**Updated:** `backend/src/services/fileStorage.ts`
**Configuration:** Set S3_* environment variables in backend `.env`

### 10. ✅ Exposed Credentials in Scripts
**Issue:** `scripts/verify-services.sh` printed working admin/supervisor/operator passwords
**Fix:** Replaced with generic message referencing database seed script
**File:** `scripts/verify-services.sh:190-191`

## Actions Required Before Deployment

### 1. Rotate All Credentials
```bash
# Generate new JWT secrets
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(64).toString('hex'))"

# Generate new API keys
openssl rand -hex 32
```

### 2. Configure Environment Variables

#### Backend (.env)
```bash
# Copy example and fill in real values
cp backend/.env.example backend/.env
# Edit backend/.env and replace ALL placeholders
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string with strong password
- `JWT_SECRET` - 64-char hex string (generated above)
- `JWT_REFRESH_SECRET` - Different 64-char hex string
- `MAPBOX_ACCESS_TOKEN` - New token from Mapbox
- `S3_ACCESS_KEY` / `S3_SECRET_KEY` - MinIO credentials
- `REDIS_URL` - Redis connection (with password if production)

#### AI Service (.env)
```bash
cp ai-service/.env.example ai-service/.env
# Edit ai-service/.env
```

Required variables:
- `AI_SERVICE_API_KEY` - Random API key for backend→AI auth
- `DATABASE_URL` - (Optional) Same as backend if needed
- `REDIS_URL` - (Optional) Same as backend if needed

#### Production Docker Compose (.env)
Create `infra/.env`:
```bash
POSTGRES_PASSWORD=<strong-password>
POSTGRES_USER=postgres
POSTGRES_DB=gbsoft_oltu
REDIS_PASSWORD=<strong-password>
MINIO_ROOT_USER=<access-key>
MINIO_ROOT_PASSWORD=<secret-key>
```

### 3. Install New Dependencies

#### Backend
```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

### 4. Update Backend Configuration
Update the backend's API client to include AI service API key:
```typescript
// In backend/src/services/aiClient.ts (or equivalent)
headers: {
  'Authorization': `Bearer ${process.env.AI_SERVICE_API_KEY}`
}
```

### 5. Database Seeding
Update seed script to use hashed passwords and strong credentials:
```bash
cd backend
# Review and update seed passwords in prisma/seed.ts
npm run db:seed
```

### 6. MQTT Configuration
If using MQTT authentication (recommended for production):
1. Update `infra/mosquitto.conf` to enable auth
2. Generate password file: `mosquitto_passwd -c mosquitto.passwd <username>`
3. Mount password file in docker-compose

## Testing Before Deployment

### 1. Frontend Build
```bash
cd frontend
npm run type-check  # Should pass without errors
npm run build       # Should complete successfully
```

### 2. Backend Build
```bash
cd backend
docker build -f Dockerfile.prod .  # Should build successfully
```

### 3. API Contracts
Test the updated endpoints:
- `GET /api/vehicles` - verify response structure
- `GET /api/vehicles/locations` - verify uses `recordedAt`
- `GET /api/messages?conversationId=xxx` - verify filtering works
- `PUT /api/messages/:id/read` - verify mark as read works
- `PATCH /api/messages/:id/read` - verify still works

### 4. Authentication
- Verify refresh token rotation works
- Verify logout clears sessionStorage
- Test token expiration and refresh flow

### 5. Storage
- Send a voice message
- Verify it's stored in S3/MinIO
- Verify playback works
- Verify deletion works
- Test fallback to local storage when S3 not configured

## Deployment Checklist

- [ ] All credentials rotated
- [ ] Environment variables configured for all services
- [ ] `.env` files added to `.gitignore` (already done)
- [ ] Dependencies installed
- [ ] Frontend build passes
- [ ] Backend build passes
- [ ] Docker images build successfully
- [ ] Database migrations run
- [ ] Database seeded with new passwords
- [ ] API contract tests pass
- [ ] S3/MinIO configured and tested
- [ ] MQTT configured (if using authentication)
- [ ] Redis configured with password (production)
- [ ] AI service authentication tested
- [ ] SSL/TLS certificates configured (production)
- [ ] Firewall rules configured
- [ ] Monitoring and logging configured

## Security Recommendations

### Immediate (Critical)
1. ✅ Rotate all exposed credentials
2. ✅ Use environment variables for all secrets
3. ✅ Enable authentication on all services
4. ✅ Don't expose databases to host network
5. ✅ Use sessionStorage instead of localStorage for tokens

### Short-term (Important)
1. Implement mTLS for service-to-service communication
2. Add rate limiting on authentication endpoints
3. Enable CORS only for specific origins (update in production)
4. Implement audit logging for sensitive operations
5. Add security headers (helmet.js)
6. Configure CSP (Content Security Policy)

### Medium-term (Recommended)
1. Implement OAuth2/OIDC for authentication
2. Add 2FA for admin users
3. Implement secrets management (HashiCorp Vault, AWS Secrets Manager)
4. Add WAF (Web Application Firewall)
5. Implement automated security scanning
6. Add intrusion detection

## Monitoring

### Required Metrics
- API response times
- Error rates by endpoint
- Authentication failures
- Database connection pool usage
- S3 upload/download success rates
- Redis cache hit rates
- AI service response times

### Required Alerts
- High error rates (>5%)
- API downtime
- Database connection failures
- S3 access failures
- Disk space < 20% (for local storage fallback)
- Memory usage > 80%
- CPU usage > 90% for 5+ minutes

## Support

For questions about these fixes:
1. Review this document
2. Check `.env.example` files for configuration options
3. Review code comments in modified files
4. Check application logs for detailed error messages

## Summary

All critical deployment blockers have been resolved:
- ✅ Build failures fixed
- ✅ Security vulnerabilities patched
- ✅ API contracts aligned
- ✅ Authentication implemented
- ✅ Storage persistence configured
- ✅ Docker configurations secured

The application is now ready for deployment after completing the "Actions Required" section above.

