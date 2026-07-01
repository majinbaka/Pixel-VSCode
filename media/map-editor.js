"use strict";
(() => {
  // src/webview/mapEditor/dom.ts
  function byId(id) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing element #${id}`);
    }
    return el;
  }
  function queryElements() {
    const mapCanvas = byId("mapCanvas");
    const paletteCanvas = byId("paletteCanvas");
    const mapContext = mapCanvas.getContext("2d");
    const paletteContext = paletteCanvas.getContext("2d");
    if (!mapContext || !paletteContext) {
      throw new Error("Unable to acquire 2D canvas context");
    }
    return {
      mapCanvas,
      mapContext,
      mapFrame: byId("mapFrame"),
      paletteCanvas,
      paletteContext,
      sourceSelect: byId("sourceSelect"),
      layersList: byId("layersList"),
      mapStatus: byId("mapStatus"),
      cellStatus: byId("cellStatus"),
      selectionStatus: byId("selectionStatus"),
      zoomInput: byId("zoomInput"),
      zoomLabel: byId("zoomLabel"),
      gridInput: byId("gridInput"),
      saveButton: byId("saveButton"),
      exportButton: byId("exportButton"),
      addLayerButton: byId("addLayerButton"),
      deleteLayerButton: byId("deleteLayerButton"),
      toolButtons: Array.from(document.querySelectorAll("[data-tool]"))
    };
  }

  // src/webview/mapEditor/state.ts
  function createInitialState() {
    return {
      map: void 0,
      sources: [],
      sourceById: /* @__PURE__ */ new Map(),
      activeLayer: 0,
      hiddenLayers: /* @__PURE__ */ new Set(),
      selectedTile: void 0,
      tool: "paint",
      zoom: 0.5,
      drawing: false,
      changedInStroke: false,
      lastCell: "",
      pointerId: void 0,
      loadToken: 0
    };
  }
  function cellKey(x, y) {
    return `${x},${y}`;
  }
  function toMapModel(map) {
    return {
      ...map,
      layers: map.layers.map((layer) => toMapLayer(layer))
    };
  }
  function toMapLayer(layer) {
    const cellMap = /* @__PURE__ */ new Map();
    for (const cell of layer.cells) {
      cellMap.set(cellKey(cell[0], cell[1]), cell);
    }
    return { name: layer.name, zIndex: layer.zIndex, cellMap };
  }
  function serializeMap(map) {
    return {
      ...map,
      layers: map.layers.map((layer) => ({
        name: layer.name,
        zIndex: layer.zIndex,
        cells: Array.from(layer.cellMap.values()).sort((a, b) => a[1] - b[1] || a[0] - b[0])
      }))
    };
  }

  // src/webview/mapEditor/canvas.ts
  async function loadSourceImages(state, sources) {
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
  function setZoom(el, state, value) {
    state.zoom = Math.max(0.2, Math.min(2, Number(value) / 100 || 0.5));
    el.zoomInput.value = String(Math.round(state.zoom * 100));
    el.zoomLabel.value = `${Math.round(state.zoom * 100)}%`;
    if (state.map) {
      el.mapCanvas.style.width = `${el.mapCanvas.width * state.zoom}px`;
      el.mapCanvas.style.height = `${el.mapCanvas.height * state.zoom}px`;
    }
  }
  function renderMap(el, state) {
    if (!state.map) {
      return;
    }
    el.mapContext.clearRect(0, 0, el.mapCanvas.width, el.mapCanvas.height);
    el.mapContext.imageSmoothingEnabled = false;
    for (let index = 0; index < state.map.layers.length; index += 1) {
      if (state.hiddenLayers.has(index)) {
        continue;
      }
      const layer = state.map.layers[index];
      for (const cell of layer.cellMap.values()) {
        drawCell(el, state, cell);
      }
    }
    if (el.gridInput.checked) {
      drawGrid(el, state);
    }
  }
  function drawCell(el, state, cell) {
    const source = state.sourceById.get(cell[2]);
    if (!source || !state.map) {
      return;
    }
    const tileSize = state.map.tileSize;
    el.mapContext.drawImage(
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
  function drawGrid(el, state) {
    if (!state.map) {
      return;
    }
    const tileSize = state.map.tileSize;
    el.mapContext.strokeStyle = "rgba(127, 127, 127, 0.28)";
    el.mapContext.lineWidth = 1;
    for (let x = 0; x <= state.map.width; x += 1) {
      el.mapContext.beginPath();
      el.mapContext.moveTo(x * tileSize + 0.5, 0);
      el.mapContext.lineTo(x * tileSize + 0.5, el.mapCanvas.height);
      el.mapContext.stroke();
    }
    for (let y = 0; y <= state.map.height; y += 1) {
      el.mapContext.beginPath();
      el.mapContext.moveTo(0, y * tileSize + 0.5);
      el.mapContext.lineTo(el.mapCanvas.width, y * tileSize + 0.5);
      el.mapContext.stroke();
    }
  }
  function eventToCell(el, state, event) {
    const rect = el.mapCanvas.getBoundingClientRect();
    const pixelX = (event.clientX - rect.left) * el.mapCanvas.width / rect.width;
    const pixelY = (event.clientY - rect.top) * el.mapCanvas.height / rect.height;
    const tileSize = state.map?.tileSize ?? 1;
    return {
      x: Math.floor(pixelX / tileSize),
      y: Math.floor(pixelY / tileSize)
    };
  }
  function isValidCell(state, x, y) {
    if (!state.map) {
      return false;
    }
    return x >= 0 && y >= 0 && x < state.map.width && y < state.map.height;
  }
  function activeLayer(state) {
    if (!state.map) {
      throw new Error("No map loaded");
    }
    return state.map.layers[state.activeLayer];
  }
  function paintCell(state, x, y, erase = false) {
    if (!isValidCell(state, x, y)) {
      return false;
    }
    const layer = activeLayer(state);
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
  function fillCells(state, startX, startY) {
    if (!isValidCell(state, startX, startY) || !state.selectedTile) {
      return false;
    }
    const layer = activeLayer(state);
    const target = layer.cellMap.get(cellKey(startX, startY));
    const targetId = target ? target.slice(2, 6).join(":") : "";
    const replacementId = [
      state.selectedTile.sourceId,
      state.selectedTile.atlasX,
      state.selectedTile.atlasY,
      0
    ].join(":");
    if (targetId === replacementId) {
      return false;
    }
    const stack = [[startX, startY]];
    const visited = /* @__PURE__ */ new Set();
    let changed = false;
    while (stack.length) {
      const next = stack.pop();
      if (!next) {
        break;
      }
      const [x, y] = next;
      const key = cellKey(x, y);
      if (!isValidCell(state, x, y) || visited.has(key)) {
        continue;
      }
      visited.add(key);
      const current = layer.cellMap.get(key);
      const currentId = current ? current.slice(2, 6).join(":") : "";
      if (currentId !== targetId) {
        continue;
      }
      changed = paintCell(state, x, y) || changed;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    return changed;
  }

  // src/webview/mapEditor/palettePanel.ts
  function activeSource(el, state) {
    return state.sourceById.get(Number(el.sourceSelect.value));
  }
  function renderSourceOptions(el, state) {
    el.sourceSelect.replaceChildren();
    for (const source of state.sources) {
      const option = document.createElement("option");
      option.value = String(source.sourceId);
      option.textContent = `${source.sourceId}: ${source.name} (${source.regionWidth}px)`;
      el.sourceSelect.append(option);
    }
    if (state.sources[0]) {
      el.sourceSelect.value = String(state.sources[0].sourceId);
      renderPalette(el, state);
    }
  }
  function renderPalette(el, state) {
    const source = activeSource(el, state);
    if (!source) {
      return;
    }
    el.paletteCanvas.width = source.image.naturalWidth;
    el.paletteCanvas.height = source.image.naturalHeight;
    el.paletteContext.imageSmoothingEnabled = false;
    el.paletteContext.clearRect(0, 0, el.paletteCanvas.width, el.paletteCanvas.height);
    el.paletteContext.drawImage(source.image, 0, 0);
    el.paletteContext.strokeStyle = "rgba(255, 255, 255, 0.45)";
    el.paletteContext.lineWidth = 1;
    for (let x = 0; x <= source.columns; x += 1) {
      el.paletteContext.beginPath();
      el.paletteContext.moveTo(x * source.regionWidth + 0.5, 0);
      el.paletteContext.lineTo(x * source.regionWidth + 0.5, el.paletteCanvas.height);
      el.paletteContext.stroke();
    }
    for (let y = 0; y <= source.rows; y += 1) {
      el.paletteContext.beginPath();
      el.paletteContext.moveTo(0, y * source.regionHeight + 0.5);
      el.paletteContext.lineTo(el.paletteCanvas.width, y * source.regionHeight + 0.5);
      el.paletteContext.stroke();
    }
    drawPaletteSelection(el, state);
  }
  function drawPaletteSelection(el, state) {
    const source = activeSource(el, state);
    const selected = state.selectedTile;
    if (!source || !selected || selected.sourceId !== source.sourceId) {
      return;
    }
    el.paletteContext.strokeStyle = "#ffcc00";
    el.paletteContext.lineWidth = 3;
    el.paletteContext.strokeRect(
      selected.atlasX * source.regionWidth + 1.5,
      selected.atlasY * source.regionHeight + 1.5,
      source.regionWidth - 3,
      source.regionHeight - 3
    );
  }
  function selectPaletteTile(el, state, event) {
    const source = activeSource(el, state);
    if (!source) {
      return void 0;
    }
    const rect = el.paletteCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) * el.paletteCanvas.width / rect.width);
    const y = Math.floor((event.clientY - rect.top) * el.paletteCanvas.height / rect.height);
    const atlasX = Math.floor(x / source.regionWidth);
    const atlasY = Math.floor(y / source.regionHeight);
    if (atlasX < 0 || atlasY < 0 || atlasX >= source.columns || atlasY >= source.rows) {
      return void 0;
    }
    const selected = { sourceId: source.sourceId, atlasX, atlasY };
    state.selectedTile = selected;
    el.selectionStatus.textContent = `Source ${source.sourceId} \xB7 atlas ${atlasX}, ${atlasY}`;
    renderPalette(el, state);
    return selected;
  }

  // src/webview/mapEditor/layersPanel.ts
  function renderLayers(el, state, callbacks) {
    if (!state.map) {
      return;
    }
    el.layersList.replaceChildren();
    state.map.layers.forEach((layer, index) => {
      const row = document.createElement("div");
      row.className = "layer-row";
      row.classList.toggle("active", index === state.activeLayer);
      const visibility = document.createElement("button");
      visibility.className = "icon-button";
      visibility.type = "button";
      visibility.textContent = state.hiddenLayers.has(index) ? "\u25CB" : "\u25CF";
      visibility.title = "Toggle preview visibility";
      visibility.addEventListener("click", (event) => {
        event.stopPropagation();
        if (state.hiddenLayers.has(index)) {
          state.hiddenLayers.delete(index);
        } else {
          state.hiddenLayers.add(index);
        }
        callbacks.onToggleVisibility();
      });
      const name = document.createElement("input");
      name.type = "text";
      name.value = layer.name;
      name.addEventListener("click", (event) => event.stopPropagation());
      name.addEventListener("change", () => {
        const value = name.value.trim();
        if (value && value !== layer.name) {
          layer.name = value;
          callbacks.onRenameLayer();
        }
      });
      const count = document.createElement("span");
      count.className = "layer-count";
      count.textContent = String(layer.cellMap.size);
      row.append(visibility, name, count);
      row.addEventListener("click", () => callbacks.onSelectLayer(index));
      el.layersList.append(row);
    });
    el.deleteLayerButton.disabled = state.map.layers.length <= 1;
  }
  function addLayer(state) {
    if (!state.map) {
      return false;
    }
    const name = window.prompt("Layer name", `Layer ${state.map.layers.length + 1}`);
    if (!name?.trim()) {
      return false;
    }
    const lastZ = state.map.layers.at(-1)?.zIndex ?? -20;
    state.map.layers.push({
      name: name.trim(),
      zIndex: lastZ + 1,
      cellMap: /* @__PURE__ */ new Map()
    });
    state.activeLayer = state.map.layers.length - 1;
    return true;
  }
  function deleteLayer(state) {
    if (!state.map || state.map.layers.length <= 1) {
      return false;
    }
    const layer = state.map.layers[state.activeLayer];
    if (!window.confirm(`Delete layer "${layer.name}"?`)) {
      return false;
    }
    state.map.layers.splice(state.activeLayer, 1);
    state.hiddenLayers.clear();
    state.activeLayer = Math.max(0, state.activeLayer - 1);
    return true;
  }

  // src/webview/mapEditor/main.ts
  (function main() {
    const vscode = acquireVsCodeApi();
    const el = queryElements();
    const state = createInitialState();
    function postEdit(label) {
      if (!state.map) {
        return;
      }
      vscode.postMessage({ type: "edit", label, map: serializeMap(state.map) });
    }
    function setTool(tool) {
      state.tool = tool;
      for (const button of el.toolButtons) {
        button.classList.toggle("active", button.dataset.tool === tool);
      }
    }
    function renderLayersPanel() {
      renderLayers(el, state, {
        onToggleVisibility: () => renderMap(el, state),
        onRenameLayer: () => postEdit("Rename map layer"),
        onSelectLayer: (index) => {
          state.activeLayer = index;
          renderLayersPanel();
        }
      });
    }
    async function initialize(map, sources) {
      state.map = toMapModel(map);
      state.activeLayer = 0;
      state.hiddenLayers.clear();
      state.selectedTile = void 0;
      el.mapStatus.textContent = `${state.map.name} \xB7 ${state.map.width}x${state.map.height} \xB7 ${state.map.tileSize}px`;
      el.mapCanvas.width = state.map.width * state.map.tileSize;
      el.mapCanvas.height = state.map.height * state.map.tileSize;
      setZoom(el, state, el.zoomInput.value);
      try {
        if (!await loadSourceImages(state, sources)) {
          return;
        }
        renderSourceOptions(el, state);
        renderLayersPanel();
        renderMap(el, state);
      } catch (error) {
        el.mapStatus.textContent = error instanceof Error ? error.message : "Unable to load TileSet";
      }
    }
    function handlePointerDown(event) {
      if (!state.map || event.button !== 0) {
        return;
      }
      const { x, y } = eventToCell(el, state, event);
      if (!isValidCell(state, x, y)) {
        return;
      }
      if (state.tool === "fill") {
        if (fillCells(state, x, y)) {
          renderMap(el, state);
          postEdit("Fill map layer");
        }
        return;
      }
      state.drawing = true;
      state.pointerId = event.pointerId;
      state.lastCell = `${x},${y}`;
      state.changedInStroke = paintCell(state, x, y, state.tool === "erase");
      el.mapCanvas.setPointerCapture(event.pointerId);
      renderMap(el, state);
    }
    function handlePointerMove(event) {
      if (!state.map) {
        return;
      }
      const { x, y } = eventToCell(el, state, event);
      el.cellStatus.textContent = `${x}, ${y}`;
      if (!state.drawing || event.pointerId !== state.pointerId || !isValidCell(state, x, y)) {
        return;
      }
      const key = `${x},${y}`;
      if (key === state.lastCell) {
        return;
      }
      state.lastCell = key;
      state.changedInStroke = paintCell(state, x, y, state.tool === "erase") || state.changedInStroke;
      renderMap(el, state);
    }
    function stopDrawing(event) {
      if (!state.drawing || event.pointerId !== state.pointerId) {
        return;
      }
      state.drawing = false;
      state.pointerId = void 0;
      state.lastCell = "";
      if (state.changedInStroke) {
        postEdit(state.tool === "erase" ? "Erase map tiles" : "Paint map tiles");
      }
      state.changedInStroke = false;
    }
    for (const button of el.toolButtons) {
      button.addEventListener("click", () => setTool(button.dataset.tool ?? "paint"));
    }
    el.sourceSelect.addEventListener("change", () => renderPalette(el, state));
    el.paletteCanvas.addEventListener("click", (event) => {
      if (selectPaletteTile(el, state, event)) {
        setTool("paint");
      }
    });
    el.zoomInput.addEventListener("input", () => setZoom(el, state, el.zoomInput.value));
    el.gridInput.addEventListener("change", () => renderMap(el, state));
    el.saveButton.addEventListener("click", () => vscode.postMessage({ type: "save" }));
    el.exportButton.addEventListener("click", () => vscode.postMessage({ type: "export" }));
    el.addLayerButton.addEventListener("click", () => {
      if (addLayer(state)) {
        renderLayersPanel();
        renderMap(el, state);
        postEdit("Add map layer");
      }
    });
    el.deleteLayerButton.addEventListener("click", () => {
      if (deleteLayer(state)) {
        renderLayersPanel();
        renderMap(el, state);
        postEdit("Delete map layer");
      }
    });
    el.mapCanvas.addEventListener("pointerdown", handlePointerDown);
    el.mapCanvas.addEventListener("pointermove", handlePointerMove);
    el.mapCanvas.addEventListener("pointerup", stopDrawing);
    el.mapCanvas.addEventListener("pointercancel", stopDrawing);
    el.mapCanvas.addEventListener("contextmenu", (event) => event.preventDefault());
    window.addEventListener("message", (event) => {
      if (event.data.type === "init") {
        void initialize(event.data.map, event.data.sources);
      }
    });
    setTool("paint");
    setZoom(el, state, el.zoomInput.value);
    vscode.postMessage({ type: "ready" });
  })();
})();
//# sourceMappingURL=map-editor.js.map
