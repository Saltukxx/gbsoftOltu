from fastapi import Security, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import os
from typing import Optional

# Security scheme
security = HTTPBearer()

def get_api_key() -> str:
    """Get API key from environment."""
    api_key = os.getenv("AI_SERVICE_API_KEY")
    if not api_key:
        raise RuntimeError("AI_SERVICE_API_KEY environment variable must be set")
    return api_key

async def verify_api_key(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> bool:
    """
    Verify API key for AI service authentication.
    
    Usage in routes:
        @router.get("/endpoint", dependencies=[Depends(verify_api_key)])
        async def protected_endpoint():
            ...
    """
    # Check if we're in development mode
    environment = os.getenv("ENVIRONMENT", "production").lower()
    
    try:
        api_key = get_api_key()
    except RuntimeError:
        # Only allow bypassing authentication in development mode
        if environment == "development":
            return True
        # In production, authentication is mandatory
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service not properly configured - missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if credentials.credentials != api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return True

def require_auth():
    """
    Dependency to require authentication on routes.
    
    Usage:
        @router.get("/endpoint", dependencies=[Depends(require_auth())])
    """
    return Depends(verify_api_key)

# Optional: Service-to-service authentication for internal services
SERVICE_TOKEN = os.getenv("SERVICE_TOKEN")

async def verify_service_token(
    credentials: HTTPAuthorizationCredentials = Security(security)
) -> bool:
    """Verify service-to-service token."""
    environment = os.getenv("ENVIRONMENT", "production").lower()
    
    if not SERVICE_TOKEN:
        # In development, fall back to API key verification
        if environment == "development":
            return await verify_api_key(credentials)
        # In production, service token is required for service-to-service calls
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Service token not configured",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if credentials.credentials != SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid service token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return True

