# Mapbox Token Security Guide

## 🔒 Security Best Practices

### Token Types
- **Public Token (pk.*)**: Designed for client-side use in frontend applications
- **Secret Token (sk.*)**: For server-side use only - never expose in client code

### Current Implementation

#### Frontend (`frontend/.env`)
- Uses `VITE_MAPBOX_ACCESS_TOKEN` (public token)
- Token is exposed in client-side code (this is expected for public tokens)
- **Security measures:**
  - Token validation before map initialization
  - Error handling for invalid/missing tokens
  - Environment variable validation

#### Backend (`backend/.env`)
- Uses `MAPBOX_ACCESS_TOKEN` (currently public token)
- **Note**: If you need server-side geocoding/routing, consider creating a secret token

### 🔐 Recommended Security Steps

1. **Set URL Restrictions in Mapbox Dashboard**
   - Go to: https://account.mapbox.com/access-tokens/
   - Click on your token
   - Under "URL restrictions", add your domain(s):
     - `http://localhost:3000` (development)
     - `https://yourdomain.com` (production)
   - This prevents token abuse from other domains

2. **Set Scopes/Scopes Restrictions**
   - Limit token to only necessary Mapbox APIs
   - For vehicle tracking: `styles:read`, `fonts:read`, `sprites:read`
   - Avoid granting unnecessary permissions

3. **Monitor Usage**
   - Regularly check Mapbox dashboard for unusual usage
   - Set up usage alerts if available
   - Review billing/usage reports

4. **Token Rotation**
   - Periodically rotate tokens (every 90 days recommended)
   - Update both `.env` files when rotating
   - Revoke old tokens after confirming new ones work

5. **Never Commit Tokens**
   - ✅ `.env` files are in `.gitignore`
   - ✅ Use `.env.example` with placeholder values
   - ❌ Never commit real tokens to version control

### 🚨 If Token is Compromised

1. **Immediately revoke the token** in Mapbox dashboard
2. Generate a new token
3. Update both `.env` files
4. Restart all services
5. Review access logs for suspicious activity

### Current Token Status

- ✅ Token configured in both frontend and backend
- ✅ Validation and error handling implemented
- ✅ Token format validated (must start with `pk.` for public tokens)
- ⚠️ **Action Required**: Set URL restrictions in Mapbox dashboard
- ⚠️ **Action Required**: Review token scopes/permissions

### Code Security Features

1. **Token Validation**
   - Checks for placeholder values (`your-`, `token-here`)
   - Validates token format (public tokens start with `pk.`)
   - Prevents map initialization with invalid tokens

2. **Error Handling**
   - User-friendly error messages
   - Console logging for debugging
   - Graceful degradation if token is invalid

3. **Environment Variable Protection**
   - `.env` files excluded from git
   - `.env.example` files provided as templates
   - Clear documentation on required variables

## 📝 Notes

- Public tokens (pk.*) are **meant** to be exposed in client-side code
- The security comes from URL restrictions set in Mapbox dashboard
- Always use HTTPS in production
- Consider using Content Security Policy (CSP) headers

