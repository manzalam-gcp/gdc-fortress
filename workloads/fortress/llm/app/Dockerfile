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
# =============================================================================
# Dockerfile.llm — Google Fortress Offline LLM (CPU-Only + Layer-Split)
# =============================================================================
# Harbor is rejecting the massive 1.5GB CUDA/ROCm layer from the official 
# ollama/ollama:latest base image. Since this environment is CPU-only, we can 
# strip out the GPU libraries by copying just the ollama binary into a fresh 
# Ubuntu image, and then layering our chunked model on top.

# --- Stage 1: Extract the Ollama binary ---
FROM ollama/ollama:latest AS ollama-bin

# --- Stage 2: Pull and chunk the model ---
FROM ollama/ollama:latest AS builder
ARG OLLAMA_MODEL=moondream

RUN echo "==> Starting Ollama server to pull model..." && \
    ollama serve & \
    OLLAMA_PID=$! && \
    sleep 5 && \
    ollama pull "${OLLAMA_MODEL}" && \
    kill "$OLLAMA_PID" && wait "$OLLAMA_PID" 2>/dev/null || true

RUN cd /root/.ollama/models/blobs && \
    BIG_FILE=$(ls -S | head -n 1) && \
    echo "Splitting $BIG_FILE into chunks..." && \
    echo "$BIG_FILE" > big_file_name.txt && \
    split -b 300M "$BIG_FILE" chunk_ && \
    rm "$BIG_FILE" && \
    touch dummy_ab dummy_ac dummy_ad dummy_ae dummy_af

# --- Stage 3: Rebuild with a lightweight Ubuntu base ---
FROM ubuntu:22.04 AS layer1
RUN apt-get update && apt-get install -y curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=ollama-bin /bin/ollama /bin/ollama
COPY --from=builder /root/.ollama/models/blobs/chunk_aa /root/.ollama/models/blobs/chunk_aa

FROM layer1 AS layer2
COPY --from=builder /root/.ollama/models/blobs/chunk_ab* /root/.ollama/models/blobs/dummy_ab /root/.ollama/models/blobs/

FROM layer2 AS layer3
COPY --from=builder /root/.ollama/models/blobs/chunk_ac* /root/.ollama/models/blobs/dummy_ac /root/.ollama/models/blobs/

FROM layer3 AS layer4
COPY --from=builder /root/.ollama/models/blobs/chunk_ad* /root/.ollama/models/blobs/dummy_ad /root/.ollama/models/blobs/

FROM layer4 AS layer5
COPY --from=builder /root/.ollama/models/blobs/chunk_ae* /root/.ollama/models/blobs/dummy_ae /root/.ollama/models/blobs/

FROM layer5 AS layer6
COPY --from=builder /root/.ollama/models/blobs/chunk_af* /root/.ollama/models/blobs/dummy_af /root/.ollama/models/blobs/

FROM layer6 AS final
COPY --from=builder /root/.ollama/models/manifests /root/.ollama/models/manifests/
COPY --from=builder /root/.ollama/models/blobs/sha256* /root/.ollama/models/blobs/
COPY --from=builder /root/.ollama/models/blobs/big_file_name.txt /root/.ollama/models/blobs/

ENV OLLAMA_MODEL=moondream
ENV OLLAMA_HOST=0.0.0.0
EXPOSE 11434

HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -sf http://localhost:11434/api/tags || exit 1

CMD echo "Reassembling model weights..." && \
    cd /root/.ollama/models/blobs && \
    rm -f dummy_* && \
    BIG_FILE=$(cat big_file_name.txt) && \
    cat chunk_* > "$BIG_FILE" && \
    rm chunk_* big_file_name.txt && \
    echo "Starting Ollama..." && \
    ollama serve
