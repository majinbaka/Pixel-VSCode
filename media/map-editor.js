(function () {
  const vscode = acquireVsCodeApi();

  const mapCanvas = document.getElementById('mapCanvas');
  const mapContext = mapCanvas.getContext('2d');
  const mapFrame = document.getElementById('mapFrame');
  const paletteCanvas = document.getElementById('paletteCanvas');
  const paletteContext = paletteCanvas.getContext('2d');
  const sourceSelect = document.getElementById('sourceSelect');
  const layersList = document.getElementById('layersList');
  const mapStatus = document.getElementById('mapStatus');
  const cellStatus = document.getElementById('cellStatus');
  const selectionStatus = document.getElementById('selectionStatus');
  const zoomInput = document.getElementById('zoomInput');
  const zoomLabel = document.getElementById('zoomLabel');
  const gridInput = document.getElementById('gridInput');
  const saveButton = document.getElementById('saveButton');
  const exportButton = document.getElementById('exportButton');
  const addLayerButton = document.getElementById('addLayerButton');
  const deleteLayerButton = document.getElementById('deleteLayerButton');
  const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));

  const state = {
    map: undefined,
    sources: [],
    sourceById: new Map(),
    activeLayer: 0,
    hiddenLayers: new Set(),
    selectedTile: undefined,
    tool: 'paint',
    zoom: 0.5,
    drawing: false,
    changedInStroke: false,
    lastCell: '',
    pointerId: undefined,
    loadToken: 0
  };

  function cellKey(x, y) {
    return `${x},${y}`;
  }

  function normalizeLayers(map) {
    for (const layer of map.layers) {
      layer.cellMap = new Map();
      for (const cell of layer.cells) {
        layer.cellMap.set(cellKey(cell[0], cell[1]), cell);
      }
    }
  }

  function serializeMap() {
    return {
      ...state.map,
      layers: state.map.layers.map((layer) => ({
        name: layer.name,
        zIndex: layer.zIndex,
        cells: Array.from(layer.cellMap.values()).sort((a, b) => a[1] - b[1] || a[0] - b[0])
      }))
    };
  }

  function postEdit(label) {
    vscode.postMessage({
      type: 'edit',
      label,
      map: serializeMap()
    });
  }

  function setTool(tool) {
    state.tool = tool;
    for (const button of toolButtons) {
      button.classList.toggle('active', button.dataset.tool === tool);
    }
  }

  function setZoom(value) {
    state.zoom = Math.max(0.2, Math.min(2, Number(value) / 100 || 0.5));
    zoomInput.value = String(Math.round(state.zoom * 100));
    zoomLabel.value = `${Math.round(state.zoom * 100)}%`;
    if (state.map) {
      mapCanvas.style.width = `${mapCanvas.width * state.zoom}px`;
      mapCanvas.style.height = `${mapCanvas.height * state.zoom}px`;
    }
  }

  async function loadSourceImages(sources) {
    const token = ++state.loadToken;
    const loaded = await Promise.all(sources.map((source) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ ...source, image });
      image.onerror = () => reject(new Error(`Unable to load ${source.name}`));
      image.src = source.dataUri;
    })));
    if (token !== state.loadToken) {
      return false;
    }
    state.sources = loaded;
    state.sourceById = new Map(loaded.map((source) => [source.sourceId, source]));
    return true;
  }

  async function initialize(map, sources) {
    state.map = structuredClone(map);
    normalizeLayers(state.map);
    state.activeLayer = 0;
    state.hiddenLayers.clear();
    state.selectedTile = undefined;
    mapStatus.textContent = `${state.map.name} · ${state.map.width}x${state.map.height} · ${state.map.tileSize}px`;
    mapCanvas.width = state.map.width * state.map.tileSize;
    mapCanvas.height = state.map.height * state.map.tileSize;
    setZoom(zoomInput.value);

    try {
      if (!await loadSourceImages(sources)) {
        return;
      }
      renderSourceOptions();
      renderLayers();
      renderMap();
    } catch (error) {
      mapStatus.textContent = error instanceof Error ? error.message : 'Unable to load TileSet';
    }
  }

  function renderSourceOptions() {
    sourceSelect.replaceChildren();
    for (const source of state.sources) {
      const option = document.createElement('option');
      option.value = String(source.sourceId);
      option.textContent = `${source.sourceId}: ${source.name} (${source.regionWidth}px)`;
      sourceSelect.append(option);
    }
    if (state.sources[0]) {
      sourceSelect.value = String(state.sources[0].sourceId);
      renderPalette();
    }
  }

  function activeSource() {
    return state.sourceById.get(Number(sourceSelect.value));
  }

  function renderPalette() {
    const source = activeSource();
    if (!source) {
      return;
    }
    paletteCanvas.width = source.image.naturalWidth;
    paletteCanvas.height = source.image.naturalHeight;
    paletteContext.imageSmoothingEnabled = false;
    paletteContext.clearRect(0, 0, paletteCanvas.width, paletteCanvas.height);
    paletteContext.drawImage(source.image, 0, 0);
    paletteContext.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    paletteContext.lineWidth = 1;
    for (let x = 0; x <= source.columns; x += 1) {
      paletteContext.beginPath();
      paletteContext.moveTo(x * source.regionWidth + 0.5, 0);
      paletteContext.lineTo(x * source.regionWidth + 0.5, paletteCanvas.height);
      paletteContext.stroke();
    }
    for (let y = 0; y <= source.rows; y += 1) {
      paletteContext.beginPath();
      paletteContext.moveTo(0, y * source.regionHeight + 0.5);
      paletteContext.lineTo(paletteCanvas.width, y * source.regionHeight + 0.5);
      paletteContext.stroke();
    }
    drawPaletteSelection();
  }

  function drawPaletteSelection() {
    const source = activeSource();
    const selected = state.selectedTile;
    if (!source || !selected || selected.sourceId !== source.sourceId) {
      return;
    }
    paletteContext.strokeStyle = '#ffcc00';
    paletteContext.lineWidth = 3;
    paletteContext.strokeRect(
      selected.atlasX * source.regionWidth + 1.5,
      selected.atlasY * source.regionHeight + 1.5,
      source.regionWidth - 3,
      source.regionHeight - 3
    );
  }

  function selectPaletteTile(event) {
    const source = activeSource();
    if (!source) {
      return;
    }
    const rect = paletteCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * paletteCanvas.width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * paletteCanvas.height / rect.height);
    const atlasX = Math.floor(x / source.regionWidth);
    const atlasY = Math.floor(y / source.regionHeight);
    if (atlasX < 0 || atlasY < 0 || atlasX >= source.columns || atlasY >= source.rows) {
      return;
    }
    state.selectedTile = { sourceId: source.sourceId, atlasX, atlasY };
    selectionStatus.textContent = `Source ${source.sourceId} · atlas ${atlasX}, ${atlasY}`;
    setTool('paint');
    renderPalette();
  }

  function renderMap() {
    if (!state.map) {
      return;
    }
    mapContext.clearRect(0, 0, mapCanvas.width, mapCanvas.height);
    mapContext.imageSmoothingEnabled = false;

    for (let index = 0; index < state.map.layers.length; index += 1) {
      if (state.hiddenLayers.has(index)) {
        continue;
      }
      const layer = state.map.layers[index];
      for (const cell of layer.cellMap.values()) {
        drawCell(cell);
      }
    }

    if (gridInput.checked) {
      drawGrid();
    }
  }

  function drawCell(cell) {
    const source = state.sourceById.get(cell[2]);
    if (!source) {
      return;
    }
    const tileSize = state.map.tileSize;
    mapContext.drawImage(
      source.image,
      cell[3] * source.regionWidth,
      cell[4] * source.regionHeight,
      source.regionWidth,
      source.regionHeight,
      cell[0] * tileSize,
      cell[1] * tileSize,
      tileSize,
      tileSize
    );
  }

  function drawGrid() {
    const tileSize = state.map.tileSize;
    mapContext.strokeStyle = 'rgba(127, 127, 127, 0.28)';
    mapContext.lineWidth = 1;
    for (let x = 0; x <= state.map.width; x += 1) {
      mapContext.beginPath();
      mapContext.moveTo(x * tileSize + 0.5, 0);
      mapContext.lineTo(x * tileSize + 0.5, mapCanvas.height);
      mapContext.stroke();
    }
    for (let y = 0; y <= state.map.height; y += 1) {
      mapContext.beginPath();
      mapContext.moveTo(0, y * tileSize + 0.5);
      mapContext.lineTo(mapCanvas.width, y * tileSize + 0.5);
      mapContext.stroke();
    }
  }

  function eventToCell(event) {
    const rect = mapCanvas.getBoundingClientRect();
    const pixelX = (event.clientX - rect.left) * mapCanvas.width / rect.width;
    const pixelY = (event.clientY - rect.top) * mapCanvas.height / rect.height;
    return {
      x: Math.floor(pixelX / state.map.tileSize),
      y: Math.floor(pixelY / state.map.tileSize)
    };
  }

  function isValidCell(x, y) {
    return x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
  }

  function activeLayer() {
    return state.map.layers[state.activeLayer];
  }

  function paintCell(x, y, erase = false) {
    if (!isValidCell(x, y)) {
      return false;
    }
    const layer = activeLayer();
    const key = cellKey(x, y);
    if (erase) {
      return layer.cellMap.delete(key);
    }
    if (!state.selectedTile) {
      return false;
    }
    const next = [
      x,
      y,
      state.selectedTile.sourceId,
      state.selectedTile.atlasX,
      state.selectedTile.atlasY,
      0
    ];
    const previous = layer.cellMap.get(key);
    if (previous && previous.slice(2, 6).every((value, index) => value === next[index + 2])) {
      return false;
    }
    layer.cellMap.set(key, next);
    return true;
  }

  function fillCells(startX, startY) {
    if (!isValidCell(startX, startY) || !state.selectedTile) {
      return false;
    }
    const layer = activeLayer();
    const target = layer.cellMap.get(cellKey(startX, startY));
    const targetId = target ? target.slice(2, 6).join(':') : '';
    const replacementId = [
      state.selectedTile.sourceId,
      state.selectedTile.atlasX,
      state.selectedTile.atlasY,
      0
    ].join(':');
    if (targetId === replacementId) {
      return false;
    }

    const stack = [[startX, startY]];
    const visited = new Set();
    let changed = false;
    while (stack.length) {
      const [x, y] = stack.pop();
      const key = cellKey(x, y);
      if (!isValidCell(x, y) || visited.has(key)) {
        continue;
      }
      visited.add(key);
      const current = layer.cellMap.get(key);
      const currentId = current ? current.slice(2, 6).join(':') : '';
      if (currentId !== targetId) {
        continue;
      }
      changed = paintCell(x, y) || changed;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return changed;
  }

  function handlePointerDown(event) {
    if (!state.map || event.button !== 0) {
      return;
    }
    const { x, y } = eventToCell(event);
    if (!isValidCell(x, y)) {
      return;
    }
    if (state.tool === 'fill') {
      if (fillCells(x, y)) {
        renderMap();
        postEdit('Fill map layer');
      }
      return;
    }

    state.drawing = true;
    state.pointerId = event.pointerId;
    state.lastCell = cellKey(x, y);
    state.changedInStroke = paintCell(x, y, state.tool === 'erase');
    mapCanvas.setPointerCapture(event.pointerId);
    renderMap();
  }

  function handlePointerMove(event) {
    if (!state.map) {
      return;
    }
    const { x, y } = eventToCell(event);
    cellStatus.textContent = `${x}, ${y}`;
    if (!state.drawing || event.pointerId !== state.pointerId || !isValidCell(x, y)) {
      return;
    }
    const key = cellKey(x, y);
    if (key === state.lastCell) {
      return;
    }
    state.lastCell = key;
    state.changedInStroke = paintCell(x, y, state.tool === 'erase') || state.changedInStroke;
    renderMap();
  }

  function stopDrawing(event) {
    if (!state.drawing || event.pointerId !== state.pointerId) {
      return;
    }
    state.drawing = false;
    state.pointerId = undefined;
    state.lastCell = '';
    if (state.changedInStroke) {
      postEdit(state.tool === 'erase' ? 'Erase map tiles' : 'Paint map tiles');
    }
    state.changedInStroke = false;
  }

  function renderLayers() {
    layersList.replaceChildren();
    state.map.layers.forEach((layer, index) => {
      const row = document.createElement('div');
      row.className = 'layer-row';
      row.classList.toggle('active', index === state.activeLayer);

      const visibility = document.createElement('button');
      visibility.className = 'icon-button';
      visibility.type = 'button';
      visibility.textContent = state.hiddenLayers.has(index) ? '○' : '●';
      visibility.title = 'Toggle preview visibility';
      visibility.addEventListener('click', (event) => {
        event.stopPropagation();
        if (state.hiddenLayers.has(index)) {
          state.hiddenLayers.delete(index);
        } else {
          state.hiddenLayers.add(index);
        }
        renderLayers();
        renderMap();
      });

      const name = document.createElement('input');
      name.type = 'text';
      name.value = layer.name;
      name.addEventListener('click', (event) => event.stopPropagation());
      name.addEventListener('change', () => {
        const value = name.value.trim();
        if (value && value !== layer.name) {
          layer.name = value;
          postEdit('Rename map layer');
        }
      });

      const count = document.createElement('span');
      count.className = 'layer-count';
      count.textContent = String(layer.cellMap.size);

      row.append(visibility, name, count);
      row.addEventListener('click', () => {
        state.activeLayer = index;
        renderLayers();
      });
      layersList.append(row);
    });
    deleteLayerButton.disabled = state.map.layers.length <= 1;
  }

  function addLayer() {
    const name = window.prompt('Layer name', `Layer ${state.map.layers.length + 1}`);
    if (!name?.trim()) {
      return;
    }
    const lastZ = state.map.layers.at(-1)?.zIndex ?? -20;
    state.map.layers.push({
      name: name.trim(),
      zIndex: lastZ + 1,
      cells: [],
      cellMap: new Map()
    });
    state.activeLayer = state.map.layers.length - 1;
    renderLayers();
    renderMap();
    postEdit('Add map layer');
  }

  function deleteLayer() {
    if (state.map.layers.length <= 1) {
      return;
    }
    const layer = activeLayer();
    if (!window.confirm(`Delete layer "${layer.name}"?`)) {
      return;
    }
    state.map.layers.splice(state.activeLayer, 1);
    state.hiddenLayers.clear();
    state.activeLayer = Math.max(0, state.activeLayer - 1);
    renderLayers();
    renderMap();
    postEdit('Delete map layer');
  }

  for (const button of toolButtons) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }
  sourceSelect.addEventListener('change', renderPalette);
  paletteCanvas.addEventListener('click', selectPaletteTile);
  zoomInput.addEventListener('input', () => setZoom(zoomInput.value));
  gridInput.addEventListener('change', renderMap);
  saveButton.addEventListener('click', () => vscode.postMessage({ type: 'save' }));
  exportButton.addEventListener('click', () => vscode.postMessage({ type: 'export' }));
  addLayerButton.addEventListener('click', addLayer);
  deleteLayerButton.addEventListener('click', deleteLayer);
  mapCanvas.addEventListener('pointerdown', handlePointerDown);
  mapCanvas.addEventListener('pointermove', handlePointerMove);
  mapCanvas.addEventListener('pointerup', stopDrawing);
  mapCanvas.addEventListener('pointercancel', stopDrawing);
  mapCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('message', (event) => {
    if (event.data.type === 'init') {
      void initialize(event.data.map, event.data.sources);
    }
  });

  setTool('paint');
  setZoom(zoomInput.value);
  vscode.postMessage({ type: 'ready' });
}());
