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
# Dockerfile.llm — Google Fortress Offline LLM (Layer-Split Workaround)
# =============================================================================
# Harbor often throws 500 timeouts on layers > 1GB. This Dockerfile pulls the 
# model, splits the massive weights file into 300MB chunks (forcing Docker to 
# create smaller layers), and reassembles them at runtime.

FROM ollama/ollama:latest AS builder

ARG OLLAMA_MODEL=moondream

RUN echo "==> Starting Ollama server to pull model..." && \
    ollama serve & \
    OLLAMA_PID=$! && \
    sleep 5 && \
    ollama pull "${OLLAMA_MODEL}" && \
    kill "$OLLAMA_PID" && wait "$OLLAMA_PID" 2>/dev/null || true

# Find the largest blob (the weights), split it into 300MB chunks, and save its name
RUN cd /root/.ollama/models/blobs && \
    BIG_FILE=$(ls -S | head -n 1) && \
    echo "Splitting $BIG_FILE into chunks..." && \
    echo "$BIG_FILE" > big_file_name.txt && \
    split -b 300M "$BIG_FILE" chunk_ && \
    rm "$BIG_FILE" && \
    touch dummy_ab dummy_ac dummy_ad dummy_ae dummy_af

# --- Create smaller layers by copying chunks one by one ---
FROM ollama/ollama:latest AS layer1
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
# Copy the rest of the metadata and small files
COPY --from=builder /root/.ollama/models/manifests /root/.ollama/models/manifests/
COPY --from=builder /root/.ollama/models/blobs/sha256* /root/.ollama/models/blobs/
COPY --from=builder /root/.ollama/models/blobs/big_file_name.txt /root/.ollama/models/blobs/

ENV OLLAMA_MODEL=moondream
EXPOSE 11434

HEALTHCHECK --interval=20s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -sf http://localhost:11434/api/tags || exit 1

# Reassemble the chunks at runtime before starting the server
CMD echo "Reassembling model weights..." && \
    cd /root/.ollama/models/blobs && \
    rm -f dummy_* && \
    BIG_FILE=$(cat big_file_name.txt) && \
    cat chunk_* > "$BIG_FILE" && \
    rm chunk_* big_file_name.txt && \
    echo "Starting Ollama..." && \
    ollama serve
