from fastapi.testclient import TestClient

from app import config
from app.database import connection
from app.main import app
from app.services import authentication, backup_service


def configure_test_storage(monkeypatch, tmp_path):
    database_dir = tmp_path / "database"
    backup_dir = tmp_path / "backups"
    database_path = database_dir / "calendar.db"

    monkeypatch.setattr(config, "DATABASE_DIR", database_dir)
    monkeypatch.setattr(config, "BACKUP_DIR", backup_dir)
    monkeypatch.setattr(connection, "DATABASE_PATH", database_path)
    monkeypatch.setattr(backup_service, "DATABASE_PATH", database_path)
    monkeypatch.setattr(backup_service, "BACKUP_DIR", backup_dir)
    monkeypatch.setenv("MNH_ENV", "development")
    monkeypatch.delenv("MNH_ADMIN_PASSWORD", raising=False)
    monkeypatch.delenv("MNH_LECTURER_PASSWORD", raising=False)
    authentication.SESSIONS.clear()


def test_web_assets_and_service_worker_are_served(monkeypatch, tmp_path):
    configure_test_storage(monkeypatch, tmp_path)

    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/css/app.css").status_code == 200
        assert client.get("/js/app.js").status_code == 200
        service_worker = client.get("/service-worker.js")
        assert service_worker.status_code == 200
        assert "mnh-calendar-shell-v6" in service_worker.text
        assert "addEventListener(\"fetch\"" in service_worker.text
        assert "no-cache" in service_worker.headers.get("cache-control", "")


def test_api_requires_authentication_for_shared_writes(monkeypatch, tmp_path):
    configure_test_storage(monkeypatch, tmp_path)

    with TestClient(app) as client:
        denied = client.put("/api/doc/cells/0_0", json={"title": "Should be blocked"})
        assert denied.status_code == 401

        login = client.post("/api/auth", json={"password": "rep"})
        assert login.status_code == 200
        assert login.json()["role"] == "administrator"

        saved = client.put("/api/doc/cells/0_0", json={"title": "API test"})
        assert saved.status_code == 200
        rows = client.get("/api/col/cells").json()
        assert any(row["id"] == "0_0" and row["data"]["title"] == "API test" for row in rows)

        assert client.post("/api/logout").status_code == 200
        assert client.put("/api/doc/cells/0_1", json={"title": "Blocked after logout"}).status_code == 401


def test_analytics_requires_a_management_role(monkeypatch, tmp_path):
    configure_test_storage(monkeypatch, tmp_path)

    with TestClient(app) as client:
        assert client.post("/api/auth", json={"password": "rep"}).status_code == 200
        assert client.get("/api/analytics").status_code == 403
        client.post("/api/logout")

        monkeypatch.setenv("MNH_HOD_PASSWORD", "hod-audit-secret")
        assert client.post("/api/auth", json={"password": "hod-audit-secret"}).status_code == 200
        response = client.get("/api/analytics")
        assert response.status_code == 200
        assert "delivery_modes" in response.json()


def test_restore_rejects_duplicate_records_without_deleting_existing_data(monkeypatch, tmp_path):
    configure_test_storage(monkeypatch, tmp_path)

    with TestClient(app) as client:
        client.post("/api/auth", json={"password": "rep"})
        client.put("/api/doc/cells/0_0", json={"title": "Keep this record"})

        backup = {
            "format": "mnh-calendar-backup",
            "documents": [
                {"col": "cells", "id": "0_0", "data": {"title": "First duplicate"}},
                {"col": "cells", "id": "0_0", "data": {"title": "Second duplicate"}},
            ],
        }
        response = client.post("/api/restore", json=backup)

        assert response.status_code == 400
        rows = client.get("/api/col/cells").json()
        assert rows == [{"id": "0_0", "data": {"title": "Keep this record"}}]
