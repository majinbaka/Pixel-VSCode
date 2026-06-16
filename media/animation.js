(function () {
  const vscode = acquireVsCodeApi();

  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const previewFrame = document.getElementById('previewFrame');
  const framesList = document.getElementById('framesList');
  const frameCountText = document.getElementById('frameCountText');
  const statusText = document.getElementById('statusText');
  const playButton = document.getElementById('playButton');
  const restartButton = document.getElementById('restartButton');
  const loopInput = document.getElementById('loopInput');
  const zoomInput = document.getElementById('zoomInput');
  const zoomLabel = document.getElementById('zoomLabel');
  const allDurationInput = document.getElementById('allDurationInput');
  const applyDurationButton = document.getElementById('applyDurationButton');
  const pickFramesButton = document.getElementById('pickFramesButton');

  const state = {
    frames: [],
    currentIndex: 0,
    playing: false,
    timer: undefined,
    zoom: 8,
    loadToken: 0
  };

  function clampDuration(value) {
    const duration = Number(value);
    if (!Number.isInteger(duration)) {
      return 120;
    }

    return Math.max(20, Math.min(10000, duration));
  }

  function setZoom(value) {
    const zoom = Math.max(1, Math.min(32, Number(value) || 8));
    state.zoom = zoom;
    zoomInput.value = String(zoom);
    zoomLabel.value = `${zoom}x`;
    updateCanvasDisplaySize();
  }

  function updateCanvasDisplaySize() {
    canvas.style.width = `${canvas.width * state.zoom}px`;
    canvas.style.height = `${canvas.height * state.zoom}px`;
    previewFrame.style.setProperty('--pixel-size', `${state.zoom}px`);
  }

  function clearPlaybackTimer() {
    if (state.timer !== undefined) {
      window.clearTimeout(state.timer);
      state.timer = undefined;
    }
  }

  function setPlaying(playing) {
    state.playing = Boolean(playing && state.frames.length);
    playButton.textContent = state.playing ? 'Pause' : 'Play';

    if (state.playing) {
      scheduleNextFrame();
    } else {
      clearPlaybackTimer();
    }
  }

  function scheduleNextFrame() {
    clearPlaybackTimer();

    if (!state.playing || state.frames.length === 0) {
      return;
    }

    const frame = state.frames[state.currentIndex];
    state.timer = window.setTimeout(() => {
      const atEnd = state.currentIndex >= state.frames.length - 1;
      if (atEnd && !loopInput.checked) {
        setPlaying(false);
        return;
      }

      showFrame((state.currentIndex + 1) % state.frames.length);
      scheduleNextFrame();
    }, frame.duration);
  }

  function updateStatus() {
    if (!state.frames.length) {
      statusText.textContent = 'No frames';
      frameCountText.textContent = '0';
      playButton.disabled = true;
      restartButton.disabled = true;
      return;
    }

    const frame = state.frames[state.currentIndex];
    statusText.textContent = `${state.currentIndex + 1}/${state.frames.length} - ${frame.duration} ms`;
    frameCountText.textContent = String(state.frames.length);
    playButton.disabled = false;
    restartButton.disabled = false;
  }

  function updateActiveFrameRow() {
    const rows = framesList.querySelectorAll('.frame-row');
    rows.forEach((row, index) => {
      row.classList.toggle('active', index === state.currentIndex);
    });
  }

  function drawFrame() {
    const frame = state.frames[state.currentIndex];
    if (!frame) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(frame.image, 0, 0);
  }

  function showFrame(index) {
    if (!state.frames.length) {
      return;
    }

    state.currentIndex = Math.max(0, Math.min(state.frames.length - 1, index));
    drawFrame();
    updateActiveFrameRow();
    updateStatus();
  }

  function renderFramesList() {
    framesList.replaceChildren();

    state.frames.forEach((frame, index) => {
      const row = document.createElement('button');
      row.className = 'frame-row';
      row.type = 'button';
      row.title = frame.path;
      row.addEventListener('click', () => {
        showFrame(index);
        if (state.playing) {
          scheduleNextFrame();
        }
      });

      const thumbnail = document.createElement('img');
      thumbnail.className = 'frame-thumbnail';
      thumbnail.src = frame.dataUri;
      thumbnail.alt = '';

      const details = document.createElement('span');
      details.className = 'frame-details';

      const name = document.createElement('span');
      name.className = 'frame-name';
      name.textContent = frame.name;

      const meta = document.createElement('span');
      meta.className = 'frame-meta';
      meta.textContent = `Frame ${index + 1}`;

      details.append(name, meta);

      const duration = document.createElement('input');
      duration.className = 'duration-input';
      duration.type = 'number';
      duration.min = '20';
      duration.max = '10000';
      duration.step = '10';
      duration.value = String(frame.duration);
      duration.title = 'Frame duration in milliseconds';
      duration.addEventListener('click', (event) => event.stopPropagation());
      duration.addEventListener('change', () => {
        const nextDuration = clampDuration(duration.value);
        duration.value = String(nextDuration);
        frame.duration = nextDuration;
        updateStatus();
        if (state.playing && index === state.currentIndex) {
          scheduleNextFrame();
        }
      });

      const unit = document.createElement('span');
      unit.className = 'duration-unit';
      unit.textContent = 'ms';

      row.append(thumbnail, details, duration, unit);
      framesList.append(row);
    });

    updateActiveFrameRow();
  }

  function resizeCanvasToFrames() {
    const width = Math.max(...state.frames.map((frame) => frame.image.naturalWidth));
    const height = Math.max(...state.frames.map((frame) => frame.image.naturalHeight));
    canvas.width = width;
    canvas.height = height;
    updateCanvasDisplaySize();
  }

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

  async function loadFrames(frames) {
    const token = ++state.loadToken;
    statusText.textContent = 'Loading frames';
    setPlaying(false);

    try {
      const loadedFrames = await Promise.all(frames.map(loadFrame));
      if (token !== state.loadToken) {
        return;
      }

      state.frames = loadedFrames;
      state.currentIndex = 0;
      resizeCanvasToFrames();
      renderFramesList();
      showFrame(0);
      allDurationInput.value = String(state.frames[0]?.duration ?? 120);
    } catch (error) {
      statusText.textContent = error instanceof Error ? error.message : 'Unable to load frames';
      state.frames = [];
      framesList.replaceChildren();
      updateStatus();
    }
  }

  playButton.addEventListener('click', () => setPlaying(!state.playing));
  restartButton.addEventListener('click', () => {
    showFrame(0);
    if (state.playing) {
      scheduleNextFrame();
    }
  });
  loopInput.addEventListener('change', () => {
    if (state.playing) {
      scheduleNextFrame();
    }
  });
  zoomInput.addEventListener('input', () => setZoom(zoomInput.value));
  applyDurationButton.addEventListener('click', () => {
    const duration = clampDuration(allDurationInput.value);
    allDurationInput.value = String(duration);

    for (const frame of state.frames) {
      frame.duration = duration;
    }

    const inputs = framesList.querySelectorAll('.duration-input');
    inputs.forEach((input) => {
      input.value = String(duration);
    });

    updateStatus();
    if (state.playing) {
      scheduleNextFrame();
    }
  });
  pickFramesButton.addEventListener('click', () => vscode.postMessage({ type: 'pickFrames' }));

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'init') {
      loadFrames(message.frames);
    }
  });

  setZoom(zoomInput.value);
  updateStatus();
  vscode.postMessage({ type: 'ready' });
}());
