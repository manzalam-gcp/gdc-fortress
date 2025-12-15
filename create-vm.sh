#!/bin/bash

# --- Configuration ---

source .env

PROJECT_ID=$WORKLOAD_PROJECT
IMAGE_PROJECT="vm-system"
BOOT_DISK_SIZE="64GB"

# --- Input Validation ---
if [ "$#" -ne 3 ]; then
    echo "Usage: $0 <INSTANCE_NAME> <MACHINE_TYPE> <IMAGE TYPE>"
    echo "Example: $0 test-vm n3-standard-2-gdc rocky-8-v20250210-gdch"
    exit 1
fi

INSTANCE_NAME=$1
MACHINE_TYPE=$2
IMAGE=$3

# --- Execution ---
echo "----------------------------------------"
echo "Creating VM: $INSTANCE_NAME"
echo "Type:        $MACHINE_TYPE"
echo "Project:     $PROJECT_ID"
echo "----------------------------------------"

gdcloud compute instances create "$INSTANCE_NAME" \
    --project "$PROJECT_ID" \
    --image "$IMAGE" \
    --image-project "$IMAGE_PROJECT" \
    --machine-type "$MACHINE_TYPE" \
    --boot-disk-size "$BOOT_DISK_SIZE" \

# --- Status Check ---
if [ $? -eq 0 ]; then
    echo ""
    echo " Success: VM '$INSTANCE_NAME' has been created."
else
    echo ""
    echo " Error: Failed to create VM. See output above for details."
    exit 1
fi