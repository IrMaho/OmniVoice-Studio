/**
 * app.js - Main Application Controller for OmniVoice Studio
 * Features: Zero-Scroll Ergonomic Layout, Instant Voice Cloning, Speaker Bank, Telemetry
 */

let trimmer = null;
let currentProgressInterval = null;
let activeCloneMode = 'profile'; // 'profile' or 'custom'
let cachedProfiles = [];
let selectedProfile = null;

let activeInputType = 'text'; // 'text' or 'voice_convert'
let vcSourceFile = null;

document.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  initUniversalConfirmModal();
  initTrimmer();
  initTabs();
  initSystemTelemetry();
  initCloneModeToggle();
  initInputTypeSwitcher();
  initTtsEngineSelector();
  initVoiceConversionUI();
  initAdvancedStudioControls();
  initCadenceAndSpeedControls();
  initQuickPauseToolbar();
  initCfgSlider();
  initProfilesManager();
  initSaveSpeakerModal();
  initEditProfileModal();
  initFormActions();
  initStoryStudio();
  initScenarioLibrary();
  initVideoScrubber();
  loadProfiles();
  loadHistory();
});

// ---------------------------------------------------------------------------
// 1. Theme Manager (Light & Dark with auto-persistence)
// ---------------------------------------------------------------------------
function initThemeManager() {
  const themeBtn = document.getElementById('theme-toggle-btn');
  const storedTheme = localStorage.getItem('omnivoice_theme') || 'dark';

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('omnivoice_theme', theme);
    if (themeBtn) {
      themeBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      themeBtn.title = theme === 'dark' ? 'تغییر به تم روشن' : 'تغییر به تم تیره';
    }
    if (trimmer) {
      trimmer.draw();
    }
  };

  applyTheme(storedTheme);

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
}

// ---------------------------------------------------------------------------
// 1.1. Universal Centered Confirmation Modal
// ---------------------------------------------------------------------------
let currentConfirmResolver = null;

function initUniversalConfirmModal() {
  const modal = document.getElementById('confirm-delete-modal');
  const btnDanger = document.getElementById('btn-confirm-modal-danger');
  const btnCancel = document.getElementById('btn-confirm-modal-cancel');

  if (btnDanger) {
    btnDanger.addEventListener('click', () => {
      closeConfirmModal(true);
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener('click', () => {
      closeConfirmModal(false);
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeConfirmModal(false);
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal && modal.style.display !== 'none') {
      closeConfirmModal(false);
    }
  });
}

function showConfirmModal({
  title = 'تایید حذف',
  message = 'آیا از حذف این مورد اطمینان دارید؟ این عملیات غیرقابل بازگشت است.',
  confirmText = 'بله، حذف کن',
  cancelText = 'انصراف',
  icon = '🗑️'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-delete-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const msgEl = document.getElementById('confirm-modal-message');
    const btnDanger = document.getElementById('btn-confirm-modal-danger');
    const btnCancel = document.getElementById('btn-confirm-modal-cancel');
    const iconEl = modal ? modal.querySelector('.confirm-modal-icon') : null;

    if (!modal) {
      resolve(window.confirm(message));
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (btnDanger) btnDanger.textContent = confirmText;
    if (btnCancel) btnCancel.textContent = cancelText;
    if (iconEl) iconEl.textContent = icon;

    currentConfirmResolver = resolve;
    modal.style.display = 'flex';
  });
}

function closeConfirmModal(result) {
  const modal = document.getElementById('confirm-delete-modal');
  if (modal) modal.style.display = 'none';
  if (currentConfirmResolver) {
    const cb = currentConfirmResolver;
    currentConfirmResolver = null;
    cb(result);
  }
}
window.showConfirmModal = showConfirmModal;

// ---------------------------------------------------------------------------
// 2. Waveform Trimmer (Compact Precision Editor)
// ---------------------------------------------------------------------------
function initTrimmer() {
  const timeStartEl = document.getElementById('trim-start-time');
  const timeEndEl = document.getElementById('trim-end-time');
  const timeDurationEl = document.getElementById('trim-duration-badge');
  const playbackTimerEl = document.getElementById('trim-playback-time');

  trimmer = new AudioTrimmer('waveform-canvas', {
    onSelectionChange: (sel) => {
      if (timeStartEl) timeStartEl.textContent = formatSeconds(sel.startTime);
      if (timeEndEl) timeEndEl.textContent = formatSeconds(sel.endTime);
      if (timeDurationEl) {
        timeDurationEl.textContent = `${sel.duration.toFixed(1)}s`;
        if (sel.duration > 12) {
          timeDurationEl.style.color = '#ef4444';
          timeDurationEl.title = 'طول صوت بیشتر از ۱۲ ثانیه است؛ برای شباهت دقیق‌تر بهتر است بین ۳ تا ۷ ثانیه باشد.';
        } else {
          timeDurationEl.style.color = 'var(--color-success)';
          timeDurationEl.title = 'طول ایده‌آل برای کلون دقیق';
        }
      }
      if (playbackTimerEl && !trimmer?.isPlaying && !trimmer?.isPaused) {
        playbackTimerEl.textContent = `⏱️ ${formatSeconds(sel.startTime)} / ${sel.duration.toFixed(1)}s`;
      }
    },
    onLoaded: (dur, name) => {
      const nameEl = document.getElementById('audio-file-name');
      const durEl = document.getElementById('audio-total-duration');
      if (nameEl) nameEl.textContent = name;
      if (durEl) durEl.textContent = `${dur.toFixed(1)}s`;
      if (playbackTimerEl) {
        playbackTimerEl.textContent = `⏱️ 00:00.0 / ${Math.min(5.0, dur).toFixed(1)}s`;
      }
      document.getElementById('trimmer-wrapper').style.display = 'flex';
      document.getElementById('drop-zone').style.display = 'none';
    },
    onPlaybackChange: (state) => {
      const playBtn = document.getElementById('btn-play-trim');
      const iconSpan = document.getElementById('btn-play-trim-icon');
      const textSpan = document.getElementById('btn-play-trim-text');

      if (state.isPlaying) {
        if (iconSpan) iconSpan.textContent = '⏸️';
        if (textSpan) textSpan.textContent = 'مکث';
        if (playBtn) {
          playBtn.classList.add('playing');
          playBtn.title = 'مکث صدا (کلید Space)';
        }
      } else if (state.isPaused) {
        if (iconSpan) iconSpan.textContent = '▶️';
        if (textSpan) textSpan.textContent = 'ادامه پخش';
        if (playBtn) {
          playBtn.classList.remove('playing');
          playBtn.title = 'ادامه پخش از موقعیت مکث (کلید Space)';
        }
      } else {
        if (iconSpan) iconSpan.textContent = '▶️';
        if (textSpan) textSpan.textContent = 'پخش برش';
        if (playBtn) {
          playBtn.classList.remove('playing');
          playBtn.title = 'پخش برش صوتی (کلید Space)';
        }
      }

      if (playbackTimerEl) {
        const cur = formatSeconds(state.currentTime);
        const dur = (state.duration).toFixed(1);
        playbackTimerEl.textContent = `⏱️ ${cur} / ${dur}s`;
      }
    }
  });

  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('audio-file-input');

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        handleAudioUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        handleAudioUpload(e.target.files[0]);
      }
    });
  }

  // Preset buttons
  const p1 = document.getElementById('preset-first-3s');
  const p2 = document.getElementById('preset-first-5s');
  const p3 = document.getElementById('preset-mid-5s');

  if (p1) p1.addEventListener('click', () => trimmer.setSelection(0, 3));
  if (p2) p2.addEventListener('click', () => trimmer.setSelection(0, 5));
  if (p3) p3.addEventListener('click', () => {
    const mid = trimmer.duration / 2;
    trimmer.setSelection(Math.max(0, mid - 2.5), Math.min(trimmer.duration, mid + 2.5));
  });

  // Play / Pause preview toggle
  const playBtn = document.getElementById('btn-play-trim');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (trimmer) trimmer.togglePlayPause();
    });
  }

  // Rewind button (⏪ 1s)
  const rewindBtn = document.getElementById('btn-rewind-trim');
  if (rewindBtn) {
    rewindBtn.addEventListener('click', () => {
      if (trimmer) trimmer.seekRelative(-1.0);
    });
  }

  // Fast-forward button (⏩ 1s)
  const forwardBtn = document.getElementById('btn-forward-trim');
  if (forwardBtn) {
    forwardBtn.addEventListener('click', () => {
      if (trimmer) trimmer.seekRelative(1.0);
    });
  }

  // Stop button (⏹️)
  const stopBtn = document.getElementById('btn-stop-trim');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (trimmer) trimmer.stop();
    });
  }

  // Change audio file
  const changeBtn = document.getElementById('btn-change-audio');
  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      if (trimmer) trimmer.stop();
      if (fileInput) fileInput.value = '';
      document.getElementById('trimmer-wrapper').style.display = 'none';
      document.getElementById('drop-zone').style.display = 'flex';
    });
  }
}

function handleAudioUpload(file) {
  if (!file) return;
  const isVideo = (file.type && file.type.startsWith('video/')) || /\.(mp4|mkv|webm|mov|avi|flv|ts|m4v)$/i.test(file.name);
  if (isVideo) {
    if (window.openVideoScrubber) {
      window.openVideoScrubber(file);
      return;
    }
  }
  if (trimmer) trimmer.loadAudioFile(file);
}

// ---------------------------------------------------------------------------
// 3. Navigation Tabs
// ---------------------------------------------------------------------------
function initTabs() {
  const tabBtns = document.querySelectorAll('.nav-tab');
  const tabViews = {
    'tab-btn-clone': document.getElementById('view-clone'),
    'tab-btn-story': document.getElementById('view-story'),
    'tab-btn-profiles': document.getElementById('view-profiles'),
    'tab-btn-design': document.getElementById('view-design'),
    'tab-btn-history': document.getElementById('view-history'),
  };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.values(tabViews).forEach(view => {
        if (view) view.style.display = 'none';
      });

      const activeView = tabViews[btn.id];
      if (activeView) activeView.style.display = 'flex';

      if (btn.id === 'tab-btn-history') loadHistory();
      if (btn.id === 'tab-btn-profiles') loadProfiles();
      if (btn.id === 'tab-btn-story' && typeof renderStoryDialogues === 'function') {
        renderStoryDialogues();
      }
    });
  });

  const navToProfBtn = document.getElementById('btn-nav-to-profiles');
  if (navToProfBtn) {
    navToProfBtn.addEventListener('click', () => {
      const profTabBtn = document.getElementById('tab-btn-profiles');
      if (profTabBtn) profTabBtn.click();
    });
  }
}

// ---------------------------------------------------------------------------
// 4. Clone Mode Toggle (Saved Profile vs Custom Audio)
// ---------------------------------------------------------------------------
function initCloneModeToggle() {
  const btnProfile = document.getElementById('btn-mode-profile');
  const btnCustom = document.getElementById('btn-mode-custom');
  const containerProfile = document.getElementById('container-mode-profile');
  const containerCustom = document.getElementById('container-mode-custom');
  const submitLabel = document.getElementById('btn-generate-clone-label');

  function setMode(mode) {
    activeCloneMode = mode;
    if (mode === 'profile') {
      btnProfile.classList.add('active');
      btnCustom.classList.remove('active');
      containerProfile.style.display = 'flex';
      containerCustom.style.display = 'none';
      if (submitLabel) submitLabel.textContent = 'تولید فوری صدا با گوینده ذخیره‌شده (فوق‌سریع)';
    } else {
      btnCustom.classList.add('active');
      btnProfile.classList.remove('active');
      containerProfile.style.display = 'none';
      containerCustom.style.display = 'flex';
      if (submitLabel) submitLabel.textContent = 'کلون صدا با فایل صوتی جدید (Zero-Shot)';
      if (trimmer) setTimeout(() => trimmer.draw(), 50);
    }
  }

  if (btnProfile && btnCustom) {
    btnProfile.addEventListener('click', () => setMode('profile'));
    btnCustom.addEventListener('click', () => setMode('custom'));
  }

  const chkSave = document.getElementById('chk-save-as-profile');
  const saveFields = document.getElementById('save-as-profile-fields');
  if (chkSave && saveFields) {
    chkSave.addEventListener('change', () => {
      saveFields.style.display = chkSave.checked ? 'grid' : 'none';
    });
  }
}

// ---------------------------------------------------------------------------
// 4.1. Input Type Switcher (Text vs Voice Conversion)
// ---------------------------------------------------------------------------
function initInputTypeSwitcher() {
  const btnText = document.getElementById('btn-input-type-text');
  const btnAudio = document.getElementById('btn-input-type-audio');
  const sectionText = document.getElementById('section-input-text');
  const sectionVc = document.getElementById('section-input-voice-convert');
  const stripSettings = document.getElementById('strip-standard-settings');
  const submitLabel = document.getElementById('btn-generate-clone-label');

  if (!btnText || !btnAudio) return;

  btnText.addEventListener('click', () => {
    activeInputType = 'text';
    btnText.classList.add('active');
    btnAudio.classList.remove('active');
    if (sectionText) sectionText.style.display = 'flex';
    if (sectionVc) sectionVc.style.display = 'none';
    if (stripSettings) stripSettings.style.display = 'grid';
    if (submitLabel) {
      submitLabel.textContent = activeCloneMode === 'profile'
        ? 'تولید فوری صدا با گوینده ذخیره‌شده (فوق‌سریع)'
        : 'کلون صدا با فایل صوتی جدید (Zero-Shot)';
    }
  });

  btnAudio.addEventListener('click', () => {
    activeInputType = 'voice_convert';
    btnAudio.classList.add('active');
    btnText.classList.remove('active');
    if (sectionText) sectionText.style.display = 'none';
    if (sectionVc) sectionVc.style.display = 'flex';
    if (window._updateVcEngineUI) {
      window._updateVcEngineUI();
    } else {
      if (stripSettings) stripSettings.style.display = 'grid';
      if (submitLabel) submitLabel.textContent = '👑 تبدیل با صدای ۱۰۰٪ خالص کلون‌شده (حداکثر شباهت استودیویی)';
    }
  });
}

