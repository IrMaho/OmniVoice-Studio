import os
import sys
import time
import json
import threading
from pathlib import Path

# Force disable XET (which connects to blocked AWS CAS) and use fast mirror
os.environ["HF_HUB_DISABLE_XET"] = "1"
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from huggingface_hub import hf_hub_download

REPO_ID = "k2-fsa/OmniVoice"
SNAPSHOT_DIR = Path.home() / ".cache" / "huggingface" / "hub" / "models--k2-fsa--OmniVoice"

FILES = [
    {"name": "audio_tokenizer/model.safetensors", "size_bytes": 805665628},      # 768.34 MB
    {"name": "model.safetensors", "size_bytes": 2450346080},                     # 2336.83 MB
]

TOTAL_MODEL_BYTES = 3267439000  # Total ~3116 MB
ALREADY_COMPLETED_BYTES = 11470000  # Configs + tokenizer.json (~11 MB)

status = {
    "current_file": "",
    "current_file_downloaded_bytes": 0,
    "current_file_total_bytes": 0,
    "current_file_percent": 0.0,
    "total_downloaded_mb": round(ALREADY_COMPLETED_BYTES / 1024 / 1024, 2),
    "total_target_mb": round(TOTAL_MODEL_BYTES / 1024 / 1024, 2),
    "total_percent": round((ALREADY_COMPLETED_BYTES / TOTAL_MODEL_BYTES) * 100, 2),
    "speed_mb_s": 0.0,
    "eta_seconds": 0,
    "is_done": False,
    "error": None,
}

stop_monitor = False

def get_blobs_size():
    blobs_dir = SNAPSHOT_DIR / "blobs"
    if not blobs_dir.exists():
        return 0
    total = 0
    for f in blobs_dir.glob("*"):
        try:
            total += f.stat().st_size
        except Exception:
            pass
    return total

def monitor():
    last_size = get_blobs_size()
    last_time = time.time()
    while not stop_monitor:
        time.sleep(1.0)
        curr_size = get_blobs_size()
        now = time.time()
        dt = max(now - last_time, 0.001)
        speed = max(0.0, (curr_size - last_size) / (dt * 1024 * 1024))
        last_size = curr_size
        last_time = now

        status["total_downloaded_mb"] = round(curr_size / 1024 / 1024, 2)
        status["total_percent"] = round(min(100.0, (curr_size / TOTAL_MODEL_BYTES) * 100), 2)
        status["speed_mb_s"] = round(speed, 2)
        remaining_mb = max(0.0, (TOTAL_MODEL_BYTES - curr_size) / 1024 / 1024)
        if speed > 0.01:
            status["eta_seconds"] = int(remaining_mb / speed)
        else:
            status["eta_seconds"] = 0

        with open("download_status.json", "w", encoding="utf-8") as f:
            json.dump(status, f, indent=2, ensure_ascii=False)

def main():
    global stop_monitor
    monitor_thread = threading.Thread(target=monitor, daemon=True)
    monitor_thread.start()

    print("Starting download with mirror https://hf-mirror.com ...", flush=True)
    start_all = time.time()

    for item in FILES:
        fname = item["name"]
        fsize = item["size_bytes"]
        status["current_file"] = fname
        status["current_file_total_bytes"] = fsize
        print(f"\n>>> Downloading: {fname} ({round(fsize / 1024 / 1024, 2)} MB) ...", flush=True)
        try:
            path = hf_hub_download(
                repo_id=REPO_ID,
                filename=fname,
            )
            print(f">>> Finished: {fname} -> {path}", flush=True)
        except Exception as e:
            status["error"] = str(e)
            with open("download_status.json", "w", encoding="utf-8") as f:
                json.dump(status, f, indent=2, ensure_ascii=False)
            print(f"Error downloading {fname}: {e}", flush=True)
            stop_monitor = True
            sys.exit(1)

    status["is_done"] = True
    status["total_percent"] = 100.0
    status["total_downloaded_mb"] = status["total_target_mb"]
    with open("download_status.json", "w", encoding="utf-8") as f:
        json.dump(status, f, indent=2, ensure_ascii=False)

    stop_monitor = True
    print(f"\nALL DOWNLOADS COMPLETED in {round(time.time() - start_all, 1)}s!", flush=True)

if __name__ == "__main__":
    main()
