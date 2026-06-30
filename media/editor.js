(function () {
  const vscode = acquireVsCodeApi();

  const canvas = document.getElementById('pixelCanvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const canvasFrame = document.getElementById('canvasFrame');
  const workspace = document.getElementById('workspace');
  const fileStatus = document.getElementById('fileStatus');
  const colorInput = document.getElementById('colorInput');
  const brushSizeInput = document.getElementById('brushSize');
  const brushSizeLabel = document.getElementById('brushSizeLabel');
  const zoomInput = document.getElementById('zoom');
  const zoomLabel = document.getElementById('zoomLabel');
  const fitZoomButton = document.getElementById('fitZoomButton');
  const guideSizeSelect = document.getElementById('guideSize');
  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const resizeButton = document.getElementById('resizeButton');
  const saveButton = document.getElementById('saveButton');
  const syncCharacterButton = document.getElementById('syncCharacterButton');
  const toggleGridButton = document.getElementById('toggleGrid');
  const paletteSelect = document.getElementById('paletteSelect');
  const paletteSwatches = document.getElementById('paletteSwatches');
  const layersList = document.getElementById('layersList');
  const addLayerButton = document.getElementById('addLayerButton');
  const duplicateLayerButton = document.getElementById('duplicateLayerButton');
  const deleteLayerButton = document.getElementById('deleteLayerButton');
  const moveLayerUpButton = document.getElementById('moveLayerUpButton');
  const moveLayerDownButton = document.getElementById('moveLayerDownButton');
  const layerOpacityInput = document.getElementById('layerOpacity');
  const layerOpacityLabel = document.getElementById('layerOpacityLabel');
  const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));
  const hitboxOverlay = document.getElementById('hitboxOverlay');
  const autoTraceButton = document.getElementById('autoTraceButton');
  const clearHitboxButton = document.getElementById('clearHitboxButton');
  const saveHitboxButton = document.getElementById('saveHitboxButton');
  const hitboxPointCount = document.getElementById('hitboxPointCount');
  const cursorOverlay = document.getElementById('cursorOverlay');
  const rigOverlay = document.getElementById('rigOverlay');
  const rigAngleInput = document.getElementById('rigAngle');
  const applyRigButton = document.getElementById('applyRigButton');
  const resetRigButton = document.getElementById('resetRigButton');
  const addPivotButton = document.getElementById('addPivotButton');
  const pivotsList = document.getElementById('pivotsList');

  const palettes = [
    {
      name: 'PICO-8',
      colors: [
        '#000000', '#1d2b53', '#7e2553', '#008751',
        '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
        '#ff004d', '#ffa300', '#ffec27', '#00e436',
        '#29adff', '#83769c', '#ff77a8', '#ffccaa'
      ]
    },
    {
      name: 'Game Boy',
      colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f']
    },
    {
      name: 'DawnBringer 16',
      colors: [
        '#140c1c', '#442434', '#30346d', '#4e4a4e',
        '#854c30', '#346524', '#d04648', '#757161',
        '#597dce', '#d27d2c', '#8595a1', '#6daa2c',
        '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'
      ]
    },
    {
      name: 'AAP-16',
      colors: [
        '#070708', '#332222', '#774433', '#cc8855',
        '#993311', '#dd7711', '#ffdd55', '#ffffcc',
        '#55aa44', '#115522', '#44bbcc', '#2255aa',
        '#553388', '#9955aa', '#dd99bb', '#ffffff'
      ]
    },
    {
      name: 'UI Basics',
      colors: [
        '#111827', '#374151', '#6b7280', '#d1d5db',
        '#ffffff', '#ef4444', '#f97316', '#f59e0b',
        '#eab308', '#22c55e', '#06b6d4', '#3b82f6',
        '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
      ]
    }
  ];

  const state = {
    tool: 'pencil',
    drawing: false,
    lastKey: '',
    pointerId: undefined,
    zoom: 16,
    ready: false,
    layers: [],
    activeLayerId: undefined,
    nextLayerId: 1,
    nextPivotId: 1,
    guideSize: 1,
    assetProfile: undefined,
    pendingCollisionPoints: undefined,
    collision: {
      points: [],
      draggingIndex: -1
    },
    rig: {
      dragMode: undefined
    }
  };

  function setTool(tool) {
    const leavingRig = state.tool === 'rig' && tool !== 'rig';
    state.tool = tool;
    for (const button of toolButtons) {
      button.classList.toggle('active', button.dataset.tool === tool);
    }
    canvas.style.cursor = tool === 'picker' ? 'copy' : 'crosshair';
    const layer = getActiveLayer();
    if (leavingRig && bakeRigRotation(layer)) {
      commit('Apply rig rotation');
    }
    if (tool === 'rig' && layer) {
      updateRigAngleInput(layer);
      renderPivotsPanel();
    }
    renderRigOverlay();
  }

  function updateCanvasDisplaySize() {
    canvas.style.width = `${canvas.width * state.zoom}px`;
    canvas.style.height = `${canvas.height * state.zoom}px`;
    canvasFrame.style.setProperty('--pixel-size', `${state.zoom}px`);
    canvasFrame.style.setProperty('--guide-size', `${state.zoom * state.guideSize}px`);
  }

  function setZoom(value) {
    const zoom = Math.max(0.1, Math.min(40, Number(value) || 16));
    state.zoom = zoom;
    zoomInput.value = String(zoom);
    zoomLabel.value = `${Math.round(zoom * 100) / 100}x`;
    updateCanvasDisplaySize();
    renderHitboxOverlay();
    renderRigOverlay();
  }

  function fitZoomToWorkspace() {
    if (!canvas.width || !canvas.height || !workspace) {
      return;
    }

    const padding = 64;
    const availableWidth = Math.max(1, workspace.clientWidth - padding);
    const availableHeight = Math.max(1, workspace.clientHeight - padding);
    const fitZoom = Math.min(availableWidth / canvas.width, availableHeight / canvas.height);
    const niceZoom = fitZoom >= 1 ? Math.max(1, Math.floor(fitZoom)) : fitZoom;
    setZoom(niceZoom);
  }

  function setGuideSize(value) {
    const guideSize = Math.max(1, Math.min(128, Number(value) || 1));
    state.guideSize = guideSize;
    guideSizeSelect.value = String(guideSize);
    canvasFrame.style.setProperty('--guide-size', `${state.zoom * guideSize}px`);
  }

  function setCanvasSize(width, height) {
    canvas.width = width;
    canvas.height = height;
    widthInput.value = String(width);
    heightInput.value = String(height);
    updateCanvasDisplaySize();
  }

  function createLayerCanvas(width, height) {
    const layerCanvas = document.createElement('canvas');
    layerCanvas.width = width;
    layerCanvas.height = height;
    return layerCanvas;
  }

  function createLayer(name, sourceCanvas) {
    const layerCanvas = createLayerCanvas(canvas.width, canvas.height);
    if (sourceCanvas) {
      layerCanvas.getContext('2d').drawImage(sourceCanvas, 0, 0);
    }

    const defaultPivot = createPivot(layerCanvas.width / 2, layerCanvas.height / 2);

    return {
      id: `layer-${state.nextLayerId++}`,
      name,
      visible: true,
      opacity: 1,
      canvas: layerCanvas,
      rig: {
        pivots: [defaultPivot],
        activePivotId: defaultPivot.id
      }
    };
  }

  function createPivot(x, y, name) {
    const id = `pivot-${state.nextPivotId++}`;
    return { id, name: name || `Pivot ${state.nextPivotId - 1}`, x, y, angle: 0 };
  }

  function getActivePivot(layer) {
    const target = layer ?? getActiveLayer();
    if (!target) {
      return undefined;
    }
    return target.rig.pivots.find((pivot) => pivot.id === target.rig.activePivotId) ?? target.rig.pivots[0];
  }

  function getActiveLayer() {
    return state.layers.find((layer) => layer.id === state.activeLayerId) ?? state.layers[state.layers.length - 1];
  }

  function setActiveLayer(id) {
    if (!state.layers.some((layer) => layer.id === id)) {
      return;
    }

    state.activeLayerId = id;
    renderLayersPanel();
    renderComposite();
    const layer = getActiveLayer();
    if (state.tool === 'rig' && layer) {
      updateRigAngleInput(layer);
    }
    renderPivotsPanel();
    renderRigOverlay();
  }

  function setBrushSize(value) {
    const size = Math.max(1, Math.min(64, Number(value) || 1));
    brushSizeInput.value = String(size);
    brushSizeLabel.value = String(size);
  }

  function renderComposite() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    for (const layer of state.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }

      ctx.save();
      ctx.globalAlpha = layer.opacity;
      for (const pivot of layer.rig.pivots) {
        if (pivot.angle) {
          ctx.translate(pivot.x, pivot.y);
          ctx.rotate(pivot.angle);
          ctx.translate(-pivot.x, -pivot.y);
        }
      }
      ctx.drawImage(layer.canvas, 0, 0);
      ctx.restore();
    }
  }

  function loadImageElement(dataUri) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = dataUri;
    });
  }

  function finishLoad(filename) {
    fileStatus.textContent = filename || 'pixel.png';
    state.ready = true;
    state.collision.points = flatToHitboxPoints(state.pendingCollisionPoints, canvas.width, canvas.height);
    state.collision.draggingIndex = -1;
    state.pendingCollisionPoints = undefined;
    renderLayersPanel();
    renderComposite();
    renderHitboxOverlay();
    renderPivotsPanel();
    renderRigOverlay();
  }

  function loadImage(dataUri, filename) {
    loadImageElement(dataUri).then((image) => {
      setCanvasSize(image.naturalWidth, image.naturalHeight);
      fitZoomToWorkspace();
      const baseCanvas = createLayerCanvas(canvas.width, canvas.height);
      baseCanvas.getContext('2d').drawImage(image, 0, 0);

      state.layers = [createLayer('Layer 1', baseCanvas)];
      state.activeLayerId = state.layers[0].id;
      finishLoad(filename);
    });
  }

  async function loadLayerState(layerState, filename) {
    if (!layerState || !Array.isArray(layerState.layers) || layerState.layers.length === 0) {
      return false;
    }

    const images = await Promise.all(layerState.layers.map((entry) => loadImageElement(entry.dataUri)));
    setCanvasSize(images[0].naturalWidth, images[0].naturalHeight);
    fitZoomToWorkspace();

    state.layers = layerState.layers.map((entry, index) => {
      const layerCanvas = createLayerCanvas(canvas.width, canvas.height);
      layerCanvas.getContext('2d').drawImage(images[index], 0, 0);
      const pivots = entry.rig.pivots.map((pivot) => ({
        id: pivot.id,
        name: pivot.name,
        x: pivot.x,
        y: pivot.y,
        angle: pivot.angle
      }));
      return {
        id: entry.id,
        name: entry.name,
        visible: entry.visible,
        opacity: entry.opacity,
        canvas: layerCanvas,
        rig: {
          pivots,
          activePivotId: entry.rig.activePivotId
        }
      };
    });
    state.activeLayerId = state.layers[state.layers.length - 1].id;
    finishLoad(filename);
    return true;
  }

  function flatToHitboxPoints(flat, width, height) {
    if (!Array.isArray(flat) || flat.length < 6 || flat.length % 2 !== 0) {
      return [];
    }

    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const points = [];
    for (let index = 0; index < flat.length; index += 2) {
      points.push({ x: flat[index] + halfWidth, y: flat[index + 1] + halfHeight });
    }
    return points;
  }

  function flattenHitboxPoints() {
    const halfWidth = canvas.width / 2;
    const halfHeight = canvas.height / 2;
    const flat = [];
    for (const point of state.collision.points) {
      flat.push(point.x - halfWidth, point.y - halfHeight);
    }
    return flat;
  }

  function hitboxPointThreshold() {
    return 8 / state.zoom;
  }

  function findNearestHitboxPointIndex(x, y, threshold) {
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    state.collision.points.forEach((point, index) => {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    return nearestDistance <= threshold ? nearestIndex : -1;
  }

  function handleHitboxPointerDown(event, x, y) {
    const nearestIndex = findNearestHitboxPointIndex(x, y, hitboxPointThreshold());
    if (nearestIndex >= 0) {
      state.collision.draggingIndex = nearestIndex;
    } else {
      state.collision.points.push({ x, y });
      state.collision.draggingIndex = state.collision.points.length - 1;
    }
    renderHitboxOverlay();
  }

  function handleHitboxPointerMove(event) {
    if (state.collision.draggingIndex < 0) {
      return;
    }

    const { x, y } = eventToPixel(event);
    state.collision.points[state.collision.draggingIndex] = { x, y };
    renderHitboxOverlay();
  }

  function deleteNearestHitboxPoint(x, y) {
    const index = findNearestHitboxPointIndex(x, y, hitboxPointThreshold());
    if (index >= 0) {
      state.collision.points.splice(index, 1);
      renderHitboxOverlay();
    }
  }

  function renderHitboxOverlay() {
    if (!state.ready) {
      return;
    }

    hitboxOverlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    hitboxOverlay.replaceChildren();
    hitboxPointCount.textContent = String(state.collision.points.length);

    const points = state.collision.points;
    if (points.length >= 2) {
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', points.map((point) => `${point.x},${point.y}`).join(' '));
      polygon.setAttribute('class', 'hitbox-polygon');
      hitboxOverlay.append(polygon);
    }

    const radius = Math.max(0.5, 5 / state.zoom);
    for (const point of points) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
      circle.setAttribute('r', String(radius));
      circle.setAttribute('class', 'hitbox-point');
      hitboxOverlay.append(circle);
    }
  }

  function rigHandleDistance() {
    return Math.max(canvas.width, canvas.height) / 4;
  }

  function rigHandlePosition(pivot) {
    const distance = rigHandleDistance();
    return {
      x: pivot.x + Math.cos(pivot.angle - Math.PI / 2) * distance,
      y: pivot.y + Math.sin(pivot.angle - Math.PI / 2) * distance
    };
  }

  function renderPivotsPanel() {
    if (!pivotsList) {
      return;
    }

    pivotsList.replaceChildren();
    const layer = getActiveLayer();
    if (!layer) {
      return;
    }

    for (const pivot of layer.rig.pivots) {
      const item = document.createElement('div');
      item.className = 'pivot-item';
      item.classList.toggle('active', pivot.id === layer.rig.activePivotId);
      item.dataset.pivotId = pivot.id;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'pivot-name';
      nameSpan.textContent = pivot.name;
      item.append(nameSpan);

      if (layer.rig.pivots.length > 1) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'icon-button pivot-delete';
        deleteButton.title = 'Delete pivot';
        deleteButton.setAttribute('aria-label', 'Delete pivot');
        deleteButton.textContent = '×';
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          deletePivot(pivot.id);
        });
        item.append(deleteButton);
      }

      item.addEventListener('click', () => setActivePivot(pivot.id));
      pivotsList.append(item);
    }
  }

  function setActivePivot(pivotId) {
    const layer = getActiveLayer();
    if (!layer || !layer.rig.pivots.some((pivot) => pivot.id === pivotId)) {
      return;
    }

    layer.rig.activePivotId = pivotId;
    updateRigAngleInput(layer);
    renderPivotsPanel();
    renderRigOverlay();
  }

  function addPivot() {
    const layer = getActiveLayer();
    if (!layer) {
      return;
    }

    const pivot = createPivot(canvas.width / 2, canvas.height / 2);
    layer.rig.pivots.push(pivot);
    layer.rig.activePivotId = pivot.id;
    updateRigAngleInput(layer);
    renderPivotsPanel();
    renderRigOverlay();
  }

  function deletePivot(pivotId) {
    const layer = getActiveLayer();
    if (!layer || layer.rig.pivots.length <= 1) {
      return;
    }

    const index = layer.rig.pivots.findIndex((pivot) => pivot.id === pivotId);
    if (index < 0) {
      return;
    }

    layer.rig.pivots.splice(index, 1);
    if (layer.rig.activePivotId === pivotId) {
      layer.rig.activePivotId = layer.rig.pivots[Math.max(0, index - 1)].id;
    }

    updateRigAngleInput(layer);
    renderComposite();
    renderPivotsPanel();
    renderRigOverlay();
  }

  function renderRigOverlay() {
    if (!state.ready) {
      return;
    }

    rigOverlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    rigOverlay.replaceChildren();

    if (state.tool !== 'rig') {
      return;
    }

    const layer = getActiveLayer();
    if (!layer) {
      return;
    }

    const pivotRadius = Math.max(0.75, 6 / state.zoom);
    const handleRadius = Math.max(0.5, 4 / state.zoom);

    for (const pivot of layer.rig.pivots) {
      const isActive = pivot.id === layer.rig.activePivotId;
      const handle = rigHandlePosition(pivot);

      if (isActive) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(pivot.x));
        line.setAttribute('y1', String(pivot.y));
        line.setAttribute('x2', String(handle.x));
        line.setAttribute('y2', String(handle.y));
        line.setAttribute('class', 'rig-line');
        rigOverlay.append(line);

        const handlePoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        handlePoint.setAttribute('cx', String(handle.x));
        handlePoint.setAttribute('cy', String(handle.y));
        handlePoint.setAttribute('r', String(handleRadius));
        handlePoint.setAttribute('class', 'rig-handle');
        rigOverlay.append(handlePoint);
      }

      const pivotPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      pivotPoint.setAttribute('cx', String(pivot.x));
      pivotPoint.setAttribute('cy', String(pivot.y));
      pivotPoint.setAttribute('r', String(pivotRadius));
      pivotPoint.setAttribute('class', isActive ? 'rig-pivot' : 'rig-pivot inactive');
      rigOverlay.append(pivotPoint);
    }
  }

  function updateRigAngleInput(layer) {
    const pivot = getActivePivot(layer);
    const degrees = pivot ? Math.round((pivot.angle * 180) / Math.PI) : 0;
    rigAngleInput.value = String(degrees);
  }

  function setRigAngleFromInput() {
    const layer = getActiveLayer();
    const pivot = getActivePivot(layer);
    if (!layer || !pivot) {
      return;
    }

    const degrees = Number(rigAngleInput.value) || 0;
    pivot.angle = (degrees * Math.PI) / 180;
    renderComposite();
    renderRigOverlay();
  }

  function handleRigPointerDown(x, y) {
    const layer = getActiveLayer();
    const pivot = getActivePivot(layer);
    if (!layer || !pivot) {
      return;
    }

    const threshold = 10 / state.zoom;
    const handle = rigHandlePosition(pivot);
    const distanceToHandle = Math.hypot(handle.x - x, handle.y - y);
    const distanceToPivot = Math.hypot(pivot.x - x, pivot.y - y);

    const otherPivot = layer.rig.pivots.find(
      (candidate) => candidate.id !== pivot.id && Math.hypot(candidate.x - x, candidate.y - y) <= threshold
    );

    if (distanceToHandle <= threshold) {
      state.rig.dragMode = 'rotate';
    } else if (distanceToPivot <= threshold) {
      state.rig.dragMode = 'pivot';
    } else if (otherPivot) {
      setActivePivot(otherPivot.id);
      return;
    } else {
      state.rig.dragMode = 'rotate';
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      pivot.angle = Math.atan2(dy, dx) + Math.PI / 2;
      updateRigAngleInput(layer);
      renderComposite();
    }

    renderRigOverlay();
  }

  function handleRigPointerMove(x, y) {
    if (!state.rig.dragMode) {
      return;
    }

    const layer = getActiveLayer();
    const pivot = getActivePivot(layer);
    if (!layer || !pivot) {
      return;
    }

    if (state.rig.dragMode === 'pivot') {
      pivot.x = x;
      pivot.y = y;
    } else if (state.rig.dragMode === 'rotate') {
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      pivot.angle = Math.atan2(dy, dx) + Math.PI / 2;
      updateRigAngleInput(layer);
    }

    renderComposite();
    renderRigOverlay();
  }

  function bakeRigRotation(layer) {
    if (!layer || !layer.rig.pivots.some((pivot) => pivot.angle)) {
      return false;
    }

    const rotated = createLayerCanvas(canvas.width, canvas.height);
    const rotatedCtx = rotated.getContext('2d');
    rotatedCtx.imageSmoothingEnabled = false;
    for (const pivot of layer.rig.pivots) {
      if (pivot.angle) {
        rotatedCtx.translate(pivot.x, pivot.y);
        rotatedCtx.rotate(pivot.angle);
        rotatedCtx.translate(-pivot.x, -pivot.y);
      }
    }
    rotatedCtx.drawImage(layer.canvas, 0, 0);

    layer.canvas = rotated;
    for (const pivot of layer.rig.pivots) {
      pivot.angle = 0;
    }
    updateRigAngleInput(layer);
    renderComposite();
    renderRigOverlay();
    return true;
  }

  function applyRigRotation() {
    const layer = getActiveLayer();
    if (!bakeRigRotation(layer)) {
      return;
    }

    commit('Apply rig rotation');
  }

  function resetRig() {
    const layer = getActiveLayer();
    const pivot = getActivePivot(layer);
    if (!layer || !pivot) {
      return;
    }

    pivot.x = canvas.width / 2;
    pivot.y = canvas.height / 2;
    pivot.angle = 0;
    updateRigAngleInput(layer);
    renderComposite();
    renderRigOverlay();
  }

  function convexHull(rawPoints) {
    const unique = Array.from(new Map(rawPoints.map((point) => [`${point.x}:${point.y}`, point])).values())
      .sort((first, second) => (first.x === second.x ? first.y - second.y : first.x - second.x));
    if (unique.length <= 2) {
      return unique;
    }

    const cross = (origin, a, b) => (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);

    const lower = [];
    for (const point of unique) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
        lower.pop();
      }
      lower.push(point);
    }

    const upper = [];
    for (let index = unique.length - 1; index >= 0; index -= 1) {
      const point = unique[index];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
        upper.pop();
      }
      upper.push(point);
    }

    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  function autoTraceHitbox() {
    if (!state.ready) {
      return;
    }

    const image = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const alphaAt = (x, y) => image[(y * canvas.width + x) * 4 + 3];
    const candidates = [];

    for (let y = 0; y < canvas.height; y += 1) {
      let left = -1;
      let right = -1;
      for (let x = 0; x < canvas.width; x += 1) {
        if (alphaAt(x, y) > 8) {
          if (left < 0) {
            left = x;
          }
          right = x;
        }
      }
      if (left >= 0) {
        candidates.push({ x: left, y }, { x: right, y });
      }
    }

    for (let x = 0; x < canvas.width; x += 1) {
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < canvas.height; y += 1) {
        if (alphaAt(x, y) > 8) {
          if (top < 0) {
            top = y;
          }
          bottom = y;
        }
      }
      if (top >= 0) {
        candidates.push({ x, y: top }, { x, y: bottom });
      }
    }

    const hull = convexHull(candidates);
    if (hull.length < 3) {
      return;
    }

    state.collision.points = hull;
    state.collision.draggingIndex = -1;
    renderHitboxOverlay();
  }

  function clampCanvasNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(1024, parsed));
  }

  function eventToPixel(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * canvas.height);
    return {
      x: Math.max(0, Math.min(canvas.width - 1, x)),
      y: Math.max(0, Math.min(canvas.height - 1, y))
    };
  }

  function hideCursorOverlay() {
    cursorOverlay.hidden = true;
  }

  function updateCursorOverlay(x, y) {
    if (state.tool === 'hitbox' || state.tool === 'rig') {
      hideCursorOverlay();
      return;
    }

    const size = state.tool === 'picker' || state.tool === 'fill' ? 1 : Number(brushSizeInput.value) || 1;
    const half = Math.floor(size / 2);
    const left = Math.max(0, x - half);
    const top = Math.max(0, y - half);
    const width = Math.min(size, canvas.width - left);
    const height = Math.min(size, canvas.height - top);

    cursorOverlay.style.left = `${left * state.zoom}px`;
    cursorOverlay.style.top = `${top * state.zoom}px`;
    cursorOverlay.style.width = `${width * state.zoom}px`;
    cursorOverlay.style.height = `${height * state.zoom}px`;
    cursorOverlay.hidden = false;
  }

  function hexToRgb(hex) {
    const normalized = hex.replace('#', '');
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
      a: 255
    };
  }

  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function drawAt(x, y) {
    const layer = getActiveLayer();
    if (!layer) {
      return;
    }

    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true });
    const size = Number(brushSizeInput.value);
    const half = Math.floor(size / 2);
    const left = Math.max(0, x - half);
    const top = Math.max(0, y - half);
    const width = Math.min(size, canvas.width - left);
    const height = Math.min(size, canvas.height - top);

    if (state.tool === 'eraser') {
      layerCtx.clearRect(left, top, width, height);
    } else {
      layerCtx.fillStyle = colorInput.value;
      layerCtx.fillRect(left, top, width, height);
    }

    renderComposite();
  }

  function pickColor(x, y) {
    const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
    if (a === 0) {
      setTool('eraser');
      return;
    }
    colorInput.value = rgbToHex(r, g, b);
    setTool('pencil');
  }

  function sameColor(data, index, target) {
    return data[index] === target.r &&
      data[index + 1] === target.g &&
      data[index + 2] === target.b &&
      data[index + 3] === target.a;
  }

  function setPixel(data, index, color) {
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
  }

  function floodFill(startX, startY) {
    const layer = getActiveLayer();
    if (!layer) {
      return;
    }

    const layerCtx = layer.canvas.getContext('2d', { willReadFrequently: true });
    const image = layerCtx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const startIndex = (startY * canvas.width + startX) * 4;
    const target = {
      r: data[startIndex],
      g: data[startIndex + 1],
      b: data[startIndex + 2],
      a: data[startIndex + 3]
    };
    const replacement = state.tool === 'eraser'
      ? { r: 0, g: 0, b: 0, a: 0 }
      : hexToRgb(colorInput.value);

    if (target.r === replacement.r &&
      target.g === replacement.g &&
      target.b === replacement.b &&
      target.a === replacement.a) {
      return;
    }

    const stack = [[startX, startY]];
    while (stack.length) {
      const point = stack.pop();
      if (!point) {
        continue;
      }

      const [x, y] = point;
      if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
        continue;
      }

      const index = (y * canvas.width + x) * 4;
      if (!sameColor(data, index, target)) {
        continue;
      }

      setPixel(data, index, replacement);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    layerCtx.putImageData(image, 0, 0);
    renderComposite();
  }

  function serializeLayerState() {
    return {
      layers: state.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        dataUri: layer.canvas.toDataURL('image/png'),
        rig: {
          activePivotId: layer.rig.activePivotId,
          pivots: layer.rig.pivots.map((pivot) => ({
            id: pivot.id,
            name: pivot.name,
            x: pivot.x,
            y: pivot.y,
            angle: pivot.angle
          }))
        }
      }))
    };
  }

  function commit(label) {
    if (!state.ready) {
      return;
    }

    renderComposite();
    vscode.postMessage({
      type: 'edit',
      label,
      dataUri: canvas.toDataURL('image/png'),
      layerState: serializeLayerState()
    });
  }

  function handlePointerDown(event) {
    if (!state.ready || event.button !== 0) {
      return;
    }

    const { x, y } = eventToPixel(event);
    state.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);

    if (state.tool === 'hitbox') {
      handleHitboxPointerDown(event, x, y);
      return;
    }

    if (state.tool === 'rig') {
      handleRigPointerDown(x, y);
      return;
    }

    if (state.tool === 'picker') {
      pickColor(x, y);
      return;
    }

    if (state.tool === 'fill') {
      floodFill(x, y);
      commit('Fill layer');
      return;
    }

    state.drawing = true;
    state.lastKey = `${x}:${y}`;
    drawAt(x, y);
  }

  function handlePointerMove(event) {
    const { x, y } = eventToPixel(event);
    updateCursorOverlay(x, y);

    if (event.pointerId !== state.pointerId) {
      return;
    }

    if (state.tool === 'hitbox') {
      handleHitboxPointerMove(event);
      return;
    }

    if (state.tool === 'rig') {
      handleRigPointerMove(x, y);
      return;
    }

    if (!state.drawing) {
      return;
    }

    const key = `${x}:${y}`;
    if (key === state.lastKey) {
      return;
    }

    state.lastKey = key;
    drawAt(x, y);
  }

  function stopDrawing(event) {
    if (event.pointerId !== state.pointerId) {
      return;
    }

    if (state.tool === 'hitbox') {
      state.collision.draggingIndex = -1;
      state.pointerId = undefined;
      return;
    }

    if (state.tool === 'rig') {
      state.rig.dragMode = undefined;
      state.pointerId = undefined;
      return;
    }

    if (!state.drawing) {
      return;
    }

    state.drawing = false;
    state.pointerId = undefined;
    state.lastKey = '';
    commit(state.tool === 'eraser' ? 'Erase layer' : 'Draw layer');
  }

  function resizeCanvas() {
    const width = clampCanvasNumber(widthInput.value, canvas.width);
    const height = clampCanvasNumber(heightInput.value, canvas.height);

    for (const layer of state.layers) {
      const oldCanvas = layer.canvas;
      const nextCanvas = createLayerCanvas(width, height);
      nextCanvas.getContext('2d').drawImage(oldCanvas, 0, 0);
      layer.canvas = nextCanvas;
    }

    setCanvasSize(width, height);
    state.collision.points = [];
    state.collision.draggingIndex = -1;
    renderComposite();
    renderHitboxOverlay();
    renderRigOverlay();
    commit('Resize canvas');
  }

  function addLayer() {
    const layer = createLayer(`Layer ${state.layers.length + 1}`);
    state.layers.push(layer);
    state.activeLayerId = layer.id;
    renderLayersPanel();
    renderComposite();
    renderPivotsPanel();
    renderRigOverlay();
    commit('Add layer');
  }

  function duplicateLayer() {
    const activeLayer = getActiveLayer();
    if (!activeLayer) {
      return;
    }

    const layer = createLayer(`${activeLayer.name} copy`, activeLayer.canvas);
    const index = state.layers.findIndex((item) => item.id === activeLayer.id);
    state.layers.splice(index + 1, 0, layer);
    state.activeLayerId = layer.id;
    renderLayersPanel();
    renderComposite();
    renderPivotsPanel();
    renderRigOverlay();
    commit('Duplicate layer');
  }

  function deleteLayer() {
    if (state.layers.length <= 1) {
      return;
    }

    const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    if (index < 0) {
      return;
    }

    state.layers.splice(index, 1);
    state.activeLayerId = state.layers[Math.max(0, index - 1)].id;
    renderLayersPanel();
    renderComposite();
    renderPivotsPanel();
    renderRigOverlay();
    commit('Delete layer');
  }

  function moveLayer(offset) {
    const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.layers.length) {
      return;
    }

    const [layer] = state.layers.splice(index, 1);
    state.layers.splice(nextIndex, 0, layer);
    renderLayersPanel();
    renderComposite();
    commit(offset > 0 ? 'Move layer up' : 'Move layer down');
  }

  function toggleLayerVisibility(id) {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) {
      return;
    }

    layer.visible = !layer.visible;
    renderLayersPanel();
    renderComposite();
    commit(layer.visible ? 'Show layer' : 'Hide layer');
  }

  function setActiveLayerOpacity(value, shouldCommit) {
    const layer = getActiveLayer();
    if (!layer) {
      return;
    }

    const opacity = Math.max(0, Math.min(100, Number(value) || 0));
    layer.opacity = opacity / 100;
    layerOpacityInput.value = String(opacity);
    layerOpacityLabel.value = `${opacity}%`;
    renderLayersPanel();
    renderComposite();
    if (shouldCommit) {
      commit('Change layer opacity');
    }
  }

  function renameLayer(id, value) {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) {
      return;
    }

    const name = value.trim();
    if (!name || name === layer.name) {
      renderLayersPanel();
      return;
    }

    layer.name = name;
    renderLayersPanel();
  }

  function renderLayersPanel() {
    layersList.replaceChildren();

    const activeLayer = getActiveLayer();
    const activeOpacity = activeLayer ? Math.round(activeLayer.opacity * 100) : 100;
    layerOpacityInput.value = String(activeOpacity);
    layerOpacityLabel.value = `${activeOpacity}%`;

    for (let index = state.layers.length - 1; index >= 0; index -= 1) {
      const layer = state.layers[index];
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.classList.toggle('active', layer.id === state.activeLayerId);
      row.dataset.layerId = layer.id;

      const visibility = document.createElement('button');
      visibility.className = 'icon-button layer-visibility';
      visibility.type = 'button';
      visibility.title = layer.visible ? 'Hide layer' : 'Show layer';
      visibility.setAttribute('aria-label', visibility.title);
      visibility.textContent = layer.visible ? '👁️' : '🚫';
      visibility.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleLayerVisibility(layer.id);
      });

      const name = document.createElement('input');
      name.className = 'layer-name-input';
      name.type = 'text';
      name.value = layer.name;
      name.title = 'Layer name';
      name.addEventListener('click', (event) => event.stopPropagation());
      name.addEventListener('change', () => renameLayer(layer.id, name.value));
      name.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          name.blur();
        }
      });

      const opacity = document.createElement('span');
      opacity.className = 'layer-opacity';
      opacity.textContent = `${Math.round(layer.opacity * 100)}%`;

      row.append(visibility, name, opacity);
      row.addEventListener('click', () => setActiveLayer(layer.id));
      layersList.append(row);
    }

    deleteLayerButton.disabled = state.layers.length <= 1;
    const activeIndex = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    moveLayerDownButton.disabled = activeIndex <= 0;
    moveLayerUpButton.disabled = activeIndex === -1 || activeIndex >= state.layers.length - 1;
  }

  function renderPalettes() {
    for (const palette of palettes) {
      const option = document.createElement('option');
      option.value = palette.name;
      option.textContent = palette.name;
      paletteSelect.append(option);
    }

    paletteSelect.value = palettes[0].name;
    renderPaletteSwatches();
  }

  function renderPaletteSwatches() {
    const palette = palettes.find((item) => item.name === paletteSelect.value) ?? palettes[0];
    paletteSwatches.replaceChildren();

    for (const color of palette.colors) {
      const swatch = document.createElement('button');
      swatch.className = 'color-swatch';
      swatch.type = 'button';
      swatch.title = color;
      swatch.setAttribute('aria-label', color);
      swatch.style.backgroundColor = color;
      swatch.classList.toggle('active', color.toLowerCase() === colorInput.value.toLowerCase());
      swatch.addEventListener('click', () => {
        colorInput.value = color;
        setTool('pencil');
        renderPaletteSwatches();
      });
      paletteSwatches.append(swatch);
    }
  }

  for (const button of toolButtons) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }

  brushSizeInput.addEventListener('input', () => setBrushSize(brushSizeInput.value));
  zoomInput.addEventListener('input', () => setZoom(zoomInput.value));
  fitZoomButton.addEventListener('click', fitZoomToWorkspace);
  guideSizeSelect.addEventListener('change', () => setGuideSize(guideSizeSelect.value));
  resizeButton.addEventListener('click', resizeCanvas);
  saveButton.addEventListener('click', () => vscode.postMessage({ type: 'save' }));
  syncCharacterButton.addEventListener('click', () => vscode.postMessage({ type: 'syncCharacter' }));
  colorInput.addEventListener('input', renderPaletteSwatches);
  paletteSelect.addEventListener('change', renderPaletteSwatches);
  addLayerButton.addEventListener('click', addLayer);
  duplicateLayerButton.addEventListener('click', duplicateLayer);
  deleteLayerButton.addEventListener('click', deleteLayer);
  moveLayerUpButton.addEventListener('click', () => moveLayer(1));
  moveLayerDownButton.addEventListener('click', () => moveLayer(-1));
  layerOpacityInput.addEventListener('input', () => setActiveLayerOpacity(layerOpacityInput.value, false));
  layerOpacityInput.addEventListener('change', () => setActiveLayerOpacity(layerOpacityInput.value, true));
  toggleGridButton.addEventListener('click', () => {
    canvasFrame.classList.toggle('grid');
    toggleGridButton.classList.toggle('active', canvasFrame.classList.contains('grid'));
  });

  autoTraceButton.addEventListener('click', autoTraceHitbox);
  clearHitboxButton.addEventListener('click', () => {
    state.collision.points = [];
    state.collision.draggingIndex = -1;
    renderHitboxOverlay();
  });
  saveHitboxButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'saveCollision', points: flattenHitboxPoints() });
  });

  rigAngleInput.addEventListener('change', setRigAngleFromInput);
  applyRigButton.addEventListener('click', applyRigRotation);
  resetRigButton.addEventListener('click', resetRig);
  addPivotButton.addEventListener('click', addPivot);

  canvas.addEventListener('pointerdown', handlePointerDown);
  canvas.addEventListener('pointermove', handlePointerMove);
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);
  canvas.addEventListener('pointerleave', (event) => {
    stopDrawing(event);
    hideCursorOverlay();
  });
  canvas.addEventListener('contextmenu', (event) => {
    if (state.tool !== 'hitbox') {
      return;
    }
    event.preventDefault();
    const { x, y } = eventToPixel(event);
    deleteNearestHitboxPoint(x, y);
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'init') {
      state.assetProfile = message.assetProfile;
      state.pendingCollisionPoints = message.collisionPoints;
      syncCharacterButton.hidden = message.assetProfile?.kind !== 'lpc-action';
      if (message.assetProfile?.kind === 'lpc-action') {
        setGuideSize(message.assetProfile.guideSize);
      }
      loadLayerState(message.layerState, message.filename).then((loaded) => {
        if (!loaded) {
          loadImage(message.dataUri, message.filename);
        }
      });
    }
  });

  renderPalettes();
  setTool('pencil');
  setBrushSize(brushSizeInput.value);
  setZoom(zoomInput.value);
  setGuideSize(guideSizeSelect.value);
  vscode.postMessage({ type: 'ready' });
}());
