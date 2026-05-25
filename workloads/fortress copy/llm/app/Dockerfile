# =============================================================================
# Dockerfile.llm — Google Fortress Offline LLM (Ollama + LLaVA weights baked in)
# =============================================================================
#
# Air-gap strategy — "baked weights" approach:
#   During the Docker BUILD phase (on the internet-connected build host),
#   this Dockerfile:
#     1. Launches the Ollama server in the background
#     2. Pulls the llava:7b model weights from the Ollama registry
#     3. Stops the server
#   The resulting image contains the model in /root/.ollama/models/
#   so it starts fully offline — no download happens at pod startup.
#
#   The finished image is exported with docker save and transferred via
#   USB/secure-file-transfer to the GDC appliance.
#
# Build:
#   (Run by build_and_export.sh — do not build manually)
#   docker build -f Dockerfile.llm -t fortress-llm:latest .
# =============================================================================

# ---- Stage 1: Pull base Ollama image -----------------------------------------
FROM ollama/ollama:latest AS model-builder

# ---- Bake model weights into the image ----------------------------------------
# We start the Ollama server, wait for it to become ready, then pull the model.
# The RUN instruction executes fully before the layer is committed, so the
# weights are frozen into the image layer — no network needed at runtime.
#
# Change OLLAMA_MODEL build-arg to swap models (e.g., llava:13b, bakllava:7b).
ARG OLLAMA_MODEL=moondream

RUN echo "==> Starting Ollama server in background for model pull..." && \
    ollama serve & \
    OLLAMA_PID=$! && \
    # Poll until the server is accepting requests (up to 60s)
    for i in $(seq 1 60); do \
    if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then \
    echo "==> Ollama is ready (attempt $i)"; break; \
    fi; \
    echo "==> Waiting for Ollama... ($i/60)"; \
    sleep 1; \
    done && \
    # Pull the target VLM model (weights land in /root/.ollama/models/)
    echo "==> Pulling model: ${OLLAMA_MODEL}" && \
    ollama pull "${OLLAMA_MODEL}" && \
    # Verify the model is registered
    echo "==> Verifying model listing:" && \
    ollama list && \
    # Cleanly stop Ollama so no stale PID files are committed
    kill "$OLLAMA_PID" && wait "$OLLAMA_PID" 2>/dev/null || true && \
    echo "==> Model bake complete."

# ---- Stage 2: Final runtime image ---------------------------------------------
# We copy the baked model directory from the builder stage into a fresh Ollama
# base image.  This keeps the final layer structure clean.
FROM ollama/ollama:latest

# Copy the pre-downloaded model weights from the builder
COPY --from=model-builder /root/.ollama /root/.ollama

# Persist the model name so the API knows what to request
ENV OLLAMA_MODEL=moondream

# ---- Health / metadata --------------------------------------------------------
# Default Ollama port — matched by k8s/llm-deployment.yaml Service
EXPOSE 11434

# Liveness check: Ollama's /api/tags lists loaded models (fast query)
HEALTHCHECK --interval=20s --timeout=10s --start-period=30s --retries=5 \
    CMD curl -sf http://localhost:11434/api/tags || exit 1

# ---- Entrypoint ---------------------------------------------------------------
# ollama serve starts the inference server; because weights are already on disk
# in /root/.ollama/models/, no download occurs — 100% offline startup.
CMD ["serve"]
