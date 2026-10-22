import os
import sys
import time
import torch
import soundfile as sf
import librosa

# Add project root to sys.path
sys.path.insert(0, r"c:\Users\ASUS\Desktop\flutter_project\voiceClone")

from omnivoice import OmniVoice, OmniVoiceGenerationConfig, VoiceClonePrompt

def test_omnivoice_vc():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    model_path = r"c:\Users\ASUS\Desktop\flutter_project\voiceClone\OmniVoice"
    if not os.path.exists(model_path):
        model_path = "k2-fsa/OmniVoice"

    # We can connect to running server or test directly
    # Let's test with the running server API directly via requests!
    import requests

    server_url = "http://127.0.0.1:8001"
    
    # 1. Check if server is accessible
    resp = requests.get(f"{server_url}/api/profiles")
    print("Profiles:", resp.json())

    # Let's find an input audio to convert
    input_audio_path = r"C:\Users\ASUS\Downloads\Telegram Desktop\zzzzzzz.ogg"
    if not os.path.exists(input_audio_path):
        # find any audio in uploads or outputs
        candidates = list(Path(r"c:\Users\ASUS\Desktop\flutter_project\voiceClone\web_ui\uploads").glob("*.*"))
        if candidates:
            input_audio_path = str(candidates[0])
        else:
            print("No candidate audio found")
            return

    print(f"Testing with input audio: {input_audio_path}")

test_omnivoice_vc()
