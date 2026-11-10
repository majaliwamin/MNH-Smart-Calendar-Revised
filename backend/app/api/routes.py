"""Versioned-compatible REST endpoints used by the web and Flutter clients."""
import json
import re
import time
from fastapi import APIRouter, Body, Cookie, HTTPException, Request, Response
from app.config import COOKIE_SECURE, SESSION_SECONDS
from app.database.connection import database
from app.services.authentication import role_for_password, create_session, get_session, delete_session
from app.services.audit_service import write_activity, VISIBLE_ROLES
from app.services.backup_service import list_backups

router = APIRouter(prefix="/api")
ALLOWED_COLLECTIONS = {"cells", "resources", "settings", "modules", "facilitators", "examinations", "recurring", "communications"}
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_. –-]{0,99}$")
COOKIE_NAME = "mnh_session"


def current_session(mnh_session: str | None):
    return get_session(mnh_session)


def require_editor(mnh_session: str | None):
    session = current_session(mnh_session)
    if not session:
        raise HTTPException(status_code=401, detail="Please sign in with an authorised editing password.")
    return session


@router.get("/ping")
def ping():
    return {"ok": True, "storage": "shared"}


@router.get("/health")
def health():
    with database() as c:
        count = c.execute("SELECT COUNT(*) FROM docs").fetchone()[0]
        last = c.execute("SELECT MAX(at) FROM audit").fetchone()[0]
    backups = list_backups()
    return {"ok": True, "storage": "shared", "documents": count,
            "last_change": last, "backup_count": len(backups),
            "last_backup": backups[0].stat().st_mtime if backups else None}


@router.get("/analytics")
def analytics(mnh_session: str | None = Cookie(default=None)):
    session = current_session(mnh_session)
    if not session:
        raise HTTPException(403, "Analytics are restricted to staff and class representatives. Enter the editing password to continue.")
    with database() as c:
        rows = c.execute("SELECT col,data FROM docs WHERE col IN ('cells','examinations','recurring','communications','modules','facilitators')").fetchall()
    counts = {name: 0 for name in ("cells", "examinations", "recurring", "communications", "modules", "facilitators")}
    modes = {"online": 0, "face_to_face": 0, "unspecified": 0}
    for row in rows:
        data = json.loads(row["data"])
        counts[row["col"]] += 1
        if row["col"] == "cells":
            mode = str(data.get("mode", data.get("delivery", "unspecified"))).lower().replace("-", "_").replace(" ", "_")
            if mode in ("online", "virtual", "remote"): modes["online"] += 1
            elif mode in ("face_to_face", "physical", "in_person", "inperson"): modes["face_to_face"] += 1
            else: modes["unspecified"] += 1
    with database() as c:
        additions = c.execute("SELECT COUNT(*) FROM audit WHERE action='added' AND collection IN ('cells','resources','examinations','recurring','communications')").fetchone()[0]
    return {"counts": counts, "delivery_modes": modes, "recorded_additions": additions,
            "missed_sessions": 0, "note": "Missed-session analytics require attendance records; none are currently stored."}


@router.get("/history")
def history():
    with database() as c:
        rows = c.execute(
            "SELECT at,role,action,collection,item_id,summary FROM audit "
            "WHERE action='added' AND collection IN ('cells','resources','examinations','recurring','communications') ORDER BY seq DESC LIMIT 100"
        ).fetchall()
    return [{"at": r["at"], "role": VISIBLE_ROLES.get(r["role"], "Staff"),
             "action": "added", "collection": r["collection"], "id": r["item_id"], "summary": r["summary"]}
            for r in rows]


@router.get("/backup")
def backup_json():
    with database() as c:
        rows = c.execute("SELECT col,id,data FROM docs ORDER BY col,id").fetchall()
    return {"format": "mnh-calendar-backup", "version": 1, "created_at": int(time.time()*1000),
            "documents": [{"col": r["col"], "id": r["id"], "data": json.loads(r["data"])} for r in rows]}


@router.get("/session")
def session_status(mnh_session: str | None = Cookie(default=None)):
    session = current_session(mnh_session)
    return {"authenticated": bool(session), "role": session["role"] if session else "student"}


@router.get("/export")
def export_all():
    with database() as c:
        rows = c.execute("SELECT col,id,data FROM docs ORDER BY col,id").fetchall()
    return [{"col": r["col"], "id": r["id"], "data": json.loads(r["data"])} for r in rows]


