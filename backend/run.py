"""Local development entry point: python backend/run.py"""
import os
import socket
from pathlib import Path
import uvicorn


def local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            return sock.getsockname()[0]
    except OSError:
        return "your-computer-LAN-IP"


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    print(f"MNH Calendar server listening on 0.0.0.0:{port} (server bind address only).", flush=True)
    print(f"  Open on this computer: http://127.0.0.1:{port}/", flush=True)
    print(f"  Other devices on the same LAN: http://{local_ip()}:{port}/", flush=True)
    print("  Different networks: deploy to Render and use its public HTTPS URL.", flush=True)
    print("  Stop with Ctrl+C.", flush=True)
    # Resolve the backend package independently of the terminal's working directory.
    backend_dir = Path(__file__).resolve().parent
    uvicorn.run("app.main:app", app_dir=str(backend_dir), host="0.0.0.0", port=port,
                reload=os.getenv("MNH_RELOAD", "false").lower() == "true")
