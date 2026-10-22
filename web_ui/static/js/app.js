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
  initFormActions();
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
// 2. Waveform Trimmer (Compact Precision Editor)
// ---------------------------------------------------------------------------
function initTrimmer() {
  const timeStartEl = document.getElementById('trim-start-time');
  const timeEndEl = document.getElementById('trim-end-time');
  const timeDurationEl = document.getElementById('trim-duration-badge');

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
    },
    onLoaded: (dur, name) => {
      const nameEl = document.getElementById('audio-file-name');
      const durEl = document.getElementById('audio-total-duration');
      if (nameEl) nameEl.textContent = name;
      if (durEl) durEl.textContent = `${dur.toFixed(1)}s`;
      document.getElementById('trimmer-wrapper').style.display = 'flex';
      document.getElementById('drop-zone').style.display = 'none';
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

  // Play / Pause preview
  const playBtn = document.getElementById('btn-play-trim');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (trimmer.isPlaying) {
        trimmer.stopPlayback();
        playBtn.innerHTML = '<span>▶️</span><span>پخش برش</span>';
      } else {
        trimmer.playSelection();
        playBtn.innerHTML = '<span>⏸️</span><span>توقف</span>';
      }
    });
  }

  // Change audio file
  const changeBtn = document.getElementById('btn-change-audio');
  if (changeBtn) {
    changeBtn.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      document.getElementById('trimmer-wrapper').style.display = 'none';
      document.getElementById('drop-zone').style.display = 'flex';
    });
  }
}

function handleAudioUpload(file) {
  if (trimmer) trimmer.loadAudioFile(file);
}