// ---------------------------------------------------------------------------
// 4.2. Direct Voice Conversion UI (Dropzone, player, sliders)
// ---------------------------------------------------------------------------
function initVoiceConversionUI() {
  const dropZone = document.getElementById('vc-drop-zone');
  const fileInput = document.getElementById('vc-file-input');
  const previewCard = document.getElementById('vc-audio-preview-card');
  const fileNameEl = document.getElementById('vc-file-name');
  const fileDurEl = document.getElementById('vc-file-dur');
  const player = document.getElementById('vc-audio-player');
  const changeBtn = document.getElementById('btn-vc-change-file');
  const quickTranscribeBtn = document.getElementById('btn-vc-quick-transcribe');
  const transcriptTextarea = document.getElementById('vc-override-text');
  const transcribeStatus = document.getElementById('vc-transcribe-status');

  const engineToneRadio = document.getElementById('engine-vc-tone');
  const engineOmniRadio = document.getElementById('engine-vc-omnivoice');
  const labelEngineTone = document.getElementById('label-vc-engine-tone');
  const labelEngineOmni = document.getElementById('label-vc-engine-omnivoice');
  const timbreStrengthRow = document.getElementById('vc-timbre-strength-row');
  const stripSettings = document.getElementById('strip-standard-settings');
  const submitLabel = document.getElementById('btn-generate-clone-label') || document.getElementById('btn-clone-label');

  const updateEngineUI = () => {
    const isOmni = engineOmniRadio && engineOmniRadio.checked;
    if (labelEngineOmni) {
      labelEngineOmni.style.borderColor = isOmni ? 'var(--color-primary)' : 'var(--border-color)';
      labelEngineOmni.style.background = isOmni ? 'rgba(99,102,241,0.18)' : 'var(--bg-input)';
    }
    if (labelEngineTone) {
      labelEngineTone.style.borderColor = !isOmni ? 'var(--color-primary)' : 'var(--border-color)';
      labelEngineTone.style.background = !isOmni ? 'rgba(99,102,241,0.18)' : 'var(--bg-input)';
    }
    if (timbreStrengthRow) timbreStrengthRow.style.display = !isOmni ? 'flex' : 'none';
    if (stripSettings && activeInputType === 'voice_convert') {
      stripSettings.style.display = isOmni ? 'grid' : 'none';
    }
    if (submitLabel && activeInputType === 'voice_convert') {
      submitLabel.textContent = isOmni
        ? '👑 تبدیل با صدای ۱۰۰٪ خالص کلون‌شده (حداکثر شباهت استودیویی)'
        : '🎭 انتقال مستقیم لحن و تحریرها (Tone Color Converter)';
    }
  };

  window._updateVcEngineUI = updateEngineUI;

  if (engineToneRadio) engineToneRadio.addEventListener('change', updateEngineUI);
  if (engineOmniRadio) engineOmniRadio.addEventListener('change', updateEngineUI);
  if (labelEngineTone) labelEngineTone.addEventListener('click', () => { if (engineToneRadio) { engineToneRadio.checked = true; updateEngineUI(); } });
  if (labelEngineOmni) labelEngineOmni.addEventListener('click', () => { if (engineOmniRadio) { engineOmniRadio.checked = true; updateEngineUI(); } });

  const timbreSlider = document.getElementById('vc-timbre-slider');
  const timbreBadge = document.getElementById('badge-vc-timbre');
  if (timbreSlider && timbreBadge) {
    timbreSlider.addEventListener('input', () => {
      const v = parseFloat(timbreSlider.value);
      timbreBadge.textContent = `${v.toFixed(2)}x (${v < 0.8 ? 'نرم و سبک' : v > 1.2 ? 'شدید و نافذ' : 'استاندارد طبیعی'})`;
    });
  }

  const handleFile = (file) => {
    if (!file) return;
    const isVideo = (file.type && file.type.startsWith('video/')) || /\.(mp4|mkv|webm|mov|avi|flv|ts|m4v)$/i.test(file.name);
    if (isVideo) {
      if (window.openVideoScrubber) {
        window.openVideoScrubber(file);
        return;
      }
    }
    vcSourceFile = file;
    if (fileNameEl) fileNameEl.textContent = file.name;
    const url = URL.createObjectURL(file);
    if (player) {
      player.src = url;
      player.onloadedmetadata = () => {
        if (fileDurEl) fileDurEl.textContent = `${player.duration.toFixed(1)}s`;
      };
    }
    if (dropZone) dropZone.style.display = 'none';
    if (previewCard) previewCard.style.display = 'block';
    updateEngineUI();
  };

  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) handleFile(e.target.files[0]);
    });
  }

  if (changeBtn && fileInput) {
    changeBtn.addEventListener('click', () => {
      fileInput.value = '';
      vcSourceFile = null;
      if (dropZone) dropZone.style.display = 'flex';
      if (previewCard) previewCard.style.display = 'none';
      if (player) player.src = '';
      if (transcriptTextarea) transcriptTextarea.value = '';
      if (transcribeStatus) transcribeStatus.textContent = '';
    });
  }

  if (quickTranscribeBtn) {
    quickTranscribeBtn.addEventListener('click', async () => {
      if (!vcSourceFile) {
        alert('ابتدا یک فایل صوتی انتخاب کنید.');
        return;
      }
      if (transcribeStatus) transcribeStatus.textContent = '⏳ در حال استخراج گفتار با Whisper...';
      try {
        const fd = new FormData();
        fd.append('audio', vcSourceFile);
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success && data.text) {
          if (transcriptTextarea) transcriptTextarea.value = data.text;
          if (transcribeStatus) transcribeStatus.textContent = `✅ استخراج شد (${data.elapsed_seconds}s)`;
        } else {
          if (transcribeStatus) transcribeStatus.textContent = `⚠️ ${data.error || 'کلامی یافت نشد'}`;
        }
      } catch (err) {
        if (transcribeStatus) transcribeStatus.textContent = '❌ خطا در ارتباط با سرور';
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 4.3. Advanced Studio Customization Controls
// ---------------------------------------------------------------------------
function initAdvancedStudioControls() {
  const toggleBtn = document.getElementById('btn-toggle-advanced-tuning');
  const drawer = document.getElementById('advanced-tuning-drawer');
  const chevron = document.getElementById('adv-toggle-chevron');

  if (toggleBtn && drawer) {
    toggleBtn.addEventListener('click', () => {
      const isHidden = drawer.style.display === 'none';
      drawer.style.display = isHidden ? 'block' : 'none';
      if (chevron) chevron.textContent = isHidden ? '▲' : '▼';
    });
  }

  // Live badges
  const tShift = document.getElementById('adv-t-shift');
  const bTShift = document.getElementById('badge-t-shift');
  if (tShift && bTShift) {
    tShift.addEventListener('input', () => bTShift.textContent = parseFloat(tShift.value).toFixed(2));
  }

  const posTemp = document.getElementById('adv-pos-temp');
  const bPosTemp = document.getElementById('badge-pos-temp');
  if (posTemp && bPosTemp) {
    posTemp.addEventListener('input', () => bPosTemp.textContent = parseFloat(posTemp.value).toFixed(1));
  }

  const classTemp = document.getElementById('adv-class-temp');
  const bClassTemp = document.getElementById('badge-class-temp');
  if (classTemp && bClassTemp) {
    classTemp.addEventListener('input', () => bClassTemp.textContent = parseFloat(classTemp.value).toFixed(2));
  }

  const chunkDur = document.getElementById('adv-chunk-dur');
  const bChunkDur = document.getElementById('badge-chunk-dur');
  if (chunkDur && bChunkDur) {
    chunkDur.addEventListener('input', () => bChunkDur.textContent = `${parseFloat(chunkDur.value).toFixed(0)} ثانیه`);
  }

  const pitchShift = document.getElementById('adv-pitch-shift');
  const bPitchShift = document.getElementById('badge-pitch-shift');
  if (pitchShift && bPitchShift) {
    pitchShift.addEventListener('input', () => {
      const v = parseFloat(pitchShift.value);
      bPitchShift.textContent = v === 0 ? '0 (طبیعی)' : (v > 0 ? `+${v}st` : `${v}st`);
    });
  }

  // Random seed button
  const seedInput = document.getElementById('adv-seed');
  const seedBtn = document.getElementById('btn-adv-random-seed');
  if (seedBtn && seedInput) {
    seedBtn.addEventListener('click', () => {
      seedInput.value = Math.floor(Math.random() * 999999);
    });
  }

  // Reset defaults
  const resetBtn = document.getElementById('btn-adv-reset-defaults');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (tShift) { tShift.value = 0.10; if (bTShift) bTShift.textContent = '0.10 (پیش‌فرض)'; }
      if (posTemp) { posTemp.value = 5.0; if (bPosTemp) bPosTemp.textContent = '5.0'; }
      if (classTemp) { classTemp.value = 0.0; if (bClassTemp) bClassTemp.textContent = '0.0 (دقیق)'; }
      if (chunkDur) { chunkDur.value = 12.0; if (bChunkDur) bChunkDur.textContent = '12.0 ثانیه'; }
      if (pitchShift) { pitchShift.value = 0.0; if (bPitchShift) bPitchShift.textContent = '0 (طبیعی)'; }
      if (seedInput) seedInput.value = -1;
      const chkDenoise = document.getElementById('adv-chk-denoise');
      const chkVol = document.getElementById('adv-chk-normalize-volume');
      if (chkDenoise) chkDenoise.checked = true;
      if (chkVol) chkVol.checked = true;
    });
  }
}

// ---------------------------------------------------------------------------
// 5. CFG Likeness Slider (Compact)
// ---------------------------------------------------------------------------
function initCfgSlider() {
  const slider = document.getElementById('clone-cfg-slider');
  const badge = document.getElementById('cfg-val-badge');
  if (!slider || !badge) return;

  const updateBadge = () => {
    const val = parseFloat(slider.value).toFixed(1);
    let note = '';
    if (val < 1.9) note = 'روان و محاوره‌ای';
    else if (val <= 2.2) note = 'طبیعی و روان (هاگینگ‌فیس)';
    else if (val <= 2.6) note = 'تطابق تار صوتی';
    else note = 'بسیار مقید به رفرنس';
    badge.textContent = `${val}x (${note})`;
  };

  slider.addEventListener('input', updateBadge);
  updateBadge();
}

// ---------------------------------------------------------------------------
// 5.1. Granular Cadence, Speed & Word Pause Controls
// ---------------------------------------------------------------------------
function initCadenceAndSpeedControls() {
  const speedSlider = document.getElementById('clone-speed-slider');
  const speedBadge = document.getElementById('speed-val-badge');
  const speedChips = document.querySelectorAll('.btn-speed-chip');

  const updateSpeedBadge = (val) => {
    let note = 'طبیعی';
    if (val <= 0.75) note = 'آرام و شمرده';
    else if (val < 0.95) note = 'ملایم';
    else if (val >= 0.95 && val <= 1.05) note = 'طبیعی';
    else if (val <= 1.25) note = 'پرانرژی و روان';
    else if (val <= 1.45) note = 'سریع';
    else note = 'فوق‌العاده سریع';

    if (speedBadge) {
      speedBadge.textContent = `${val.toFixed(2)}x (${note})`;
    }

    speedChips.forEach(chip => {
      const chipSpeed = parseFloat(chip.getAttribute('data-speed'));
      if (Math.abs(chipSpeed - val) < 0.03) chip.classList.add('active');
      else chip.classList.remove('active');
    });
  };

  if (speedSlider) {
    speedSlider.addEventListener('input', () => {
      updateSpeedBadge(parseFloat(speedSlider.value));
    });
  }

  speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const targetSpeed = parseFloat(chip.getAttribute('data-speed'));
      if (speedSlider) {
        speedSlider.value = targetSpeed;
        updateSpeedBadge(targetSpeed);
      }
    });
  });

  // Pause & Syllable Spacing Slider
  const pauseSlider = document.getElementById('clone-pause-slider');
  const pauseBadge = document.getElementById('pause-val-badge');
  const pauseChips = document.querySelectorAll('.btn-pause-scale-chip');

  const updatePauseBadge = (val) => {
    let note = 'مکث طبیعی کلمات';
    if (val <= 0.6) note = 'پیوسته و فشرده بدون مکث';
    else if (val < 0.9) note = 'مکث کوتاه';
    else if (val >= 0.9 && val <= 1.1) note = 'مکث طبیعی کلمات';
    else if (val <= 1.5) note = 'شمرده با مکث‌های مشخص';
    else note = 'مکث‌های طولانی و ادبی';

    if (pauseBadge) {
      pauseBadge.textContent = `${val.toFixed(2)}x (${note})`;
    }

    pauseChips.forEach(chip => {
      const chipPause = parseFloat(chip.getAttribute('data-pause'));
      if (Math.abs(chipPause - val) < 0.04) chip.classList.add('active');
      else chip.classList.remove('active');
    });
  };

  if (pauseSlider) {
    pauseSlider.addEventListener('input', () => {
      updatePauseBadge(parseFloat(pauseSlider.value));
    });
  }

  pauseChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const targetPause = parseFloat(chip.getAttribute('data-pause'));
      if (pauseSlider) {
        pauseSlider.value = targetPause;
        updatePauseBadge(targetPause);
      }
    });
  });

  // Duration override checkbox toggle
  const chkDuration = document.getElementById('chk-duration-override');
  const durationWrapper = document.getElementById('duration-input-wrapper');
  if (chkDuration && durationWrapper) {
    chkDuration.addEventListener('change', () => {
      durationWrapper.style.display = chkDuration.checked ? 'flex' : 'none';
    });
  }
}