@router.get("/col/{collection}")
def get_collection(collection: str):
    if collection not in ALLOWED_COLLECTIONS:
        raise HTTPException(404, "not found")
    with database() as c:
        rows = c.execute("SELECT id,data FROM docs WHERE col=? ORDER BY id", (collection,)).fetchall()
    return [{"id": r["id"], "data": json.loads(r["data"])} for r in rows]


@router.post("/auth")
def authenticate(request: Request, response: Response, payload: dict = Body(...)):
    password = str(payload.get("password", ""))[:256]
    role = role_for_password(password)
    if not role:
        time.sleep(0.25)
        raise HTTPException(401, "Incorrect password. Editing remains locked.")
    token = create_session(role)
    forwarded = request.headers.get("x-forwarded-proto", "").lower() if request else ""
    is_https = request.url.scheme == "https" or forwarded == "https"
    secure = COOKIE_SECURE == "true" or (COOKIE_SECURE == "auto" and is_https)
    response.set_cookie(COOKIE_NAME, token, max_age=SESSION_SECONDS, httponly=True,
                        secure=secure, samesite="none" if secure else "lax", path="/")
    return {"ok": True, "role": role}


@router.post("/logout")
def logout(response: Response, mnh_session: str | None = Cookie(default=None)):
    delete_session(mnh_session)
    response.delete_cookie(COOKIE_NAME, path="/", httponly=True, samesite="lax")
    return {"ok": True}


@router.post("/restore")
def restore(payload: dict = Body(...), mnh_session: str | None = Cookie(default=None)):
    require_editor(mnh_session)
    if payload.get("format") != "mnh-calendar-backup" or not isinstance(payload.get("documents"), list):
        raise HTTPException(400, "Unsupported backup format.")
    documents = payload["documents"]
    if len(documents) > 10000:
        raise HTTPException(400, "Backup contains too many records.")
    cleaned = []
    seen_documents = set()
    for item in documents:
        if not isinstance(item, dict):
            raise HTTPException(400, "Backup contains an invalid record.")
        col, item_id, data = item.get("col"), str(item.get("id", "")), item.get("data")
        if col not in ALLOWED_COLLECTIONS or not NAME.fullmatch(item_id) or not isinstance(data, dict):
            raise HTTPException(400, "Backup contains an invalid record.")
        identity = (col, item_id)
        if identity in seen_documents:
            raise HTTPException(400, "Backup contains duplicate records.")
        seen_documents.add(identity)
        cleaned.append((col, item_id, json.dumps(data, ensure_ascii=False), int(time.time()*1000)))
    with database() as c:
        c.execute("DELETE FROM docs")
        c.executemany("INSERT INTO docs(col,id,data,updated_at) VALUES(?,?,?,?)", cleaned)
    return {"ok": True, "restored": len(cleaned)}


@router.put("/doc/{collection}/{item_id}")
def put_document(collection: str, item_id: str, data: dict = Body(...), mnh_session: str | None = Cookie(default=None)):
    session = require_editor(mnh_session)
    if collection not in ALLOWED_COLLECTIONS or not NAME.fullmatch(item_id):
        raise HTTPException(404, "not found")
    if collection == "modules" and (not str(data.get("title", "")).strip() or len(str(data.get("title", ""))) > 160):
        raise HTTPException(400, "A valid module title is required.")
    with database() as c:
        exists = c.execute("SELECT 1 FROM docs WHERE col=? AND id=?", (collection, item_id)).fetchone()
        c.execute("INSERT INTO docs(col,id,data,updated_at) VALUES(?,?,?,?) "
                  "ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
                  (collection, item_id, json.dumps(data, ensure_ascii=False), int(time.time()*1000)))
        if not exists and collection in ("cells", "resources", "examinations", "recurring", "communications"):
            description = next((str(data.get(k, "")).strip() for k in
                                ("title", "activity", "message", "text", "name", "module", "code", "label") if data.get(k)), "")
            kind = "session" if collection == "cells" else "activity"
            summary = "Added %s%s" % (kind, (": " + description[:170]) if description else "")
            write_activity(c, session["role"], "added", collection, item_id, summary)
    return {"ok": True}


@router.delete("/doc/{collection}/{item_id}")
def delete_document(collection: str, item_id: str, mnh_session: str | None = Cookie(default=None)):
    require_editor(mnh_session)
    if collection not in ALLOWED_COLLECTIONS or not NAME.fullmatch(item_id):
        raise HTTPException(404, "not found")
    with database() as c:
        c.execute("DELETE FROM docs WHERE col=? AND id=?", (collection, item_id))
    return {"ok": True}
