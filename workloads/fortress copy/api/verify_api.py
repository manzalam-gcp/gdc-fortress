import requests
import time
import os

API_URL = "http://localhost:8000"

def test_health():
    print("Testing /health...")
    response = requests.get(f"{API_URL}/health")
    print(f"Status: {response.status_code}, Response: {response.json()}")

def test_list_jobs():
    print("\nTesting /jobs (history)...")
    response = requests.get(f"{API_URL}/jobs")
    print(f"Status: {response.status_code}")
    jobs = response.json()
    print(f"Found {len(jobs)} jobs.")
    return jobs

def test_upload():
    print("\nTesting /upload...")
    # Create a dummy file for testing if needed, but better to use a real small video if available
    # For now, let's just check if the endpoint exists and returns 422 if no file is provided
    response = requests.post(f"{API_URL}/upload")
    print(f"Status (expected 422): {response.status_code}")

if __name__ == "__main__":
    try:
        test_health()
        test_list_jobs()
        test_upload()
    except Exception as e:
        print(f"Error: {e}")
        print("Ensure the API is running (e.g., via docker-compose up api)")
