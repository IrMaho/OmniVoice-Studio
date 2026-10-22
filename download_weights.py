import os
import sys
import time
from huggingface_hub import hf_hub_download

os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

FILES_TO_DOWNLOAD = [
    ("audio_tokenizer/model.safetensors", 768.34),
    ("model.safetensors", 2336.83),
]

TOTAL_MB = 3116.10
ALREADY_DOWNLOADED_MB = 10.94

print(f"=== OMNIVOICE MODEL DOWNLOADER ===", flush=True)
print(f"Total Model Size: {TOTAL_MB:.2f} MB", flush=True)
print(f"Initial completed: {ALREADY_DOWNLOADED_MB:.2f} MB", flush=True)

start_time = time.time()

for filename, size_mb in FILES_TO_DOWNLOAD:
    print(f"\n--- Downloading: {filename} ({size_mb:.2f} MB) ---", flush=True)
    f_start = time.time()
    try:
        path = hf_hub_download(
            repo_id="k2-fsa/OmniVoice",
            filename=filename,
            resume_download=True,
        )
        dt = time.time() - f_start
        print(f"Completed {filename} in {dt:.1f}s ({size_mb / max(dt, 0.001):.2f} MB/s)", flush=True)
        print(f"Saved to: {path}", flush=True)
    except Exception as e:
        print(f"Error downloading {filename}: {e}", flush=True)
        sys.exit(1)

# Download OpenVoice V2 Converter for instant Voice-to-Voice Conversion
print(f"\n--- Downloading: OpenVoice V2 Tone Color Converter (125 MB) ---", flush=True)
try:
    ov_dir = os.path.join("checkpoints", "openvoice_v2")
    hf_hub_download(repo_id="myshell-ai/OpenVoiceV2", filename="converter/config.json", local_dir=ov_dir)
    hf_hub_download(repo_id="myshell-ai/OpenVoiceV2", filename="converter/checkpoint.pth", local_dir=ov_dir)
    print("OpenVoice V2 Converter downloaded successfully!", flush=True)
except Exception as e:
    print(f"Warning: OpenVoice download error: {e}", flush=True)

total_time = time.time() - start_time
print(f"\nALL FILES DOWNLOADED SUCCESSFULLY in {total_time:.1f}s!", flush=True)
