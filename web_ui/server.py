import os
import sys
import time
import uuid
import json
import asyncio
import logging
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple

import torch
import numpy as np
import soundfile as sf
import uvicorn
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Ensure working directory is workspace
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

from omnivoice import OmniVoice, OmniVoiceGenerationConfig, VoiceClonePrompt
from omnivoice.utils.lang_map import LANG_NAMES, lang_display_name
from omnivoice.utils.persian_normalizer import normalize_persian_for_tts, is_persian_text, diacritize_persian
from omnivoice.utils.voice_converter import convert_voice_timbre

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("OmniVoiceStudio")

def scale_inter_word_pauses(
    audio_data: np.ndarray,
    sample_rate: int = 24000,
    pause_scale: float = 1.0,
    min_silence_len_ms: int = 65,
    silence_thresh_db: int = -42,
) -> np.ndarray:
    """
    Scale the duration of pauses, breaths and silences between words and phrases.
    - pause_scale < 1.0: tighter, faster, continuous word transitions.
    - pause_scale > 1.0: more relaxed, clear pauses and deliberate pacing.
    """
    if abs(pause_scale - 1.0) < 0.04 or len(audio_data) < sample_rate * 0.5:
        return audio_data

    try:
        from pydub import AudioSegment
        from pydub.silence import detect_nonsilent

        audio_int = (audio_data * 32768.0).clip(-32768, 32767).astype(np.int16)
        seg = AudioSegment(
            data=audio_int.tobytes(),
            sample_width=2,
            frame_rate=sample_rate,
            channels=1,
        )

        nonsilent_ranges = detect_nonsilent(
            seg,
            min_silence_len=min_silence_len_ms,
            silence_thresh=silence_thresh_db,
            seek_step=10,
        )

        if not nonsilent_ranges or len(nonsilent_ranges) <= 1:
            return audio_data

        output_seg = AudioSegment.silent(duration=0)
        last_end = 0

        for start, end in nonsilent_ranges:
            if start > last_end:
                orig_sil_dur = start - last_end
                new_sil_dur = max(15, int(orig_sil_dur * pause_scale))
                output_seg += AudioSegment.silent(duration=new_sil_dur, frame_rate=sample_rate)

            output_seg += seg[start:end]
            last_end = end

        if last_end < len(seg):
            trail_dur = max(30, int((len(seg) - last_end) * pause_scale))
            output_seg += AudioSegment.silent(duration=trail_dur, frame_rate=sample_rate)

        return np.array(output_seg.get_array_of_samples()).astype(np.float32) / 32768.0
    except Exception as e:
        logger.warning(f"Pause scaling warning: {e}")
        return audio_data

def apply_post_mastering(
    wav_data: np.ndarray,
    sample_rate: int = 24000,
    pitch_shift_steps: float = 0.0,
    normalize_volume: bool = True,
    pause_scale: float = 1.0,
) -> np.ndarray:
    """Post-processing audio mastering: Pause scaling, Pitch shift and peak normalization."""
    if abs(pause_scale - 1.0) >= 0.04:
        wav_data = scale_inter_word_pauses(wav_data, sample_rate, pause_scale=pause_scale)

    if abs(pitch_shift_steps) > 0.05:
        try:
            tensor_wav = torch.from_numpy(wav_data).unsqueeze(0).float()
            shifted = torchaudio.functional.pitch_shift(
                tensor_wav,
                sample_rate=sample_rate,
                n_steps=float(round(pitch_shift_steps * 2) / 2.0),
            )
            wav_data = shifted.squeeze(0).numpy()
        except Exception as pe:
            logger.warning(f"Pitch shift error: {pe}")

    if normalize_volume and len(wav_data) > 0:
        peak = np.max(np.abs(wav_data))
        if peak > 1e-4:
            wav_data = (wav_data / peak) * 0.92

    return wav_data

app = FastAPI(title="OmniVoice AI Studio", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STATIC_DIR = BASE_DIR / "web_ui" / "static"
OUTPUTS_DIR = BASE_DIR / "outputs"
PROFILES_DIR = BASE_DIR / "profiles"
PROFILES_JSON = PROFILES_DIR / "profiles.json"
CHECKPOINT_PATH = BASE_DIR / "checkpoints" / "OmniVoice"

OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)
PROFILES_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/outputs", StaticFiles(directory=str(OUTPUTS_DIR)), name="outputs")
app.mount("/profiles", StaticFiles(directory=str(PROFILES_DIR)), name="profiles")

PROFILES_PROMPT_CACHE: Dict[str, VoiceClonePrompt] = {}

def load_profiles_db() -> List[Dict[str, Any]]:
    if not PROFILES_JSON.exists():
        return []
    try:
        return json.loads(PROFILES_JSON.read_text(encoding="utf-8"))
    except Exception:
        return []

def save_profiles_db(profiles: List[Dict[str, Any]]) -> None:
    PROFILES_JSON.write_text(json.dumps(profiles, ensure_ascii=False, indent=2), encoding="utf-8")

# Global state
model: Optional[OmniVoice] = None
model_device = "cuda:0" if torch.cuda.is_available() else "cpu"
current_progress = {
    "is_busy": False,
    "task_id": None,
    "stage": "idle",
    "stage_text": "آماده برای تولید صدا",
    "step": 0,
    "total_steps": 32,
    "percent": 0,
    "elapsed_seconds": 0.0,
    "eta_seconds": 0.0,
    "error": None,
}

history_records: List[Dict[str, Any]] = [
    {
        "id": "hf_clone_exact",
        "mode": "Voice Clone (مشابه هاگینگ‌فیس)",
        "text": "سلام، این یک آزمایش شبیه‌سازی دقیق و مستقیم صدای من با هوش مصنوعی است.",
        "audio_url": "/outputs/test_hf_clone_exact.wav",
        "duration_sec": 9.32,
        "elapsed_sec": 6.8,
        "rtf": 0.73,
        "created_at": time.strftime("%H:%M:%S"),
    }
]

def get_gpu_info():
    if not torch.cuda.is_available():
        return {"has_gpu": False, "name": "CPU", "vram_used_mb": 0, "vram_total_mb": 0}
    try:
        dev = torch.cuda.current_device()
        name = torch.cuda.get_device_name(dev)
        mem_alloc = torch.cuda.memory_allocated(dev) / (1024 * 1024)
        mem_res = torch.cuda.memory_reserved(dev) / (1024 * 1024)
        total = torch.cuda.get_device_properties(dev).total_memory / (1024 * 1024)
        return {
            "has_gpu": True,
            "name": name,
            "vram_used_mb": round(mem_res, 1),
            "vram_total_mb": round(total, 1),
            "percent": round((mem_res / max(total, 1)) * 100, 1),
        }
    except Exception as e:
        return {"has_gpu": True, "name": "NVIDIA GPU", "vram_used_mb": 0, "vram_total_mb": 8188, "error": str(e)}

def load_omnivoice_model():
    global model
    if model is not None:
        return
    if torch.cuda.is_available():
        torch.backends.cudnn.benchmark = True
        torch.backends.cuda.matmul.allow_tf32 = True
        torch.backends.cudnn.allow_tf32 = True

    logger.info(f"Loading OmniVoice from {CHECKPOINT_PATH} on {model_device}...")
    model = OmniVoice.from_pretrained(
        str(CHECKPOINT_PATH),
        device_map=model_device,
        dtype=torch.float16 if "cuda" in model_device else torch.float32,
        load_asr=True,  # Whisper is already cached locally!
    )
    logger.info("OmniVoice model loaded successfully on GPU!")

tone_converter = None

def load_tone_converter():
    global tone_converter
    if tone_converter is not None:
        return tone_converter
    try:
        from openvoice.api import ToneColorConverter
        config_path = BASE_DIR / "checkpoints" / "openvoice_v2" / "converter" / "config.json"
        ckpt_path = BASE_DIR / "checkpoints" / "openvoice_v2" / "converter" / "checkpoint.pth"
        if not config_path.exists() or not ckpt_path.exists():
            logger.warning("OpenVoice converter checkpoint not found at: %s", ckpt_path)
            return None
        logger.info(f"Loading OpenVoice ToneColorConverter on {model_device}...")
        tone_converter = ToneColorConverter(str(config_path), device=model_device, enable_watermark=False)
        tone_converter.load_ckpt(str(ckpt_path))
        logger.info("OpenVoice ToneColorConverter loaded successfully!")
        return tone_converter
    except Exception as e:
        logger.error(f"Failed to load OpenVoice ToneColorConverter: {e}", exc_info=True)
        return None

