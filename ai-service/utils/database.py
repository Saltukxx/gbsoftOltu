import asyncio
import asyncpg
import redis.asyncio as redis
import os
from typing import Optional
from utils.logger import logger

# Global connection pools
postgres_pool: Optional[asyncpg.Pool] = None
redis_client: Optional[redis.Redis] = None

async def init_db():
    """Initialize database connections (optional for AI service)."""
    global postgres_pool, redis_client
    
    try:
        # Initialize PostgreSQL connection pool (optional)
        database_url = os.getenv("DATABASE_URL")
        if database_url:
            try:
                postgres_pool = await asyncpg.create_pool(
                    database_url,
                    min_size=1,
                    max_size=10,
                    command_timeout=60
                )
                logger.info("✅ PostgreSQL connection pool created")
            except Exception as pg_error:
                logger.warning(f"⚠️  PostgreSQL connection failed: {str(pg_error)}")
                logger.warning("⚠️  AI service will continue without database access")
                postgres_pool = None
        else:
            logger.info("ℹ️  DATABASE_URL not set, skipping PostgreSQL connection")
        
        # Initialize Redis connection (optional)
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                redis_client = redis.from_url(redis_url, decode_responses=True)
                # Test Redis connection
                await redis_client.ping()
                logger.info("✅ Redis connection established")
            except Exception as redis_error:
                logger.warning(f"⚠️  Redis connection failed: {str(redis_error)}")
                logger.warning("⚠️  AI service will continue without cache")
                redis_client = None
        else:
            logger.info("ℹ️  REDIS_URL not set, skipping Redis connection")
        
    except Exception as e:
        logger.error(f"❌ Error during database initialization: {str(e)}")
        # Don't raise - allow service to start without database
        logger.warning("⚠️  AI service starting in limited mode (no database access)")

async def get_postgres_connection():
    """Get PostgreSQL connection from pool."""
    if postgres_pool is None:
        raise RuntimeError("PostgreSQL pool not initialized")
    return await postgres_pool.acquire()

async def release_postgres_connection(connection):
    """Release PostgreSQL connection back to pool."""
    if postgres_pool is None:
        raise RuntimeError("PostgreSQL pool not initialized")
    await postgres_pool.release(connection)

async def get_redis_client():
    """Get Redis client."""
    if redis_client is None:
        raise RuntimeError("Redis client not initialized")
    return redis_client

async def close_connections():
    """Close all database connections."""
    global postgres_pool, redis_client
    
    if postgres_pool:
        await postgres_pool.close()
        logger.info("PostgreSQL connection pool closed")
    
    if redis_client:
        await redis_client.close()
        logger.info("Redis connection closed")

# Database query helpers
async def execute_query(query: str, *args):
    """Execute a PostgreSQL query."""
    connection = await get_postgres_connection()
    try:
        return await connection.fetch(query, *args)
    finally:
        await release_postgres_connection(connection)

async def execute_single_query(query: str, *args):
    """Execute a PostgreSQL query that returns a single row."""
    connection = await get_postgres_connection()
    try:
        return await connection.fetchrow(query, *args)
    finally:
        await release_postgres_connection(connection)

async def execute_command(command: str, *args):
    """Execute a PostgreSQL command (INSERT, UPDATE, DELETE)."""
    connection = await get_postgres_connection()
    try:
        return await connection.execute(command, *args)
    finally:
        await release_postgres_connection(connection)

# Redis helpers
async def cache_set(key: str, value: str, expire_seconds: int = 3600):
    """Set a value in Redis cache."""
    client = await get_redis_client()
    await client.setex(key, expire_seconds, value)

async def cache_get(key: str) -> Optional[str]:
    """Get a value from Redis cache."""
    client = await get_redis_client()
    return await client.get(key)

async def cache_delete(key: str):
    """Delete a key from Redis cache."""
    client = await get_redis_client()
    await client.delete(key)

async def cache_exists(key: str) -> bool:
    """Check if a key exists in Redis cache."""
    client = await get_redis_client()
    return bool(await client.exists(key))