# Login Troubleshooting Guide

## Quick Fixes

### 1. Check Backend is Running
```bash
# Check if backend is running on port 3001
curl http://localhost:3001/health
```

If not running, start it:
```bash
cd backend
npm run dev
```

### 2. Check Frontend API URL
Verify `frontend/.env` or `frontend/.env.local` has:
```
VITE_API_URL=http://localhost:3001
```

### 3. Test Login Directly
Use the test script:
```bash
cd backend
npm run test:login
```

Or test manually:
```bash
cd backend
npx tsx scripts/test-login-manual.ts
```

### 4. Check Browser Console
Open DevTools (F12) → Console tab and look for:
- CORS errors
- Network errors  
- API connection errors
- Error messages from login

### 5. Check Backend Logs
Look for:
- Login attempt logs
- Error messages
- Rate limiting messages
- CSRF errors

## Common Issues

### Issue: "Invalid credentials"
- **Cause**: Wrong email/password or user doesn't exist
- **Fix**: Verify credentials match seed data:
  - President: `president@oltubelediyesi.gov.tr` / `president123`
  - Admin: `admin@oltubelediyesi.gov.tr` / `admin123`

### Issue: "Too many login attempts"
- **Cause**: Rate limiting (20 attempts per 15 minutes)
- **Fix**: Wait 15 minutes or restart backend server

### Issue: CORS Error
- **Cause**: Frontend and backend on different origins
- **Fix**: Check `CORS_ORIGIN` in backend `.env` matches frontend URL

### Issue: Network Error / Connection Refused
- **Cause**: Backend not running or wrong URL
- **Fix**: Start backend and verify `VITE_API_URL` in frontend

### Issue: CSRF Token Error
- **Cause**: CSRF protection blocking request
- **Fix**: Login endpoint should skip CSRF - check backend logs

## Test Credentials

All users from seed:
- **President**: `president@oltubelediyesi.gov.tr` / `president123`
- **Admin**: `admin@oltubelediyesi.gov.tr` / `admin123`
- **Supervisor**: `supervisor@oltubelediyesi.gov.tr` / `supervisor123`
- **Operators**: `ahmet.yilmaz@oltubelediyesi.gov.tr` / `operator123`
- **Messenger**: `messenger@oltubelediyesi.gov.tr` / `messenger123`
- **Additional Users**: `[email]@oltubelediyesi.gov.tr` / `user123`

## Debug Steps

1. **Check Backend Health**
   ```bash
   curl http://localhost:3001/health
   ```

2. **Test Login API Directly**
   ```bash
   curl -X POST http://localhost:3001/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"president@oltubelediyesi.gov.tr","password":"president123"}'
   ```

3. **Check Frontend Network Tab**
   - Open DevTools → Network tab
   - Try to login
   - Check the login request:
     - Status code
     - Response body
     - Request headers
     - Error messages

4. **Check Backend Logs**
   - Look for "Login attempt" logs
   - Check for errors or warnings
   - Verify user lookup is working

## Still Not Working?

Run the comprehensive test:
```bash
cd backend
npm run test:login
```

This will test all users and show exactly which ones work and which don't.

