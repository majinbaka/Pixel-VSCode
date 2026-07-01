"use strict";
(() => {
  // src/webview/domUtil.ts
  function byId(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing element #${id}`);
    }
    return element;
  }

  // src/webview/animation/dom.ts
  function queryElements() {
    const canvas = byId("previewCanvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Unable to acquire 2D canvas context");
    }
    return {
      canvas,
      ctx,
      previewFrame: byId("previewFrame"),
      framesList: byId("framesList"),
      frameCountText: byId("frameCountText"),
      statusText: byId("statusText"),
      playButton: byId("playButton"),
      restartButton: byId("restartButton"),
      loopInput: byId("loopInput"),
      zoomInput: byId("zoomInput"),
      zoomLabel: byId("zoomLabel"),
      allDurationInput: byId("allDurationInput"),
      applyDurationButton: byId("applyDurationButton"),
      pickFramesButton: byId("pickFramesButton")
    };
  }

  // src/webview/animation/state.ts
  function createInitialState() {
    return {
      frames: [],
      currentIndex: 0,
      playing: false,
      timer: void 0,
      zoom: 8,
      loadToken: 0
    };
  }
  function clampDuration(value) {
    const duration = Number(value);
    if (!Number.isInteger(duration)) {
      return 120;
    }
    return Math.max(20, Math.min(1e4, duration));
  }

  // src/webview/animation/playback.ts
  function clearPlaybackTimer(state) {
    if (state.timer !== void 0) {
      window.clearTimeout(state.timer);
      state.timer = void 0;
    }
  }
  function setPlaying(el, state, playing, onTick) {
    state.playing = Boolean(playing && state.frames.length);
    el.playButton.textContent = state.playing ? "Pause" : "Play";
    if (state.playing) {
      scheduleNextFrame(el, state, onTick);
    } else {
      clearPlaybackTimer(state);
    }
  }
  function scheduleNextFrame(el, state, onTick) {
    clearPlaybackTimer(state);
    if (!state.playing || state.frames.length === 0) {
      return;
    }
    const frame = state.frames[state.currentIndex];
    state.timer = window.setTimeout(() => {
      const atEnd = state.currentIndex >= state.frames.length - 1;
      if (atEnd && !el.loopInput.checked) {
        setPlaying(el, state, false, onTick);
        return;
      }
      onTick();
    }, frame.duration);
  }

  // src/webview/animation/framesPanel.ts
  function updateCanvasDisplaySize(el, state) {
    el.canvas.style.width = `${el.canvas.width * state.zoom}px`;
    el.canvas.style.height = `${el.canvas.height * state.zoom}px`;
    el.previewFrame.style.setProperty("--pixel-size", `${state.zoom}px`);
  }
  function setZoom(el, state, value) {
    const zoom = Math.max(1, Math.min(32, Number(value) || 8));
    state.zoom = zoom;
    el.zoomInput.value = String(zoom);
    el.zoomLabel.value = `${zoom}x`;
    updateCanvasDisplaySize(el, state);
  }
  function updateStatus(el, state) {
    if (!state.frames.length) {
      el.statusText.textContent = "No frames";
      el.frameCountText.textContent = "0";
      el.playButton.disabled = true;
      el.restartButton.disabled = true;
      return;
    }
    const frame = state.frames[state.currentIndex];
    el.statusText.textContent = `${state.currentIndex + 1}/${state.frames.length} - ${frame.duration} ms`;
    el.frameCountText.textContent = String(state.frames.length);
    el.playButton.disabled = false;
    el.restartButton.disabled = false;
  }
  function updateActiveFrameRow(el, state) {
    const rows = el.framesList.querySelectorAll(".frame-row");
    rows.forEach((row, index) => {
      row.classList.toggle("active", index === state.currentIndex);
    });
  }
  function drawFrame(el, state) {
    const frame = state.frames[state.currentIndex];
    if (!frame) {
      el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
      return;
    }
    el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    el.ctx.imageSmoothingEnabled = false;
    el.ctx.drawImage(frame.image, 0, 0);
  }
  function showFrame(el, state, index) {
    if (!state.frames.length) {
      return;
    }
    state.currentIndex = Math.max(0, Math.min(state.frames.length - 1, index));
    drawFrame(el, state);
    updateActiveFrameRow(el, state);
    updateStatus(el, state);
  }
  function renderFramesList(el, state, callbacks) {
    el.framesList.replaceChildren();
    state.frames.forEach((frame, index) => {
      const row = document.createElement("button");
      row.className = "frame-row";
      row.type = "button";
      row.title = frame.path;
      row.addEventListener("click", () => callbacks.onSelectFrame(index));
      const thumbnail = document.createElement("img");
      thumbnail.className = "frame-thumbnail";
      thumbnail.src = frame.dataUri;
      thumbnail.alt = "";
      const details = document.createElement("span");
      details.className = "frame-details";
      const name = document.createElement("span");
      name.className = "frame-name";
      name.textContent = frame.name;
      const meta = document.createElement("span");
      meta.className = "frame-meta";
      meta.textContent = `Frame ${index + 1}`;
      details.append(name, meta);
      const duration = document.createElement("input");
      duration.className = "duration-input";
      duration.type = "number";
      duration.min = "20";
      duration.max = "10000";
      duration.step = "10";
      duration.value = String(frame.duration);
      duration.title = "Frame duration in milliseconds";
      duration.addEventListener("click", (event) => event.stopPropagation());
      duration.addEventListener("change", () => {
        const nextDuration = clampDuration(duration.value);
        duration.value = String(nextDuration);
        frame.duration = nextDuration;
        callbacks.onDurationChange();
      });
      const unit = document.createElement("span");
      unit.className = "duration-unit";
      unit.textContent = "ms";
      row.append(thumbnail, details, duration, unit);
      el.framesList.append(row);
    });
    updateActiveFrameRow(el, state);
  }
  function resizeCanvasToFrames(el, state) {
    const width = Math.max(...state.frames.map((frame) => frame.image.naturalWidth));
    const height = Math.max(...state.frames.map((frame) => frame.image.naturalHeight));
    el.canvas.width = width;
    el.canvas.height = height;
    updateCanvasDisplaySize(el, state);
  }

  // src/webview/animation/frameLoader.ts
  function loadFrame(frame) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({
        ...frame,
        duration: clampDuration(frame.duration),
        image
      });
      image.onerror = () => reject(new Error(`Unable to load ${frame.name}`));
      image.src = frame.dataUri;
    });
  }
  async function loadFrames(state, frames) {
    const token = ++state.loadToken;
    const loadedFrames = await Promise.all(frames.map(loadFrame));
    if (token !== state.loadToken) {
      return void 0;
    }
    return loadedFrames;
  }

  // src/webview/animation/main.ts
  (function main() {
    const vscode = acquireVsCodeApi();
    const el = queryElements();
    const state = createInitialState();
    function onTick() {
      showFrame(el, state, (state.currentIndex + 1) % state.frames.length);
      scheduleNextFrame(el, state, onTick);
    }
    async function loadAndShowFrames(frames) {
      el.statusText.textContent = "Loading frames";
      setPlaying(el, state, false, onTick);
      try {
        const loadedFrames = await loadFrames(state, frames);
        if (!loadedFrames) {
          return;
        }
        state.frames = loadedFrames;
        state.currentIndex = 0;
        resizeCanvasToFrames(el, state);
        renderFramesList(el, state, {
          onSelectFrame: (index) => {
            showFrame(el, state, index);
            if (state.playing) {
              scheduleNextFrame(el, state, onTick);
            }
          },
          onDurationChange: () => {
            updateStatus(el, state);
            if (state.playing) {
              scheduleNextFrame(el, state, onTick);
            }
          }
        });
        showFrame(el, state, 0);
        el.allDurationInput.value = String(state.frames[0]?.duration ?? 120);
      } catch (error) {
        el.statusText.textContent = error instanceof Error ? error.message : "Unable to load frames";
        state.frames = [];
        el.framesList.replaceChildren();
        updateStatus(el, state);
      }
    }
    el.playButton.addEventListener("click", () => setPlaying(el, state, !state.playing, onTick));
    el.restartButton.addEventListener("click", () => {
      showFrame(el, state, 0);
      if (state.playing) {
        scheduleNextFrame(el, state, onTick);
      }
    });
    el.loopInput.addEventListener("change", () => {
      if (state.playing) {
        scheduleNextFrame(el, state, onTick);
      }
    });
    el.zoomInput.addEventListener("input", () => setZoom(el, state, el.zoomInput.value));
    el.applyDurationButton.addEventListener("click", () => {
      const duration = clampDuration(el.allDurationInput.value);
      el.allDurationInput.value = String(duration);
      for (const frame of state.frames) {
        frame.duration = duration;
      }
      const inputs = el.framesList.querySelectorAll(".duration-input");
      inputs.forEach((input) => {
        input.value = String(duration);
      });
      updateStatus(el, state);
      if (state.playing) {
        scheduleNextFrame(el, state, onTick);
      }
    });
    el.pickFramesButton.addEventListener("click", () => vscode.postMessage({ type: "pickFrames" }));
    window.addEventListener("message", (event) => {
      if (event.data.type === "init") {
        void loadAndShowFrames(event.data.frames);
      }
    });
    setZoom(el, state, el.zoomInput.value);
    updateStatus(el, state);
    vscode.postMessage({ type: "ready" });
  })();
})();
//# sourceMappingURL=animation.js.map
