import logging
import sys
import os
from datetime import datetime
from typing import Any, Dict

# Configure logging level from environment
log_level = os.getenv("LOG_LEVEL", "INFO").upper()
log_format = os.getenv("LOG_FORMAT", "json").lower()

class JSONFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_entry = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "service": "oltu-ai-service",
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        
        # Add extra fields from the log record
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'levelname', 'levelno', 'pathname',
                          'filename', 'module', 'lineno', 'funcName', 'created', 'msecs',
                          'relativeCreated', 'thread', 'threadName', 'processName',
                          'process', 'getMessage', 'exc_info', 'exc_text', 'stack_info']:
                log_entry[key] = value
        
        return str(log_entry).replace("'", '"')

class ColoredFormatter(logging.Formatter):
    """Colored formatter for console output."""
    
    COLORS = {
        'DEBUG': '\033[36m',    # Cyan
        'INFO': '\033[32m',     # Green
        'WARNING': '\033[33m',  # Yellow
        'ERROR': '\033[31m',    # Red
        'CRITICAL': '\033[35m', # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record: logging.LogRecord) -> str:
        color = self.COLORS.get(record.levelname, '')
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        
        formatter = logging.Formatter(
            '%(asctime)s [%(service)s] %(levelname)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Add service name to record
        record.service = "ai-service"
        
        return formatter.format(record)

# Create logger
logger = logging.getLogger("oltu-ai-service")
logger.setLevel(getattr(logging, log_level, logging.INFO))

# Remove existing handlers
for handler in logger.handlers[:]:
    logger.removeHandler(handler)

# Create console handler
console_handler = logging.StreamHandler(sys.stdout)

# Set formatter based on LOG_FORMAT
if log_format == "json":
    formatter = JSONFormatter()
else:
    formatter = ColoredFormatter()

console_handler.setFormatter(formatter)
logger.addHandler(console_handler)

# Create file handler for errors
if not os.path.exists("logs"):
    os.makedirs("logs")

error_handler = logging.FileHandler("logs/error.log")
error_handler.setLevel(logging.ERROR)
error_handler.setFormatter(JSONFormatter())
logger.addHandler(error_handler)

# Create file handler for all logs
info_handler = logging.FileHandler("logs/ai-service.log")
info_handler.setFormatter(JSONFormatter())
logger.addHandler(info_handler)

# Prevent duplicate logs
logger.propagate = False

def log_function_call(func_name: str, **kwargs):
    """Log function call with parameters."""
    logger.debug(f"Function called: {func_name}", extra={"parameters": kwargs})

def log_performance(func_name: str, duration_ms: float, **kwargs):
    """Log function performance metrics."""
    logger.info(
        f"Performance: {func_name} took {duration_ms:.2f}ms",
        extra={"duration_ms": duration_ms, "function": func_name, **kwargs}
    )

def log_error_with_context(error: Exception, context: Dict[str, Any]):
    """Log error with additional context."""
    logger.error(
        f"Error: {str(error)}",
        exc_info=True,
        extra={"error_type": type(error).__name__, "context": context}
    )

# Export logger instance
__all__ = ["logger", "log_function_call", "log_performance", "log_error_with_context"]