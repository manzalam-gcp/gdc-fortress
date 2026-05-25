# =============================================================================
# Dockerfile.api — Google Fortress FastAPI + OpenCV Backend
# =============================================================================
#
# Build:
#   (Run by build_push_deploy.sh — do not build manually)
#   docker build -f Dockerfile.api -t fortress-api:latest .
# =============================================================================

FROM python:3.11-slim-bookworm

# ---- System dependencies ------------------------------------------------------
# libgl1 / libglib2.0-0: required by opencv-python-headless for codec support
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# ---- Python dependencies ------------------------------------------------------
# Standard pip install — internet is available on the GDC sandbox build host.
WORKDIR /app
COPY requirements.txt /app/requirements.txt

RUN pip install --no-cache-dir -r /app/requirements.txt

# ---- Application code ---------------------------------------------------------
COPY main.py /app/main.py

# ---- Runtime configuration ----------------------------------------------------
# UPLOAD_DIR is mounted from the PersistentVolumeClaim defined in k8s/pvc.yaml
ENV UPLOAD_DIR=/app/uploads \
    OLLAMA_BASE_URL=http://llm-service.google-fortress.svc.cluster.local:11434 \
    OLLAMA_MODEL=llava:7b \
    FRAME_INTERVAL_SECONDS=5 \
    LLM_TIMEOUT_SECONDS=120 \
    PYTHONUNBUFFERED=1

RUN mkdir -p /app/uploads

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uvicorn", "main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000", \
    "--workers", "4", \
    "--log-level", "info"]
