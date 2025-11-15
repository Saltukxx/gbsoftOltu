from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
import os
from dotenv import load_dotenv

from routers import shifts, fuel, emissions
from utils.database import init_db
from utils.logger import logger
from utils.model_registry import get_model_registry
from utils.auth import require_auth

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting Oltu AI Service...")
    
    # Initialize database connection
    await init_db()
    
    # Load AI models
    logger.info("📚 Loading AI models...")
    registry = get_model_registry()
    registry.get_fuel_model()
    registry.get_emission_forecaster()
    logger.info("✅ Model artifacts loaded into memory")
    
    logger.info("✅ AI Service started successfully")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down AI Service...")

app = FastAPI(
    title="Oltu Municipality AI Service",
    description="AI-powered optimization and prediction service for Oltu Municipality Platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://gbsoftt.com", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with authentication
# Note: Authentication can be disabled by not setting AI_SERVICE_API_KEY env var (dev mode)
app.include_router(
    shifts.router, 
    prefix="/ai/shifts", 
    tags=["Shift Optimization"],
    dependencies=[Depends(require_auth())]
)
app.include_router(
    fuel.router, 
    prefix="/ai/fuel", 
    tags=["Fuel Prediction"],
    dependencies=[Depends(require_auth())]
)
app.include_router(
    emissions.router, 
    prefix="/ai/emissions", 
    tags=["Emissions Estimation"],
    dependencies=[Depends(require_auth())]
)

@app.get("/")
async def root():
    return {
        "service": "Oltu Municipality AI Service",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "shifts": "/ai/shifts/",
            "fuel": "/ai/fuel/",
            "emissions": "/ai/emissions/",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "ai-service",
        "version": "1.0.0"
    }

if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    debug = os.getenv("DEBUG", "true").lower() == "true"
    reload = os.getenv("RELOAD", "true").lower() == "true"
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=reload,
        log_level="info" if not debug else "debug"
    )
