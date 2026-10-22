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
  initStoryStudio();
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
    btnClearAll.addEventListener('click', () => {
      if (!storyDialogues.length) return;
      if (confirm('آیا از حذف تمام دیالوگ‌ها اطمینان دارید؟')) {
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

  // Pre-seed default sample if dialogues list is empty
  if (storyDialogues.length === 0) {
    loadSampleStoryScenario(false);
  } else {
    renderStoryDialogues();
  }
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
      <div style="text-align:center; padding:3rem 1rem; background:var(--bg-card); border-radius:var(--radius-md); border:1px dashed var(--border-subtle);">
        <div style="font-size:2.5rem; margin-bottom:0.5rem;">🎭</div>
        <p style="font-size:0.95rem; font-weight:700; color:var(--text-secondary); margin-bottom:0.5rem;">هیچ دیالوگی در سناریو وجود ندارد.</p>
        <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:1rem;">می‌توانید روی «افزودن دیالوگ جدید» کلیک کنید یا نمونه آماده را بارگذاری نمایید.</p>
        <div style="display:flex; justify-content:center; gap:0.5rem;">
          <button type="button" onclick="addStoryDialogue()" class="btn-compact-primary">
            <span>➕</span><span>افزودن اولین دیالوگ</span>
          </button>
          <button type="button" onclick="loadSampleStoryScenario()" class="btn-compact-primary" style="background:linear-gradient(135deg, #ec4899, #8b5cf6);">
            <span>✨</span><span>بارگذاری نمونه آماده (مریم و خودم)</span>
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

      </div>
    `;
  }).join('');
}

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

window.deleteDialogue = function(idx) {
  const dlg = storyDialogues[idx];
  if (!dlg) return;
  if (dlg.text.trim().length > 0) {
    if (!confirm('آیا از حذف این دیالوگ اطمینان دارید؟')) return;
  }
  storyDialogues.splice(idx, 1);
  renderStoryDialogues();
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
    };
  });

  try {
    const res = await fetch('/api/story/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title,
        dialogues: dialoguesPayload,
      }),
    });
    const data = await res.json();

    if (data.success) {
      const rtf = (data.elapsed_sec / (data.duration_sec || 1)).toFixed(2);
      const resultItem = {
        id: data.story_id,
        audio_url: data.audio_url,
        text: `داستان صوتی «${data.title}» - شامل ${storyDialogues.length} دیالوگ با ترکیب و پیوستگی کامل گویندگان`,
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