// ---------------------------------------------------------------------------
// 5.2. Quick Punctuation & Pause Toolbar + Auto Diacritization
// ---------------------------------------------------------------------------
function initQuickPauseToolbar() {
  const buttons = document.querySelectorAll('.btn-pause-chip');
  const textarea = document.getElementById('clone-target-text');
  if (!textarea) return;

  buttons.forEach(btn => {
    if (btn.id === 'btn-auto-diacritize') return;
    btn.addEventListener('click', () => {
      const insertText = btn.getAttribute('data-insert') || '';
      const offset = parseInt(btn.getAttribute('data-offset') || insertText.length);
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;

      textarea.value = val.substring(0, start) + insertText + val.substring(end);
      textarea.focus();
      textarea.setSelectionRange(start + offset, start + offset);
    });
  });

  const diacritizeBtn = document.getElementById('btn-auto-diacritize');
  if (diacritizeBtn) {
    diacritizeBtn.addEventListener('click', async () => {
      const currentText = textarea.value.trim();
      if (!currentText) {
        alert('لطفاً ابتدا متنی در کادر بنویسید.');
        return;
      }
      diacritizeBtn.disabled = true;
      const origHtml = diacritizeBtn.innerHTML;
      diacritizeBtn.innerHTML = '<span>⏳</span><span>در حال اعراب‌گذاری هوشمند...</span>';
      try {
        const res = await fetch('/api/diacritize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: currentText }),
        });
        const data = await res.json();
        if (data.success && data.diacritized) {
          textarea.value = data.diacritized;
        } else {
          alert('خطا در اعراب‌گذاری: ' + (data.error || 'ناشناخته'));
        }
      } catch (err) {
        alert('خطا در برقراری ارتباط با سرور.');
      } finally {
        diacritizeBtn.disabled = false;
        diacritizeBtn.innerHTML = origHtml;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 5.3. TTS Engine Mode Selector (OmniVoice Clone vs Meta MMS Broadcast)
// ---------------------------------------------------------------------------
function initTtsEngineSelector() {
  const radioOmni = document.getElementById('engine-tts-omnivoice');
  const radioMms = document.getElementById('engine-tts-mms');
  const labelOmni = document.getElementById('label-engine-tts-omnivoice');
  const labelMms = document.getElementById('label-engine-tts-mms');
  const cloneSpeakerCard = document.getElementById('clone-speaker-card');

  if (!radioOmni || !radioMms) return;

  const updateState = () => {
    if (radioMms.checked) {
      labelMms.classList.add('active');
      labelMms.style.background = 'rgba(99,102,241,0.15)';
      labelMms.style.borderColor = 'var(--color-primary)';
      labelMms.style.color = 'var(--text-main)';

      labelOmni.classList.remove('active');
      labelOmni.style.background = 'var(--bg-input)';
      labelOmni.style.borderColor = 'var(--border-color)';
      labelOmni.style.color = 'var(--text-muted)';

      if (cloneSpeakerCard) {
        cloneSpeakerCard.style.opacity = '0.55';
        cloneSpeakerCard.title = 'در حالت گوینده رسمی نیازی به فایل مرجع یا پروفایل نیست؛ صوت مستقیم تولید می‌شود.';
      }
    } else {
      labelOmni.classList.add('active');
      labelOmni.style.background = 'rgba(99,102,241,0.15)';
      labelOmni.style.borderColor = 'var(--color-primary)';
      labelOmni.style.color = 'var(--text-main)';

      labelMms.classList.remove('active');
      labelMms.style.background = 'var(--bg-input)';
      labelMms.style.borderColor = 'var(--border-color)';
      labelMms.style.color = 'var(--text-muted)';

      if (cloneSpeakerCard) {
        cloneSpeakerCard.style.opacity = '1.0';
        cloneSpeakerCard.title = '';
      }
    }
  };

  radioOmni.addEventListener('change', updateState);
  radioMms.addEventListener('change', updateState);
  if (labelOmni) labelOmni.addEventListener('click', () => { radioOmni.checked = true; updateState(); });
  if (labelMms) labelMms.addEventListener('click', () => { radioMms.checked = true; updateState(); });
}

// ---------------------------------------------------------------------------
// 6. System Telemetry
// ---------------------------------------------------------------------------
async function initSystemTelemetry() {
  try {
    const res = await fetch('/api/system_info');
    const data = await res.json();
    if (data.gpu && data.gpu.has_gpu) {
      const nameBadge = document.getElementById('gpu-name-badge');
      const vramBadge = document.getElementById('gpu-vram-badge');
      if (nameBadge) nameBadge.textContent = data.gpu.name;
      if (vramBadge) vramBadge.textContent = `VRAM: ${Math.round(data.gpu.vram_used_mb)}MB / ${Math.round(data.gpu.vram_total_mb)}MB`;
    }
  } catch (e) {
    console.error('Failed to load telemetry', e);
  }
}

// ---------------------------------------------------------------------------
// 7. Profiles Manager
// ---------------------------------------------------------------------------
function initProfilesManager() {
  const showCreateBtn = document.getElementById('btn-show-create-profile');
  const closeCreateBtn = document.getElementById('btn-close-create-profile');
  const createBox = document.getElementById('create-profile-box');
  const submitCreateBtn = document.getElementById('btn-submit-create-profile');
  const selectProfEl = document.getElementById('select-saved-profile');

  if (showCreateBtn && createBox) {
    showCreateBtn.addEventListener('click', () => {
      const isHidden = createBox.style.display === 'none';
      createBox.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) {
        const nameInput = document.getElementById('prof-name');
        if (nameInput) nameInput.focus();
      }
    });
  }

  if (closeCreateBtn && createBox) {
    closeCreateBtn.addEventListener('click', () => {
      createBox.style.display = 'none';
    });
  }

  if (submitCreateBtn) {
    submitCreateBtn.addEventListener('click', async () => {
      const name = document.getElementById('prof-name').value.trim();
      const desc = document.getElementById('prof-desc').value.trim();
      const audioInput = document.getElementById('prof-audio-file');
      const greeting = document.getElementById('prof-greeting-text').value.trim();
      const cfg = document.getElementById('prof-cfg').value;
      const steps = document.getElementById('prof-steps').value;

      if (!name) {
        alert('لطفاً نام گوینده را وارد کنید.');
        return;
      }
      if (!audioInput.files || !audioInput.files.length) {
        alert('لطفاً یک فایل صوتی مرجع برای این گوینده انتخاب کنید.');
        return;
      }

      const formData = new FormData();
      formData.append('name', name);
      formData.append('description', desc);
      formData.append('audio', audioInput.files[0]);
      formData.append('greeting_text', greeting);
      formData.append('guidance_scale', parseFloat(cfg) || 2.0);
      formData.append('num_steps', parseInt(steps) || 36);

      submitCreateBtn.disabled = true;
      try {
        await startGenerationTask('/api/profiles/create', formData);
        createBox.style.display = 'none';
        document.getElementById('prof-name').value = '';
        document.getElementById('prof-desc').value = '';
        audioInput.value = '';
        await loadProfiles();
      } finally {
        submitCreateBtn.disabled = false;
      }
    });
  }

  if (selectProfEl) {
    selectProfEl.addEventListener('change', (e) => {
      const profId = e.target.value;
      const prof = cachedProfiles.find(p => p.id === profId);
      updateSelectedProfileCard(prof);
    });
  }

  const playGreetingBtn = document.getElementById('btn-play-profile-greeting');
  const greetingAudio = document.getElementById('audio-profile-greeting');
  if (playGreetingBtn && greetingAudio) {
    playGreetingBtn.addEventListener('click', () => {
      if (!greetingAudio.src) return;
      if (greetingAudio.paused) {
        greetingAudio.play();
        playGreetingBtn.innerHTML = '<span>⏸️ توقف</span>';
      } else {
        greetingAudio.pause();
        playGreetingBtn.innerHTML = '<span>▶️ تست صدا</span>';
      }
    });

    greetingAudio.addEventListener('ended', () => {
      playGreetingBtn.innerHTML = '<span>▶️ تست صدا</span>';
    });
  }

  const editSelectedBtn = document.getElementById('btn-edit-selected-profile');
  if (editSelectedBtn) {
    editSelectedBtn.addEventListener('click', () => {
      if (selectedProfile) {
        openEditProfileModal(selectedProfile.id);
      } else {
        alert('لطفاً ابتدا یک گوینده را انتخاب نمایید.');
      }
    });
  }
}

async function loadProfiles(selectProfileId = null) {
  try {
    const res = await fetch('/api/profiles');
    const data = await res.json();
    cachedProfiles = data.profiles || [];

    renderProfilesSelect(cachedProfiles);
    renderProfilesGrid(cachedProfiles);

    if (cachedProfiles.length > 0) {
      if (selectProfileId) {
        selectedProfile = cachedProfiles.find(p => p.id === selectProfileId) || cachedProfiles[0];
      } else if (!selectedProfile || !cachedProfiles.some(p => p.id === selectedProfile.id)) {
        selectedProfile = cachedProfiles[0];
      }
      const selectEl = document.getElementById('select-saved-profile');
      if (selectEl) selectEl.value = selectedProfile.id;
      updateSelectedProfileCard(selectedProfile);
    } else {
      updateSelectedProfileCard(null);
    }

    if (typeof updateStorySpeakerSelects === 'function') {
      updateStorySpeakerSelects();
    }
  } catch (e) {
    console.error('Failed to load profiles', e);
  }
}

function renderProfilesSelect(profiles) {
  const selectEl = document.getElementById('select-saved-profile');
  if (!selectEl) return;

  if (!profiles.length) {
    selectEl.innerHTML = '<option value="" disabled selected>هیچ گوینده‌ای هنوز ثبت نشده است. روی «➕ گوینده جدید» کلیک کنید.</option>';
    return;
  }

  selectEl.innerHTML = profiles.map(p => `
    <option value="${p.id}">👤 ${p.name} (${p.description || 'گوینده اختصاصی'})</option>
  `).join('');
}

function updateSelectedProfileCard(prof) {
  const avatar = document.getElementById('selected-profile-avatar');
  const descEl = document.getElementById('selected-profile-desc');
  const greetingAudio = document.getElementById('audio-profile-greeting');
  const playBtn = document.getElementById('btn-play-profile-greeting');

  if (!prof) {
    if (avatar) avatar.textContent = '👤';
    if (descEl) descEl.textContent = 'هیچ گوینده‌ای ذخیره نشده است';
    selectedProfile = null;
    return;
  }

  selectedProfile = prof;
  if (avatar) avatar.textContent = prof.name ? prof.name.charAt(0) : '👤';
  if (descEl) descEl.textContent = `${prof.description || 'گوینده اختصاصی'} • تطابق: ${prof.guidance_scale || 2.0}x`;
  
  if (greetingAudio) {
    greetingAudio.src = prof.preview_url || '';
    if (playBtn) playBtn.innerHTML = '<span>▶️ تست صدا</span>';
  }
}

function renderProfilesGrid(profiles) {
  const grid = document.getElementById('profiles-grid-container');
  if (!grid) return;

  if (!profiles.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:2rem 1rem;">
        <div style="font-size:2rem; margin-bottom:0.5rem;">🎭</div>
        <p class="empty-state-text" style="padding:0; margin-bottom:0.8rem;">هنوز هیچ گوینده‌ای ذخیره نشده است.</p>
        <button onclick="document.getElementById('btn-show-create-profile').click()" class="btn-compact-primary">
          <span>➕</span><span>ثبت اولین گوینده</span>
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = profiles.map(p => `
    <div class="profile-card" id="prof-card-${p.id}">
      <div class="profile-card-header">
        <div class="profile-avatar">${p.name ? escapeHtml(p.name.charAt(0)) : '👤'}</div>
        <div class="profile-card-title-group">
          <div class="profile-card-name">${escapeHtml(p.name)}</div>
          <div class="profile-card-meta">${escapeHtml(p.description || 'گوینده اختصاصی')}</div>
        </div>
      </div>

      <div class="profile-audio-row">
        <div style="font-size:0.7rem; color:var(--text-muted); font-weight:700; display:flex; justify-content:space-between;">
          <span>نمونه صدا (Greeting):</span>
          <span>${p.preview_duration_sec || 0}s</span>
        </div>
        <audio controls src="${p.preview_url}" style="width:100%; height:32px;"></audio>
      </div>

      <div class="profile-card-actions">
        <button class="btn-micro accent" style="flex:1;" onclick="useProfileForClone('${p.id}')">
          <span>⚡</span><span>انتخاب برای خوانش</span>
        </button>
        <button class="btn-micro secondary" style="color:var(--text-main);" onclick="openEditProfileModal('${p.id}')" title="ویرایش مشخصات گوینده">
          <span>✏️</span>
        </button>
        <button class="btn-micro secondary" style="color:#ef4444;" onclick="confirmDeleteProfile('${p.id}')" title="حذف گوینده">
          <span>🗑️</span>
        </button>
      </div>
    </div>
  `).join('');
}

window.useProfileForClone = function(profId) {
  const cloneTabBtn = document.getElementById('tab-btn-clone');
  if (cloneTabBtn) cloneTabBtn.click();

  const modeProfileBtn = document.getElementById('btn-mode-profile');
  if (modeProfileBtn) modeProfileBtn.click();

  const selectEl = document.getElementById('select-saved-profile');
  if (selectEl) {
    selectEl.value = profId;
    const prof = cachedProfiles.find(p => p.id === profId);
    updateSelectedProfileCard(prof);
  }
};

window.confirmDeleteProfile = async function(profId) {
  const prof = cachedProfiles.find(p => p.id === profId);
  const profName = prof ? prof.name : 'این گوینده';

  const confirmed = await showConfirmModal({
    title: 'حذف گوینده از کتابخانه',
    message: `آیا از حذف کامل گوینده «${profName}» از بانک گویندگان اطمینان دارید؟`,
    confirmText: 'بله، حذف کن',
    cancelText: 'انصراف',
    icon: '🗑️'
  });

  if (!confirmed) return;

  try {
    const res = await fetch(`/api/profiles/${profId}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await loadProfiles();
    } else {
      alert('خطا در حذف گوینده: ' + (data.error || 'ناشناخته'));
    }
  } catch (err) {
    alert('خطا در ارسال درخواست: ' + err.message);
  }
};
window.deleteProfile = window.confirmDeleteProfile;

// ---------------------------------------------------------------------------
// 7.1. Dedicated Save Speaker to Library Modal
// ---------------------------------------------------------------------------
function initSaveSpeakerModal() {
  const triggerBtn = document.getElementById('btn-save-current-to-profiles');
  const modal = document.getElementById('save-speaker-modal');
  const btnClose = document.getElementById('btn-close-save-speaker-modal');
  const btnCancel = document.getElementById('btn-cancel-save-speaker');
  const btnConfirm = document.getElementById('btn-confirm-save-speaker');
  const inputName = document.getElementById('modal-speaker-name');
  const inputDesc = document.getElementById('modal-speaker-desc');
  const inputRefText = document.getElementById('modal-speaker-ref-text');

  const openModal = () => {
    if (!trimmer || !trimmer.audioBuffer) {
      alert('لطفاً ابتدا یک فایل صوتی یا ویدیویی در استودیو بارگذاری نمایید.');
      return;
    }

    const refTextVal = document.getElementById('clone-ref-text')?.value || '';
    if (inputRefText) inputRefText.value = refTextVal;
    if (inputName) inputName.value = '';
    if (inputDesc) inputDesc.value = '';
    if (modal) modal.style.display = 'flex';
    setTimeout(() => { if (inputName) inputName.focus(); }, 60);
  };

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (triggerBtn) triggerBtn.addEventListener('click', openModal);
  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (btnConfirm) {
    btnConfirm.addEventListener('click', async () => {
      const name = inputName?.value?.trim();
      const desc = inputDesc?.value?.trim() || 'گوینده اختصاصی استودیو';
      const refText = inputRefText?.value?.trim() || null;

      if (!name) {
        alert('لطفاً نام گوینده را وارد کنید.');
        if (inputName) inputName.focus();
        return;
      }

      if (!trimmer || !trimmer.audioBuffer) {
        alert('صوتی برای ذخیره یافت نشد.');
        return;
      }

      const label = document.getElementById('btn-save-speaker-label');
      btnConfirm.disabled = true;
      if (label) label.textContent = '⏳ در حال ذخیره وکتورها...';

      try {
        const wavBlob = await trimmer.getTrimmedWavBlob();
        if (!wavBlob) {
          throw new Error('خطا در دریافت قطعه صوتی.');
        }

        const fd = new FormData();
        fd.append('name', name);
        fd.append('description', desc);
        fd.append('audio', wavBlob, 'speaker_ref.wav');
        if (refText) fd.append('ref_text', refText);
        fd.append('greeting_text', `سلام، این صدای ${name} است که برای همیشه در استودیو ذخیره شده است.`);
        fd.append('guidance_scale', 2.0);
        fd.append('num_steps', 36);

        await startGenerationTask('/api/profiles/create', fd);
        closeModal();
        await loadProfiles();
        alert(`🎉 گوینده «${name}» با موفقیت در بانک گویندگان ذخیره گردید!`);
      } catch (err) {
        console.error('Save speaker error:', err);
        alert('خطا در ذخیره گوینده: ' + err.message);
      } finally {
        btnConfirm.disabled = false;
        if (label) label.textContent = '💾 ثبت دائمی در بانک گویندگان';
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 7.2. Edit Speaker Profile Modal
// ---------------------------------------------------------------------------
function initEditProfileModal() {
  const modal = document.getElementById('edit-profile-modal');
  const btnClose = document.getElementById('btn-close-edit-profile-modal');
  const btnCancel = document.getElementById('btn-cancel-edit-profile');
  const btnSave = document.getElementById('btn-confirm-save-edit-profile');

  const closeModal = () => {
    if (modal) modal.style.display = 'none';
  };

  if (btnClose) btnClose.addEventListener('click', closeModal);
  if (btnCancel) btnCancel.addEventListener('click', closeModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      const profId = document.getElementById('edit-prof-id')?.value;
      const name = document.getElementById('edit-prof-name')?.value?.trim();
      const desc = document.getElementById('edit-prof-desc')?.value?.trim() || '';
      const cfg = parseFloat(document.getElementById('edit-prof-cfg')?.value) || 2.0;
      const steps = parseInt(document.getElementById('edit-prof-steps')?.value) || 36;
      const greeting = document.getElementById('edit-prof-greeting')?.value?.trim() || '';
      const refText = document.getElementById('edit-prof-ref-text')?.value?.trim() || '';

      if (!profId) return;
      if (!name) {
        alert('لطفاً نام گوینده را وارد کنید.');
        document.getElementById('edit-prof-name')?.focus();
        return;
      }

      btnSave.disabled = true;
      btnSave.innerHTML = '<span>⏳ در حال ذخیره...</span>';

      try {
        const res = await fetch(`/api/profiles/${profId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            description: desc,
            guidance_scale: cfg,
            num_steps: steps,
            greeting_text: greeting,
            ref_text: refText,
          }),
        });

        const data = await res.json();
        if (data.success && data.profile) {
          // Update cachedProfiles in place
          const idx = cachedProfiles.findIndex(p => p.id === profId);
          if (idx !== -1) {
            cachedProfiles[idx] = { ...cachedProfiles[idx], ...data.profile };
          }
          renderProfilesGrid(cachedProfiles);
          renderProfilesSelect(cachedProfiles);
          if (typeof updateStorySpeakerSelects === 'function') {
            updateStorySpeakerSelects();
          }
          if (selectedProfile && selectedProfile.id === profId) {
            updateSelectedProfileCard(data.profile);
          }
          closeModal();
          alert(`✅ مشخصات گوینده «${name}» با موفقیت به‌روزرسانی شد!`);
        } else {
          alert('خطا در ذخیره تغییرات: ' + (data.detail || data.error || 'ناشناخته'));
        }
      } catch (err) {
        console.error('Update profile error:', err);
        alert('خطا در ارتباط با سرور: ' + err.message);
      } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = '<span>💾</span><span>ذخیره تغییرات</span>';
      }
    });
  }
}

window.openEditProfileModal = function(profId) {
  const prof = cachedProfiles.find(p => p.id === profId);
  if (!prof) {
    alert('پروفایل گوینده یافت نشد.');
    return;
  }

  const modal = document.getElementById('edit-profile-modal');
  const idInput = document.getElementById('edit-prof-id');
  const nameInput = document.getElementById('edit-prof-name');
  const descInput = document.getElementById('edit-prof-desc');
  const cfgInput = document.getElementById('edit-prof-cfg');
  const stepsSelect = document.getElementById('edit-prof-steps');
  const greetingInput = document.getElementById('edit-prof-greeting');
  const refTextInput = document.getElementById('edit-prof-ref-text');

  if (idInput) idInput.value = prof.id;
  if (nameInput) nameInput.value = prof.name || '';
  if (descInput) descInput.value = prof.description || '';
  if (cfgInput) cfgInput.value = prof.guidance_scale || 2.0;
  if (stepsSelect) stepsSelect.value = prof.num_steps || 36;
  if (greetingInput) greetingInput.value = prof.greeting_text || '';
  if (refTextInput) refTextInput.value = prof.ref_text || '';

  if (modal) modal.style.display = 'flex';
  setTimeout(() => {
    if (nameInput) nameInput.focus();
  }, 60);
};