// ---------------------------------------------------------------------------
// 3. Navigation Tabs
// ---------------------------------------------------------------------------
function initTabs() {
  const tabBtns = document.querySelectorAll('.nav-tab');
  const tabViews = {
    'tab-btn-clone': document.getElementById('view-clone'),
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
    if (stripSettings) stripSettings.style.display = 'none';
    if (submitLabel) {
      submitLabel.textContent = '🔄 تبدیل مستقیم این صدا به صدای من (Voice Conversion)';
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

  const engineOmniRadio = document.getElementById('engine-omnivoice');
  const engineDspRadio = document.getElementById('engine-dsp');
  const labelEngineOmni = document.getElementById('label-engine-omnivoice');
  const labelEngineDsp = document.getElementById('label-engine-dsp');
  const dspControls = document.getElementById('vc-dsp-controls-grid');
  const stripSettings = document.getElementById('strip-standard-settings');
  const submitLabel = document.getElementById('btn-clone-label');

  const updateEngineUI = () => {
    const isOmni = engineOmniRadio && engineOmniRadio.checked;
    if (labelEngineOmni) {
      labelEngineOmni.style.borderColor = isOmni ? 'var(--color-primary)' : 'var(--border-color)';
      labelEngineOmni.style.background = isOmni ? 'rgba(99,102,241,0.15)' : 'var(--bg-input)';
    }
    if (labelEngineDsp) {
      labelEngineDsp.style.borderColor = !isOmni ? 'var(--color-primary)' : 'var(--border-color)';
      labelEngineDsp.style.background = !isOmni ? 'rgba(99,102,241,0.15)' : 'var(--bg-input)';
    }
    if (dspControls) dspControls.style.display = isOmni ? 'none' : 'grid';
    if (stripSettings && activeInputType === 'voice_convert') {
      stripSettings.style.display = isOmni ? 'grid' : 'none';
    }
    if (submitLabel && activeInputType === 'voice_convert') {
      submitLabel.textContent = isOmni
        ? '✨ تبدیل صدا با هوش مصنوعی OmniVoice (کیفیت طبیعی استودیویی)'
        : '🤖 تغییر فرکانس با فیلتر DSP';
    }
  };

  if (engineOmniRadio) engineOmniRadio.addEventListener('change', updateEngineUI);
  if (engineDspRadio) engineDspRadio.addEventListener('change', updateEngineUI);

  const pitchSlider = document.getElementById('vc-pitch-slider');
  const pitchBadge = document.getElementById('vc-pitch-badge');
  const timbreSlider = document.getElementById('vc-timbre-slider');
  const timbreBadge = document.getElementById('vc-timbre-badge');

  if (pitchSlider && pitchBadge) {
    pitchSlider.addEventListener('input', () => {
      const v = parseFloat(pitchSlider.value);
      if (v === 0) pitchBadge.textContent = '0 نیم‌پرده (خودکار)';
      else if (v > 0) pitchBadge.textContent = `+${v} نیم‌پرده (زیرتر)`;
      else pitchBadge.textContent = `${v} نیم‌پرده (بم‌تر)`;
    });
  }

  if (timbreSlider && timbreBadge) {
    timbreSlider.addEventListener('input', () => {
      const pct = Math.round(parseFloat(timbreSlider.value) * 100);
      timbreBadge.textContent = `${pct}% (تطابق تار صوتی)`;
    });
  }

  const handleFile = (file) => {
    if (!file) return;
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
}

async function loadProfiles() {
  try {
    const res = await fetch('/api/profiles');
    const data = await res.json();
    cachedProfiles = data.profiles || [];

    renderProfilesSelect(cachedProfiles);
    renderProfilesGrid(cachedProfiles);

    if (cachedProfiles.length > 0) {
      if (!selectedProfile || !cachedProfiles.some(p => p.id === selectedProfile.id)) {
        selectedProfile = cachedProfiles[0];
      }
      const selectEl = document.getElementById('select-saved-profile');
      if (selectEl) selectEl.value = selectedProfile.id;
      updateSelectedProfileCard(selectedProfile);
    } else {
      updateSelectedProfileCard(null);
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
        <div class="profile-avatar">${p.name ? p.name.charAt(0) : '👤'}</div>
        <div class="profile-card-title-group">
          <div class="profile-card-name">${p.name}</div>
          <div class="profile-card-meta">${p.description || 'گوینده اختصاصی'}</div>
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
        <button class="btn-micro secondary" style="color:#ef4444;" onclick="deleteProfile('${p.id}', '${p.name}')" title="حذف">
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

window.deleteProfile = async function(profId, profName) {
  if (!confirm(`آیا مطمئن هستید که می‌خواهید گوینده «${profName}» را به طور کامل حذف کنید؟`)) {
    return;
  }

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

      const isOmni = document.getElementById('engine-omnivoice')?.checked ?? true;
      const convertEngine = isOmni ? 'omnivoice' : 'dsp';
      formData.append('convert_engine', convertEngine);

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

      const chkSave = document.getElementById('chk-save-as-profile');
      if (chkSave && chkSave.checked) {
        const pName = document.getElementById('new-profile-name-input').value.trim();
        const pDesc = document.getElementById('new-profile-desc-input').value.trim();
        if (pName) {
          formData.append('save_as_profile', 'true');
          formData.append('profile_name', pName);
          formData.append('profile_desc', pDesc);
        }
      }

      await startGenerationTask('/api/clone', formData);
      if (chkSave && chkSave.checked) {
        await loadProfiles();
      }
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
  const downloadLink = document.getElementById('btn-download-result');

  if (idleCard) idleCard.style.display = 'none';

  if (player) player.src = item.audio_url;
  if (textPreview) textPreview.textContent = item.text;
  if (durBadge) durBadge.textContent = `طول صوت: ${item.duration_sec}s`;
  if (timeBadge) timeBadge.textContent = `پردازش: ${item.elapsed_sec}s`;
  if (rtfBadge) rtfBadge.textContent = `RTF: ${item.rtf}x`;
  if (downloadLink) {
    downloadLink.href = item.audio_url;
    downloadLink.download = `omnivoice_${item.id}.wav`;
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
