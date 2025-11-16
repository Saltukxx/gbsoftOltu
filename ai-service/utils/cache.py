"""
Redis-based caching utility for AI service.
Caches employee data, constraints, and other frequently accessed data.
"""
import json
import os
from typing import Any, Optional, Dict, List
from datetime import timedelta
try:
    import redis.asyncio as redis
except ImportError:
    # Fallback for older redis versions
    import redis
    import asyncio
from utils.logger import logger


class CacheService:
    """Redis-based cache service for shift optimization data."""
    
    def __init__(self):
        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
        try:
            self.redis_client: Optional[redis.Redis] = redis.from_url(
                redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            self.enabled = True
            logger.info("Redis cache initialized successfully")
        except Exception as e:
            logger.warning(f"Redis cache initialization failed: {e}. Cache disabled.")
            self.redis_client = None
            self.enabled = False
    
    async def get(self, key: str) -> Optional[Any]:
        """Get value from cache."""
        if not self.enabled or not self.redis_client:
            return None
        
        try:
            value = await self.redis_client.get(key)
            if value:
                return json.loads(value)
            return None
        except Exception as e:
            logger.warning(f"Cache get error for key {key}: {e}")
            return None
    
    async def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: int = 3600  # Default 1 hour
    ) -> bool:
        """Set value in cache with TTL."""
        if not self.enabled or not self.redis_client:
            return False
        
        try:
            serialized = json.dumps(value, default=str)
            await self.redis_client.setex(key, ttl_seconds, serialized)
            return True
        except Exception as e:
            logger.warning(f"Cache set error for key {key}: {e}")
            return False
    
    async def delete(self, key: str) -> bool:
        """Delete key from cache."""
        if not self.enabled or not self.redis_client:
            return False
        
        try:
            await self.redis_client.delete(key)
            return True
        except Exception as e:
            logger.warning(f"Cache delete error for key {key}: {e}")
            return False
    
    async def delete_pattern(self, pattern: str) -> int:
        """Delete all keys matching pattern."""
        if not self.enabled or not self.redis_client:
            return 0
        
        try:
            keys = await self.redis_client.keys(pattern)
            if keys:
                return await self.redis_client.delete(*keys)
            return 0
        except Exception as e:
            logger.warning(f"Cache delete_pattern error for {pattern}: {e}")
            return 0
    
    def _employee_cache_key(self, employee_id: str) -> str:
        """Generate cache key for employee data."""
        return f"employee:{employee_id}"
    
    def _employees_batch_cache_key(self, employee_ids: List[str]) -> str:
        """Generate cache key for batch employee data."""
        sorted_ids = sorted(employee_ids)
        ids_hash = hash(tuple(sorted_ids))
        return f"employees:batch:{ids_hash}"
    
    def _constraints_cache_key(self, constraints_hash: str) -> str:
        """Generate cache key for constraints."""
        return f"constraints:{constraints_hash}"
    
    async def get_employee(self, employee_id: str) -> Optional[Dict[str, Any]]:
        """Get cached employee data."""
        return await self.get(self._employee_cache_key(employee_id))
    
    async def set_employee(
        self,
        employee_id: str,
        employee_data: Dict[str, Any],
        ttl_seconds: int = 7200  # 2 hours for employee data
    ) -> bool:
        """Cache employee data."""
        return await self.set(
            self._employee_cache_key(employee_id),
            employee_data,
            ttl_seconds
        )
    
    async def get_employees_batch(
        self,
        employee_ids: List[str]
    ) -> Optional[List[Dict[str, Any]]]:
        """Get cached batch of employees."""
        return await self.get(self._employees_batch_cache_key(employee_ids))
    
    async def set_employees_batch(
        self,
        employee_ids: List[str],
        employees_data: List[Dict[str, Any]],
        ttl_seconds: int = 3600  # 1 hour for batch data
    ) -> bool:
        """Cache batch of employees."""
        return await self.set(
            self._employees_batch_cache_key(employee_ids),
            employees_data,
            ttl_seconds
        )
    
    async def invalidate_employee(self, employee_id: str) -> bool:
        """Invalidate employee cache."""
        return await self.delete(self._employee_cache_key(employee_id))
    
    async def invalidate_all_employees(self) -> int:
        """Invalidate all employee caches."""
        return await self.delete_pattern("employee:*")
    
    async def close(self):
        """Close Redis connection."""
        if self.redis_client:
            await self.redis_client.close()


# Global cache instance
_cache_service: Optional[CacheService] = None


def get_cache_service() -> CacheService:
    """Get or create cache service instance."""
    global _cache_service
    if _cache_service is None:
        _cache_service = CacheService()
    return _cache_service

