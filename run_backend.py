"""
Entry point for PyInstaller-packaged backend.
Initializes .env from template on first run, then starts uvicorn.
"""

import sys
import os
import shutil
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("run_backend")


def _resolve_dotenv() -> str:
    """Ensure .env exists. Copy from template on first run. Returns path."""
    # Priority: DOTENV_PATH env var > exe_dir (frozen) > project root (dev)
    env_path = os.environ.get("DOTENV_PATH")
    if env_path:
        target = env_path
    elif getattr(sys, "frozen", False):
        target = os.path.join(os.path.dirname(sys.executable), ".env")
    else:
        target = os.path.join(os.path.dirname(__file__), ".env")

    if not os.path.exists(target):
        if getattr(sys, "frozen", False):
            template = os.path.join(sys._MEIPASS, ".env.template")
        else:
            template = os.path.join(os.path.dirname(__file__), ".env.template")

        if os.path.exists(template):
            shutil.copy2(template, target)
            logger.info(f"Created .env from template at {target}")
        else:
            logger.warning(f"No .env.template found at {template}")

    os.environ.setdefault("DOTENV_PATH", target)
    return target


def main():
    dotenv_path = _resolve_dotenv()

    host = os.environ.get("BACKEND_HOST", "127.0.0.1")
    port = int(os.environ.get("BACKEND_PORT", "19877"))

    logger.info(f"Starting backend on {host}:{port}")
    logger.info(f"Config file: {dotenv_path}")

    import uvicorn
    uvicorn.run(
        "backend.main:app",
        host=host,
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    main()
