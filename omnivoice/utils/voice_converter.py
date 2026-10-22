import time
import logging
from pathlib import Path
from typing import Optional, Tuple, Dict, Any

import numpy as np
import scipy.signal as signal
import soundfile as sf
import torch
import torchaudio
import librosa

logger = logging.getLogger("VoiceConverter")

def extract_speaker_acoustic_profile(wav_data: np.ndarray, sample_rate: int = 24000) -> Dict[str, Any]:
    """Extract fundamental pitch statistics and spectral envelope from reference audio."""
    if len(wav_data) < sample_rate * 0.5:
        # Too short, default values
        return {
            "median_f0": 120.0,
            "mean_f0": 120.0,
            "spectral_env": np.ones(513),
        }
    
    # 1. Pitch F0
    try:
        f0, voiced_flags, _ = librosa.pyin(
            wav_data,
            fmin=50,
            fmax=550,
            sr=sample_rate,
            frame_length=1024,
            hop_length=256,
        )
        voiced_f0 = f0[voiced_flags]
        median_f0 = float(np.median(voiced_f0)) if len(voiced_f0) > 0 else 120.0
    except Exception as e:
        logger.warning(f"Pitch extraction fallback: {e}")
        median_f0 = 120.0

    # 2. Spectral envelope (formant distribution)
    n_fft = 1024
    hop_length = 256
    stft = np.abs(librosa.stft(wav_data, n_fft=n_fft, hop_length=hop_length))
    spec_env = np.mean(stft, axis=1) # average energy per frequency bin
    
    # Smooth with Savitzky-Golay
    if len(spec_env) >= 31:
        spec_env_smooth = signal.savgol_filter(spec_env, 31, 3)
    else:
        spec_env_smooth = spec_env

    return {
        "median_f0": median_f0,
        "spectral_env": spec_env_smooth,
    }


def convert_voice_timbre(
    source_wav_path: str,
    target_ref_path: str,
    output_wav_path: str,
    sample_rate: int = 24000,
    pitch_offset_semitones: float = 0.0,
    timbre_strength: float = 1.0,
    denoise_source: bool = True,
    preserve_volume: bool = True,
) -> Dict[str, Any]:
    """
    Direct Speech-to-Speech Voice Conversion (Timbre & Frequency Transfer):
    Transforms source audio into target speaker's vocal frequency and formant structure
    without speech-to-text synthesis, preserving 100% of the original accent, timing,
    emotional inflections, pauses, and cadence.
    """
    t0 = time.time()
    
    # 1. Load source audio
    src_wav, sr = librosa.load(source_wav_path, sr=sample_rate)
    if len(src_wav) == 0:
        raise ValueError("فایل صوتی ورودی خالی است.")

    # Optional mild noise gate / low cut filter
    if denoise_source:
        sos = signal.butter(4, 40, 'hp', fs=sample_rate, output='sos')
        src_wav = signal.sosfilt(sos, src_wav)

    # 2. Load target reference audio
    target_wav, _ = librosa.load(target_ref_path, sr=sample_rate)
    
    # Extract profiles
    target_profile = extract_speaker_acoustic_profile(target_wav, sample_rate)
    source_profile = extract_speaker_acoustic_profile(src_wav, sample_rate)

    f0_target = target_profile["median_f0"]
    f0_source = source_profile["median_f0"]

    # 3. Compute pitch shift required to align fundamental frequencies
    auto_semitones = 12.0 * np.log2(max(f0_target, 50.0) / max(f0_source, 50.0))
    total_semitones = (auto_semitones * timbre_strength) + pitch_offset_semitones
    # Bound reasonable pitch shift (-14 to +14 semitones)
    total_semitones = float(np.clip(total_semitones, -14.0, 14.0))

    logger.info(f"Voice Conversion: source F0={f0_source:.1f}Hz, target F0={f0_target:.1f}Hz, shift={total_semitones:.2f} st")

    # 4. Phase-vocoder pitch shift using torchaudio
    if abs(total_semitones) > 0.15:
        src_tensor = torch.from_numpy(src_wav).float().unsqueeze(0)
        # Shift in half-semitone steps for stability
        shifted_tensor = torchaudio.functional.pitch_shift(
            src_tensor,
            sample_rate,
            n_steps=float(round(total_semitones * 2) / 2.0),
        )
        shifted_wav = shifted_tensor.squeeze(0).numpy()
    else:
        shifted_wav = src_wav

    # 5. Formant & Spectral Envelope Morphing
    n_fft = 1024
    hop_length = 256
    
    stft_src = librosa.stft(shifted_wav, n_fft=n_fft, hop_length=hop_length)
    mag_src = np.abs(stft_src)
    phase_src = np.angle(stft_src)

    current_env = np.mean(mag_src, axis=1)
    if len(current_env) >= 31:
        current_env = signal.savgol_filter(current_env, 31, 3)

    target_env = target_profile["spectral_env"]

    # Transfer ratio
    ratio = (target_env + 1e-4) / (current_env + 1e-4)
    # Blend according to timbre_strength
    ratio = 1.0 + timbre_strength * (ratio - 1.0)
    # Clip ratio to prevent harsh resonances
    ratio = np.clip(ratio, 0.35, 2.8)
    if len(ratio) >= 25:
        ratio_smooth = signal.savgol_filter(ratio, 25, 2)
    else:
        ratio_smooth = ratio

    # Apply spectral filter
    stft_morphed = (mag_src * ratio_smooth[:, np.newaxis]) * np.exp(1j * phase_src)
    morphed_wav = librosa.istft(stft_morphed, hop_length=hop_length, length=len(shifted_wav))

    # 6. Peak Normalization
    peak = np.max(np.abs(morphed_wav))
    if peak > 1e-4 and preserve_volume:
        morphed_wav = (morphed_wav / peak) * 0.92

    # 7. Write output file
    sf.write(output_wav_path, morphed_wav, sample_rate)

    dt = round(time.time() - t0, 2)
    duration = round(len(morphed_wav) / float(sample_rate), 2)
    rtf = round(dt / max(duration, 0.01), 3)

    return {
        "success": True,
        "output_path": output_wav_path,
        "duration_sec": duration,
        "elapsed_sec": dt,
        "rtf": rtf,
        "pitch_shift_applied": round(total_semitones, 2),
        "source_f0": round(f0_source, 1),
        "target_f0": round(f0_target, 1),
    }
