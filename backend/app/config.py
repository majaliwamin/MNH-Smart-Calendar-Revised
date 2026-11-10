"""Environment-backed application configuration."""
import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("MNH_DATA_DIR", str(PROJECT_ROOT))).resolve()
DATABASE_DIR = DATA_DIR / "database"
BACKUP_DIR = DATA_DIR / "backups"
DATABASE_PATH = DATABASE_DIR / "calendar.db"
BACKUP_INTERVAL_SECONDS = max(60, int(os.getenv("MNH_BACKUP_INTERVAL_SECONDS", "86400")))
BACKUP_RETENTION = max(1, int(os.getenv("MNH_BACKUP_RETENTION", "30")))
SESSION_SECONDS = max(300, int(os.getenv("MNH_SESSION_SECONDS", str(12 * 60 * 60))))
CORS_ORIGINS = [x.strip() for x in os.getenv("MNH_CORS_ORIGINS", "").split(",") if x.strip()]
COOKIE_SECURE = os.getenv("MNH_COOKIE_SECURE", "auto").lower()


def ensure_directories():
    DATABASE_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
