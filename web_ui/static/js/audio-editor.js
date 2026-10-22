/**
 * audio-editor.js - Interactive Web Audio Waveform Visualizer & Trimmer
 * Precision trimming for Telegram OGG, MP3, WAV, M4A with zero dependencies.
 */

class AudioTrimmer {
  constructor(canvasId, options = {}) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    this.audioBuffer = null;
    this.rawFile = null;
    this.duration = 0;
    this.startTime = 0;
    this.endTime = 5.0; // Default 5 seconds
    
    this.isPlaying = false;
    this.isPaused = false;
    this._isSeeking = false;
    this.activeSource = null;
    this.playbackStartAudioTime = 0;
    this.playbackStartOffset = 0;
    this.playheadPosition = 0;
    this.animFrameId = null;

    // Interaction state
    this.dragTarget = null; // 'start', 'end', 'range', 'playhead'
    this.dragStartX = 0;
    this.initialStartTime = 0;
    this.initialEndTime = 0;

    this.onSelectionChange = options.onSelectionChange || null;
    this.onLoaded = options.onLoaded || null;
    this.onPlaybackChange = options.onPlaybackChange || null;

    this.initCanvas();
    this.attachEvents();
  }

  initCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  async loadAudioFile(file) {
    this.rawFile = file;
    const arrayBuffer = await file.arrayBuffer();
    this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    this.duration = this.audioBuffer.duration;

    this.maxAllowedDuration = 15.0;
    this.startTime = 0;
    this.endTime = Math.min(5.0, this.duration);

    if (this.onLoaded) {
      this.onLoaded(this.duration, file.name);
    }
    this.triggerChange();
    this.draw();
  }

  setSelection(start, end) {
    const maxDur = this.maxAllowedDuration || 15.0;
    this.startTime = Math.max(0, Math.min(start, this.duration - 0.5));
    let desiredEnd = Math.min(this.duration, Math.max(end, this.startTime + 0.5));
    if (desiredEnd - this.startTime > maxDur) {
      desiredEnd = this.startTime + maxDur;
    }
    this.endTime = desiredEnd;
    this.triggerChange();
    this.draw();
  }

  triggerChange() {
    if (this.onSelectionChange) {
      this.onSelectionChange({
        startTime: this.startTime,
        endTime: this.endTime,
        duration: Math.max(0.1, this.endTime - this.startTime),
        totalDuration: this.duration,
      });
    }
  }

  draw() {
    if (!this.width || !this.height) this.initCanvas();
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.clearRect(0, 0, w, h);

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';

    // Background
    ctx.fillStyle = isLight ? '#f8fafc' : '#060911';
    ctx.fillRect(0, 0, w, h);

    if (!this.audioBuffer) {
      ctx.fillStyle = isLight ? '#94a3b8' : '#475569';
      ctx.font = '13px Vazirmatn, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('هیچ فایلی بارگذاری نشده است', w / 2, h / 2);
      return;
    }

    const channelData = this.audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / w);
    const amp = h / 2;

    // Draw Waveform Peaks
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    if (isLight) {
      grad.addColorStop(0, '#0284c7');
      grad.addColorStop(0.5, '#6366f1');
      grad.addColorStop(1, '#a855f7');
    } else {
      grad.addColorStop(0, '#06b6d4');
      grad.addColorStop(0.5, '#6366f1');
      grad.addColorStop(1, '#d946ef');
    }
    ctx.fillStyle = grad;

    for (let i = 0; i < w; i++) {
      let min = 1.0;
      let max = -1.0;
      const startIdx = i * step;
      for (let j = 0; j < step; j++) {
        const val = channelData[startIdx + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      const barH = Math.max(2, (max - min) * amp * 0.85);
      const y = (h - barH) / 2;
      ctx.fillRect(i, y, 1.5, barH);
    }

    // Dim regions outside selection
    const startX = (this.startTime / this.duration) * w;
    const endX = (this.endTime / this.duration) * w;

    ctx.fillStyle = isLight ? 'rgba(241, 245, 249, 0.82)' : 'rgba(6, 9, 17, 0.75)';
    ctx.fillRect(0, 0, startX, h);
    ctx.fillRect(endX, 0, w - endX, h);

    // Highlight selected range
    ctx.fillStyle = isLight ? 'rgba(99, 102, 241, 0.12)' : 'rgba(99, 102, 241, 0.18)';
    ctx.fillRect(startX, 0, endX - startX, h);

    // Start & End handle lines
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, 0);
    ctx.lineTo(startX, h);
    ctx.stroke();

    ctx.strokeStyle = isLight ? '#a855f7' : '#d946ef';
    ctx.beginPath();
    ctx.moveTo(endX, 0);
    ctx.lineTo(endX, h);
    ctx.stroke();

    // Handle knurling badges
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(startX - 4, h / 2 - 14, 8, 28);
    ctx.fillStyle = isLight ? '#a855f7' : '#d946ef';
    ctx.fillRect(endX - 4, h / 2 - 14, 8, 28);

    // Timeline ruler
    ctx.fillStyle = isLight ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.4)';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    const intervalSec = this.duration > 20 ? 5 : 2;
    for (let sec = 0; sec <= this.duration; sec += intervalSec) {
      const x = (sec / this.duration) * w;
      ctx.fillRect(x, h - 8, 1, 8);
      ctx.fillText(`${sec}s`, x + 2, h - 10);
    }

    // Playhead if playing, paused, or scrubbed
    if (this.isPlaying || this.isPaused || this.playheadPosition > this.startTime) {
      const playX = (this.playheadPosition / this.duration) * w;
      const playColor = this.isPlaying ? '#38bdf8' : '#f59e0b';

      ctx.save();
      ctx.strokeStyle = playColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = playColor;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(playX, 0);
      ctx.lineTo(playX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Playhead top handle pin
      ctx.fillStyle = playColor;
      ctx.beginPath();
      ctx.arc(playX, 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(playX, 7, 2, 0, Math.PI * 2);
      ctx.fill();

      // Current playhead time tag
      const relTime = Math.max(0, this.playheadPosition - this.startTime).toFixed(1);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${relTime}s`, playX, 22);
      ctx.restore();
    }
  }

  attachEvents() {
    window.addEventListener('resize', () => {
      this.initCanvas();
      this.draw();
    });

    const getX = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    };

    let mouseDownX = 0;
    let hasMoved = false;

    this.canvas.addEventListener('mousedown', (e) => {
      if (!this.audioBuffer) return;
      const x = getX(e);
      mouseDownX = x;
      hasMoved = false;

      const startX = (this.startTime / this.duration) * this.width;
      const endX = (this.endTime / this.duration) * this.width;
      const playX = (this.playheadPosition / this.duration) * this.width;

      if (Math.abs(x - startX) <= 12) {
        this.dragTarget = 'start';
      } else if (Math.abs(x - endX) <= 12) {
        this.dragTarget = 'end';
      } else if (Math.abs(x - playX) <= 12) {
        this.dragTarget = 'playhead';
      } else if (x >= startX && x <= endX) {
        this.dragTarget = 'range_or_seek';
        this.dragStartX = x;
        this.initialStartTime = this.startTime;
        this.initialEndTime = this.endTime;
      } else {
        // Clicked outside: snap nearest handle
        if (Math.abs(x - startX) < Math.abs(x - endX)) {
          this.startTime = Math.max(0, (x / this.width) * this.duration);
        } else {
          this.endTime = Math.min(this.duration, (x / this.width) * this.duration);
        }
        if (this.playheadPosition < this.startTime || this.playheadPosition > this.endTime) {
          this.playheadPosition = this.startTime;
        }
        this.triggerChange();
        this.draw();
        this.triggerPlaybackChange();
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragTarget || !this.audioBuffer) return;
      const x = getX(e);
      if (Math.abs(x - mouseDownX) > 4) {
        hasMoved = true;
      }

      const maxDur = this.maxAllowedDuration || 15.0;
      const time = (x / this.width) * this.duration;

      if (this.dragTarget === 'start') {
        const candidateStart = Math.max(0, Math.min(time, this.endTime - 0.5));
        this.startTime = Math.max(candidateStart, this.endTime - maxDur);
        if (this.playheadPosition < this.startTime) this.playheadPosition = this.startTime;
        this.triggerChange();
        this.draw();
        this.triggerPlaybackChange();
      } else if (this.dragTarget === 'end') {
        const candidateEnd = Math.min(this.duration, Math.max(time, this.startTime + 0.5));
        this.endTime = Math.min(candidateEnd, this.startTime + maxDur);
        if (this.playheadPosition > this.endTime) this.playheadPosition = this.endTime;
        this.triggerChange();
        this.draw();
        this.triggerPlaybackChange();
      } else if (this.dragTarget === 'playhead') {
        const scrubTime = Math.max(this.startTime, Math.min(this.endTime, time));
        this.seek(scrubTime);
      } else if (this.dragTarget === 'range_or_seek' && hasMoved) {
        const deltaSec = ((x - this.dragStartX) / this.width) * this.duration;
        const dur = this.initialEndTime - this.initialStartTime;
        let newStart = this.initialStartTime + deltaSec;
        let newEnd = this.initialEndTime + deltaSec;

        if (newStart < 0) {
          newStart = 0;
          newEnd = dur;
        } else if (newEnd > this.duration) {
          newEnd = this.duration;
          newStart = this.duration - dur;
        }
        this.startTime = newStart;
        this.endTime = newEnd;
        if (this.playheadPosition < this.startTime || this.playheadPosition > this.endTime) {
          this.playheadPosition = this.startTime;
        }
        this.triggerChange();
        this.draw();
        this.triggerPlaybackChange();
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (!this.dragTarget || !this.audioBuffer) return;
      if (this.dragTarget === 'range_or_seek' && !hasMoved) {
        // User clicked inside selection range without dragging -> Seek to clicked time!
        const x = getX(e);
        const clickTime = (x / this.width) * this.duration;
        this.seek(clickTime);
      }
      this.dragTarget = null;
      hasMoved = false;
    });

    // Spacebar and Arrow Keys for instant Seek / Play / Pause
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
      if (activeTag === 'input' || activeTag === 'textarea') return;
      const customWrapper = document.getElementById('container-mode-custom');
      if (!customWrapper || customWrapper.style.display === 'none') return;
      if (!this.audioBuffer) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.code === 'ArrowLeft') {
        // Rewind 1 second
        e.preventDefault();
        this.seekRelative(-1.0);
      } else if (e.code === 'ArrowRight') {
        // Forward 1 second
        e.preventDefault();
        this.seekRelative(1.0);
      }
    });
  }

  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (!this.audioBuffer) return;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    if (this.activeSource) {
      this._isSeeking = true;
      try { this.activeSource.stop(); } catch (e) {}
      this.activeSource = null;
      this._isSeeking = false;
    }

    // Clamp playhead between startTime and endTime
    if (this.playheadPosition < this.startTime || this.playheadPosition >= this.endTime - 0.05) {
      this.playheadPosition = this.startTime;
    }

    const offset = this.playheadPosition;
    const remainingDuration = Math.max(0.05, this.endTime - offset);

    const source = this.audioContext.createBufferSource();
    source.buffer = this.audioBuffer;
    source.connect(this.audioContext.destination);

    source.start(0, offset, remainingDuration);
    this.activeSource = source;
    this.isPlaying = true;
    this.isPaused = false;
    this.playbackStartAudioTime = this.audioContext.currentTime;
    this.playbackStartOffset = offset;

    source.onended = () => {
      if (this._isSeeking) return;
      if (this.activeSource === source) {
        this.isPlaying = false;
        this.isPaused = false;
        this.activeSource = null;
        this.playheadPosition = this.startTime;
        cancelAnimationFrame(this.animFrameId);
        this.draw();
        this.triggerPlaybackChange();
      }
    };

    const animatePlayhead = () => {
      if (!this.isPlaying) return;
      const elapsed = this.audioContext.currentTime - this.playbackStartAudioTime;
      this.playheadPosition = this.playbackStartOffset + elapsed;

      if (this.playheadPosition >= this.endTime) {
        this.stop();
        return;
      }

      this.draw();
      this.triggerPlaybackChange();
      this.animFrameId = requestAnimationFrame(animatePlayhead);
    };

    cancelAnimationFrame(this.animFrameId);
    this.animFrameId = requestAnimationFrame(animatePlayhead);
    this.draw();
    this.triggerPlaybackChange();
  }

  pause() {
    if (!this.isPlaying) return;
    this._isSeeking = true;
    if (this.activeSource) {
      try { this.activeSource.stop(); } catch (e) {}
      this.activeSource = null;
    }
    this._isSeeking = false;

    this.isPlaying = false;
    this.isPaused = true;
    cancelAnimationFrame(this.animFrameId);
    this.draw();
    this.triggerPlaybackChange();
  }

  stop() {
    this._isSeeking = true;
    if (this.activeSource) {
      try { this.activeSource.stop(); } catch (e) {}
      this.activeSource = null;
    }
    this._isSeeking = false;

    this.isPlaying = false;
    this.isPaused = false;
    this.playheadPosition = this.startTime;
    cancelAnimationFrame(this.animFrameId);
    this.draw();
    this.triggerPlaybackChange();
  }

  seek(targetTime) {
    if (!this.audioBuffer) return;
    const clampedTime = Math.max(this.startTime, Math.min(this.endTime, targetTime));
    this.playheadPosition = clampedTime;

    if (this.isPlaying) {
      this.play();
    } else {
      this.draw();
      this.triggerPlaybackChange();
    }
  }

  seekRelative(deltaSeconds) {
    if (!this.audioBuffer) return;
    this.seek(this.playheadPosition + deltaSeconds);
  }

  playSelection() {
    this.togglePlayPause();
  }

  stopPlayback() {
    this.stop();
  }

  triggerPlaybackChange() {
    if (this.onPlaybackChange) {
      this.onPlaybackChange({
        isPlaying: this.isPlaying,
        isPaused: this.isPaused,
        currentTime: this.playheadPosition,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: Math.max(0.1, this.endTime - this.startTime),
      });
    }
  }

  /**
   * Export the precise trimmed audio segment to a standard 24kHz/16kHz WAV Blob
   */
  async getTrimmedWavBlob() {
    if (!this.audioBuffer) return null;

    const sampleRate = this.audioBuffer.sampleRate;
    const startOffset = Math.floor(this.startTime * sampleRate);
    const maxSamples = Math.floor((this.maxAllowedDuration || 15.0) * sampleRate);
    const rawEndOffset = Math.floor(this.endTime * sampleRate);
    const endOffset = Math.min(rawEndOffset, startOffset + maxSamples);
    const frameCount = Math.max(1, endOffset - startOffset);

    // Create offline audio buffer for slice
    const sliceBuffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
    const channelData = this.audioBuffer.getChannelData(0);
    const sliceData = sliceBuffer.getChannelData(0);

    for (let i = 0; i < frameCount; i++) {
      sliceData[i] = channelData[startOffset + i] || 0;
    }

    return this.audioBufferToWav(sliceBuffer);
  }

  audioBufferToWav(buffer) {
    const numChannels = 1;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const data = buffer.getChannelData(0);
    const dataSize = data.length * bytesPerSample;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;

    const arrayBuffer = new ArrayBuffer(totalSize);
    const view = new DataView(arrayBuffer);

    // Write WAV RIFF header
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, totalSize - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Float to Int16
    let offset = 44;
    for (let i = 0; i < data.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, data[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

window.AudioTrimmer = AudioTrimmer;