// ---------------------------------------------------------------------------
// 8. Form Actions & Generation Submit (With Ctrl + Enter Shortcut)
// ---------------------------------------------------------------------------
function initFormActions() {
  const clearRefBtn = document.getElementById('btn-clear-ref-text');
  if (clearRefBtn) {
    clearRefBtn.addEventListener('click', () => {
      const refInput = document.getElementById('clone-ref-text');
      if (refInput) refInput.value = '';
    });
  }

  const transcribeBtn = document.getElementById('btn-auto-transcribe');
  if (transcribeBtn) {
    transcribeBtn.addEventListener('click', async () => {
      if (!trimmer || !trimmer.audioBuffer) {
        alert('لطفاً ابتدا یک فایل صوتی آپلود کنید.');
        return;
      }
      const blob = await trimmer.getTrimmedWavBlob();
      if (!blob) return;

      transcribeBtn.disabled = true;
      transcribeBtn.innerHTML = '<span>⏳ Whisper...</span>';

      try {
        const formData = new FormData();
        formData.append('audio', blob, 'trimmed_ref.wav');

        const res = await fetch('/api/transcribe', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.success && data.text) {
          document.getElementById('clone-ref-text').value = data.text;
        } else {
          alert('خطا در استخراج متن: ' + (data.error || 'ناشناخته'));
        }
      } catch (err) {
        alert('خطا در ارسال درخواست: ' + err.message);
      } finally {
        transcribeBtn.disabled = false;
        transcribeBtn.innerHTML = '<span>🎙️ Whisper</span>';
      }
    });
  }

  // -------------------------------------------------------------
  // Custom Output Directory & Format Persistence
  // -------------------------------------------------------------
  const savedOutputDir = localStorage.getItem('omnivoice_custom_output_dir') || '';
  const dirInputs = [
    document.getElementById('profile-custom-dir'),
    document.getElementById('clone-custom-dir'),
    document.getElementById('story-custom-dir'),
  ].filter(Boolean);

  dirInputs.forEach(input => {
    if (savedOutputDir) input.value = savedOutputDir;
    input.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      localStorage.setItem('omnivoice_custom_output_dir', val);
      dirInputs.forEach(other => {
        if (other !== input) other.value = val;
      });
    });
  });

  const openFolderHelper = async (folderPath) => {
    try {
      const res = await fetch('/api/system/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath || '' }),
      });
      const data = await res.json();
      if (!data.success) {
        alert('خطا در باز کردن پوشه: ' + (data.error || 'پوشه یافت نشد.'));
      }
    } catch (e) {
      alert('خطا در ارتباط با سیستم: ' + e.message);
    }
  };

  const bindBrowseBtn = (btnId, inputId) => {
    const btn = document.getElementById(btnId);
    if (btn) {
      btn.addEventListener('click', () => {
        const p = document.getElementById(inputId)?.value?.trim() || '';
        openFolderHelper(p);
      });
    }
  };

  bindBrowseBtn('btn-browse-profile-dir', 'profile-custom-dir');
  bindBrowseBtn('btn-browse-clone-dir', 'clone-custom-dir');
  bindBrowseBtn('btn-browse-story-dir', 'story-custom-dir');

  const btnOpenResultFolder = document.getElementById('btn-open-result-folder');
  if (btnOpenResultFolder) {
    btnOpenResultFolder.addEventListener('click', () => {
      const p = btnOpenResultFolder.dataset.path || document.getElementById('result-saved-path')?.textContent || '';
      openFolderHelper(p);
    });
  }

  const getActiveExportOptions = (mode) => {
    let fmt = 'mp3';
    let customName = '';
    let customDir = localStorage.getItem('omnivoice_custom_output_dir') || '';

    if (mode === 'profile') {
      fmt = document.getElementById('profile-output-format')?.value || 'mp3';
      customName = document.getElementById('profile-custom-filename')?.value?.trim() || '';
      const dirVal = document.getElementById('profile-custom-dir')?.value?.trim();
      if (dirVal) customDir = dirVal;
    } else {
      fmt = document.getElementById('clone-output-format')?.value || document.getElementById('profile-output-format')?.value || 'mp3';
      customName = document.getElementById('clone-custom-filename')?.value?.trim() || document.getElementById('profile-custom-filename')?.value?.trim() || '';
      const dirVal = document.getElementById('clone-custom-dir')?.value?.trim() || document.getElementById('profile-custom-dir')?.value?.trim();
      if (dirVal) customDir = dirVal;
    }

    return { fmt, customName, customDir };
  };

  // Ctrl + Enter shortcut support on textareas
  const cloneTextarea = document.getElementById('clone-target-text');
  if (cloneTextarea) {
    cloneTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-generate-clone').click();
      }
    });
  }

  const designTextarea = document.getElementById('design-target-text');
  if (designTextarea) {
    designTextarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('btn-generate-design').click();
      }
    });
  }

  // Main Action Button (Handles both Text-to-Speech AND Direct Voice Conversion)
  document.getElementById('btn-generate-clone').addEventListener('click', async () => {
    // -------------------------------------------------------------
    // MODE 1: Direct Voice Conversion (Speech-to-Speech)
    // -------------------------------------------------------------
    if (activeInputType === 'voice_convert') {
      if (!vcSourceFile) {
        alert('لطفاً یک فایل صوتی مبدا را برای تغییر صدا انتخاب کنید.');
        return;
      }

      const formData = new FormData();
      formData.append('source_audio', vcSourceFile);

      const selectedVcEngine = document.querySelector('input[name="vc_engine_choice"]:checked')?.value || 'tone_color';
      formData.append('convert_engine', selectedVcEngine);

      const transcribedText = document.getElementById('vc-override-text')?.value?.trim() || '';
      formData.append('transcribed_text', transcribedText);

      const cfgVal = parseFloat(document.getElementById('clone-cfg-slider')?.value || 2.0);
      const steps = parseInt(document.getElementById('clone-steps')?.value || 36);
      const speed = parseFloat(document.getElementById('clone-speed-slider')?.value || 1.0);
      const pauseScale = parseFloat(document.getElementById('clone-pause-slider')?.value || 1.0);
      const durationOverrideChecked = document.getElementById('chk-duration-override')?.checked;
      const durationVal = parseFloat(document.getElementById('clone-duration-input')?.value || 0);

      formData.append('guidance_scale', cfgVal);
      formData.append('num_steps', steps);
      formData.append('speed', speed);
      formData.append('pause_scale', pauseScale);
      if (durationOverrideChecked && durationVal > 0) {
        formData.append('duration', durationVal);
      }

      const pitchOffset = parseFloat(document.getElementById('vc-pitch-slider')?.value || 0.0);
      const timbreStrength = parseFloat(document.getElementById('vc-timbre-slider')?.value || 1.0);
      const denoise = document.getElementById('vc-chk-denoise')?.checked ?? true;

      formData.append('pitch_offset', pitchOffset);
      formData.append('timbre_strength', timbreStrength);
      formData.append('denoise', denoise);

      const expOpts = getActiveExportOptions(activeCloneMode);
      formData.append('output_format', expOpts.fmt);
      if (expOpts.customName) formData.append('custom_filename', expOpts.customName);
      if (expOpts.customDir) formData.append('custom_output_dir', expOpts.customDir);

      if (activeCloneMode === 'profile') {
        const selectProfEl = document.getElementById('select-saved-profile');
        const profileId = selectProfEl ? selectProfEl.value : null;
        if (!profileId) {
          alert('لطفاً یک گوینده از لیست انتخاب کنید.');
          return;
        }
        formData.append('profile_id', profileId);
      } else {
        if (!trimmer || !trimmer.audioBuffer) {
          alert('لطفاً یک فایل صوتی مرجع آپلود کنید یا به حالت گویندگان ذخیره‌شده بروید.');
          return;
        }
        const trimmedBlob = await trimmer.getTrimmedWavBlob();
        if (!trimmedBlob) {
          alert('خطا در دریافت صوت مرجع.');
          return;
        }
        formData.append('ref_audio', trimmedBlob, 'target_reference.wav');
      }

      await startGenerationTask('/api/convert-voice', formData);
      return;
    }

    // -------------------------------------------------------------
    // MODE 2: Text to Speech (With all Advanced Studio Parameters)
    // -------------------------------------------------------------
    const text = document.getElementById('clone-target-text').value.trim();
    if (!text) {
      alert('لطفاً متن مورد نظر برای تولید صدا را وارد کنید.');
      return;
    }

    const cfgVal = parseFloat(document.getElementById('clone-cfg-slider')?.value || 2.0);
    const lang = document.getElementById('clone-language')?.value || 'Persian';
    const speed = parseFloat(document.getElementById('clone-speed-slider')?.value || 1.0);
    const pauseScale = parseFloat(document.getElementById('clone-pause-slider')?.value || 1.0);
    const durationOverrideChecked = document.getElementById('chk-duration-override')?.checked;
    const durationVal = parseFloat(document.getElementById('clone-duration-input')?.value || 0);
    const steps = parseInt(document.getElementById('clone-steps')?.value || 36);

    // Advanced studio master parameters
    const tShift = parseFloat(document.getElementById('adv-t-shift')?.value || 0.1);
    const posTemp = parseFloat(document.getElementById('adv-pos-temp')?.value || 5.0);
    const classTemp = parseFloat(document.getElementById('adv-class-temp')?.value || 0.0);
    const chunkDur = parseFloat(document.getElementById('adv-chunk-dur')?.value || 12.0);
    const pitchShift = parseFloat(document.getElementById('adv-pitch-shift')?.value || 0.0);
    const seed = parseInt(document.getElementById('adv-seed')?.value || -1);
    const denoise = document.getElementById('adv-chk-denoise')?.checked ?? true;
    const normalizeVol = document.getElementById('adv-chk-normalize-volume')?.checked ?? true;

    // Check TTS Engine Choice: OmniVoice Clone vs Meta MMS Native Persian
    const ttsEngine = document.querySelector('input[name="tts_engine_choice"]:checked')?.value || 'omnivoice';

    if (ttsEngine === 'mms') {
      const mmsFormData = new FormData();
      mmsFormData.append('text', text);
      mmsFormData.append('speed', speed);
      mmsFormData.append('pause_scale', pauseScale);
      mmsFormData.append('pitch_shift', pitchShift);
      mmsFormData.append('normalize_volume', normalizeVol);

      const expOpts = getActiveExportOptions(activeCloneMode);
      mmsFormData.append('output_format', expOpts.fmt);
      if (expOpts.customName) mmsFormData.append('custom_filename', expOpts.customName);
      if (expOpts.customDir) mmsFormData.append('custom_output_dir', expOpts.customDir);

      await startGenerationTask('/api/native-tts', mmsFormData);
      return;
    }

    if (activeCloneMode === 'profile') {
      const selectProfEl = document.getElementById('select-saved-profile');
      const profileId = selectProfEl ? selectProfEl.value : null;

      if (!profileId) {
        alert('لطفاً یک گوینده از لیست انتخاب کنید یا از تب «بانک گویندگان» یک گوینده جدید بسازید.');
        return;
      }

      const formData = new FormData();
      formData.append('text', text);
      formData.append('language', lang);
      formData.append('speed', speed);
      formData.append('pause_scale', pauseScale);
      if (durationOverrideChecked && durationVal > 0) {
        formData.append('duration', durationVal);
      }
      formData.append('num_steps', steps);
      formData.append('guidance_scale', cfgVal);
      formData.append('t_shift', tShift);
      formData.append('position_temperature', posTemp);
      formData.append('class_temperature', classTemp);
      formData.append('audio_chunk_duration', chunkDur);
      formData.append('pitch_shift', pitchShift);
      formData.append('seed', seed);
      formData.append('denoise', denoise);
      formData.append('normalize_volume', normalizeVol);

      // Append custom export settings
      const expOpts = getActiveExportOptions('profile');
      formData.append('output_format', expOpts.fmt);
      if (expOpts.customName) formData.append('custom_filename', expOpts.customName);
      if (expOpts.customDir) formData.append('custom_output_dir', expOpts.customDir);

      startGenerationTask(`/api/profiles/${profileId}/generate`, formData);

    } else {
      if (!trimmer || !trimmer.audioBuffer) {
        alert('لطفاً یک فایل صوتی مرجع آپلود کنید یا به حالت «استفاده از گویندگان من» بروید.');
        return;
      }

      const trimmedBlob = await trimmer.getTrimmedWavBlob();
      if (!trimmedBlob) {
        alert('خطا در برش فایل صوتی.');
        return;
      }

      const formData = new FormData();
      formData.append('text', text);
      formData.append('audio', trimmedBlob, 'reference.wav');
      formData.append('ref_text', document.getElementById('clone-ref-text').value.trim());
      formData.append('language', lang);
      formData.append('speed', speed);
      formData.append('pause_scale', pauseScale);
      if (durationOverrideChecked && durationVal > 0) {
        formData.append('duration', durationVal);
      }
      formData.append('num_steps', steps);
      formData.append('guidance_scale', cfgVal);
      formData.append('t_shift', tShift);
      formData.append('position_temperature', posTemp);
      formData.append('class_temperature', classTemp);
      formData.append('audio_chunk_duration', chunkDur);
      formData.append('pitch_shift', pitchShift);
      formData.append('seed', seed);
      formData.append('denoise', denoise);
      formData.append('normalize_volume', normalizeVol);

      // Append custom export settings
      const expOpts = getActiveExportOptions('custom');
      formData.append('output_format', expOpts.fmt);
      if (expOpts.customName) formData.append('custom_filename', expOpts.customName);
      if (expOpts.customDir) formData.append('custom_output_dir', expOpts.customDir);

      formData.append('save_as_profile', 'false');
      await startGenerationTask('/api/clone', formData);
    }
  });

  // Voice Design Submit
  document.getElementById('btn-generate-design').addEventListener('click', async () => {
    const text = document.getElementById('design-target-text').value.trim();
    if (!text) {
      alert('لطفاً متن مورد نظر برای خوانش را وارد کنید.');
      return;
    }

    const formData = new FormData();
    formData.append('text', text);
    formData.append('gender', document.getElementById('design-gender').value);
    formData.append('age', document.getElementById('design-age').value);
    formData.append('pitch', document.getElementById('design-pitch').value);
    formData.append('style', document.getElementById('design-style').value);
    formData.append('accent', document.getElementById('design-accent').value);
    formData.append('language', document.getElementById('design-language').value);
    formData.append('speed', parseFloat(document.getElementById('design-speed').value) || 1.0);
    formData.append('num_steps', parseInt(document.getElementById('design-steps').value) || 32);

    startGenerationTask('/api/design', formData);
  });
}

// ---------------------------------------------------------------------------
// 9. Execution, Progress Tracker & Audio Player
// ---------------------------------------------------------------------------
async function startGenerationTask(endpoint, formData) {
  const progressBox = document.getElementById('progress-container');
  const resultCard = document.getElementById('result-card');
  const idleCard = document.getElementById('monitor-idle-card');
  const generateCloneBtn = document.getElementById('btn-generate-clone');
  const generateDesignBtn = document.getElementById('btn-generate-design');

  if (idleCard) idleCard.style.display = 'none';
  if (progressBox) progressBox.style.display = 'flex';
  if (resultCard) resultCard.style.display = 'none';
  if (generateCloneBtn) generateCloneBtn.disabled = true;
  if (generateDesignBtn) generateDesignBtn.disabled = true;

  startProgressTracker();

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (data.success) {
      if (data.result) {
        showResult(data.result);
        loadHistory();
      } else if (data.profile) {
        showProfileCreatedResult(data.profile);
      }
    } else {
      const errMsg = data.error || 'خطای ناشناخته رخ داد.';
      alert('⚠️ ' + errMsg);
      try { await fetch('/api/clean-memory', { method: 'POST' }); } catch (e) {}
      if (idleCard) idleCard.style.display = 'flex';
    }
  } catch (err) {
    alert('ارتباط با سرور قطع شد: ' + err.message);
    try { await fetch('/api/clean-memory', { method: 'POST' }); } catch (e) {}
    if (idleCard) idleCard.style.display = 'flex';
  } finally {
    stopProgressTracker();
    if (progressBox) progressBox.style.display = 'none';
    if (generateCloneBtn) generateCloneBtn.disabled = false;
    if (generateDesignBtn) generateDesignBtn.disabled = false;
  }
}

function startProgressTracker() {
  stopProgressTracker();
  const progressBar = document.getElementById('progress-bar-fill');
  const percentBadge = document.getElementById('progress-percent-badge');
  const stageTitle = document.getElementById('progress-stage-title');
  const timerBadge = document.getElementById('progress-timer-badge');

  const steps = [
    document.getElementById('step-1'),
    document.getElementById('step-2'),
    document.getElementById('step-3'),
    document.getElementById('step-4'),
  ];

  currentProgressInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/progress');
      const data = await res.json();

      if (progressBar) progressBar.style.width = `${data.percent}%`;
      if (percentBadge) percentBadge.textContent = `${data.percent}%`;
      if (stageTitle) stageTitle.textContent = data.stage_text;
      if (timerBadge) timerBadge.textContent = `${data.elapsed_seconds.toFixed(1)}s`;

      const p = data.percent;
      steps.forEach((s, idx) => {
        if (!s) return;
        const targetPercent = (idx + 1) * 25;
        if (p >= targetPercent) {
          s.className = 'micro-step completed';
        } else if (p >= targetPercent - 25) {
          s.className = 'micro-step active';
        } else {
          s.className = 'micro-step';
        }
      });

      if (!data.is_busy && p === 100) {
        stopProgressTracker();
      }
    } catch (e) {
      console.warn('Progress poll error', e);
    }
  }, 300);
}

function stopProgressTracker() {
  if (currentProgressInterval) {
    clearInterval(currentProgressInterval);
    currentProgressInterval = null;
  }
}

function showResult(item) {
  const resultCard = document.getElementById('result-card');
  const idleCard = document.getElementById('monitor-idle-card');
  const player = document.getElementById('result-audio-player');
  const textPreview = document.getElementById('result-text-preview');
  const durBadge = document.getElementById('result-duration-badge');
  const timeBadge = document.getElementById('result-time-badge');
  const rtfBadge = document.getElementById('result-rtf-badge');
  const formatBadge = document.getElementById('result-format-badge');
  const downloadLink = document.getElementById('btn-download-result');
  const savedPathEl = document.getElementById('result-saved-path');
  const btnOpenFolder = document.getElementById('btn-open-result-folder');

  if (idleCard) idleCard.style.display = 'none';

  if (player) player.src = item.audio_url;
  if (textPreview) textPreview.textContent = item.text;
  if (durBadge) durBadge.textContent = `طول صوت: ${item.duration_sec}s`;
  if (timeBadge) timeBadge.textContent = `پردازش: ${item.elapsed_sec}s`;
  if (rtfBadge) rtfBadge.textContent = `RTF: ${item.rtf}x`;

  const ext = (item.format || (item.audio_url && item.audio_url.split('.').pop()) || 'mp3').toLowerCase();
  if (formatBadge) {
    formatBadge.textContent = ext.toUpperCase();
  }

  const savedPath = item.saved_path || item.audio_url;
  if (savedPathEl) {
    savedPathEl.textContent = savedPath;
    savedPathEl.title = savedPath;
  }
  if (btnOpenFolder) {
    btnOpenFolder.dataset.path = savedPath;
  }

  if (downloadLink) {
    downloadLink.href = item.audio_url;
    let dlName = `omnivoice_${item.id}.${ext}`;
    if (item.saved_path) {
      const parts = item.saved_path.replace(/\\/g, '/').split('/');
      if (parts.length > 0 && parts[parts.length - 1]) {
        dlName = parts[parts.length - 1];
      }
    }
    downloadLink.download = dlName;
    const dlLabel = document.getElementById('btn-download-label');
    if (dlLabel) {
      dlLabel.textContent = `دانلود صوت با کیفیت استودیویی (${ext.toUpperCase()})`;
    }
  }

  if (resultCard) resultCard.style.display = 'flex';
  if (player) player.play().catch(() => {});
}