@app.on_event("startup")
async def startup_event():
    load_omnivoice_model()
    load_tone_converter()

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = BASE_DIR / "web_ui" / "templates" / "index.html"
    if not index_file.exists():
        raise HTTPException(status_code=404, detail="Index template not found")
    return HTMLResponse(content=index_file.read_text(encoding="utf-8"))

@app.get("/api/system_info")
async def api_system_info():
    gpu = get_gpu_info()
    return {
        "status": "online",
        "device": model_device,
        "gpu": gpu,
        "languages": sorted(lang_display_name(n) for n in LANG_NAMES),
    }

@app.get("/api/progress")
async def api_progress():
    return current_progress

@app.post("/api/transcribe")
async def api_transcribe(audio: UploadFile = File(...)):
    """Transcribe a reference audio snippet using the cached Whisper model."""
    global model
    if model is None:
        load_omnivoice_model()

    temp_path = OUTPUTS_DIR / f"temp_{uuid.uuid4().hex[:8]}_{audio.filename}"
    try:
        content = await audio.read()
        with open(temp_path, "wb") as f:
            f.write(content)

        t0 = time.time()
        text = model.transcribe(str(temp_path))
        dt = time.time() - t0
        return {"success": True, "text": text, "elapsed_seconds": round(dt, 2)}
    except Exception as e:
        logger.error(f"Transcription error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}
    finally:
        if temp_path.exists():
            try:
                temp_path.unlink()
            except Exception:
                pass

@app.post("/api/clean-memory")
async def api_clean_memory():
    import gc
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()
        torch.cuda.ipc_collect()
    current_progress.update({"is_busy": False, "stage": "idle", "stage_text": "حافظه کارت گرافیک با موفقیت آزاد شد."})
    return {"success": True, "message": "حافظه کارت گرافیک با موفقیت پاکسازی شد."}

@app.post("/api/clone")
async def api_clone(
    text: str = Form(...),
    ref_text: Optional[str] = Form(None),
    language: Optional[str] = Form("Persian"),
    speed: float = Form(1.0),
    duration: Optional[float] = Form(None),
    pause_scale: float = Form(1.0),
    num_steps: int = Form(36),
    guidance_scale: float = Form(2.0),
    t_shift: float = Form(0.1),
    position_temperature: float = Form(5.0),
    class_temperature: float = Form(0.0),
    audio_chunk_duration: float = Form(12.0),
    denoise: bool = Form(True),
    seed: int = Form(-1),
    pitch_shift: float = Form(0.0),
    normalize_volume: bool = Form(True),
    save_as_profile: bool = Form(False),
    profile_name: Optional[str] = Form(None),
    profile_desc: Optional[str] = Form(None),
    audio: UploadFile = File(...),
):
    global model, current_progress
    if model is None:
        load_omnivoice_model()

    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="A generation task is already in progress.")

    task_id = uuid.uuid4().hex[:8]
    current_progress.update({
        "is_busy": True,
        "task_id": task_id,
        "stage": "uploading",
        "stage_text": "۱. دریافت و رمزگشایی فایل صوتی رفرنس...",
        "step": 0,
        "total_steps": num_steps,
        "percent": 10,
        "elapsed_seconds": 0.0,
        "eta_seconds": 0.0,
        "error": None,
    })

    ref_audio_path = OUTPUTS_DIR / f"ref_{task_id}_{audio.filename}"
    output_audio_path = OUTPUTS_DIR / f"clone_{task_id}.wav"
    output_audio_url = f"/outputs/clone_{task_id}.wav"

    try:
        content = await audio.read()
        with open(ref_audio_path, "wb") as f:
            f.write(content)

        # Safety: auto-clamp reference audio to max 12s to prevent CUDA OOM
        try:
            info = sf.info(str(ref_audio_path))
            if info.duration > 15.0:
                logger.warning(f"Uploaded reference audio is {info.duration:.1f}s. Auto-slicing to optimal 12s slice.")
                data_wav, sr_wav = sf.read(str(ref_audio_path))
                max_samples = int(12.0 * sr_wav)
                sf.write(str(ref_audio_path), data_wav[:max_samples], sr_wav)
                ref_text = None  # Force Whisper to auto-transcribe the 12s slice accurately
        except Exception as se:
            logger.warning(f"Audio inspection warning: {se}")

        t_start = time.time()

        current_progress.update({
            "stage": "tokenizing",
            "stage_text": "۲. استخراج ویژگی‌های صوتی با Higgs Audio Tokenizer...",
            "percent": 25,
        })
        await asyncio.sleep(0.05)

        # Build voice clone prompt
        clean_ref_text = ref_text.strip() if (ref_text and ref_text.strip()) else None
        logger.info(f"Creating voice clone prompt (manual ref_text: {'YES' if clean_ref_text else 'AUTO-WHISPER'})...")

        prompt = model.create_voice_clone_prompt(
            ref_audio=str(ref_audio_path),
            ref_text=clean_ref_text,
            preprocess_prompt=True,
        )

        current_progress.update({
            "stage": "diffusion",
            "stage_text": f"۳. اجرای دیفیوژن زبانی روی کارت گرافیک ({num_steps} گام با CFG={guidance_scale})...",
            "percent": 45,
        })
        await asyncio.sleep(0.05)

        # Smart Persian language detection and normalization
        is_fa = (language == "Persian" or language == "fa") or is_persian_text(text)
        if is_fa:
            clean_text = normalize_persian_for_tts(text)
            clean_text = diacritize_persian(clean_text)
            resolved_lang = "fa"
            logger.info(f"Persian text auto-detected and diacritized: {clean_text[:60]}...")
        else:
            clean_text = text.strip()
            resolved_lang = language if language and language != "Auto" else None

        if seed >= 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)

        # Run model generation in threadpool to keep event loop alive for SSE/telemetry
        loop = asyncio.get_event_loop()
        gen_config = OmniVoiceGenerationConfig(
            num_step=int(num_steps or 36),
            guidance_scale=float(guidance_scale or 2.0),
            t_shift=float(t_shift or 0.1),
            position_temperature=float(position_temperature if position_temperature is not None else 5.0),
            class_temperature=float(class_temperature if class_temperature is not None else 0.0),
            denoise=bool(denoise),
            preprocess_prompt=True,
            postprocess_output=True,
            audio_chunk_duration=float(audio_chunk_duration or 12.0),
        )
        gen_kwargs = {
            "text": clean_text,
            "language": resolved_lang,
            "voice_clone_prompt": prompt,
            "generation_config": gen_config,
        }
        if duration is not None and duration > 0:
            gen_kwargs["duration"] = float(duration)
        elif speed is not None and float(speed) != 1.0:
            gen_kwargs["speed"] = float(speed)

        # Simulated progress updater while CUDA computes
        async def update_simulation():
            p = 45
            while current_progress["is_busy"] and p < 92:
                await asyncio.sleep(0.3)
                p += 2
                current_progress["percent"] = min(92, p)
                current_progress["elapsed_seconds"] = round(time.time() - t_start, 1)

        sim_task = asyncio.create_task(update_simulation())

        generated_audio_list = await loop.run_in_executor(
            None, lambda: model.generate(**gen_kwargs)
        )
        sim_task.cancel()

        current_progress.update({
            "stage": "decoding",
            "stage_text": "۴. تبدیل توکن‌ها و مسترینگ نهایی صوت...",
            "percent": 95,
        })

        raw_wav = generated_audio_list[0]
        wav_data = apply_post_mastering(
            raw_wav, 24000, pitch_shift, normalize_volume, pause_scale=pause_scale
        )
        sf.write(str(output_audio_path), wav_data, 24000)

        dt = round(time.time() - t_start, 2)
        audio_dur = round(len(wav_data) / 24000.0, 2)
        rtf = round(dt / max(audio_dur, 0.01), 3)

        # Check if user requested saving as a permanent profile
        if save_as_profile and profile_name and profile_name.strip():
            try:
                prof_id = uuid.uuid4().hex[:8]
                prof_folder = PROFILES_DIR / prof_id
                prof_folder.mkdir(parents=True, exist_ok=True)

                prompt.save(str(prof_folder / "prompt.pt"))
                PROFILES_PROMPT_CACHE[prof_id] = prompt
                shutil.copyfile(str(ref_audio_path), str(prof_folder / "reference.wav"))
                sf.write(str(prof_folder / "preview.wav"), wav_data, 24000)

                profile_record = {
                    "id": prof_id,
                    "name": profile_name.strip(),
                    "description": profile_desc.strip() if profile_desc else "پروفایل گوینده ذخیره شده",
                    "preview_url": f"/profiles/{prof_id}/preview.wav",
                    "reference_url": f"/profiles/{prof_id}/reference.wav",
                    "guidance_scale": float(guidance_scale or 2.8),
                    "num_steps": int(num_steps or 32),
                    "greeting_text": text,
                    "ref_text": prompt.ref_text,
                    "preview_duration_sec": audio_dur,
                    "created_at": time.strftime("%Y-%m-%d %H:%M"),
                }
                profiles = load_profiles_db()
                profiles.insert(0, profile_record)
                save_profiles_db(profiles)
                logger.info(f"Auto-saved new profile: {profile_name} ({prof_id})")
            except Exception as pe:
                logger.warning(f"Failed to auto-save profile: {pe}")

        result_item = {
            "id": task_id,
            "mode": "Voice Clone",
            "text": text,
            "audio_url": output_audio_url,
            "duration_sec": audio_dur,
            "elapsed_sec": dt,
            "rtf": rtf,
            "created_at": time.strftime("%H:%M:%S"),
        }
        history_records.insert(0, result_item)

        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"تکمیل شد در {dt} ثانیه (طول صوت: {audio_dur}s)",
            "percent": 100,
            "elapsed_seconds": dt,
        })

        return {"success": True, "result": result_item}

    except torch.cuda.OutOfMemoryError as e:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.error(f"Clone CUDA OOM error: {e}")
        err_msg = "حافظه کارت گرافیک پر شد. حافظه GPU به صورت خودکار آزاد شد. لطفاً طول صوت مرجع را کوتاه‌تر (۳ تا ۱۰ ثانیه) انتخاب کنید."
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": err_msg,
            "error": err_msg,
        })
        return {"success": False, "error": err_msg}
    except Exception as e:
        logger.error(f"Clone error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در پردازش: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@app.post("/api/design")
async def api_design(
    text: str = Form(...),
    gender: str = Form("Female"),
    age: str = Form("Young Adult"),
    pitch: str = Form("Moderate Pitch"),
    style: Optional[str] = Form(None),
    accent: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    speed: float = Form(1.0),
    num_steps: int = Form(32),
):
    global model, current_progress
    if model is None:
        load_omnivoice_model()

    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="A generation task is already in progress.")

    task_id = uuid.uuid4().hex[:8]
    current_progress.update({
        "is_busy": True,
        "task_id": task_id,
        "stage": "preparing",
        "stage_text": "۱. آماده‌سازی پرامپت و ویژگی‌های کاراکتر صوتی...",
        "step": 0,
        "total_steps": num_steps,
        "percent": 15,
        "elapsed_seconds": 0.0,
        "eta_seconds": 0.0,
        "error": None,
    })

    output_audio_path = OUTPUTS_DIR / f"design_{task_id}.wav"
    output_audio_url = f"/outputs/design_{task_id}.wav"

    try:
        t_start = time.time()
        # Compose instruct text
        instruct_parts = [gender, age, pitch]
        if style:
            instruct_parts.append(style)
        if accent:
            instruct_parts.append(accent)
        instruct = ", ".join(instruct_parts)

        # Smart Persian language detection and normalization
        is_fa = (language == "Persian" or language == "fa") or is_persian_text(text)
        if is_fa:
            clean_text = normalize_persian_for_tts(text)
            resolved_lang = "fa"
            logger.info(f"Design - Persian text normalized: {clean_text[:60]}...")
        else:
            clean_text = text.strip()
            resolved_lang = language if language and language != "Auto" else None

        current_progress.update({
            "stage": "diffusion",
            "stage_text": f"۲. اجرای دیفیوژن زبانی روی GPU با ویژگی‌های [{instruct}]...",
            "percent": 40,
        })

        loop = asyncio.get_event_loop()
        gen_config = OmniVoiceGenerationConfig(
            num_step=int(num_steps or 32),
            guidance_scale=2.0,
            denoise=True,
            preprocess_prompt=True,
            postprocess_output=True,
            audio_chunk_duration=12.0,
        )
        gen_kwargs = {
            "text": clean_text,
            "language": resolved_lang,
            "instruct": instruct,
            "speed": speed,
            "generation_config": gen_config,
        }

        async def update_simulation():
            p = 40
            while current_progress["is_busy"] and p < 92:
                await asyncio.sleep(0.3)
                p += 3
                current_progress["percent"] = min(92, p)
                current_progress["elapsed_seconds"] = round(time.time() - t_start, 1)

        sim_task = asyncio.create_task(update_simulation())

        generated_audio_list = await loop.run_in_executor(
            None, lambda: model.generate(**gen_kwargs)
        )
        sim_task.cancel()

        current_progress.update({
            "stage": "decoding",
            "stage_text": "۳. دیکود صوتی و ساخت فایل خروجی...",
            "percent": 95,
        })

        wav_data = generated_audio_list[0]
        sf.write(str(output_audio_path), wav_data, 24000)

        dt = round(time.time() - t_start, 2)
        audio_dur = round(len(wav_data) / 24000.0, 2)
        rtf = round(dt / max(audio_dur, 0.01), 3)

        result_item = {
            "id": task_id,
            "mode": "Voice Design",
            "text": text,
            "instruct": instruct,
            "audio_url": output_audio_url,
            "duration_sec": audio_dur,
            "elapsed_sec": dt,
            "rtf": rtf,
            "created_at": time.strftime("%H:%M:%S"),
        }
        history_records.insert(0, result_item)

        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"تکمیل شد در {dt} ثانیه (طول صوت: {audio_dur}s)",
            "percent": 100,
            "elapsed_seconds": dt,
        })

        return {"success": True, "result": result_item}

    except torch.cuda.OutOfMemoryError as e:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.error(f"Design CUDA OOM: {e}")
        err_msg = "حافظه کارت گرافیک پر شد. حافظه آزاد شد."
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": err_msg,
            "error": err_msg,
        })
        return {"success": False, "error": err_msg}
    except Exception as e:
        logger.error(f"Design error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در تولید صدا: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

# ---------------------------------------------------------------------------
# Voice Profiles Management API
# ---------------------------------------------------------------------------

@app.get("/api/profiles")
async def api_get_profiles():
    profiles = load_profiles_db()
    return {"profiles": profiles}

@app.post("/api/profiles/create")
async def api_create_profile(
    name: str = Form(...),
    description: Optional[str] = Form(""),
    ref_text: Optional[str] = Form(None),
    guidance_scale: float = Form(2.0),
    num_steps: int = Form(36),
    greeting_text: Optional[str] = Form("سلام، این صدای شبیه‌سازی‌شده‌ی من است که برای همیشه ذخیره شده است."),
    audio: UploadFile = File(...),
):
    global model, current_progress
    if model is None:
        load_omnivoice_model()

    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="یک فرآیند دیگر در حال اجراست. لطفاً کمی صبر کنید.")

    prof_id = uuid.uuid4().hex[:8]
    prof_folder = PROFILES_DIR / prof_id
    prof_folder.mkdir(parents=True, exist_ok=True)

    current_progress.update({
        "is_busy": True,
        "task_id": prof_id,
        "stage": "uploading",
        "stage_text": f"۱. دریافت و ذخیره فایل صوتی برای پروفایل «{name}»...",
        "step": 0,
        "total_steps": num_steps,
        "percent": 15,
        "elapsed_seconds": 0.0,
        "eta_seconds": 0.0,
        "error": None,
    })

    ref_audio_path = prof_folder / "reference.wav"
    prompt_path = prof_folder / "prompt.pt"
    preview_path = prof_folder / "preview.wav"

    try:
        t_start = time.time()
        content = await audio.read()
        with open(ref_audio_path, "wb") as f:
            f.write(content)

        # Safety: auto-clamp reference audio to max 12s to prevent CUDA OOM
        try:
            info = sf.info(str(ref_audio_path))
            if info.duration > 15.0:
                logger.warning(f"Profile reference audio is {info.duration:.1f}s. Auto-slicing to optimal 12s.")
                data_wav, sr_wav = sf.read(str(ref_audio_path))
                max_samples = int(12.0 * sr_wav)
                sf.write(str(ref_audio_path), data_wav[:max_samples], sr_wav)
                ref_text = None
        except Exception as se:
            logger.warning(f"Profile duration inspection warning: {se}")

        current_progress.update({
            "stage": "tokenizing",
            "stage_text": "۲. استخراج و بهینه‌سازی ویژگی‌های صوتی با Higgs Audio Tokenizer...",
            "percent": 35,
        })
        await asyncio.sleep(0.05)

        clean_ref_text = ref_text.strip() if (ref_text and ref_text.strip()) else None

        # Build reusable voice clone prompt
        prompt = model.create_voice_clone_prompt(
            ref_audio=str(ref_audio_path),
            ref_text=clean_ref_text,
            preprocess_prompt=True,
        )

        current_progress.update({
            "stage": "saving_prompt",
            "stage_text": "۳. ذخیره دائمی وکتورهای صوتی گوینده در بانک پروفایل‌ها...",
            "percent": 55,
        })
        await asyncio.sleep(0.05)

        # Save prompt to disk and keep in RAM cache
        prompt.save(str(prompt_path))
        PROFILES_PROMPT_CACHE[prof_id] = prompt

        # Generate greeting preview audio ("سلام این صدای من است...")
        current_progress.update({
            "stage": "greeting",
            "stage_text": f"۴. تولید خودکار نمونه صدای خوش‌آمدگویی گوینده ({num_steps} گام دیفیوژن با CFG={guidance_scale})...",
            "percent": 70,
        })
        await asyncio.sleep(0.05)

        greeting_msg = greeting_text.strip() if (greeting_text and greeting_text.strip()) else "سلام، این صدای شبیه‌سازی‌شده‌ی من است که برای پروژه‌های شما آماده است."
        greeting_msg = normalize_persian_for_tts(greeting_msg)

        gen_config = OmniVoiceGenerationConfig(
            num_step=int(num_steps or 36),
            guidance_scale=float(guidance_scale or 2.0),
            denoise=True,
            preprocess_prompt=True,
            postprocess_output=True,
            audio_chunk_duration=12.0,
        )

        loop = asyncio.get_event_loop()
        generated_audio_list = await loop.run_in_executor(
            None,
            lambda: model.generate(
                text=greeting_msg,
                language="fa",
                voice_clone_prompt=prompt,
                generation_config=gen_config,
            )
        )

        wav_data = generated_audio_list[0]
        sf.write(str(preview_path), wav_data, 24000)

        dt = round(time.time() - t_start, 2)
        preview_dur = round(len(wav_data) / 24000.0, 2)

        profile_record = {
            "id": prof_id,
            "name": name.strip(),
            "description": description.strip() if description else "پروفایل گوینده اختصاصی",
            "preview_url": f"/profiles/{prof_id}/preview.wav",
            "reference_url": f"/profiles/{prof_id}/reference.wav",
            "guidance_scale": float(guidance_scale or 2.0),
            "num_steps": int(num_steps or 36),
            "greeting_text": greeting_msg,
            "ref_text": prompt.ref_text,
            "preview_duration_sec": preview_dur,
            "created_at": time.strftime("%Y-%m-%d %H:%M"),
        }

        profiles = load_profiles_db()
        profiles.insert(0, profile_record)
        save_profiles_db(profiles)

        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"پروفایل گوینده «{name}» با موفقیت ذخیره شد و آماده استفاده است!",
            "percent": 100,
            "elapsed_seconds": dt,
        })

        return {"success": True, "profile": profile_record}

    except torch.cuda.OutOfMemoryError as e:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.error(f"Profile creation CUDA OOM: {e}")
        err_msg = "حافظه کارت گرافیک پر شد. حافظه آزاد شد. لطفاً یک فایل صوتی کوتاه‌تر انتخاب کنید."
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": err_msg,
            "error": err_msg,
        })
        return {"success": False, "error": err_msg}
    except Exception as e:
        logger.error(f"Profile creation error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در ایجاد پروفایل: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@app.post("/api/profiles/{profile_id}/generate")
async def api_generate_from_profile(
    profile_id: str,
    text: str = Form(...),
    language: Optional[str] = Form("Persian"),
    speed: float = Form(1.0),
    duration: Optional[float] = Form(None),
    pause_scale: float = Form(1.0),
    num_steps: int = Form(36),
    guidance_scale: float = Form(2.0),
    t_shift: float = Form(0.1),
    position_temperature: float = Form(5.0),
    class_temperature: float = Form(0.0),
    audio_chunk_duration: float = Form(12.0),
    denoise: bool = Form(True),
    seed: int = Form(-1),
    pitch_shift: float = Form(0.0),
    normalize_volume: bool = Form(True),
):
    global model, current_progress
    if model is None:
        load_omnivoice_model()

    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="یک فرآیند دیگر در حال اجراست.")

    # Retrieve prompt from cache or disk
    prompt = PROFILES_PROMPT_CACHE.get(profile_id)
    if prompt is None:
        prompt_file = PROFILES_DIR / profile_id / "prompt.pt"
        if not prompt_file.exists():
            raise HTTPException(status_code=404, detail="پروفایل گوینده یافت نشد.")
        prompt = VoiceClonePrompt.load(str(prompt_file))
        PROFILES_PROMPT_CACHE[profile_id] = prompt

    profiles = load_profiles_db()
    prof_meta = next((p for p in profiles if p["id"] == profile_id), None)
    speaker_name = prof_meta["name"] if prof_meta else "گوینده انتخابی"

    task_id = uuid.uuid4().hex[:8]
    output_audio_path = OUTPUTS_DIR / f"profile_{profile_id}_{task_id}.wav"
    output_audio_url = f"/outputs/profile_{profile_id}_{task_id}.wav"

    current_progress.update({
        "is_busy": True,
        "task_id": task_id,
        "stage": "diffusion",
        "stage_text": f"تولید فوق‌سریع صدا با پروفایل «{speaker_name}» ({num_steps} گام، بدون تأخیر رفرنس)...",
        "step": 0,
        "total_steps": num_steps,
        "percent": 30,
        "elapsed_seconds": 0.0,
        "eta_seconds": 0.0,
        "error": None,
    })

    try:
        t_start = time.time()

        # Smart Persian language detection and normalization
        is_fa = (language == "Persian" or language == "fa") or is_persian_text(text)
        if is_fa:
            clean_text = normalize_persian_for_tts(text)
            clean_text = diacritize_persian(clean_text)
            resolved_lang = "fa"
            logger.info(f"Profile gen - Persian text diacritized: {clean_text[:60]}...")
        else:
            clean_text = text.strip()
            resolved_lang = language if language and language != "Auto" else None

        if seed >= 0:
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)

        gen_config = OmniVoiceGenerationConfig(
            num_step=int(num_steps or 36),
            guidance_scale=float(guidance_scale or 2.0),
            t_shift=float(t_shift or 0.1),
            position_temperature=float(position_temperature if position_temperature is not None else 5.0),
            class_temperature=float(class_temperature if class_temperature is not None else 0.0),
            denoise=bool(denoise),
            preprocess_prompt=True,
            postprocess_output=True,
            audio_chunk_duration=float(audio_chunk_duration or 12.0),
        )

        gen_kwargs = {
            "text": clean_text,
            "language": resolved_lang,
            "voice_clone_prompt": prompt,
            "generation_config": gen_config,
        }
        if duration is not None and duration > 0:
            gen_kwargs["duration"] = float(duration)
        elif speed is not None and float(speed) != 1.0:
            gen_kwargs["speed"] = float(speed)

        async def update_simulation():
            p = 30
            while current_progress["is_busy"] and p < 92:
                await asyncio.sleep(0.25)
                p += 3
                current_progress["percent"] = min(92, p)
                current_progress["elapsed_seconds"] = round(time.time() - t_start, 1)

        sim_task = asyncio.create_task(update_simulation())

        loop = asyncio.get_event_loop()
        generated_audio_list = await loop.run_in_executor(
            None, lambda: model.generate(**gen_kwargs)
        )
        sim_task.cancel()

        current_progress.update({
            "stage": "decoding",
            "stage_text": "تبدیل توکن‌ها و مسترینگ نهایی صوت...",
            "percent": 95,
        })

        raw_wav = generated_audio_list[0]
        wav_data = apply_post_mastering(
            raw_wav, 24000, pitch_shift, normalize_volume, pause_scale=pause_scale
        )
        sf.write(str(output_audio_path), wav_data, 24000)

        dt = round(time.time() - t_start, 2)
        audio_dur = round(len(wav_data) / 24000.0, 2)
        rtf = round(dt / max(audio_dur, 0.01), 3)

        result_item = {
            "id": task_id,
            "mode": f"پروفایل: {speaker_name}",
            "text": text,
            "audio_url": output_audio_url,
            "duration_sec": audio_dur,
            "elapsed_sec": dt,
            "rtf": rtf,
            "created_at": time.strftime("%H:%M:%S"),
        }
        history_records.insert(0, result_item)

        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"تکمیل شد در {dt} ثانیه (طول صوت: {audio_dur}s)",
            "percent": 100,
            "elapsed_seconds": dt,
        })

        return {"success": True, "result": result_item}

    except torch.cuda.OutOfMemoryError as e:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.error(f"Profile generate CUDA OOM error: {e}")
        err_msg = "حافظه کارت گرافیک پر شد. حافظه آزاد شد. لطفاً تعداد گام‌های کیفیت را روی ۲۴ یا ۳۶ بگذارید."
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": err_msg,
            "error": err_msg,
        })
        return {"success": False, "error": err_msg}
    except Exception as e:
        logger.error(f"Profile generate error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در پردازش: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@app.post("/api/convert-voice")
async def api_convert_voice(
    source_audio: UploadFile = File(...),
    profile_id: Optional[str] = Form(None),
    ref_audio: Optional[UploadFile] = File(None),
    convert_engine: str = Form("omnivoice"),
    transcribed_text: Optional[str] = Form(None),
    guidance_scale: float = Form(2.0),
    num_steps: int = Form(36),
    speed: float = Form(1.0),
    duration: Optional[float] = Form(None),
    pause_scale: float = Form(1.0),
    pitch_offset: float = Form(0.0),
    timbre_strength: float = Form(1.0),
    denoise: bool = Form(True),
    preserve_volume: bool = Form(True),
):
    """
    Intelligent Voice Conversion:
    1. 'omnivoice': Pure 100% Cloned Voice (OmniVoice Diffusion) with automated Whisper
       transcription + Persian diacritization. Exact likeness of the target profile!
    2. 'tone_color': Real-time Tone Color Converter with F0 pitch alignment.
    """
    global model, current_progress
    if model is None:
        load_omnivoice_model()

    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="یک فرآیند دیگر در حال اجراست.")

    task_id = uuid.uuid4().hex[:8]
    current_progress.update({
        "is_busy": True,
        "task_id": task_id,
        "stage": "uploading",
        "stage_text": "۱. دریافت فایل صوتی ورودی...",
        "step": 0,
        "total_steps": num_steps if convert_engine == "omnivoice" else 4,
        "percent": 15,
        "elapsed_seconds": 0.0,
        "eta_seconds": 0.0,
        "error": None,
    })

    src_audio_path = OUTPUTS_DIR / f"src_vc_{task_id}_{source_audio.filename}"
    out_audio_path = OUTPUTS_DIR / f"vc_{task_id}.wav"
    out_audio_url = f"/outputs/vc_{task_id}.wav"

    try:
        t_start = time.time()
        content = await source_audio.read()
        with open(src_audio_path, "wb") as f:
            f.write(content)

        # 1. Determine target speaker reference / prompt
        target_name = "گوینده هدف"
        prompt_path = None
        target_ref_path = None

        if profile_id:
            prof_folder = PROFILES_DIR / profile_id
            target_ref_file = prof_folder / "reference.wav"
            prompt_file = prof_folder / "prompt.pt"
            if not target_ref_file.exists():
                raise HTTPException(status_code=404, detail="پروفایل گوینده هدف یافت نشد.")
            target_ref_path = str(target_ref_file)
            if prompt_file.exists():
                prompt_path = str(prompt_file)
            profiles = load_profiles_db()
            prof_meta = next((p for p in profiles if p["id"] == profile_id), None)
            target_name = prof_meta["name"] if prof_meta else "گوینده پروفایل"
        elif ref_audio:
            target_ref_file = OUTPUTS_DIR / f"ref_vc_{task_id}_{ref_audio.filename}"
            with open(target_ref_file, "wb") as f:
                f.write(await ref_audio.read())
            target_ref_path = str(target_ref_file)
            target_name = "صوت مرجع انتخابی"
        else:
            profiles = load_profiles_db()
            if profiles:
                p_first = profiles[0]
                target_ref_path = str(PROFILES_DIR / p_first["id"] / "reference.wav")
                prompt_candidate = PROFILES_DIR / p_first["id"] / "prompt.pt"
                if prompt_candidate.exists():
                    prompt_path = str(prompt_candidate)
                target_name = p_first["name"]
            else:
                raise HTTPException(status_code=400, detail="هیچ گوینده هدفی انتخاب نشده است.")

        # 2. Execute selected conversion engine
        if convert_engine == "tone_color":
            # --- NEURAL TONE COLOR CONVERTER WITH F0 ALIGNMENT ---
            current_progress.update({
                "stage": "extracting_timbre",
                "stage_text": f"۲. استخراج مشخصات تار صوتی و رنگ صدای «{target_name}»...",
                "percent": 35,
            })
            tc = load_tone_converter()
            if tc is None:
                raise RuntimeError("ماژول تبدیل جنس صدای عصبی (OpenVoice) در دسترس نیست یا فایل وزن‌های آن بارگذاری نشده است.")

            # Target speaker embedding (cached per profile for instant execution)
            target_se = None
            if profile_id:
                prof_se_file = PROFILES_DIR / profile_id / "tone_se.pt"
                if prof_se_file.exists():
                    try:
                        target_se = torch.load(str(prof_se_file), map_location=model_device)
                    except Exception:
                        target_se = None
                if target_se is None:
                    target_se = tc.extract_se(target_ref_path)
                    try:
                        torch.save(target_se, str(prof_se_file))
                    except Exception:
                        pass
            else:
                target_se = tc.extract_se(target_ref_path)

            current_progress.update({
                "stage": "extracting_source",
                "stage_text": "۳. تطبیق فرکانس پایه (F0) و تحلیل تحریرهای صدا...",
                "percent": 60,
            })

            # Intelligent F0 Pitch Alignment: align base pitch register before tone transfer
            input_wav_for_tc = str(src_audio_path)
            try:
                y_s, sr_s = librosa.load(str(src_audio_path), sr=22050, duration=20)
                y_t, sr_t = librosa.load(target_ref_path, sr=22050, duration=20)
                f0_s, _, _ = librosa.pyin(y_s, fmin=50, fmax=400, sr=22050)
                f0_t, _, _ = librosa.pyin(y_t, fmin=50, fmax=400, sr=22050)
                med_s = float(np.nanmedian(f0_s))
                med_t = float(np.nanmedian(f0_t))
                if not np.isnan(med_s) and not np.isnan(med_t) and med_s > 40 and med_t > 40:
                    delta_st = 12.0 * np.log2(med_t / med_s)
                    # Clamp to natural pitch shift delta (-6 to +6 st)
                    delta_st_clamped = float(np.clip(delta_st, -6.0, 6.0))
                    if abs(delta_st_clamped) > 0.8:
                        y_full, sr_full = librosa.load(str(src_audio_path), sr=22050)
                        tens = torch.from_numpy(y_full).unsqueeze(0).float()
                        y_aligned = torchaudio.functional.pitch_shift(tens, 22050, n_steps=delta_st_clamped).squeeze(0).numpy()
                        aligned_path = OUTPUTS_DIR / f"aligned_{task_id}.wav"
                        sf.write(str(aligned_path), y_aligned, 22050)
                        input_wav_for_tc = str(aligned_path)
                        logger.info(f"ToneColor F0 alignment applied: {delta_st_clamped:.2f} semitones")
            except Exception as fe:
                logger.warning(f"F0 alignment skipped: {fe}")

            src_se = tc.extract_se(input_wav_for_tc)

            current_progress.update({
                "stage": "converting",
                "stage_text": f"۴. انتقال هوشمند تار صوتی به «{target_name}»...",
                "percent": 85,
            })

            tau_val = float(timbre_strength) * 0.1 if timbre_strength else 0.1
            tau_val = float(np.clip(tau_val, 0.0, 0.4))

            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: tc.convert(
                    audio_src_path=input_wav_for_tc,
                    src_se=src_se,
                    tgt_se=target_se,
                    output_path=str(out_audio_path),
                    tau=tau_val,
                )
            )

            if preserve_volume and out_audio_path.exists():
                try:
                    wav_out, sr_out = sf.read(str(out_audio_path))
                    peak = np.max(np.abs(wav_out))
                    if peak > 1e-4:
                        wav_out = (wav_out / peak) * 0.92
                        sf.write(str(out_audio_path), wav_out, sr_out)
                except Exception as ne:
                    logger.warning(f"Normalization warning: {ne}")

            src_info = sf.info(str(out_audio_path))
            audio_dur = round(src_info.duration, 2)
            dt = round(time.time() - t_start, 2)
            rtf = round(dt / max(audio_dur, 0.01), 3)

            result_item = {
                "id": task_id,
                "mode": f"تغییر مستقیم جنس صدا (S2S-VC عصبی) ➔ {target_name}",
                "text": "«تبدیل مستقیم صوت به صوت — حفظ ۱۰۰٪ ریتم، لحن، مکث، احساسات و لحن صحبت»",
                "audio_url": out_audio_url,
                "duration_sec": audio_dur,
                "elapsed_sec": dt,
                "rtf": rtf,
                "created_at": time.strftime("%H:%M:%S"),
            }
        elif convert_engine == "omnivoice":
            # --- OMNIVOICE NEURAL TTS ENGINE (Crystal clear, human, studio-quality) ---
            spoken_text = transcribed_text.strip() if (transcribed_text and transcribed_text.strip()) else ""
            if not spoken_text:
                current_progress.update({
                    "stage": "transcribing",
                    "stage_text": "۲. استخراج گفتار با مدل هوش مصنوعی Whisper...",
                    "percent": 30,
                })
                spoken_text = model.transcribe(str(src_audio_path))
                logger.info(f"VC Whisper auto-transcribed: {spoken_text[:100]}...")

            if not spoken_text or not spoken_text.strip():
                raise ValueError("گفتار یا کلام مشخصی در فایل صوتی ورودی تشخیص داده نشد.")

            clean_text = normalize_persian_for_tts(spoken_text)
            clean_text = diacritize_persian(clean_text)
            logger.info(f"VC diacritized text: {clean_text[:80]}...")

            current_progress.update({
                "stage": "diffusion",
                "stage_text": f"۳. سنتز گفتار با مدل OmniVoice و گوینده «{target_name}»...",
                "percent": 55,
            })

            # CFG 2.0 is optimal for natural human voice cloning (values >2.3 cause boominess & distortion)
            safe_cfg = float(guidance_scale or 2.0)
            if safe_cfg > 2.3:
                safe_cfg = 2.0

            gen_config = OmniVoiceGenerationConfig(
                num_step=int(num_steps or 36),
                guidance_scale=safe_cfg,
                denoise=bool(denoise),
                preprocess_prompt=True,
                postprocess_output=True,
                audio_chunk_duration=12.0,
            )

            # Get duration of source audio to preserve original pacing
            src_info = sf.info(str(src_audio_path))
            src_duration = src_info.duration

            gen_kwargs = {
                "text": clean_text,
                "language": "fa",
                "generation_config": gen_config,
            }
            if duration is not None and duration > 0:
                gen_kwargs["duration"] = float(duration)
            elif speed and float(speed) != 1.0:
                gen_kwargs["speed"] = float(speed)
            else:
                # Match the exact pacing of the original speaker!
                gen_kwargs["duration"] = round(src_duration, 1)

            if prompt_path:
                gen_kwargs["voice_clone_prompt"] = VoiceClonePrompt.load(prompt_path)
            else:
                gen_kwargs["ref_audio"] = target_ref_path

            async def update_simulation():
                p = 55
                while current_progress["is_busy"] and p < 92:
                    await asyncio.sleep(0.3)
                    p += 2
                    current_progress["percent"] = min(92, p)
                    current_progress["elapsed_seconds"] = round(time.time() - t_start, 1)

            sim_task = asyncio.create_task(update_simulation())
            loop = asyncio.get_event_loop()
            generated_audio_list = await loop.run_in_executor(
                None, lambda: model.generate(**gen_kwargs)
            )
            sim_task.cancel()

            current_progress.update({
                "stage": "decoding",
                "stage_text": "۴. تبدیل توکن‌ها و مسترینگ نهایی صدای شفاف...",
                "percent": 95,
            })

            raw_wav = generated_audio_list[0]
            wav_data = apply_post_mastering(raw_wav, 24000, 0.0, True, pause_scale=pause_scale)
            sf.write(str(out_audio_path), wav_data, 24000)

            dt = round(time.time() - t_start, 2)
            audio_dur = round(len(wav_data) / 24000.0, 2)
            rtf = round(dt / max(audio_dur, 0.01), 3)

            result_item = {
                "id": task_id,
                "mode": f"تبدیل صدا با هوش مصنوعی (OmniVoice) ➔ {target_name}",
                "text": f"«{clean_text[:90]}...»",
                "audio_url": out_audio_url,
                "duration_sec": audio_dur,
                "elapsed_sec": dt,
                "rtf": rtf,
                "created_at": time.strftime("%H:%M:%S"),
            }
        else:
            # --- DSP FREQUENCY / VOCODER (Mechanical pitch/formant shifting) ---
            current_progress.update({
                "stage": "morphing",
                "stage_text": "۲. انتقال فرکانسی و تغییر گام (DSP)...",
                "percent": 65,
            })
            loop = asyncio.get_event_loop()
            vc_res = await loop.run_in_executor(
                None,
                lambda: convert_voice_timbre(
                    source_wav_path=str(src_audio_path),
                    target_ref_path=target_ref_path,
                    output_wav_path=str(out_audio_path),
                    sample_rate=24000,
                    pitch_offset_semitones=pitch_offset,
                    timbre_strength=timbre_strength,
                    denoise_source=denoise,
                    preserve_volume=preserve_volume,
                )
            )
            dt = round(time.time() - t_start, 2)
            audio_dur = vc_res["duration_sec"]
            rtf = vc_res["rtf"]
            result_item = {
                "id": task_id,
                "mode": f"تغییر فرکانس DSP ➔ {target_name}",
                "text": f"شیفت گام: {vc_res['pitch_shift_applied']} نیم‌پرده • تار صوتی: {vc_res['target_f0']}Hz",
                "audio_url": out_audio_url,
                "duration_sec": audio_dur,
                "elapsed_sec": dt,
                "rtf": rtf,
                "created_at": time.strftime("%H:%M:%S"),
            }

        history_records.insert(0, result_item)
        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"تبدیل صدا در {dt} ثانیه تکمیل شد! (طول صوت: {audio_dur}s)",
            "percent": 100,
            "elapsed_seconds": dt,
        })
        return {"success": True, "result": result_item}

    except torch.cuda.OutOfMemoryError as e:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.error(f"Voice conversion CUDA OOM: {e}")
        err_msg = "حافظه کارت گرافیک پر شد. حافظه آزاد شد. لطفاً یک فایل صوتی کوتاه‌تر انتخاب کنید."
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": err_msg,
            "error": err_msg,
        })
        return {"success": False, "error": err_msg}
    except Exception as e:
        logger.error(f"Voice conversion error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در تغییر صدا: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@app.post("/api/diacritize")
async def api_diacritize(request: Request):
    """
    Intelligent Persian Auto-Diacritizer:
    Enhance Persian text with standard vowels/Harakat (fathe, kasre, zamme, ezafe, tashdid)
    to ensure 100% natural and accurate pronunciation in zero-shot cloning.
    """
    try:
        body = await request.json()
        raw_text = body.get("text", "")
        vowelized = diacritize_persian(raw_text)
        return {"success": True, "diacritized": vowelized}
    except Exception as e:
        logger.error(f"Diacritize error: {e}")
        return {"success": False, "error": str(e)}

_mms_model = None
_mms_tokenizer = None

def get_mms_persian():
    global _mms_model, _mms_tokenizer
    if _mms_model is None:
        from transformers import VitsModel, AutoTokenizer
        logger.info("Loading Meta MMS Persian TTS (facebook/mms-tts-fas)...")
        _mms_tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-fas")
        _mms_model = VitsModel.from_pretrained("facebook/mms-tts-fas")
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _mms_model.to(device)
        logger.info("Meta MMS Persian TTS loaded successfully.")
    return _mms_model, _mms_tokenizer

@app.post("/api/native-tts")
async def api_native_tts(
    text: str = Form(...),
    speed: float = Form(1.0),
    pause_scale: float = Form(1.0),
    pitch_shift: float = Form(0.0),
    normalize_volume: bool = Form(True),
):
    """
    Meta MMS Native Persian Broadcast Engine:
    Generates crystal-clear, accent-free, studio-quality native Persian speech
    using Meta MMS-TTS (fas) at 16,000 Hz with post-mastering.
    """
    global current_progress
    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="یک فرآیند دیگر در حال اجراست.")

    task_id = uuid.uuid4().hex[:8]
    output_audio_path = OUTPUTS_DIR / f"mms_native_{task_id}.wav"
    output_audio_url = f"/outputs/mms_native_{task_id}.wav"

    current_progress.update({
        "is_busy": True,
        "task_id": task_id,
        "stage": "diffusion",
        "stage_text": "تولید صوت فارسی اصیل و بدون لهجه با گوینده رسمی Meta MMS...",
        "step": 0,
        "total_steps": 10,
        "percent": 30,
        "elapsed_seconds": 0.0,
        "eta_seconds": 0.0,
        "error": None,
    })

    try:
        t_start = time.time()
        mms_model, mms_tok = get_mms_persian()
        device = next(mms_model.parameters()).device

        # Preprocess text
        clean_text = normalize_persian_for_tts(text)

        inputs = mms_tok(clean_text, return_tensors="pt").to(device)
        with torch.no_grad():
            output = mms_model(**inputs).waveform

        raw_wav = output[0].cpu().numpy().astype(np.float32)

        # Speed adjustment if needed
        if abs(speed - 1.0) >= 0.05:
            try:
                import librosa
                raw_wav = librosa.effects.time_stretch(raw_wav, rate=speed)
            except Exception as e:
                logger.warning(f"Speed stretch warning: {e}")

        # Post mastering (pauses, pitch, normalization) at 16000 Hz
        wav_data = apply_post_mastering(
            raw_wav, 16000, pitch_shift, normalize_volume, pause_scale=pause_scale
        )
        sf.write(str(output_audio_path), wav_data, 16000)

        dt = round(time.time() - t_start, 2)
        audio_dur = round(len(wav_data) / 16000.0, 2)
        rtf = round(dt / max(audio_dur, 0.01), 3)

        result_item = {
            "id": task_id,
            "mode": "گوینده رسمی فارسی (Meta MMS)",
            "text": text,
            "audio_url": output_audio_url,
            "duration_sec": audio_dur,
            "elapsed_sec": dt,
            "rtf": rtf,
            "created_at": time.strftime("%H:%M:%S"),
        }
        history_records.insert(0, result_item)

        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"تولید صوت رسمی در {dt} ثانیه تکمیل شد! (طول صوت: {audio_dur}s)",
            "percent": 100,
            "elapsed_seconds": dt,
        })

        return {"success": True, "result": result_item}

    except torch.cuda.OutOfMemoryError as e:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        logger.error(f"MMS CUDA OOM: {e}")
        err_msg = "حافظه GPU پر شد. حافظه آزاد شد."
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": err_msg,
            "error": err_msg,
        })
        return {"success": False, "error": err_msg}
    except Exception as e:
        logger.error(f"MMS error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در تولید با گوینده رسمی: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

@app.delete("/api/profiles/{profile_id}")
async def api_delete_profile(profile_id: str):
    prof_folder = PROFILES_DIR / profile_id
    if prof_folder.exists():
        shutil.rmtree(prof_folder, ignore_errors=True)
    
    PROFILES_PROMPT_CACHE.pop(profile_id, None)
    profiles = load_profiles_db()
    profiles = [p for p in profiles if p["id"] != profile_id]
    save_profiles_db(profiles)
    return {"success": True, "message": "پروفایل گوینده با موفقیت حذف شد."}

@app.get("/api/history")
async def api_history():
    return {"history": history_records}

# ---------------------------------------------------------------------------
# Multi-Speaker Audio Story & Dialogue Studio (داستان صوتی و نمایش رادیویی)
# ---------------------------------------------------------------------------
def synthesize_dialogue_line(
    text: str,
    speaker_id: str,
    speed: float = 1.0,
    pitch_shift: float = 0.0,
    guidance_scale: float = 2.0,
    num_steps: int = 36,
) -> np.ndarray:
    """
    Synthesize a single dialogue line for a given speaker profile or MMS.
    Returns 1D np.float32 audio array at 24000 Hz.
    """
    if speaker_id == "mms":
        mms_model, mms_tok = get_mms_persian()
        device = next(mms_model.parameters()).device
        clean_text = normalize_persian_for_tts(text)
        inputs = mms_tok(clean_text, return_tensors="pt").to(device)
        with torch.no_grad():
            output = mms_model(**inputs).waveform
        raw_wav = output[0].cpu().numpy().astype(np.float32)
        if abs(speed - 1.0) >= 0.05:
            try:
                import librosa
                raw_wav = librosa.effects.time_stretch(raw_wav, rate=speed)
            except Exception:
                pass
        import librosa
        wav_24k = librosa.resample(raw_wav, orig_sr=16000, target_sr=24000)
        return apply_post_mastering(wav_24k, sample_rate=24000, pitch_shift_steps=pitch_shift, normalize_volume=True)

    global model
    if model is None:
        load_omnivoice_model()

    prof_folder = PROFILES_DIR / speaker_id
    prompt_file = prof_folder / "prompt.pt"
    ref_audio_file = prof_folder / "reference.wav"

    clean_text = normalize_persian_for_tts(text)
    clean_text = diacritize_persian(clean_text)

    safe_cfg = float(guidance_scale or 2.0)
    if safe_cfg > 2.5:
        safe_cfg = 2.0

    gen_config = OmniVoiceGenerationConfig(
        num_step=int(num_steps or 36),
        guidance_scale=safe_cfg,
        denoise=True,
        preprocess_prompt=True,
        postprocess_output=True,
        audio_chunk_duration=12.0,
    )

    gen_kwargs = {
        "text": clean_text,
        "language": "fa",
        "speed": float(speed or 1.0),
        "generation_config": gen_config,
    }

    if speaker_id in PROFILES_PROMPT_CACHE:
        gen_kwargs["voice_clone_prompt"] = PROFILES_PROMPT_CACHE[speaker_id]
    elif prompt_file.exists():
        prompt = VoiceClonePrompt.load(str(prompt_file))
        PROFILES_PROMPT_CACHE[speaker_id] = prompt
        gen_kwargs["voice_clone_prompt"] = prompt
    elif ref_audio_file.exists():
        gen_kwargs["ref_audio"] = str(ref_audio_file)
    else:
        profiles = load_profiles_db()
        if profiles:
            p_id = profiles[0]["id"]
            p_pt = PROFILES_DIR / p_id / "prompt.pt"
            if p_pt.exists():
                gen_kwargs["voice_clone_prompt"] = VoiceClonePrompt.load(str(p_pt))

    audio_list = model.generate(**gen_kwargs)
    raw_wav = audio_list[0]
    return apply_post_mastering(raw_wav, sample_rate=24000, pitch_shift_steps=pitch_shift, normalize_volume=True)


def assemble_story_audio(
    dialogue_wavs: List[np.ndarray],
    pause_after_list: List[float],
    repeat_list: List[int],
    sample_rate: int = 24000,
) -> Tuple[np.ndarray, List[Dict[str, float]]]:
    """
    Seamless crossfade stitching of dialogues with repetitions and custom pauses.
    Returns: (master_wav, timeline_timestamps)
    """
    fade_len = int(sample_rate * 0.015)  # 15ms anti-click crossfade
    fade_in = np.linspace(0, 1, fade_len, dtype=np.float32)
    fade_out = np.linspace(1, 0, fade_len, dtype=np.float32)

    master_chunks = []
    timeline = []
    current_time_sec = 0.0

    for idx, (wav, pause_after, repeat_count) in enumerate(zip(dialogue_wavs, pause_after_list, repeat_list)):
        repeats = max(1, int(repeat_count))
        p_sec = max(0.0, float(pause_after))

        line_start = current_time_sec

        for r in range(repeats):
            w = wav.copy()
            if len(w) > fade_len * 2:
                w[:fade_len] *= fade_in
                w[-fade_len:] *= fade_out

            master_chunks.append(w)
            current_time_sec += len(w) / sample_rate

            if r < repeats - 1:
                repeat_pause = int(sample_rate * 0.25)
                master_chunks.append(np.zeros(repeat_pause, dtype=np.float32))
                current_time_sec += 0.25

        line_end = current_time_sec
        timeline.append({
            "index": idx,
            "start_sec": round(line_start, 2),
            "end_sec": round(line_end, 2),
            "duration_sec": round(line_end - line_start, 2)
        })

        if p_sec > 0.005:
            pause_samples = int(sample_rate * p_sec)
            master_chunks.append(np.zeros(pause_samples, dtype=np.float32))
            current_time_sec += p_sec

    master_wav = np.concatenate(master_chunks) if master_chunks else np.zeros(sample_rate, dtype=np.float32)
    peak = np.max(np.abs(master_wav))
    if peak > 1e-4:
        master_wav = (master_wav / peak) * 0.94

    return master_wav, timeline


@app.post("/api/story/preview-line")
async def api_story_preview_line(request: Request):
    """Generate audio for a single dialogue line for preview."""
    try:
        data = await request.json()
        text = data.get("text", "").strip()
        speaker_id = data.get("speaker_id", "mms")
        speed = float(data.get("speed", 1.0))
        pitch_shift = float(data.get("pitch_shift", 0.0))
        num_steps = int(data.get("num_steps", 24))
        guidance_scale = float(data.get("guidance_scale", 2.0))

        if not text:
            raise HTTPException(status_code=400, detail="متن دیالوگ خالی است.")

        task_id = uuid.uuid4().hex[:8]
        out_path = OUTPUTS_DIR / f"line_{task_id}.wav"
        out_url = f"/outputs/line_{task_id}.wav"

        loop = asyncio.get_event_loop()
        wav = await loop.run_in_executor(
            None,
            lambda: synthesize_dialogue_line(
                text=text,
                speaker_id=speaker_id,
                speed=speed,
                pitch_shift=pitch_shift,
                guidance_scale=guidance_scale,
                num_steps=num_steps,
            )
        )

        sf.write(str(out_path), wav, 24000)
        dur = round(len(wav) / 24000.0, 2)
        return {"success": True, "audio_url": out_url, "duration_sec": dur}
    except Exception as e:
        logger.error(f"Story preview line error: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


@app.post("/api/story/generate")
async def api_story_generate(request: Request):
    """
    Generate and stitch a full multi-speaker audio story/dialogue.
    """
    global current_progress
    if current_progress["is_busy"]:
        raise HTTPException(status_code=429, detail="یک فرآیند دیگر در حال اجراست.")

    try:
        data = await request.json()
        title = data.get("title", "داستان صوتی").strip() or "داستان صوتی"
        dialogues = data.get("dialogues", [])

        if not dialogues:
            raise HTTPException(status_code=400, detail="حداقل یک دیالوگ برای تولید داستان صوتی لازم است.")

        total_lines = len(dialogues)
        task_id = uuid.uuid4().hex[:8]
        t_start = time.time()

        current_progress.update({
            "is_busy": True,
            "task_id": task_id,
            "stage": "diffusion",
            "stage_text": f"آغاز ساخت سناریو صوتی «{title}» ({total_lines} دیالوگ)...",
            "step": 0,
            "total_steps": total_lines,
            "percent": 5,
            "elapsed_seconds": 0.0,
            "eta_seconds": 0.0,
            "error": None,
        })

        generated_wavs = []
        pause_list = []
        repeat_list = []

        loop = asyncio.get_event_loop()

        for idx, item in enumerate(dialogues):
            line_text = item.get("text", "").strip()
            speaker_id = item.get("speaker_id", "mms")
            speaker_name = item.get("speaker_name", "گوینده")
            speed = float(item.get("speed", 1.0))
            pitch = float(item.get("pitch_shift", 0.0))
            pause_after = float(item.get("pause_after", 0.5))
            repeats = int(item.get("repeat_count", 1))
            steps = int(item.get("num_steps", 24))
            cfg = float(item.get("guidance_scale", 2.0))

            if not line_text:
                continue

            current_progress.update({
                "stage": "diffusion",
                "stage_text": f"تولید دیالوگ {idx+1} از {total_lines}: گوینده «{speaker_name}»...",
                "step": idx + 1,
                "percent": int(10 + ((idx / max(total_lines, 1)) * 80)),
                "elapsed_seconds": round(time.time() - t_start, 1),
            })

            wav = await loop.run_in_executor(
                None,
                lambda t=line_text, s=speaker_id, sp=speed, p=pitch, c=cfg, st=steps: synthesize_dialogue_line(
                    text=t,
                    speaker_id=s,
                    speed=sp,
                    pitch_shift=p,
                    guidance_scale=c,
                    num_steps=st,
                )
            )

            generated_wavs.append(wav)
            pause_list.append(pause_after)
            repeat_list.append(repeats)

        current_progress.update({
            "stage": "decoding",
            "stage_text": f"میکس و مونتاژ پیوسته تمام دیالوگ‌ها و فیدهای صوتی...",
            "percent": 95,
        })

        master_wav, timeline = assemble_story_audio(
            generated_wavs,
            pause_list,
            repeat_list,
            sample_rate=24000,
        )

        out_audio_path = OUTPUTS_DIR / f"story_{task_id}.wav"
        out_audio_url = f"/outputs/story_{task_id}.wav"
        sf.write(str(out_audio_path), master_wav, 24000)

        dt = round(time.time() - t_start, 2)
        total_dur = round(len(master_wav) / 24000.0, 2)
        rtf = round(dt / max(total_dur, 0.01), 3)

        result_item = {
            "id": task_id,
            "mode": f"داستان صوتی و دیالوگ چندنفره: «{title}»",
            "text": f"سناریوی چندنفره شامل {len(generated_wavs)} دیالوگ با ترکیب صداها",
            "audio_url": out_audio_url,
            "duration_sec": total_dur,
            "elapsed_sec": dt,
            "rtf": rtf,
            "created_at": time.strftime("%H:%M:%S"),
        }
        history_records.insert(0, result_item)

        current_progress.update({
            "is_busy": False,
            "stage": "completed",
            "stage_text": f"داستان صوتی در {dt} ثانیه ساخته شد! (طول کل: {total_dur}s)",
            "percent": 100,
            "elapsed_seconds": dt,
        })

        return {
            "success": True,
            "story_id": task_id,
            "title": title,
            "audio_url": out_audio_url,
            "duration_sec": total_dur,
            "timeline": timeline,
            "elapsed_sec": dt,
        }

    except Exception as e:
        logger.error(f"Story generation error: {e}", exc_info=True)
        current_progress.update({
            "is_busy": False,
            "stage": "error",
            "stage_text": f"خطا در ساخت داستان صوتی: {str(e)}",
            "error": str(e),
        })
        return {"success": False, "error": str(e)}
    finally:
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
