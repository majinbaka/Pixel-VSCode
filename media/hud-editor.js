(function () {
  const vscode = acquireVsCodeApi();

  const hudCanvas = document.getElementById('hudCanvas');
  const hudContext = hudCanvas.getContext('2d');
  const hudFrame = document.getElementById('hudFrame');
  const hudStatus = document.getElementById('hudStatus');
  const pointerStatus = document.getElementById('pointerStatus');
  const zoomInput = document.getElementById('zoomInput');
  const zoomLabel = document.getElementById('zoomLabel');
  const gridInput = document.getElementById('gridInput');
  const kindSelect = document.getElementById('kindSelect');
  const addElementButton = document.getElementById('addElementButton');
  const duplicateButton = document.getElementById('duplicateButton');
  const deleteButton = document.getElementById('deleteButton');
  const saveButton = document.getElementById('saveButton');
  const exportButton = document.getElementById('exportButton');
  const elementsList = document.getElementById('elementsList');
  const nameInput = document.getElementById('nameInput');
  const textInput = document.getElementById('textInput');
  const xInput = document.getElementById('xInput');
  const yInput = document.getElementById('yInput');
  const widthInput = document.getElementById('widthInput');
  const heightInput = document.getElementById('heightInput');
  const fillInput = document.getElementById('fillInput');
  const strokeInput = document.getElementById('strokeInput');
  const textColorInput = document.getElementById('textColorInput');
  const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));

  const state = {
    hud: undefined,
    selectedId: undefined,
    zoom: 1,
    pointerId: undefined,
    drag: undefined
  };

  function cloneHud() {
    return structuredClone(state.hud);
  }

  function selectedElement() {
    return state.hud?.elements.find((item) => item.id === state.selectedId);
  }

  function uniqueId(base) {
    const normalized = base.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'element';
    const used = new Set(state.hud.elements.map((item) => item.id));
    if (!used.has(normalized)) {
      return normalized;
    }
    let index = 2;
    while (used.has(`${normalized}_${index}`)) {
      index += 1;
    }
    return `${normalized}_${index}`;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clampRect(rect) {
    const viewport = state.hud.viewport;
    rect.width = Math.max(4, Math.round(rect.width));
    rect.height = Math.max(4, Math.round(rect.height));
    rect.x = clamp(Math.round(rect.x), 0, Math.max(0, viewport.width - rect.width));
    rect.y = clamp(Math.round(rect.y), 0, Math.max(0, viewport.height - rect.height));
  }

  function setZoom(value) {
    state.zoom = clamp(Number(value) / 100 || 1, 0.5, 3);
    zoomInput.value = String(Math.round(state.zoom * 100));
    zoomLabel.value = `${Math.round(state.zoom * 100)}%`;
    if (state.hud) {
      hudCanvas.style.width = `${state.hud.viewport.width * state.zoom}px`;
      hudCanvas.style.height = `${state.hud.viewport.height * state.zoom}px`;
    }
  }

  function initialize(hud) {
    state.hud = structuredClone(hud);
    state.selectedId = state.hud.elements[0]?.id;
    hudStatus.textContent = `${state.hud.name} · ${state.hud.viewport.width}x${state.hud.viewport.height}`;
    hudCanvas.width = state.hud.viewport.width;
    hudCanvas.height = state.hud.viewport.height;
    setZoom(zoomInput.value);
    renderAll();
  }

  function postEdit(label) {
    vscode.postMessage({
      type: 'edit',
      label,
      hud: cloneHud()
    });
  }

  function renderAll() {
    renderHud();
    renderElementsList();
    renderInspector();
  }

  function renderHud() {
    if (!state.hud) {
      return;
    }
    hudContext.clearRect(0, 0, hudCanvas.width, hudCanvas.height);
    hudContext.imageSmoothingEnabled = false;
    hudContext.fillStyle = '#0b1010';
    hudContext.fillRect(0, 0, hudCanvas.width, hudCanvas.height);

    for (const element of state.hud.elements) {
      drawElement(element);
    }

    const selected = selectedElement();
    if (selected) {
      drawSelection(selected);
    }
  }

  function drawElement(element) {
    const rect = element.rect;
    hudContext.save();
    hudContext.lineWidth = 1;
    hudContext.strokeStyle = element.stroke;
    hudContext.fillStyle = element.fill;
    hudContext.textBaseline = 'middle';
    hudContext.font = `${Math.max(9, Math.min(16, Math.floor(rect.height * 0.42)))}px sans-serif`;

    if (element.kind === 'label') {
      drawText(element.text || element.name, rect, element.textColor, 'left');
      hudContext.restore();
      return;
    }

    if (element.kind === 'bar') {
      roundedRect(rect.x, rect.y, rect.width, rect.height, 2);
      hudContext.fillStyle = '#111815';
      hudContext.fill();
      hudContext.stroke();
      const value = clamp(Number(element.value ?? 70), 0, 100);
      roundedRect(rect.x + 2, rect.y + 2, Math.max(0, (rect.width - 4) * value / 100), Math.max(1, rect.height - 4), 1);
      hudContext.fillStyle = element.fill;
      hudContext.fill();
      drawText(element.text, rect, element.textColor, 'center');
      hudContext.restore();
      return;
    }

    roundedRect(rect.x, rect.y, rect.width, rect.height, element.kind === 'slot' ? 3 : 4);
    hudContext.fill();
    hudContext.stroke();

    if (element.kind === 'minimap') {
      drawMinimap(rect, element.textColor);
    } else if (element.text) {
      drawText(element.text, rect, element.textColor, 'center');
    }
    hudContext.restore();
  }

  function drawMinimap(rect, color) {
    hudContext.strokeStyle = color;
    hudContext.globalAlpha = 0.38;
    for (let x = rect.x + 16; x < rect.x + rect.width; x += 16) {
      hudContext.beginPath();
      hudContext.moveTo(x + 0.5, rect.y);
      hudContext.lineTo(x + 0.5, rect.y + rect.height);
      hudContext.stroke();
    }
    for (let y = rect.y + 16; y < rect.y + rect.height; y += 16) {
      hudContext.beginPath();
      hudContext.moveTo(rect.x, y + 0.5);
      hudContext.lineTo(rect.x + rect.width, y + 0.5);
      hudContext.stroke();
    }
    hudContext.globalAlpha = 1;
    hudContext.fillStyle = color;
    hudContext.fillRect(rect.x + rect.width * 0.48, rect.y + rect.height * 0.48, 4, 4);
  }

  function drawText(text, rect, color, align) {
    hudContext.fillStyle = color;
    hudContext.textAlign = align;
    const x = align === 'left' ? rect.x + 4 : rect.x + rect.width / 2;
    hudContext.fillText(text || '', x, rect.y + rect.height / 2, Math.max(1, rect.width - 8));
  }

  function roundedRect(x, y, width, height, radius) {
    const safeRadius = Math.min(radius, width / 2, height / 2);
    hudContext.beginPath();
    hudContext.roundRect(x + 0.5, y + 0.5, width - 1, height - 1, safeRadius);
  }

  function drawSelection(element) {
    const rect = element.rect;
    hudContext.save();
    hudContext.setLineDash([4, 3]);
    hudContext.strokeStyle = '#ffcc00';
    hudContext.lineWidth = 1;
    hudContext.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.width - 1, rect.height - 1);
    hudContext.setLineDash([]);
    for (const handle of handlesFor(rect)) {
      hudContext.fillStyle = '#ffcc00';
      hudContext.strokeStyle = '#1f1f1f';
      hudContext.fillRect(handle.x, handle.y, handle.size, handle.size);
      hudContext.strokeRect(handle.x + 0.5, handle.y + 0.5, handle.size - 1, handle.size - 1);
    }
    hudContext.restore();
  }

  function handlesFor(rect) {
    const size = Math.max(4, 8 / state.zoom);
    const half = size / 2;
    return [
      { name: 'nw', x: rect.x - half, y: rect.y - half, size },
      { name: 'ne', x: rect.x + rect.width - half, y: rect.y - half, size },
      { name: 'sw', x: rect.x - half, y: rect.y + rect.height - half, size },
      { name: 'se', x: rect.x + rect.width - half, y: rect.y + rect.height - half, size }
    ];
  }

  function renderElementsList() {
    elementsList.replaceChildren();
    if (!state.hud) {
      return;
    }
    for (let index = state.hud.elements.length - 1; index >= 0; index -= 1) {
      const element = state.hud.elements[index];
      const row = document.createElement('button');
      row.className = 'element-row';
      row.classList.toggle('active', element.id === state.selectedId);
      row.type = 'button';
      row.innerHTML = `<span>${escapeHtml(element.name)}</span><small>${element.kind}</small>`;
      row.addEventListener('click', () => {
        state.selectedId = element.id;
        renderAll();
      });
      elementsList.append(row);
    }
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function renderInspector() {
    const element = selectedElement();
    const controls = [nameInput, textInput, xInput, yInput, widthInput, heightInput, fillInput, strokeInput, textColorInput];
    for (const control of controls) {
      control.disabled = !element;
    }
    duplicateButton.disabled = !element;
    deleteButton.disabled = !element;
    if (!element) {
      nameInput.value = '';
      textInput.value = '';
      xInput.value = '';
      yInput.value = '';
      widthInput.value = '';
      heightInput.value = '';
      return;
    }
    nameInput.value = element.name;
    textInput.value = element.text ?? '';
    xInput.value = String(element.rect.x);
    yInput.value = String(element.rect.y);
    widthInput.value = String(element.rect.width);
    heightInput.value = String(element.rect.height);
    fillInput.value = element.fill;
    strokeInput.value = element.stroke;
    textColorInput.value = element.textColor;
  }

  function applyInspector(label, shouldCommit) {
    const element = selectedElement();
    if (!element) {
      return;
    }
    element.name = nameInput.value.trim() || element.name;
    element.text = textInput.value;
    element.rect.x = Number(xInput.value) || 0;
    element.rect.y = Number(yInput.value) || 0;
    element.rect.width = Number(widthInput.value) || 1;
    element.rect.height = Number(heightInput.value) || 1;
    element.fill = fillInput.value;
    element.stroke = strokeInput.value;
    element.textColor = textColorInput.value;
    clampRect(element.rect);
    renderHud();
    renderElementsList();
    if (shouldCommit) {
      postEdit(label);
    }
  }

  function eventToPoint(event) {
    const rect = hudCanvas.getBoundingClientRect();
    return {
      x: clamp(Math.round((event.clientX - rect.left) * hudCanvas.width / rect.width), 0, hudCanvas.width),
      y: clamp(Math.round((event.clientY - rect.top) * hudCanvas.height / rect.height), 0, hudCanvas.height)
    };
  }

  function hitElement(x, y) {
    for (let index = state.hud.elements.length - 1; index >= 0; index -= 1) {
      const element = state.hud.elements[index];
      const rect = element.rect;
      if (x >= rect.x && y >= rect.y && x <= rect.x + rect.width && y <= rect.y + rect.height) {
        return element;
      }
    }
    return undefined;
  }

  function hitHandle(element, x, y) {
    return handlesFor(element.rect).find((handle) =>
      x >= handle.x && y >= handle.y && x <= handle.x + handle.size && y <= handle.y + handle.size
    )?.name;
  }

  function handlePointerDown(event) {
    if (!state.hud || event.button !== 0) {
      return;
    }
    const point = eventToPoint(event);
    const selected = selectedElement();
    const handle = selected ? hitHandle(selected, point.x, point.y) : undefined;
    const element = handle ? selected : hitElement(point.x, point.y);
    state.selectedId = element?.id;
    renderAll();
    if (!element) {
      return;
    }
    state.pointerId = event.pointerId;
    hudCanvas.setPointerCapture(event.pointerId);
    state.drag = {
      mode: handle ? 'resize' : 'move',
      handle,
      start: point,
      original: { ...element.rect },
      changed: false
    };
  }

  function handlePointerMove(event) {
    if (!state.hud) {
      return;
    }
    const point = eventToPoint(event);
    pointerStatus.textContent = `${point.x}, ${point.y}`;
    if (event.pointerId !== state.pointerId || !state.drag) {
      return;
    }
    const element = selectedElement();
    if (!element) {
      return;
    }
    const dx = point.x - state.drag.start.x;
    const dy = point.y - state.drag.start.y;
    if (state.drag.mode === 'move') {
      element.rect.x = state.drag.original.x + dx;
      element.rect.y = state.drag.original.y + dy;
    } else {
      resizeRect(element.rect, state.drag.original, state.drag.handle, dx, dy);
    }
    clampRect(element.rect);
    state.drag.changed = true;
    renderHud();
    renderInspector();
  }

  function resizeRect(target, original, handle, dx, dy) {
    if (handle.includes('w')) {
      target.x = original.x + dx;
      target.width = original.width - dx;
    }
    if (handle.includes('e')) {
      target.width = original.width + dx;
    }
    if (handle.includes('n')) {
      target.y = original.y + dy;
      target.height = original.height - dy;
    }
    if (handle.includes('s')) {
      target.height = original.height + dy;
    }
  }

  function stopPointer(event) {
    if (event.pointerId !== state.pointerId) {
      return;
    }
    const drag = state.drag;
    state.pointerId = undefined;
    state.drag = undefined;
    if (drag?.changed) {
      postEdit(drag.mode === 'resize' ? 'Resize HUD element' : 'Move HUD element');
    }
  }

  function defaultElement(kind) {
    const viewport = state.hud.viewport;
    const base = {
      panel: { width: 160, height: 64, text: '', fill: '#101916', stroke: '#7a6d47', textColor: '#e8f1de' },
      label: { width: 100, height: 20, text: 'Label', fill: '#000000', stroke: '#000000', textColor: '#f4f4f4' },
      bar: { width: 130, height: 12, text: 'BAR', fill: '#e13d38', stroke: '#4f6157', textColor: '#ffffff', value: 70 },
      button: { width: 72, height: 30, text: 'Button', fill: '#25443b', stroke: '#73a890', textColor: '#f5fff8' },
      slot: { width: 32, height: 32, text: '', fill: '#263831', stroke: '#73a890', textColor: '#f5fff8' },
      minimap: { width: 128, height: 96, text: '', fill: '#0d1716', stroke: '#5f7d75', textColor: '#c9fff0' }
    }[kind];
    const id = uniqueId(kind);
    return {
      id,
      kind,
      name: `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`,
      rect: {
        x: Math.round((viewport.width - base.width) / 2),
        y: Math.round((viewport.height - base.height) / 2),
        width: base.width,
        height: base.height
      },
      text: base.text,
      fill: base.fill,
      stroke: base.stroke,
      textColor: base.textColor,
      value: base.value
    };
  }

  function addElement() {
    if (!state.hud) {
      return;
    }
    const element = defaultElement(kindSelect.value);
    state.hud.elements.push(element);
    state.selectedId = element.id;
    renderAll();
    postEdit('Add HUD element');
  }

  function duplicateElement() {
    const element = selectedElement();
    if (!element) {
      return;
    }
    const copy = structuredClone(element);
    copy.id = uniqueId(`${element.id}_copy`);
    copy.name = `${element.name} copy`;
    copy.rect.x += 10;
    copy.rect.y += 10;
    clampRect(copy.rect);
    state.hud.elements.push(copy);
    state.selectedId = copy.id;
    renderAll();
    postEdit('Duplicate HUD element');
  }

  function deleteElement() {
    const index = state.hud?.elements.findIndex((element) => element.id === state.selectedId) ?? -1;
    if (index < 0) {
      return;
    }
    state.hud.elements.splice(index, 1);
    state.selectedId = state.hud.elements[Math.min(index, state.hud.elements.length - 1)]?.id;
    renderAll();
    postEdit('Delete HUD element');
  }

  for (const button of toolButtons) {
    button.addEventListener('click', () => {
      for (const item of toolButtons) {
        item.classList.toggle('active', item === button);
      }
    });
  }
  zoomInput.addEventListener('input', () => setZoom(zoomInput.value));
  gridInput.addEventListener('change', () => hudFrame.classList.toggle('grid', gridInput.checked));
  addElementButton.addEventListener('click', addElement);
  duplicateButton.addEventListener('click', duplicateElement);
  deleteButton.addEventListener('click', deleteElement);
  saveButton.addEventListener('click', () => vscode.postMessage({ type: 'save' }));
  exportButton.addEventListener('click', () => vscode.postMessage({ type: 'export' }));

  for (const input of [nameInput, textInput, xInput, yInput, widthInput, heightInput, fillInput, strokeInput, textColorInput]) {
    input.addEventListener('input', () => applyInspector('Edit HUD element', false));
    input.addEventListener('change', () => applyInspector('Edit HUD element', true));
  }

  hudCanvas.addEventListener('pointerdown', handlePointerDown);
  hudCanvas.addEventListener('pointermove', handlePointerMove);
  hudCanvas.addEventListener('pointerup', stopPointer);
  hudCanvas.addEventListener('pointercancel', stopPointer);
  hudCanvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('message', (event) => {
    if (event.data.type === 'init') {
      initialize(event.data.hud);
    }
  });

  setZoom(zoomInput.value);
  vscode.postMessage({ type: 'ready' });
}());