function showProfileCreatedResult(prof) {
  const resultCard = document.getElementById('result-card');
  const idleCard = document.getElementById('monitor-idle-card');
  const player = document.getElementById('result-audio-player');
  const textPreview = document.getElementById('result-text-preview');
  const durBadge = document.getElementById('result-duration-badge');
  const timeBadge = document.getElementById('result-time-badge');
  const rtfBadge = document.getElementById('result-rtf-badge');
  const downloadLink = document.getElementById('btn-download-result');

  if (idleCard) idleCard.style.display = 'none';

  if (player) player.src = prof.preview_url;
  if (textPreview) textPreview.textContent = `گوینده «${prof.name}» با موفقیت ذخیره شد!\nپیام نمونه: ${prof.greeting_text}`;
  if (durBadge) durBadge.textContent = `طول نمونه: ${prof.preview_duration_sec}s`;
  if (timeBadge) timeBadge.textContent = `CFG: ${prof.guidance_scale}x`;
  if (rtfBadge) rtfBadge.textContent = `${prof.num_steps} گام`;
  if (downloadLink) {
    downloadLink.href = prof.preview_url;
    downloadLink.download = `profile_${prof.id}_preview.wav`;
  }

  if (resultCard) resultCard.style.display = 'flex';
  if (player) player.play().catch(() => {});
}

// ---------------------------------------------------------------------------
// 10. History Feed & Quick Playback
// ---------------------------------------------------------------------------
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    const history = data.history || [];

    // 1. Populate full history page list
    const list = document.getElementById('history-list');
    if (list) {
      if (!history.length) {
        list.innerHTML = '<p class="empty-state-text">هنوز صوتی تولید نشده است.</p>';
      } else {
        list.innerHTML = history.map(item => `
          <div class="history-item">
            <div class="history-header">
              <span class="badge-success-micro">${item.mode}</span>
              <span style="font-size:0.72rem; color:var(--text-muted);">${item.created_at} | ${item.duration_sec}s</span>
            </div>
            <p class="history-text">${escapeHtml(item.text)}</p>
            <audio controls src="${item.audio_url}" style="width:100%; height:36px; margin-top:0.25rem;"></audio>
          </div>
        `).join('');
      }
    }

    // 2. Populate quick sidebar feed in right monitor
    const quickFeed = document.getElementById('quick-history-feed');
    const feedBadge = document.getElementById('feed-count-badge');
    if (feedBadge) feedBadge.textContent = `${history.length} صوت`;

    if (quickFeed) {
      if (!history.length) {
        quickFeed.innerHTML = '<p class="empty-state-text" style="padding:1rem;">هنوز صوتی در این نشست تولید نشده است.</p>';
      } else {
        quickFeed.innerHTML = history.slice(0, 15).map(item => `
          <div class="quick-history-item" onclick="playFeedItem('${item.audio_url}', '${escapeHtml(item.text).replace(/'/g, "\\'")}', '${item.mode}', '${item.duration_sec}s', '${item.elapsed_sec}s', '${item.rtf}x')">
            <div class="quick-history-meta">
              <span class="quick-history-badge">${item.mode}</span>
              <span style="font-size:0.68rem; color:var(--text-muted);">${item.duration_sec}s • ${item.created_at}</span>
            </div>
            <p class="quick-history-text">${escapeHtml(item.text)}</p>
          </div>
        `).join('');
      }
    }

  } catch (e) {
    console.error('History load error', e);
  }
}

window.playFeedItem = function(url, text, mode, dur, elapsed, rtf) {
  const resultCard = document.getElementById('result-card');
  const idleCard = document.getElementById('monitor-idle-card');
  const player = document.getElementById('result-audio-player');
  const textPreview = document.getElementById('result-text-preview');
  const durBadge = document.getElementById('result-duration-badge');
  const timeBadge = document.getElementById('result-time-badge');
  const rtfBadge = document.getElementById('result-rtf-badge');
  const downloadLink = document.getElementById('btn-download-result');

  if (idleCard) idleCard.style.display = 'none';
  if (resultCard) resultCard.style.display = 'flex';
  
  if (player) {
    player.src = url;
    player.play().catch(() => {});
  }
  if (textPreview) textPreview.textContent = text;
  if (durBadge && dur) durBadge.textContent = `طول صوت: ${dur}`;
  if (timeBadge && elapsed) timeBadge.textContent = `پردازش: ${elapsed}`;
  if (rtfBadge && rtf) rtfBadge.textContent = `RTF: ${rtf}`;
  if (downloadLink) downloadLink.href = url;
};

