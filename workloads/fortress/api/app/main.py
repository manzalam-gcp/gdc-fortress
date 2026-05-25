"""
main.py — Google Fortress FastAPI Backend
=========================================
Air-gap note: At runtime this service communicates ONLY with:
  1. The local filesystem (uploads, temp frames)
  2. The Ollama LLM service running inside the same Kubernetes cluster
     via a ClusterIP Service (configured by OLLAMA_BASE_URL).
No outbound internet calls are made at any point.
"""

import asyncio
import base64
import json
import logging
import os
import shutil
import sqlite3
import time
import uuid
from contextlib import asynccontextmanager
from enum import Enum
from pathlib import Path
from typing import Any

import cv2
import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

OLLAMA_BASE_URL: str = os.getenv(
    "OLLAMA_BASE_URL", "http://llm-service.google-fortress.svc.cluster.local:11434"
)
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "moondream")
FRAME_INTERVAL_SECONDS: float = float(os.getenv("FRAME_INTERVAL_SECONDS", "5"))
LLM_TIMEOUT_SECONDS: float = float(os.getenv("LLM_TIMEOUT_SECONDS", "300"))
UPLOAD_DIR: Path = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
DB_PATH: Path = UPLOAD_DIR / "fortress.db"

ANALYSIS_PROMPT: str = os.getenv(
    "ANALYSIS_PROMPT",
    "Describe this image in detail. List the objects and people you see."
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
log = logging.getLogger("google-fortress")

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------


class JobStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    DONE = "done"
    ERROR = "error"


def init_db():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                job_id TEXT PRIMARY KEY,
                filename TEXT,
                status TEXT,
                total_frames INTEGER,
                processed_frames INTEGER,
                results TEXT,
                error TEXT,
                created_at REAL,
                started_at REAL,
                finished_at REAL
            )
            """
        )
    log.info("Database initialized at %s", DB_PATH)


def get_db_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def save_job(job: dict[str, Any]):
    with get_db_conn() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO jobs 
            (job_id, filename, status, total_frames, processed_frames, results, error, created_at, started_at, finished_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                job["job_id"],
                job["filename"],
                job["status"],
                job["total_frames"],
                job["processed_frames"],
                json.dumps(job["results"]),
                job["error"],
                job["created_at"],
                job["started_at"],
                job["finished_at"],
            ),
        )


def get_job(job_id: str) -> dict[str, Any] | None:
    with get_db_conn() as conn:
        row = conn.execute("SELECT * FROM jobs WHERE job_id = ?", (job_id,)).fetchone()
        if row:
            job = dict(row)
            job["results"] = json.loads(job["results"])
            return job
    return None


def get_all_jobs() -> list[dict[str, Any]]:
    with get_db_conn() as conn:
        rows = conn.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
        jobs = []
        for row in rows:
            job = dict(row)
            job["results"] = json.loads(job["results"])
            jobs.append(job)
        return jobs


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    log.info("Upload directory ready: %s", UPLOAD_DIR)
    log.info("LLM endpoint (air-gapped, in-cluster): %s", OLLAMA_BASE_URL)
    yield
    log.info("Google Fortress shutting down.")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Google Fortress — Video Analysis API",
    description=(
        "Air-gapped video analysis using a locally-hosted Vision-Language Model. "
        "All inference is performed inside the cluster; no internet access required."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def extract_keyframes(video_path: Path, output_dir: Path) -> list[Path]:
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"OpenCV could not open video: {video_path}")

    fps: float = cap.get(cv2.CAP_PROP_FPS) or 25.0
    frame_step: int = max(1, int(fps * FRAME_INTERVAL_SECONDS))
    total_frames: int = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    log.info(
        "Video: %s | FPS=%.2f | total_frames=%d | extracting every %d frames",
        video_path.name,
        fps,
        total_frames,
        frame_step,
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    frame_idx = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_idx % frame_step == 0:
            out_path = output_dir / f"frame_{frame_idx:06d}.jpg"
            cv2.imwrite(str(out_path), frame)
            written.append(out_path)
        frame_idx += 1

    cap.release()
    log.info("Extracted %d keyframes from %s", len(written), video_path.name)
    return sorted(written)


async def analyze_frame(
    client: httpx.AsyncClient, frame_path: Path, frame_index: int, timestamp: float
) -> dict[str, Any]:
    with open(frame_path, "rb") as fh:
        image_b64 = base64.b64encode(fh.read()).decode("utf-8")

    payload = {
        "model": OLLAMA_MODEL,
        "prompt": ANALYSIS_PROMPT,
        "images": [image_b64],
        "stream": False,
    }

    try:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json=payload,
            timeout=LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        analysis_text = data.get("response", "").strip()
        return {
            "frame_index": frame_index,
            "frame_file": frame_path.name,
            "timestamp": timestamp,
            "analysis": analysis_text,
            "error": None,
        }
    except Exception as exc:
        log.error("Error analyzing frame %d: %s", frame_index, exc)
        return {
            "frame_index": frame_index,
            "frame_file": frame_path.name,
            "timestamp": timestamp,
            "analysis": None,
            "error": str(exc),
        }


async def process_video_job(job_id: str, video_path: Path) -> None:
    job = get_job(job_id)
    if not job:
        log.error("Job %s not found in DB", job_id)
        return

    job["status"] = JobStatus.PROCESSING
    job["started_at"] = time.time()
    save_job(job)

    frames_dir = UPLOAD_DIR / job_id / "frames"

    try:
        loop = asyncio.get_running_loop()
        frames: list[Path] = await loop.run_in_executor(
            None, extract_keyframes, video_path, frames_dir
        )

        if not frames:
            raise RuntimeError("No frames could be extracted from the video.")

        job["total_frames"] = len(frames)
        save_job(job)

        results: list[dict[str, Any]] = []
        async with httpx.AsyncClient() as client:
            for idx, frame_path in enumerate(frames):
                # Calculate timestamp based on frame index and interval
                timestamp = idx * FRAME_INTERVAL_SECONDS
                result = await analyze_frame(client, frame_path, idx, timestamp)
                results.append(result)
                job["processed_frames"] = idx + 1
                job["results"] = results
                save_job(job)

        job["status"] = JobStatus.DONE
        job["finished_at"] = time.time()
        save_job(job)
        log.info("Job %s complete", job_id)

    except Exception as exc:
        log.exception("Job %s failed", job_id)
        job["status"] = JobStatus.ERROR
        job["error"] = str(exc)
        job["finished_at"] = time.time()
        save_job(job)

    finally:
        if frames_dir.exists():
            shutil.rmtree(frames_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {"status": "ok", "service": "google-fortress-api"}


@app.post("/upload", status_code=202)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
) -> JSONResponse:
    job_id = str(uuid.uuid4())
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    safe_name = Path(file.filename or "upload.mp4").name
    video_path = job_dir / safe_name

    try:
        with open(video_path, "wb") as dest:
            while chunk := await file.read(1024 * 1024):
                dest.write(chunk)
    except Exception as exc:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to save upload: {exc}")

    job = {
        "job_id": job_id,
        "filename": safe_name,
        "status": JobStatus.QUEUED,
        "total_frames": None,
        "processed_frames": 0,
        "results": [],
        "error": None,
        "created_at": time.time(),
        "started_at": None,
        "finished_at": None,
    }
    save_job(job)

    background_tasks.add_task(process_video_job, job_id, video_path)

    return JSONResponse(
        status_code=202,
        content={
            "job_id": job_id,
            "message": "Video accepted. Poll /status/{job_id} for progress.",
        },
    )


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    elapsed: float | None = None
    if job["started_at"]:
        end = job["finished_at"] or time.time()
        elapsed = round(end - job["started_at"], 2)

    return {
        "job_id": job_id,
        "filename": job["filename"],
        "status": job["status"],
        "total_frames": job["total_frames"],
        "processed_frames": job["processed_frames"],
        "elapsed_seconds": elapsed,
        "error": job.get("error"),
    }


@app.get("/results/{job_id}")
async def get_results(job_id: str):
    job = get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job '{job_id}' not found.")

    if job["status"] == JobStatus.ERROR:
        return {
            "job_id": job_id,
            "filename": job["filename"],
            "status": job["status"],
            "error": job.get("error"),
        }

    duration = round((job["finished_at"] or 0) - (job["started_at"] or 0), 2)
    return {
        "job_id": job_id,
        "filename": job["filename"],
        "status": job["status"],
        "total_frames": job["total_frames"],
        "duration_seconds": duration,
        "frame_results": job["results"],
    }


@app.get("/jobs")
async def list_jobs():
    """Returns a list of all analysis jobs (history)."""
    return get_all_jobs()


@app.get("/video/{job_id}")
async def get_video(job_id: str):
    """Serves the uploaded video file for a given job."""
    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    job_dir = UPLOAD_DIR / job_id
    video_path = job_dir / job["filename"]

    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video file not found")

    return FileResponse(video_path, media_type="video/mp4")