function formatSeconds(sec) {
  const mins = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1);
  return `${mins < 10 ? '0' : ''}${mins}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===========================================================================
// 10. Multi-Speaker Audio Story & Dialogue Studio
// ===========================================================================
let storyDialogues = [];

function initStoryStudio() {
  const btnAdd = document.getElementById('btn-add-dialogue');
  const btnLoadSample = document.getElementById('btn-story-load-sample');
  const btnExport = document.getElementById('btn-story-export-json');
  const btnImportTrigger = document.getElementById('btn-story-import-trigger');
  const fileImport = document.getElementById('story-import-file');
  const btnClearAll = document.getElementById('btn-story-clear-all');
  const btnGenerateStory = document.getElementById('btn-generate-full-story');

  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      addStoryDialogue();
    });
  }

  if (btnLoadSample) {
    btnLoadSample.addEventListener('click', () => {
      loadSampleStoryScenario();
    });
  }

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      exportStoryScenarioJson();
    });
  }

  if (btnImportTrigger && fileImport) {
    btnImportTrigger.addEventListener('click', () => {
      fileImport.click();
    });

    fileImport.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (Array.isArray(parsed.dialogues)) {
            storyDialogues = parsed.dialogues;
            const titleInput = document.getElementById('story-title-input');
            if (titleInput && parsed.title) titleInput.value = parsed.title;
            renderStoryDialogues();
            alert(`سناریو با موفقیت بارگذاری شد (${storyDialogues.length} دیالوگ).`);
          } else {
            alert('فرمت فایل نامعتبر است.');
          }
        } catch (err) {
          alert('خطا در خواندن فایل JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
      fileImport.value = '';
    });
  }

  if (btnClearAll) {
    btnClearAll.addEventListener('click', async () => {
      if (!storyDialogues.length) return;
      const ok = await showConfirmModal({
        title: 'پاک‌سازی تمام دیالوگ‌ها',
        message: `آیا از پاک کردن تمام ${storyDialogues.length} دیالوگ موجود در این سناریو اطمینان دارید؟`,
        confirmText: 'بله، همه را پاک کن',
        cancelText: 'انصراف',
        icon: '🗑️'
      });
      if (ok) {
        storyDialogues = [];
        renderStoryDialogues();
      }
    });
  }

  if (btnGenerateStory) {
    btnGenerateStory.addEventListener('click', () => {
      generateFullStory();
    });
  }

  // Format selector change listener
  const formatSelect = document.getElementById('story-output-format');
  const formatBadge = document.getElementById('story-active-format-badge');
  if (formatSelect && formatBadge) {
    formatSelect.addEventListener('change', () => {
      formatBadge.textContent = formatSelect.value.toUpperCase();
    });
  }

  // Precision Crossfade Slider & Numeric Input Bidirectional Sync
  const cfSlider = document.getElementById('story-crossfade-slider');
  const cfNumber = document.getElementById('story-crossfade-number');
  const cfBadge = document.getElementById('story-crossfade-badge');
  const cfChips = document.querySelectorAll('#story-crossfade-preset-chips .cf-chip');

  const updateCrossfadeUI = (val) => {
    const num = Math.max(0, Math.min(2000, parseInt(val) || 0));
    if (cfSlider) cfSlider.value = Math.min(1000, num);
    if (cfNumber) cfNumber.value = num;
    if (cfBadge) cfBadge.textContent = `${num} ms`;

    if (cfChips) {
      cfChips.forEach(chip => {
        const chipMs = parseInt(chip.getAttribute('data-ms'));
        if (chipMs === num) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    }
  };

  if (cfSlider) {
    cfSlider.addEventListener('input', (e) => {
      updateCrossfadeUI(e.target.value);
    });
  }

  if (cfNumber) {
    cfNumber.addEventListener('input', (e) => {
      updateCrossfadeUI(e.target.value);
    });
    cfNumber.addEventListener('change', (e) => {
      updateCrossfadeUI(e.target.value);
    });
  }

  if (cfChips) {
    cfChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const ms = parseInt(chip.getAttribute('data-ms')) || 0;
        updateCrossfadeUI(ms);
      });
    });
  }

  // Start with clean, empty scenario (no forced defaults)
  storyDialogues = [];
  const titleInput = document.getElementById('story-title-input');
  if (titleInput && !titleInput.value) {
    titleInput.value = 'سناریوی جدید';
  }
  renderStoryDialogues();
}

function updateStorySpeakerSelects() {
  if (cachedProfiles && cachedProfiles.length > 0) {
    const maryam = cachedProfiles.find(p => p.name && p.name.includes('مریم'));
    const self = cachedProfiles.find(p => p.name && (p.name.includes('خودم') || p.name.includes('محمد') || p.name.includes('من')));
    
    storyDialogues.forEach((dlg, idx) => {
      if (dlg.speaker_id === 'mms') {
        if (idx % 2 === 0 && maryam) dlg.speaker_id = maryam.id;
        else if (idx % 2 === 1 && self) dlg.speaker_id = self.id;
        else dlg.speaker_id = cachedProfiles[0].id;
      }
    });
  }
  if (typeof renderStoryDialogues === 'function') {
    renderStoryDialogues();
  }
}

function getDefaultSpeakerId() {
  if (cachedProfiles && cachedProfiles.length > 0) {
    return cachedProfiles[0].id;
  }
  return 'mms';
}

function addStoryDialogue(initialProps = {}) {
  const globalPauseSelect = document.getElementById('story-global-pause-select');
  const defaultPause = globalPauseSelect ? parseFloat(globalPauseSelect.value) : 0.5;
  const globalStepsSelect = document.getElementById('story-global-steps-select');
  const defaultSteps = globalStepsSelect ? parseInt(globalStepsSelect.value) : 24;

  const newDlg = {
    id: 'dlg_' + Math.random().toString(36).substring(2, 9),
    speaker_id: initialProps.speaker_id || getDefaultSpeakerId(),
    text: initialProps.text || '',
    repeat_count: initialProps.repeat_count || 1,
    pause_after: initialProps.pause_after !== undefined ? initialProps.pause_after : defaultPause,
    speed: initialProps.speed || 1.0,
    pitch_shift: initialProps.pitch_shift || 0.0,
    num_steps: initialProps.num_steps || defaultSteps,
    guidance_scale: initialProps.guidance_scale || 2.0,
    crossfade_ms: initialProps.crossfade_ms !== undefined ? initialProps.crossfade_ms : null,
    preview_url: null,
    show_tweaks: false,
  };

  storyDialogues.push(newDlg);
  renderStoryDialogues();

  // Scroll to bottom
  const container = document.getElementById('story-dialogues-container');
  if (container) {
    setTimeout(() => {
      container.scrollTop = container.scrollHeight;
    }, 50);
  }
}

function loadSampleStoryScenario(notify = true) {
  // Find Maryam and Self profiles if they exist
  let maryamId = 'mms';
  let selfId = 'mms';

  if (cachedProfiles && cachedProfiles.length > 0) {
    const maryam = cachedProfiles.find(p => p.name && p.name.includes('مریم'));
    const self = cachedProfiles.find(p => p.name && (p.name.includes('خودم') || p.name.includes('محمد') || p.name.includes('من')));
    
    if (maryam) maryamId = maryam.id;
    else maryamId = cachedProfiles[0].id;

    if (self) selfId = self.id;
    else selfId = cachedProfiles.length > 1 ? cachedProfiles[1].id : cachedProfiles[0].id;
  }

  const titleInput = document.getElementById('story-title-input');
  if (titleInput) titleInput.value = 'گفتگوی عاشقانه و طنز دونفره';

  storyDialogues = [
    {
      id: 'dlg_1',
      speaker_id: maryamId,
      text: 'سلام عزیزم! کجایی؟ دلم برات یه ذره شده بود، داشتی چیکار می‌کردی؟',
      repeat_count: 1,
      pause_after: 0.0, // بدون مکث و کاملاً پیوسته!
      speed: 1.0,
      pitch_shift: 0.0,
      num_steps: 24,
      guidance_scale: 2.0,
      preview_url: null,
      show_tweaks: false,
    },
    {
      id: 'dlg_2',
      speaker_id: selfId,
      text: 'سلام مریم جونم! قربونت برم، داشتم روی مدل‌های هوش مصنوعی صوتی کار می‌کردم تا بتونیم با هم پادکست و داستان صوتی بسازیم.',
      repeat_count: 1,
      pause_after: 0.4, // مکث طبیعی
      speed: 1.0,
      pitch_shift: 0.0,
      num_steps: 24,
      guidance_scale: 2.0,
      preview_url: null,
      show_tweaks: false,
    },
    {
      id: 'dlg_3',
      speaker_id: maryamId,
      text: 'وای چه عالی و خفن! یعنی الان داریم با صدای شبیه‌سازی‌شده‌ی خودمون حرف می‌زنیم؟ چقدر طبیعیه!',
      repeat_count: 1,
      pause_after: 0.0, // بدون مکث
      speed: 1.0,
      pitch_shift: 0.0,
      num_steps: 24,
      guidance_scale: 2.0,
      preview_url: null,
      show_tweaks: false,
    },
    {
      id: 'dlg_4',
      speaker_id: selfId,
      text: 'دقیقاً عشق من! بدون کوچک‌ترین مکث و کاملاً پیوسته و با کیفیت استودیویی.',
      repeat_count: 1,
      pause_after: 0.0,
      speed: 1.0,
      pitch_shift: 0.0,
      num_steps: 24,
      guidance_scale: 2.0,
      preview_url: null,
      show_tweaks: false,
    }
  ];

  renderStoryDialogues();
  if (notify) {
    alert('نمونه آماده داستان صوتی (مریم و خودم) بارگذاری شد! می‌توانید دیالوگ‌ها را ویرایش، جابجا یا تکرار کنید و سپس دکمه «تولید و میکس یکپارچه» را بزنید.');
  }
}

function exportStoryScenarioJson() {
  if (!storyDialogues.length) {
    alert('هیچ دیالوگی برای برون‌ریزی وجود ندارد.');
    return;
  }
  const title = document.getElementById('story-title-input')?.value || 'story_screenplay';
  const data = {
    title: title,
    created_at: new Date().toISOString(),
    dialogues: storyDialogues.map(d => ({
      speaker_id: d.speaker_id,
      text: d.text,
      repeat_count: d.repeat_count,
      pause_after: d.pause_after,
      speed: d.speed,
      pitch_shift: d.pitch_shift,
      num_steps: d.num_steps,
      guidance_scale: d.guidance_scale,
    }))
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[\s\/:*?"<>|]+/g, '_')}_scenario.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderStoryDialogues() {
  const container = document.getElementById('story-dialogues-container');
  if (!container) return;

  const statCount = document.getElementById('story-stat-count');
  const statSpeakers = document.getElementById('story-stat-speakers');

  if (statCount) statCount.textContent = storyDialogues.length;
  if (statSpeakers) {
    const unique = new Set(storyDialogues.map(d => d.speaker_id));
    statSpeakers.textContent = unique.size;
  }

  if (storyDialogues.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding:3.5rem 1.5rem; background:var(--bg-card); border-radius:var(--radius-md); border:1px dashed var(--border-subtle); margin:0.5rem 0;">
        <div style="font-size:3rem; margin-bottom:0.6rem;">🎭</div>
        <p style="font-size:1.05rem; font-weight:800; color:var(--text-primary); margin-bottom:0.4rem;">استودیو آماده خلق داستان صوتی جدید</p>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:1.25rem;">هیچ دیالوگی در حال حاضر وجود ندارد. دیالوگ اول را اضافه کنید یا سناریوهای ذخیره‌شده را باز نمایید.</p>
        <div style="display:flex; justify-content:center; gap:0.6rem; flex-wrap:wrap;">
          <button type="button" onclick="addStoryDialogue()" class="btn-compact-primary">
            <span>➕</span><span>افزودن اولین دیالوگ</span>
          </button>
          <button type="button" onclick="openScenariosModal()" class="btn-compact-primary" style="background:var(--bg-surface-elevated); border:1px solid var(--border-color); color:var(--text-primary);">
            <span>📂</span><span>سناریوهای من</span>
          </button>
          <button type="button" onclick="loadSampleStoryScenario()" class="btn-compact-primary" style="background:linear-gradient(135deg, #ec4899, #8b5cf6);">
            <span>✨</span><span>نمونه آماده</span>
          </button>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = storyDialogues.map((dlg, idx) => {
    const isMms = dlg.speaker_id === 'mms';
    const profile = cachedProfiles.find(p => p.id === dlg.speaker_id);
    const speakerName = isMms ? 'گوینده رسمی فارسی (MMS)' : (profile ? profile.name : 'گوینده انتخاب‌شده');
    const avatarLetter = isMms ? 'ف' : (speakerName ? speakerName.charAt(0) : '👤');
    const isFirst = idx === 0;
    const isLast = idx === storyDialogues.length - 1;

    // Available speaker options
    let speakerOptions = '';
    if (cachedProfiles && cachedProfiles.length > 0) {
      speakerOptions += `<optgroup label="بانک گویندگان من">`;
      cachedProfiles.forEach(p => {
        const sel = p.id === dlg.speaker_id ? 'selected' : '';
        speakerOptions += `<option value="${p.id}" ${sel}>👤 ${escapeHtml(p.name)} (${p.description || 'گوینده اختصاصی'})</option>`;
      });
      speakerOptions += `</optgroup>`;
    }
    speakerOptions += `<optgroup label="گوینده رسمی هوش مصنوعی">`;
    speakerOptions += `<option value="mms" ${dlg.speaker_id === 'mms' ? 'selected' : ''}>🎙️ گوینده رسمی فارسی (Meta MMS - بدون لهجه)</option>`;
    speakerOptions += `</optgroup>`;

    const pausePills = [
      { val: 0.0, label: '⚡ 0.0s (بدون مکث)', seamless: true },
      { val: 0.3, label: '⏱️ 0.3s' },
      { val: 0.5, label: '⏱️ 0.5s' },
      { val: 0.8, label: '⏱️ 0.8s' },
      { val: 1.2, label: '⏱️ 1.2s' },
    ];

    const pausePillsHtml = pausePills.map(p => {
      const isActive = Math.abs(dlg.pause_after - p.val) < 0.05;
      const cls = `pause-pill-btn ${p.seamless ? 'seamless' : ''} ${isActive ? 'active' : ''}`;
      return `<button type="button" class="${cls}" onclick="setDialoguePause(${idx}, ${p.val})">${p.label}</button>`;
    }).join('');

    return `
      <div class="dialogue-card ${isMms ? 'speaker-mms' : 'speaker-profile'}" id="card-${dlg.id}">
        
        <!-- Header: Number, Character Picker, Repeat, Order Buttons -->
        <div class="dialogue-card-header">
          <div class="dialogue-character-selector-wrap">
            <span class="dialogue-idx-badge">#${idx + 1}</span>
            <div class="dialogue-speaker-avatar" style="${isMms ? 'background:linear-gradient(135deg, #10b981, #059669);' : ''}">${avatarLetter}</div>
            <select class="dialogue-speaker-select" onchange="updateDialogueSpeaker(${idx}, this.value)">
              ${speakerOptions}
            </select>
          </div>

          <div class="dialogue-card-controls">
            <!-- Repeat Count Picker -->
            <div class="dialogue-repeat-picker" title="تعداد دفعات خوانش این دیالوگ">
              <span>تکرار:</span>
              <select onchange="updateDialogueRepeat(${idx}, this.value)">
                <option value="1" ${dlg.repeat_count === 1 ? 'selected' : ''}>۱ بار</option>
                <option value="2" ${dlg.repeat_count === 2 ? 'selected' : ''}>۲ بار</option>
                <option value="3" ${dlg.repeat_count === 3 ? 'selected' : ''}>۳ بار</option>
                <option value="4" ${dlg.repeat_count === 4 ? 'selected' : ''}>۴ بار</option>
                <option value="5" ${dlg.repeat_count === 5 ? 'selected' : ''}>۵ بار</option>
              </select>
            </div>

            <!-- Reorder Buttons -->
            <button type="button" class="btn-icon-control" ${isFirst ? 'disabled style="opacity:0.3;"' : ''} onclick="moveDialogue(${idx}, -1)" title="انتقال به بالا">▲</button>
            <button type="button" class="btn-icon-control" ${isLast ? 'disabled style="opacity:0.3;"' : ''} onclick="moveDialogue(${idx}, 1)" title="انتقال به پایین">▼</button>
            
            <!-- Duplicate Button -->
            <button type="button" class="btn-icon-control" onclick="duplicateDialogue(${idx})" title="کپی و تکثیر این دیالوگ">⎘ کپی</button>
            
            <!-- Delete Button -->
            <button type="button" class="btn-icon-control danger" onclick="deleteDialogue(${idx})" title="حذف این دیالوگ">🗑️</button>
          </div>
        </div>

        <!-- Textarea with Speech Text -->
        <textarea 
          id="text-${dlg.id}" 
          class="dialogue-text-area" 
          placeholder="متن دیالوگ را اینجا بنویسید (مثلاً: سلام، حالت چطوره؟)..." 
          oninput="updateDialogueText(${idx}, this.value)"
        >${escapeHtml(dlg.text)}</textarea>

        <!-- Mini Text Helpers Toolbar -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:0.4rem; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:0.25rem;">
            <button type="button" class="btn-micro secondary" style="font-size:0.68rem;" onclick="autoDiacritizeDialogue(${idx})" title="اعراب‌گذاری هوشمند تلفظ برای این دیالوگ">
              <span>✨ اعراب‌گذاری</span>
            </button>
            <button type="button" class="btn-micro secondary" style="font-size:0.68rem;" onclick="insertTextToDialogue(${idx}, '... ')" title="مکث کوتاه">
              <span>... مکث کوتاه</span>
            </button>
            <button type="button" class="btn-micro secondary" style="font-size:0.68rem;" onclick="insertTextToDialogue(${idx}, '... ... ')" title="مکث بلند">
              <span>... ... مکث بلند</span>
            </button>
            <button type="button" class="btn-micro secondary" style="font-size:0.68rem;" onclick="insertTextToDialogue(${idx}, '«', '»')" title="نقل‌قول">
              <span>«» نقل‌قول</span>
            </button>
          </div>

          <!-- Toggle Advanced Tweaks Drawer -->
          <button type="button" class="btn-micro secondary" style="font-size:0.68rem;" onclick="toggleDialogueTweaks(${idx})">
            <span>⚙️ ${dlg.show_tweaks ? 'بستن تنظیمات' : 'تنظیمات پیشرفته'}</span>
          </button>
        </div>

        <!-- Optional Collapsible Tweaks Drawer -->
        ${dlg.show_tweaks ? `
          <div class="dialogue-tweaks-drawer">
            <div class="dialogue-tweak-item">
              <label>سرعت خوانش:</label>
              <select class="form-select-sm" onchange="updateDialogueTweak(${idx}, 'speed', parseFloat(this.value))">
                <option value="0.8" ${dlg.speed === 0.8 ? 'selected' : ''}>آرام (0.8x)</option>
                <option value="0.9" ${dlg.speed === 0.9 ? 'selected' : ''}>متوسط آرام (0.9x)</option>
                <option value="1.0" ${dlg.speed === 1.0 ? 'selected' : ''}>عادی و روان (1.0x)</option>
                <option value="1.1" ${dlg.speed === 1.1 ? 'selected' : ''}>کمی سریع‌تر (1.1x)</option>
                <option value="1.2" ${dlg.speed === 1.2 ? 'selected' : ''}>سریع (1.2x)</option>
              </select>
            </div>
            <div class="dialogue-tweak-item">
              <label>تن صدا (Pitch Shift):</label>
              <select class="form-select-sm" onchange="updateDialogueTweak(${idx}, 'pitch_shift', parseFloat(this.value))">
                <option value="-2.0" ${dlg.pitch_shift === -2.0 ? 'selected' : ''}>بم‌تر (-2)</option>
                <option value="-1.0" ${dlg.pitch_shift === -1.0 ? 'selected' : ''}>کمی بم‌تر (-1)</option>
                <option value="0.0" ${dlg.pitch_shift === 0.0 ? 'selected' : ''}>طبیعی گوینده (0)</option>
                <option value="1.0" ${dlg.pitch_shift === 1.0 ? 'selected' : ''}>کمی زیرتر (+1)</option>
                <option value="2.0" ${dlg.pitch_shift === 2.0 ? 'selected' : ''}>زیرتر (+2)</option>
              </select>
            </div>
            <div class="dialogue-tweak-item">
              <label>گام‌های کیفیت:</label>
              <select class="form-select-sm" onchange="updateDialogueTweak(${idx}, 'num_steps', parseInt(this.value))">
                <option value="16" ${dlg.num_steps === 16 ? 'selected' : ''}>⚡ سریع (۱۶)</option>
                <option value="24" ${dlg.num_steps === 24 ? 'selected' : ''}>🎯 استاندارد (۲۴)</option>
                <option value="36" ${dlg.num_steps === 36 ? 'selected' : ''}>💎 دقیق (۳۶)</option>
              </select>
            </div>
            <div class="dialogue-tweak-item" style="grid-column: 1 / -1; display:flex; flex-direction:column; gap:0.25rem;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <label>فید متقاطع اختصاصی با دیالوگ بعدی (Crossfade):</label>
                <span style="font-size:0.72rem; color:#38bdf8; font-weight:700;">
                  ${dlg.crossfade_ms !== null && dlg.crossfade_ms !== undefined ? dlg.crossfade_ms + ' ms (سفارشی)' : 'همگام با فید سراسری سناریو'}
                </span>
              </div>
              <div style="display:flex; align-items:center; gap:0.4rem;">
                <input 
                  type="range" 
                  min="0" 
                  max="1000" 
                  step="5" 
                  value="${dlg.crossfade_ms !== null && dlg.crossfade_ms !== undefined ? dlg.crossfade_ms : 120}" 
                  class="slider-precision" 
                  style="flex:1;"
                  oninput="updateDialogueCrossfade(${idx}, this.value)"
                >
                <input 
                  type="number" 
                  min="0" 
                  max="2000" 
                  step="5" 
                  value="${dlg.crossfade_ms !== null && dlg.crossfade_ms !== undefined ? dlg.crossfade_ms : ''}" 
                  placeholder="عمومی"
                  class="dialogue-cf-inline-input"
                  style="width:58px;"
                  onchange="updateDialogueCrossfade(${idx}, this.value)"
                  title="تایپ مستقیم میلی‌ثانیه فید اختصاصی"
                >
                <span style="font-size:0.68rem; color:#38bdf8; font-weight:700;">ms</span>
                <button type="button" class="btn-micro secondary" style="font-size:0.65rem;" onclick="resetDialogueCrossfade(${idx})" title="استفاده از تنظیم فید عمومی سناریو">
                  پیش‌فرض
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Footer Row: Transition Pause & Line Preview -->
        <div class="dialogue-footer-row">
          <div class="dialogue-transition-wrap">
            <span class="dialogue-transition-label">انتقال به دیالوگ بعدی:</span>
            ${pausePillsHtml}
            <div style="display:inline-flex; align-items:center; gap:2px; margin-right:4px;">
              <input 
                type="number" 
                step="0.1" 
                min="0" 
                max="10" 
                value="${dlg.pause_after}" 
                style="width:48px; background:var(--bg-surface-elevated); border:1px solid var(--border-subtle); border-radius:var(--radius-xs); color:var(--text-primary); font-size:0.7rem; padding:2px 4px; text-align:center;"
                onchange="setDialoguePause(${idx}, parseFloat(this.value) || 0)"
                title="مکث کاستوم بر حسب ثانیه"
              >
              <span style="font-size:0.68rem; color:var(--text-muted);">ثانیه</span>
            </div>
            ${dlg.pause_after <= 0.01 ? `
              <div class="dialogue-cf-pill-wrap" title="تنظیم دقیق میلی‌ثانیه فید متقاطع این خط با خط بعدی (خالی = پیش‌فرض سناریو)">
                <span class="dialogue-cf-icon">🌊 فید:</span>
                <input 
                  type="number" 
                  min="0" 
                  max="2000" 
                  step="5" 
                  placeholder="عمومی" 
                  value="${dlg.crossfade_ms !== undefined && dlg.crossfade_ms !== null ? dlg.crossfade_ms : ''}" 
                  class="dialogue-cf-inline-input"
                  onchange="updateDialogueCrossfade(${idx}, this.value)"
                  title="میلی‌ثانیه فید این خط (در صورت خالی بودن از فید عمومی سناریو استفاده می‌شود)"
                >
                <span style="font-size:0.68rem; color:#38bdf8; font-weight:700;">ms</span>
              </div>
            ` : ''}
          </div>

          <div class="dialogue-footer-actions">
            ${dlg.preview_url ? `
              <audio id="audio-preview-dlg-${dlg.id}" src="${dlg.preview_url}" controls class="line-mini-audio"></audio>
            ` : ''}
            <button type="button" id="btn-preview-dlg-${dlg.id}" class="btn-preview-line" onclick="previewDialogueLine(${idx})">
              <span>▶️</span><span>تست این خط</span>
            </button>
          </div>
        </div>

        <!-- In-Line Add Dialogue Button at Bottom of this Card for UX -->
        <div class="dialogue-card-inline-add">
          <button type="button" class="btn-inline-add-dialogue" onclick="insertDialogueAfter(${idx})" title="افزودن دیالوگ جدید دقیقاً بعد از این خط">
            <span>➕</span>
            <span>افزودن دیالوگ جدید بعد از این خط</span>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

window.insertDialogueAfter = function(idx) {
  const currentDlg = storyDialogues[idx];
  let nextSpeaker = getDefaultSpeakerId();
  if (currentDlg && cachedProfiles && cachedProfiles.length > 0) {
    if (cachedProfiles.length >= 2) {
      nextSpeaker = (currentDlg.speaker_id === cachedProfiles[0].id) ? cachedProfiles[1].id : cachedProfiles[0].id;
    } else if (currentDlg.speaker_id === cachedProfiles[0].id) {
      nextSpeaker = 'mms';
    } else {
      nextSpeaker = cachedProfiles[0].id;
    }
  }

  const globalPauseSelect = document.getElementById('story-global-pause-select');
  const defaultPause = globalPauseSelect ? parseFloat(globalPauseSelect.value) : 0.0;
  const globalStepsSelect = document.getElementById('story-global-steps-select');
  const defaultSteps = globalStepsSelect ? parseInt(globalStepsSelect.value) : 24;

  const newDlg = {
    id: 'dlg_' + Math.random().toString(36).substring(2, 9),
    speaker_id: nextSpeaker,
    text: '',
    repeat_count: 1,
    pause_after: defaultPause,
    speed: 1.0,
    pitch_shift: 0.0,
    num_steps: defaultSteps,
    guidance_scale: 2.0,
    crossfade_ms: null,
    preview_url: null,
    show_tweaks: false,
  };

  storyDialogues.splice(idx + 1, 0, newDlg);
  renderStoryDialogues();

  setTimeout(() => {
    const newCard = document.getElementById(`card-${newDlg.id}`);
    if (newCard) {
      newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const ta = document.getElementById(`text-${newDlg.id}`);
      if (ta) ta.focus();
    }
  }, 60);
};

// ---------------------------------------------------------------------------
// Story Dialogue Manipulation Handlers
// ---------------------------------------------------------------------------
window.updateDialogueSpeaker = function(idx, val) {
  if (storyDialogues[idx]) {
    storyDialogues[idx].speaker_id = val;
    storyDialogues[idx].preview_url = null;
    renderStoryDialogues();
  }
};

window.updateDialogueRepeat = function(idx, val) {
  if (storyDialogues[idx]) {
    storyDialogues[idx].repeat_count = parseInt(val) || 1;
  }
};

window.updateDialogueText = function(idx, val) {
  if (storyDialogues[idx]) {
    storyDialogues[idx].text = val;
  }
};

window.setDialoguePause = function(idx, pauseVal) {
  if (storyDialogues[idx]) {
    storyDialogues[idx].pause_after = Math.max(0.0, parseFloat(pauseVal) || 0.0);
    renderStoryDialogues();
  }
};

window.toggleDialogueTweaks = function(idx) {
  if (storyDialogues[idx]) {
    storyDialogues[idx].show_tweaks = !storyDialogues[idx].show_tweaks;
    renderStoryDialogues();
  }
};

window.updateDialogueTweak = function(idx, prop, val) {
  if (storyDialogues[idx]) {
    storyDialogues[idx][prop] = val;
    storyDialogues[idx].preview_url = null;
  }
};

window.updateDialogueCrossfade = function(idx, val) {
  if (storyDialogues[idx]) {
    if (val === '' || val === null || val === undefined) {
      storyDialogues[idx].crossfade_ms = null;
    } else {
      storyDialogues[idx].crossfade_ms = Math.max(0, Math.min(2000, parseInt(val) || 0));
    }
    renderStoryDialogues();
  }
};

window.resetDialogueCrossfade = function(idx) {
  if (storyDialogues[idx]) {
    storyDialogues[idx].crossfade_ms = null;
    renderStoryDialogues();
  }
};

window.moveDialogue = function(idx, direction) {
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= storyDialogues.length) return;
  const temp = storyDialogues[idx];
  storyDialogues[idx] = storyDialogues[targetIdx];
  storyDialogues[targetIdx] = temp;
  renderStoryDialogues();
};

window.duplicateDialogue = function(idx) {
  const source = storyDialogues[idx];
  if (!source) return;
  const copy = JSON.parse(JSON.stringify(source));
  copy.id = 'dlg_' + Math.random().toString(36).substring(2, 9);
  copy.preview_url = null;
  storyDialogues.splice(idx + 1, 0, copy);
  renderStoryDialogues();
};

window.deleteDialogue = async function(idx) {
  const dlg = storyDialogues[idx];
  if (!dlg) return;
  const preview = dlg.text && dlg.text.trim().length > 0
    ? `«${dlg.text.slice(0, 35)}...»`
    : `دیالوگ شماره #${idx + 1}`;

  const confirmed = await showConfirmModal({
    title: 'حذف دیالوگ',
    message: `آیا از حذف ${preview} اطمینان دارید؟`,
    confirmText: 'بله، حذف کن',
    cancelText: 'انصراف',
    icon: '🗑️'
  });

  if (!confirmed) return;
  storyDialogues.splice(idx, 1);
  renderStoryDialogues();
};

// ===========================================================================
// 10.1. Scenario Library & Persistence Manager (Save, Open, Copy, Delete)
// ===========================================================================
const SCENARIOS_STORAGE_KEY = 'omnivoice_scenarios_db';
let currentActiveScenarioId = null;

function getSavedScenarios() {
  try {
    const raw = localStorage.getItem(SCENARIOS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse saved scenarios', e);
    return [];
  }
}

function saveScenariosToStorage(list) {
  try {
    localStorage.setItem(SCENARIOS_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save scenarios to localStorage', e);
  }
}

function initScenarioLibrary() {
  const btnNewScenario = document.getElementById('btn-story-new-scenario');
  const btnSaveScenario = document.getElementById('btn-story-save-scenario');
  const btnOpenScenarios = document.getElementById('btn-story-open-scenarios');
  const modal = document.getElementById('scenarios-library-modal');
  const btnCloseModal = document.getElementById('btn-close-scenarios-modal');
  const btnModalNew = document.getElementById('btn-modal-create-new-scenario');
  const searchInput = document.getElementById('scenario-search-input');

  if (btnNewScenario) {
    btnNewScenario.addEventListener('click', async () => {
      await handleCreateNewScenario();
    });
  }

  if (btnModalNew) {
    btnModalNew.addEventListener('click', async () => {
      closeScenariosModal();
      await handleCreateNewScenario();
    });
  }

  if (btnSaveScenario) {
    btnSaveScenario.addEventListener('click', () => {
      handleSaveCurrentScenario();
    });
  }

  if (btnOpenScenarios) {
    btnOpenScenarios.addEventListener('click', () => {
      openScenariosModal();
    });
  }

  if (btnCloseModal) btnCloseModal.addEventListener('click', closeScenariosModal);
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeScenariosModal();
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderScenariosList(searchInput.value.trim());
    });
  }
}

async function handleCreateNewScenario() {
  if (storyDialogues.length > 0) {
    const ok = await showConfirmModal({
      title: 'ایجاد سناریوی جدید',
      message: 'آیا می‌خواهید سناریوی جدیدی شروع کنید؟ در صورت ذخیره نکردن سناریوی فعلی، تغییرات از بین خواهد رفت.',
      confirmText: 'بله، سناریوی جدید بساز',
      cancelText: 'انصراف',
      icon: '✨'
    });
    if (!ok) return;
  }

  storyDialogues = [];
  currentActiveScenarioId = null;
  const titleInput = document.getElementById('story-title-input');
  if (titleInput) titleInput.value = 'سناریوی جدید';
  renderStoryDialogues();
}

function handleSaveCurrentScenario() {
  if (!storyDialogues || !storyDialogues.length) {
    alert('سناریو هنوز خالی است. لطفاً ابتدا حداقل یک دیالوگ اضافه کنید.');
    return;
  }

  const titleInput = document.getElementById('story-title-input');
  let title = titleInput?.value?.trim();
  if (!title || title === 'سناریوی جدید') {
    title = prompt('نام این سناریو را وارد کنید:', title || 'سناریوی من');
    if (!title || !title.trim()) return;
    title = title.trim();
    if (titleInput) titleInput.value = title;
  }

  const scenarios = getSavedScenarios();
  const nowStr = new Date().toLocaleDateString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const uniqueSpeakers = new Set(storyDialogues.map(d => d.speaker_id)).size;

  if (currentActiveScenarioId) {
    const existingIdx = scenarios.findIndex(s => s.id === currentActiveScenarioId);
    if (existingIdx !== -1) {
      scenarios[existingIdx] = {
        ...scenarios[existingIdx],
        title: title,
        dialogues: JSON.parse(JSON.stringify(storyDialogues)),
        updated_at: nowStr,
        dialogues_count: storyDialogues.length,
        speakers_count: uniqueSpeakers,
      };
      saveScenariosToStorage(scenarios);
      alert(`💾 سناریو «${title}» با موفقیت به‌روزرسانی و ذخیره شد!`);
      return;
    }
  }

  const newId = 'scen_' + Date.now().toString(36);
  currentActiveScenarioId = newId;
  const newRecord = {
    id: newId,
    title: title,
    dialogues: JSON.parse(JSON.stringify(storyDialogues)),
    created_at: nowStr,
    updated_at: nowStr,
    dialogues_count: storyDialogues.length,
    speakers_count: uniqueSpeakers,
  };

  scenarios.unshift(newRecord);
  saveScenariosToStorage(scenarios);
  alert(`💾 سناریو «${title}» با موفقیت در کتابخانه سناریوها ذخیره گردید!`);
}

function openScenariosModal() {
  const modal = document.getElementById('scenarios-library-modal');
  if (modal) modal.style.display = 'flex';
  const searchInput = document.getElementById('scenario-search-input');
  if (searchInput) searchInput.value = '';
  renderScenariosList();
}

function closeScenariosModal() {
  const modal = document.getElementById('scenarios-library-modal');
  if (modal) modal.style.display = 'none';
}

function renderScenariosList(filterQuery = '') {
  const container = document.getElementById('scenarios-list-container');
  if (!container) return;

  let scenarios = getSavedScenarios();
  if (filterQuery) {
    scenarios = scenarios.filter(s => s.title && s.title.toLowerCase().includes(filterQuery.toLowerCase()));
  }

  if (!scenarios.length) {
    container.innerHTML = `
      <div style="text-align:center; padding:2.5rem 1rem; color:var(--text-muted);">
        <div style="font-size:2.4rem; margin-bottom:0.5rem;">📖</div>
        <p style="font-size:0.95rem; font-weight:700; color:var(--text-secondary); margin-bottom:0.4rem;">هیچ سناریویی یافت نشد.</p>
        <p style="font-size:0.78rem;">دیالوگ‌های خود را در استودیو بنویسید و روی دکمه «ذخیره سناریو» کلیک کنید.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = scenarios.map(s => {
    const firstSnippet = s.dialogues && s.dialogues.length > 0 && s.dialogues[0].text
      ? s.dialogues[0].text
      : 'بدون متن...';

    return `
      <div class="scenario-item-card" id="scen-card-${s.id}">
        <div class="scenario-item-header">
          <div class="scenario-item-title">
            <span>🎭</span>
            <span>${escapeHtml(s.title)}</span>
          </div>
          <div class="scenario-item-badges">
            <span class="badge-success-micro">${s.dialogues_count || (s.dialogues ? s.dialogues.length : 0)} دیالوگ</span>
            <span style="color:var(--text-muted); font-size:0.7rem;">🕒 ${s.updated_at || s.created_at || ''}</span>
          </div>
        </div>

        <div class="scenario-item-preview">
          <span>شروع: </span>
          <span>${escapeHtml(firstSnippet)}</span>
        </div>

        <div class="scenario-item-actions">
          <button type="button" class="btn-micro primary" onclick="loadSavedScenario('${s.id}')">
            <span>📂</span><span>باز کردن و ویرایش</span>
          </button>
          <button type="button" class="btn-micro secondary" onclick="duplicateSavedScenario('${s.id}')" title="تکثیر این سناریو">
            <span>⎘</span><span>کپی</span>
          </button>
          <button type="button" class="btn-micro secondary" style="color:#ef4444;" onclick="deleteSavedScenario('${s.id}')" title="حذف سناریو">
            <span>🗑️</span><span>حذف</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

window.openScenariosModal = openScenariosModal;
window.closeScenariosModal = closeScenariosModal;

window.loadSavedScenario = function(scenId) {
  const scenarios = getSavedScenarios();
  const found = scenarios.find(s => s.id === scenId);
  if (!found) {
    alert('سناریو یافت نشد.');
    return;
  }

  currentActiveScenarioId = found.id;
  storyDialogues = JSON.parse(JSON.stringify(found.dialogues || []));
  const titleInput = document.getElementById('story-title-input');
  if (titleInput) titleInput.value = found.title || 'سناریوی من';

  renderStoryDialogues();
  closeScenariosModal();
  alert(`سناریوی «${found.title}» با موفقیت باز شد (${storyDialogues.length} دیالوگ).`);
};

window.duplicateSavedScenario = function(scenId) {
  const scenarios = getSavedScenarios();
  const found = scenarios.find(s => s.id === scenId);
  if (!found) return;

  const nowStr = new Date().toLocaleDateString('fa-IR', { hour: '2-digit', minute: '2-digit' });
  const newCopy = {
    ...JSON.parse(JSON.stringify(found)),
    id: 'scen_' + Date.now().toString(36),
    title: `کپی از ${found.title}`,
    updated_at: nowStr,
    created_at: nowStr,
  };

  scenarios.unshift(newCopy);
  saveScenariosToStorage(scenarios);
  renderScenariosList();
};

window.deleteSavedScenario = async function(scenId) {
  const scenarios = getSavedScenarios();
  const found = scenarios.find(s => s.id === scenId);
  if (!found) return;

  const confirmed = await showConfirmModal({
    title: 'حذف سناریو',
    message: `آیا از حذف کامل سناریوی «${found.title}» اطمینان دارید؟`,
    confirmText: 'بله، حذف کن',
    cancelText: 'انصراف',
    icon: '🗑️'
  });
  if (!confirmed) return;

  const filtered = scenarios.filter(s => s.id !== scenId);
  saveScenariosToStorage(filtered);
  if (currentActiveScenarioId === scenId) {
    currentActiveScenarioId = null;
  }
  renderScenariosList();
};

window.insertTextToDialogue = function(idx, prefix, suffix = '') {
  const dlg = storyDialogues[idx];
  if (!dlg) return;
  const textarea = document.getElementById(`text-${dlg.id}`);
  if (!textarea) return;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  const sel = text.substring(start, end);

  const replacement = prefix + sel + suffix;
  textarea.value = text.substring(0, start) + replacement + text.substring(end);
  dlg.text = textarea.value;

  textarea.focus();
  textarea.setSelectionRange(start + replacement.length, start + replacement.length);
};

window.autoDiacritizeDialogue = async function(idx) {
  const dlg = storyDialogues[idx];
  if (!dlg || !dlg.text.trim()) {
    alert('متن دیالوگ خالی است.');
    return;
  }
  try {
    const res = await fetch('/api/diacritize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: dlg.text.trim() }),
    });
    const data = await res.json();
    if (data.success && data.diacritized) {
      dlg.text = data.diacritized;
      renderStoryDialogues();
    } else {
      alert('خطا در اعراب‌گذاری: ' + (data.error || 'ناشناخته'));
    }
  } catch (err) {
    alert('ارتباط با سرور برقرار نشد.');
  }
};

window.previewDialogueLine = async function(idx) {
  const dlg = storyDialogues[idx];
  if (!dlg || !dlg.text.trim()) {
    alert('لطفاً ابتدا متنی برای این دیالوگ بنویسید.');
    return;
  }

  const btn = document.getElementById(`btn-preview-dlg-${dlg.id}`);
  const origHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>⏳</span><span>در حال تولید...</span>';
  }

  try {
    const outputFormat = document.getElementById('story-output-format')?.value || 'mp3';

    const res = await fetch('/api/story/preview-line', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: dlg.text.trim(),
        speaker_id: dlg.speaker_id,
        speed: dlg.speed || 1.0,
        pitch_shift: dlg.pitch_shift || 0.0,
        num_steps: dlg.num_steps || 24,
        guidance_scale: dlg.guidance_scale || 2.0,
        output_format: outputFormat,
      }),
    });
    const data = await res.json();
    if (data.success && data.audio_url) {
      dlg.preview_url = data.audio_url;
      renderStoryDialogues();
      setTimeout(() => {
        const audio = document.getElementById(`audio-preview-dlg-${dlg.id}`);
        if (audio) audio.play().catch(() => {});
      }, 80);
    } else {
      alert('خطا در تولید پیش‌نمایش دیالوگ: ' + (data.error || 'ناشناخته'));
    }
  } catch (err) {
    alert('خطا در اتصال به سرور: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origHtml;
    }
  }
};

// ---------------------------------------------------------------------------
// Generate Full Multi-Speaker Story
// ---------------------------------------------------------------------------
async function generateFullStory() {
  if (!storyDialogues.length) {
    alert('هیچ دیالوگی برای ساخت داستان صوتی وجود ندارد.');
    return;
  }

  for (let i = 0; i < storyDialogues.length; i++) {
    if (!storyDialogues[i].text.trim()) {
      alert(`دیالوگ شماره #${i + 1} متن ندارد. لطفاً متن آن را وارد کرده یا دیالوگ را حذف کنید.`);
      return;
    }
  }

  const title = document.getElementById('story-title-input')?.value?.trim() || 'داستان صوتی و دیالوگ';
  const outputFormat = document.getElementById('story-output-format')?.value || 'mp3';
  const crossfadeInput = document.getElementById('story-crossfade-number');
  const crossfadeSlider = document.getElementById('story-crossfade-slider');
  const crossfadeMs = parseInt(crossfadeInput?.value || crossfadeSlider?.value || 120);
  const trimSilence = document.getElementById('story-chk-trim-silence')?.checked ?? true;

  const btnGenerateStory = document.getElementById('btn-generate-full-story');
  const progressBox = document.getElementById('progress-container');
  const resultCard = document.getElementById('result-card');
  const idleCard = document.getElementById('monitor-idle-card');

  if (idleCard) idleCard.style.display = 'none';
  if (progressBox) progressBox.style.display = 'flex';
  if (resultCard) resultCard.style.display = 'none';
  if (btnGenerateStory) btnGenerateStory.disabled = true;

  startProgressTracker();

  // Prepare payload
  const dialoguesPayload = storyDialogues.map(d => {
    let sName = 'گوینده';
    if (d.speaker_id === 'mms') {
      sName = 'گوینده رسمی MMS';
    } else {
      const p = cachedProfiles.find(x => x.id === d.speaker_id);
      if (p) sName = p.name;
    }

    return {
      text: d.text.trim(),
      speaker_id: d.speaker_id,
      speaker_name: sName,
      speed: d.speed || 1.0,
      pitch_shift: d.pitch_shift || 0.0,
      pause_after: Math.max(0.0, d.pause_after || 0.0),
      repeat_count: Math.max(1, d.repeat_count || 1),
      num_steps: d.num_steps || 24,
      guidance_scale: d.guidance_scale || 2.0,
      crossfade_ms: (typeof d.crossfade_ms === 'number' && !isNaN(d.crossfade_ms)) ? d.crossfade_ms : crossfadeMs,
    };
  });

  try {
    const customFilename = document.getElementById('story-custom-filename')?.value?.trim() || '';
    const customOutputDir = document.getElementById('story-custom-dir')?.value?.trim() || localStorage.getItem('omnivoice_custom_output_dir') || '';
    if (customOutputDir) {
      localStorage.setItem('omnivoice_custom_output_dir', customOutputDir);
    }

    const res = await fetch('/api/story/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        output_format: outputFormat,
        custom_filename: customFilename,
        custom_output_dir: customOutputDir,
        crossfade_ms: crossfadeMs,
        trim_silence: trimSilence,
        dialogues: dialoguesPayload,
      }),
    });
    const data = await res.json();

    if (data.success) {
      const rtf = (data.elapsed_sec / (data.duration_sec || 1)).toFixed(2);
      const resultItem = {
        id: data.story_id,
        audio_url: data.audio_url,
        saved_path: data.saved_path,
        format: data.format || outputFormat,
        text: `داستان صوتی «${data.title}» (${(data.format || outputFormat).toUpperCase()}) - شامل ${storyDialogues.length} دیالوگ با فید متقاطع و پیوستگی کامل`,
        duration_sec: data.duration_sec,
        elapsed_sec: data.elapsed_sec,
        rtf: rtf,
      };

      showResult(resultItem);
      renderStoryTimeline(data.timeline, data.audio_url);
      loadHistory();
    } else {
      alert('⚠️ خطا در ساخت داستان صوتی: ' + (data.error || 'ناشناخته'));
      if (idleCard) idleCard.style.display = 'flex';
    }
  } catch (err) {
    alert('قطع ارتباط با سرور: ' + err.message);
    if (idleCard) idleCard.style.display = 'flex';
  } finally {
    stopProgressTracker();
    if (progressBox) progressBox.style.display = 'none';
    if (btnGenerateStory) btnGenerateStory.disabled = false;
  }
}

function renderStoryTimeline(timeline, audioUrl) {
  const card = document.getElementById('story-timeline-card');
  const chipsContainer = document.getElementById('story-timeline-chips');
  const durBadge = document.getElementById('story-timeline-duration');
  const player = document.getElementById('result-audio-player');

  if (!card || !chipsContainer || !timeline || !timeline.length) return;

  const totalDur = timeline[timeline.length - 1].end_sec;
  if (durBadge) durBadge.textContent = `طول کل: ${totalDur}s`;

  chipsContainer.innerHTML = timeline.map((item, idx) => {
    const dlg = storyDialogues[idx];
    let spk = 'گوینده';
    if (dlg) {
      if (dlg.speaker_id === 'mms') spk = 'MMS';
      else {
        const p = cachedProfiles.find(x => x.id === dlg.speaker_id);
        if (p) spk = p.name;
      }
    }

    const startMinSec = formatSeconds(item.start_sec);
    const endMinSec = formatSeconds(item.end_sec);
    const snippet = dlg ? (dlg.text.length > 25 ? dlg.text.substring(0, 25) + '...' : dlg.text) : '';

    return `
      <div class="story-timeline-chip" onclick="seekMasterAudio(${item.start_sec})" title="کلیک برای پخش از ثانیه ${item.start_sec}">
        <span class="chip-time">${startMinSec} - ${endMinSec}</span>
        <strong>${escapeHtml(spk)}:</strong>
        <span>«${escapeHtml(snippet)}»</span>
      </div>
    `;
  }).join('');

  card.style.display = 'flex';
}

window.seekMasterAudio = function(sec) {
  const player = document.getElementById('result-audio-player');
  if (player) {
    player.currentTime = sec;
    player.play().catch(() => {});
  }
};

// ---------------------------------------------------------------------------
// 10. Video Voice Scrubber & Trimmer Module
// ---------------------------------------------------------------------------
let currentVideoFile = null;
let currentVideoPath = null;
let videoInTime = 0.0;
let videoOutTime = 5.0;
let isPreviewingVideoSegment = false;

function initVideoScrubber() {
  const modal = document.getElementById('video-scrubber-modal');
  const btnOpen = document.getElementById('btn-open-video-scrubber');
  const btnClose = document.getElementById('btn-close-video-scrubber');
  const btnCancel = document.getElementById('btn-cancel-video-scrubber');
  const filePicker = document.getElementById('video-file-picker');
  const btnSelectFile = document.getElementById('btn-select-video-file');
  const fileNameChip = document.getElementById('video-file-name-chip');
  const pathInput = document.getElementById('video-local-path-input');
  const btnLoadPath = document.getElementById('btn-load-video-path');
  const videoPlayer = document.getElementById('video-scrubber-player');
  const emptyPlaceholder = document.getElementById('video-empty-placeholder');
  const seekSlider = document.getElementById('video-seek-slider');
  const highlightBar = document.getElementById('video-selection-highlight-bar');
  const timecodeDisplay = document.getElementById('video-timecode-display');
  const durationBadge = document.getElementById('video-selection-duration-badge');

  // Navigation buttons
  const btnBack10 = document.getElementById('btn-v-back-10s');
  const btnBack1 = document.getElementById('btn-v-back-1s');
  const btnBackFrame = document.getElementById('btn-v-back-frame');
  const btnPlayPause = document.getElementById('btn-v-play-pause');
  const playIcon = document.getElementById('v-play-icon');
  const playLabel = document.getElementById('v-play-label');
  const btnFwdFrame = document.getElementById('btn-v-fwd-frame');
  const btnFwd1 = document.getElementById('btn-v-fwd-1s');
  const btnFwd10 = document.getElementById('btn-v-fwd-10s');
  const rateSelect = document.getElementById('video-playback-rate-select');

  // Markers
  const btnSetIn = document.getElementById('btn-set-video-in');
  const btnSetOut = document.getElementById('btn-set-video-out');
  const inInput = document.getElementById('video-in-time-input');
  const outInput = document.getElementById('video-out-time-input');
  const btnPreviewSeg = document.getElementById('btn-preview-video-segment');

  // Target Profile Toggle
  const chkSaveProfile = document.getElementById('chk-video-save-profile');
  const profileInputs = document.getElementById('video-profile-inputs');
  const profileNameInput = document.getElementById('video-profile-name-input');
  const profileDescInput = document.getElementById('video-profile-desc-input');

  // Extract Action
  const btnExtract = document.getElementById('btn-extract-and-clone-video');
  const extractLabel = document.getElementById('btn-extract-label');
  const extractStatus = document.getElementById('video-extract-status');

  if (!modal || !videoPlayer) return;

  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  }

  function updateVisualMarkers() {
    if (!videoPlayer.duration || isNaN(videoPlayer.duration)) return;
    const dur = videoPlayer.duration;
    const leftPct = (videoInTime / dur) * 100;
    const widthPct = Math.max(0.5, ((videoOutTime - videoInTime) / dur) * 100);

    if (highlightBar) {
      highlightBar.style.left = `${leftPct}%`;
      highlightBar.style.width = `${widthPct}%`;
    }

    const segDur = Math.max(0.1, videoOutTime - videoInTime);
    if (durationBadge) {
      durationBadge.textContent = `طول برش: ${segDur.toFixed(1)}s`;
      if (segDur > 15) {
        durationBadge.style.background = 'rgba(239, 68, 68, 0.85)';
        durationBadge.style.borderColor = '#ef4444';
        durationBadge.title = 'طول برش بیشتر از ۱۵ ثانیه است؛ هوش مصنوعی آن را به ۱۲ ثانیه کوتاه می‌کند.';
      } else {
        durationBadge.style.background = 'rgba(16, 185, 129, 0.85)';
        durationBadge.style.borderColor = '#10b981';
        durationBadge.title = 'طول ایده‌آل دیالوگ برای کلون دقیق';
      }
    }

    if (inInput) inInput.value = videoInTime.toFixed(1);
    if (outInput) outInput.value = videoOutTime.toFixed(1);
  }

  window.openVideoScrubber = function(fileOrPath = null) {
    modal.style.display = 'flex';
    if (fileOrPath instanceof File) {
      loadVideoFromFile(fileOrPath);
    } else if (typeof fileOrPath === 'string' && fileOrPath.trim()) {
      loadVideoFromPath(fileOrPath.trim());
    }
  };

  function closeVideoScrubber() {
    videoPlayer.pause();
    modal.style.display = 'none';
  }

  if (btnOpen) btnOpen.addEventListener('click', () => window.openVideoScrubber());
  if (btnClose) btnClose.addEventListener('click', closeVideoScrubber);
  if (btnCancel) btnCancel.addEventListener('click', closeVideoScrubber);

  // File Picker
  if (btnSelectFile && filePicker) {
    btnSelectFile.addEventListener('click', () => filePicker.click());
    filePicker.addEventListener('change', (e) => {
      if (e.target.files.length) loadVideoFromFile(e.target.files[0]);
    });
  }

  // Path Loader
  if (btnLoadPath && pathInput) {
    btnLoadPath.addEventListener('click', () => {
      const p = pathInput.value.trim();
      if (p) loadVideoFromPath(p);
      else alert('لطفاً مسیر فایل ویدیویی را وارد کنید.');
    });
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btnLoadPath.click();
    });
  }

  function loadVideoFromFile(file) {
    currentVideoFile = file;
    currentVideoPath = null;
    if (fileNameChip) fileNameChip.textContent = file.name;
    if (emptyPlaceholder) emptyPlaceholder.style.display = 'none';

    const objUrl = URL.createObjectURL(file);
    videoPlayer.src = objUrl;
    videoPlayer.load();
  }

  function loadVideoFromPath(p) {
    currentVideoFile = null;
    currentVideoPath = p;
    const name = p.split(/[\\/]/).pop();
    if (fileNameChip) fileNameChip.textContent = name;
    if (emptyPlaceholder) emptyPlaceholder.style.display = 'none';

    videoPlayer.src = `/api/video/stream?path=${encodeURIComponent(p)}`;
    videoPlayer.load();
  }

  videoPlayer.addEventListener('loadedmetadata', () => {
    const total = videoPlayer.duration;
    videoInTime = 0.0;
    videoOutTime = Math.min(5.0, total);
    updateVisualMarkers();
    if (timecodeDisplay) {
      timecodeDisplay.textContent = `${formatTime(0)} / ${formatTime(total)}`;
    }
    if (seekSlider) {
      seekSlider.value = 0;
    }
  });

  videoPlayer.addEventListener('timeupdate', () => {
    const cur = videoPlayer.currentTime;
    const total = videoPlayer.duration || 1;
    if (timecodeDisplay) {
      timecodeDisplay.textContent = `${formatTime(cur)} / ${formatTime(total)}`;
    }
    if (seekSlider && !seekSlider.matches(':active')) {
      seekSlider.value = (cur / total) * 100;
    }

    if (isPreviewingVideoSegment) {
      if (cur >= videoOutTime || cur < videoInTime) {
        videoPlayer.currentTime = videoInTime;
        videoPlayer.play();
      }
    }
  });

  if (seekSlider) {
    seekSlider.addEventListener('input', () => {
      if (!videoPlayer.duration) return;
      const targetTime = (parseFloat(seekSlider.value) / 100) * videoPlayer.duration;
      videoPlayer.currentTime = targetTime;
    });
  }

  function togglePlay() {
    isPreviewingVideoSegment = false;
    if (videoPlayer.paused) {
      videoPlayer.play();
      if (playIcon) playIcon.textContent = '⏸️';
      if (playLabel) playLabel.textContent = 'توقف';
    } else {
      videoPlayer.pause();
      if (playIcon) playIcon.textContent = '▶️';
      if (playLabel) playLabel.textContent = 'پخش';
    }
  }

  if (btnPlayPause) btnPlayPause.addEventListener('click', togglePlay);
  videoPlayer.addEventListener('play', () => {
    if (playIcon) playIcon.textContent = '⏸️';
    if (playLabel) playLabel.textContent = 'توقف';
  });
  videoPlayer.addEventListener('pause', () => {
    if (playIcon) playIcon.textContent = '▶️';
    if (playLabel) playLabel.textContent = 'پخش';
  });

  function skipVideo(delta) {
    isPreviewingVideoSegment = false;
    if (!videoPlayer.duration) return;
    videoPlayer.currentTime = Math.max(0, Math.min(videoPlayer.duration, videoPlayer.currentTime + delta));
  }

  if (btnBack10) btnBack10.addEventListener('click', () => skipVideo(-10));
  if (btnBack1) btnBack1.addEventListener('click', () => skipVideo(-1));
  if (btnBackFrame) btnBackFrame.addEventListener('click', () => skipVideo(-0.1));
  if (btnFwdFrame) btnFwdFrame.addEventListener('click', () => skipVideo(0.1));
  if (btnFwd1) btnFwd1.addEventListener('click', () => skipVideo(1));
  if (btnFwd10) btnFwd10.addEventListener('click', () => skipVideo(10));

  if (rateSelect) {
    rateSelect.addEventListener('change', () => {
      videoPlayer.playbackRate = parseFloat(rateSelect.value) || 1.0;
    });
  }

  // Mark In & Out
  if (btnSetIn) {
    btnSetIn.addEventListener('click', () => {
      videoInTime = Math.max(0, videoPlayer.currentTime);
      if (videoOutTime <= videoInTime) {
        videoOutTime = Math.min(videoPlayer.duration || videoInTime + 5, videoInTime + 5);
      }
      updateVisualMarkers();
    });
  }

  if (btnSetOut) {
    btnSetOut.addEventListener('click', () => {
      videoOutTime = Math.min(videoPlayer.duration || videoPlayer.currentTime, Math.max(videoInTime + 0.3, videoPlayer.currentTime));
      updateVisualMarkers();
    });
  }

  if (inInput) {
    inInput.addEventListener('change', () => {
      videoInTime = Math.max(0, parseFloat(inInput.value) || 0);
      updateVisualMarkers();
    });
  }

  if (outInput) {
    outInput.addEventListener('change', () => {
      videoOutTime = Math.max(videoInTime + 0.3, parseFloat(outInput.value) || 5);
      updateVisualMarkers();
    });
  }

  // Preview segment
  if (btnPreviewSeg) {
    btnPreviewSeg.addEventListener('click', () => {
      isPreviewingVideoSegment = true;
      videoPlayer.currentTime = videoInTime;
      videoPlayer.play();
    });
  }

  // Toggle Save as Profile
  if (chkSaveProfile && profileInputs) {
    chkSaveProfile.addEventListener('change', () => {
      profileInputs.style.display = chkSaveProfile.checked ? 'flex' : 'none';
    });
  }

  // Extract Segment & Transfer to Custom Clone Studio
  if (btnExtract) {
    btnExtract.addEventListener('click', async () => {
      if (!currentVideoFile && !currentVideoPath) {
        alert('لطفاً ابتدا یک فایل فیلم انتخاب کرده یا مسیر آن را وارد نمایید.');
        return;
      }

      const segDur = videoOutTime - videoInTime;
      if (segDur <= 0.2) {
        alert('طول بخش انتخابی دیالوگ بسیار کوتاه است. لطفاً حداقل ۱ ثانیه انتخاب کنید.');
        return;
      }

      btnExtract.disabled = true;
      extractLabel.textContent = '⏳ در حال استخراج و تحلیل صدا...';
      if (extractStatus) extractStatus.textContent = 'در حال استخراج صوتی با کیفیت ۲۴kHz و اجرای مدل Whisper...';

      try {
        const fd = new FormData();
        if (currentVideoFile) {
          fd.append('video', currentVideoFile);
        } else if (currentVideoPath) {
          fd.append('video_path', currentVideoPath);
        }

        fd.append('start_time', videoInTime.toFixed(3));
        fd.append('end_time', videoOutTime.toFixed(3));
        fd.append('denoise', document.getElementById('chk-video-denoise')?.checked ?? true);
        fd.append('auto_transcribe', document.getElementById('chk-video-auto-transcribe')?.checked ?? true);
        fd.append('save_as_profile', false); // Do NOT pollute speaker bank with test voices!

        const res = await fetch('/api/video/extract-segment', {
          method: 'POST',
          body: fd,
        });
        const data = await res.json();

        if (data.success && data.audio_url) {
          extractLabel.textContent = '⏳ در حال انتقال به استودیو...';

          // 1. Switch to Clone tab & Custom clone mode
          const tabBtnClone = document.getElementById('tab-btn-clone');
          if (tabBtnClone) tabBtnClone.click();

          const btnCustom = document.getElementById('btn-mode-custom');
          if (btnCustom) btnCustom.click();

          // 2. Fetch and load extracted audio into AudioTrimmer
          try {
            const audioRes = await fetch(data.audio_url);
            const audioBlob = await audioRes.blob();
            const audioFile = new File([audioBlob], `extracted_video_${data.duration_sec}s.wav`, { type: 'audio/wav' });

            if (trimmer) {
              await trimmer.loadAudioFile(audioFile);
              trimmer.setSelection(0, data.duration_sec);
              const dropZone = document.getElementById('drop-zone');
              const trimmerWrapper = document.getElementById('trimmer-wrapper');
              if (dropZone) dropZone.style.display = 'none';
              if (trimmerWrapper) trimmerWrapper.style.display = 'flex';
            }
          } catch (te) {
            console.warn('Trimmer load warning:', te);
          }

          // 3. Populate Whisper transcription in Reference Text
          const refTextInput = document.getElementById('clone-ref-text');
          if (refTextInput && data.transcription) {
            refTextInput.value = data.transcription;
          }

          // 4. Default prompt text if empty
          const targetText = document.getElementById('clone-target-text');
          if (targetText && !targetText.value.trim()) {
            targetText.value = 'سلام! این صدای شبیه‌سازی‌شده‌ی من است که از فیلم استخراج شده.';
          }

          closeVideoScrubber();
          alert(`🎬 صدای فیلم با موفقیت استخراج شد (${data.duration_sec} ثانیه) و در بخش کلون قرار گرفت!\n\nمتن شناسایی‌شده: «${data.transcription || '---'}»\n\nمی‌توانید پارامترها را تنظیم کرده و به تعداد دلخواه تست کنید.\nهر زمان از کیفیت صدا مطمئن شدید، دکمه «💾 افزودن به کتابخانه گویندگان» را بزنید.`);
        } else {
          alert('خطا در استخراج صدای ویدیو: ' + (data.error || 'ناشناخته'));
        }
      } catch (err) {
        console.error('Extraction error:', err);
        alert('خطا در فرآیند استخراج صدا: ' + err.message);
      } finally {
        btnExtract.disabled = false;
        extractLabel.textContent = 'استخراج صدا و انتقال به استودیوی کلون';
        if (extractStatus) extractStatus.textContent = 'بخش مورد نظرتان از فیلم (هر چند ثانیه که مایلید) را انتخاب کرده و دکمه استخراج را بزنید.';
      }
    });
  }
}


