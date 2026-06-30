// @ts-check
const vscode = acquireVsCodeApi();

/** @type {import('../src/tscnPreview').TscnScene | null} */
let scene = null;
/** @type {import('../src/tscnPreview').SceneTreeNode | null} */
let tree = null;
/** @type {Map<string, {x:number, y:number, w:number, h:number}>} */
const nodeRects = new Map();
/** @type {string | null} */
let selectedPath = null;
/** @type {Map<string, HTMLImageElement>} */
const textureImages = new Map();

const filenameLabel = /** @type {HTMLElement} */ (document.getElementById('filenameLabel'));
const treeContainer = /** @type {HTMLElement} */ (document.getElementById('treeContainer'));
const sceneCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('sceneCanvas'));
const errorMessage = /** @type {HTMLElement} */ (document.getElementById('errorMessage'));
const inspectorContainer = /** @type {HTMLElement} */ (document.getElementById('inspectorContainer'));
const zoomInput = /** @type {HTMLInputElement} */ (document.getElementById('zoomInput'));
const zoomLabel = /** @type {HTMLOutputElement} */ (document.getElementById('zoomLabel'));
const showGridInput = /** @type {HTMLInputElement} */ (document.getElementById('showGridInput'));
const refreshButton = document.getElementById('refreshButton');

window.addEventListener('message', ({ data }) => {
  switch (data.type) {
    case 'init':
      errorMessage.hidden = true;
      sceneCanvas.hidden = false;
      filenameLabel.textContent = data.filename;
      scene = data.scene;
      tree = data.tree;
      renderTree();
      loadTextures(data.textureUris ?? {}).then(renderCanvas);
      renderCanvas();
      break;
    case 'error':
      errorMessage.textContent = data.message;
      errorMessage.hidden = false;
      sceneCanvas.hidden = true;
      break;
  }
});

vscode.postMessage({ type: 'ready' });

refreshButton?.addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
zoomInput.addEventListener('input', () => {
  zoomLabel.value = zoomInput.value + '%';
  renderCanvas();
});
showGridInput.addEventListener('change', renderCanvas);

// ── Scene Tree ────────────────────────────────────────────────────────────────

function renderTree() {
  treeContainer.innerHTML = '';
  if (tree) {
    treeContainer.appendChild(makeTreeEl(tree, '.'));
  }
}

/**
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {string} path
 */
function makeTreeEl(node, path) {
  const el = document.createElement('div');
  el.className = 'tree-node';

  const row = document.createElement('div');
  row.className = 'tree-row';
  row.dataset.path = path;

  const icon = document.createElement('span');
  icon.className = 'node-icon';
  icon.textContent = typeIcon(node.nodeType);

  const nameEl = document.createElement('span');
  nameEl.className = 'node-name';
  nameEl.textContent = node.name;

  const typeEl = document.createElement('span');
  typeEl.className = 'node-type';
  typeEl.textContent = node.nodeType;

  row.append(icon, nameEl, typeEl);
  row.addEventListener('click', () => selectNode(path, row, node));
  el.appendChild(row);

  if (node.children.length > 0) {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    for (const child of node.children) {
      const childPath = path === '.' ? child.name : `${path}/${child.name}`;
      childrenEl.appendChild(makeTreeEl(child, childPath));
    }
    el.appendChild(childrenEl);
  }

  return el;
}

/** @param {string} type */
function typeIcon(type) {
  const icons = /** @type {Record<string, string>} */ ({
    CanvasLayer: '⬡',
    Control: '▭',
    Panel: '▭',
    PanelContainer: '▭',
    MarginContainer: '▢',
    VBoxContainer: '⬍',
    HBoxContainer: '⬌',
    CenterContainer: '◎',
    Label: 'T',
    RichTextLabel: 'T',
    ProgressBar: '▬',
    TextureProgressBar: '▬',
    Button: '⊟',
    TextureButton: '⊟',
    CheckBox: '☐',
    CheckButton: '☐',
    HSlider: '⊢',
    VSlider: '⊢',
    LineEdit: '▯',
    TileMapLayer: '⊞',
    Node2D: '⊕',
    Node: '●',
    Unknown: '?'
  });
  return icons[type] ?? '◦';
}

/**
 * @param {string} path
 * @param {Element} rowEl
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 */
function selectNode(path, rowEl, node) {
  document.querySelectorAll('.tree-row.selected').forEach(r => r.classList.remove('selected'));
  rowEl.classList.add('selected');
  selectedPath = path;
  renderInspector(node);
  renderCanvas();
}

// ── Inspector ─────────────────────────────────────────────────────────────────

/** @param {import('../src/tscnPreview').SceneTreeNode | null} node */
function renderInspector(node) {
  inspectorContainer.innerHTML = '';
  if (!node) {
    return;
  }

  const header = document.createElement('div');
  header.className = 'inspector-name';
  header.textContent = `${node.name}  [${node.nodeType}]`;
  inspectorContainer.appendChild(header);

  if (node.instance) {
    appendInspectorRow('Instance', node.instance);
  }
  if (node.parent !== null && node.parent !== undefined) {
    appendInspectorRow('Parent', node.parent || '.');
  }
  if (node.groups) {
    appendInspectorRow('Groups', node.groups);
  }

  const entries = Object.entries(node.props);
  if (entries.length === 0 && node.connections.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'inspector-empty';
    empty.textContent = 'No properties.';
    inspectorContainer.appendChild(empty);
    return;
  }

  for (const [key, value] of entries) {
    appendInspectorRow(key, value);
  }

  if (node.connections.length > 0) {
    const sigHeader = document.createElement('div');
    sigHeader.className = 'inspector-section';
    sigHeader.textContent = 'Signals';
    inspectorContainer.appendChild(sigHeader);

    for (const conn of node.connections) {
      appendInspectorRow(conn.signal, `${conn.to}::${conn.method}`);
    }
  }
}

/** @param {string} key @param {string} value */
function appendInspectorRow(key, value) {
  const row = document.createElement('div');
  row.className = 'prop-row';

  const k = document.createElement('span');
  k.className = 'prop-key';
  k.textContent = key;

  const v = document.createElement('span');
  v.className = 'prop-val';
  v.textContent = value;

  row.append(k, v);
  inspectorContainer.appendChild(row);
}

// ── Textures ──────────────────────────────────────────────────────────────────

/** @param {Record<string, string>} textureUris */
function loadTextures(textureUris) {
  const loads = Object.entries(textureUris).map(([id, uri]) => new Promise(resolve => {
    if (textureImages.has(id)) {
      resolve(undefined);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(undefined);
    img.onerror = () => resolve(undefined);
    img.src = uri;
    textureImages.set(id, img);
  }));
  return Promise.all(loads);
}

/**
 * Resolves the texture image referenced by a node's texture property
 * (e.g. `texture`, `texture_normal`), if it has loaded successfully.
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {string} propName
 */
function nodeTextureImage(node, propName) {
  const value = node.props[propName];
  if (!value) {
    return null;
  }
  const match = value.match(/ExtResource\("([^"]+)"\)/);
  if (!match) {
    return null;
  }
  const img = textureImages.get(match[1]);
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

// ── Canvas ────────────────────────────────────────────────────────────────────

const CONTROL_TYPES = new Set([
  'Control', 'Panel', 'PanelContainer', 'MarginContainer', 'VBoxContainer', 'HBoxContainer',
  'CenterContainer', 'ScrollContainer', 'GridContainer', 'Label', 'RichTextLabel',
  'ProgressBar', 'TextureProgressBar', 'Button', 'TextureButton', 'CheckBox', 'CheckButton',
  'HSlider', 'VSlider', 'LineEdit', 'TextEdit', 'ColorRect', 'TextureRect', 'NinePatchRect',
  'ItemList', 'OptionButton', 'SpinBox', 'TabContainer'
]);

const CONTAINER_TYPES = new Set([
  'MarginContainer', 'VBoxContainer', 'HBoxContainer', 'PanelContainer',
  'CenterContainer', 'ScrollContainer', 'GridContainer'
]);

function isControlNode(node) {
  return CONTROL_TYPES.has(node.nodeType);
}

function renderCanvas() {
  if (!scene || !tree) {
    return;
  }

  nodeRects.clear();
  const ctx = /** @type {CanvasRenderingContext2D} */ (sceneCanvas.getContext('2d'));
  const zoom = parseInt(zoomInput.value) / 100;

  if (tree.nodeType === 'CanvasLayer') {
    renderHudScene(ctx, zoom);
  } else if (isControlNode(tree)) {
    renderControlScene(ctx, zoom);
  } else if (scene.nodes.some(n => n.nodeType === 'TileMapLayer')) {
    renderMapScene(ctx, zoom);
  } else {
    renderGenericScene(ctx);
  }
}

// ── HUD Scene (CanvasLayer + flat offset children, from Pixel HUD exporter) ──

/** @param {CanvasRenderingContext2D} ctx @param {number} zoom */
function renderHudScene(ctx, zoom) {
  const rootControl = tree?.children.find(c => c.nodeType === 'Control');
  let vpW = 640;
  let vpH = 360;

  if (rootControl) {
    const or = parseFloat(rootControl.props['offset_right'] ?? '0');
    const ob = parseFloat(rootControl.props['offset_bottom'] ?? '0');
    if (or > 0) {
      vpW = or;
    }
    if (ob > 0) {
      vpH = ob;
    }
  }

  sceneCanvas.width = Math.round(vpW * zoom);
  sceneCanvas.height = Math.round(vpH * zoom);

  ctx.save();
  ctx.scale(zoom, zoom);

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, vpW, vpH);

  if (showGridInput.checked) {
    drawGrid(ctx, vpW, vpH, 32);
  }

  const elements = rootControl ? rootControl.children : [];
  for (const node of elements) {
    const rect = offsetRect(node);
    const nodePath = rootControl ? `${rootControl.name}/${node.name}` : node.name;
    nodeRects.set(nodePath, {
      x: rect.x * zoom,
      y: rect.y * zoom,
      w: rect.w * zoom,
      h: rect.h * zoom
    });
    drawUiNode(ctx, node, rect, selectedPath === nodePath);
  }

  ctx.restore();
}

/** @param {import('../src/tscnPreview').SceneTreeNode} node */
function offsetRect(node) {
  const ol = parseFloat(node.props['offset_left'] ?? '0');
  const ot = parseFloat(node.props['offset_top'] ?? '0');
  const or2 = parseFloat(node.props['offset_right'] ?? '0');
  const ob = parseFloat(node.props['offset_bottom'] ?? '0');

  if (ol !== 0 || ot !== 0 || or2 !== 0 || ob !== 0) {
    return { x: ol, y: ot, w: or2 - ol, h: ob - ot };
  }

  const pos = parseVec2(node.props['position'] ?? 'Vector2(0, 0)');
  const size = parseVec2(node.props['size'] ?? 'Vector2(64, 32)');
  return { x: pos.x, y: pos.y, w: size.x, h: size.y };
}

// ── Control Scene (generic container-based UI, e.g. settings_panel.tscn) ─────

/** @param {CanvasRenderingContext2D} ctx @param {number} zoom */
function renderControlScene(ctx, zoom) {
  const root = /** @type {import('../src/tscnPreview').SceneTreeNode} */ (tree);
  const rootSize = controlMinSize(root);
  // A full-rect anchored root (anchors_preset=15) with no declared size is a
  // full-screen UI (e.g. a splash/menu scene) — default to a viewport size
  // instead of the tiny natural size of its leaf controls.
  const isFullRectRoot = root.props['anchors_preset'] === '15';
  const vpW = isFullRectRoot ? Math.max(rootSize.w, 640) : Math.max(rootSize.w, 64);
  const vpH = isFullRectRoot ? Math.max(rootSize.h, 360) : Math.max(rootSize.h, 64);

  sceneCanvas.width = Math.round(vpW * zoom);
  sceneCanvas.height = Math.round(vpH * zoom);

  ctx.save();
  ctx.scale(zoom, zoom);

  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, vpW, vpH);

  if (showGridInput.checked) {
    drawGrid(ctx, vpW, vpH, 32);
  }

  layoutAndDraw(ctx, root, '.', { x: 0, y: 0, w: vpW, h: vpH }, zoom);

  ctx.restore();
}

/**
 * Recursively lays out a Control node within the given rect (Godot-style box containers)
 * and draws it, then recurses into children.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {string} nodePath
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @param {number} zoom
 */
function layoutAndDraw(ctx, node, nodePath, rect, zoom) {
  nodeRects.set(nodePath, {
    x: rect.x * zoom,
    y: rect.y * zoom,
    w: rect.w * zoom,
    h: rect.h * zoom
  });

  drawUiNode(ctx, node, rect, selectedPath === nodePath);

  const childRects = layoutChildren(node, rect);
  for (const { child, rect: childRect } of childRects) {
    const childPath = nodePath === '.' ? child.name : `${nodePath}/${child.name}`;
    layoutAndDraw(ctx, child, childPath, childRect, zoom);
  }
}

/**
 * Computes child rects for a single Control node, mimicking Godot's box/margin containers.
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {{x:number, y:number, w:number, h:number}} rect
 */
function layoutChildren(node, rect) {
  const children = node.children.filter(isControlNode);
  if (children.length === 0) {
    return [];
  }

  if (node.nodeType === 'MarginContainer') {
    const ml = parseFloat(node.props['theme_override_constants/margin_left'] ?? '0');
    const mt = parseFloat(node.props['theme_override_constants/margin_top'] ?? '0');
    const mr = parseFloat(node.props['theme_override_constants/margin_right'] ?? '0');
    const mb = parseFloat(node.props['theme_override_constants/margin_bottom'] ?? '0');
    const inner = { x: rect.x + ml, y: rect.y + mt, w: rect.w - ml - mr, h: rect.h - mt - mb };
    return [{ child: children[0], rect: inner }];
  }

  if (node.nodeType === 'PanelContainer' || node.nodeType === 'CenterContainer') {
    // Single child fills the available rect (with a small inset for panel border feel)
    return [{ child: children[0], rect: { ...rect } }];
  }

  if (node.nodeType === 'Control' || node.nodeType === 'ScrollContainer') {
    // Plain Control: children are free-floating and typically anchored to fill
    // the parent (anchors_preset=15), so give each child the full parent rect
    // unless it declares its own offsets/position/size.
    return children.map(child => ({ child, rect: controlChildRect(child, rect) }));
  }

  if (node.nodeType === 'VBoxContainer') {
    const sep = parseFloat(node.props['theme_override_constants/separation'] ?? '4');
    const sizes = children.map(c => controlMinSize(c).h);
    const fixedTotal = sizes.reduce((a, b) => a + b, 0) + sep * (children.length - 1);
    const stretchChildren = children.filter(c => parseInt(c.props['size_flags_vertical'] ?? '1', 10) & 2);
    const extra = Math.max(0, rect.h - fixedTotal);
    const extraPerStretch = stretchChildren.length > 0 ? extra / stretchChildren.length : 0;

    let y = rect.y;
    const result = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const stretches = parseInt(child.props['size_flags_vertical'] ?? '1', 10) & 2;
      const h = sizes[i] + (stretches ? extraPerStretch : 0);
      result.push({ child, rect: { x: rect.x, y, w: rect.w, h } });
      y += h + sep;
    }
    return result;
  }

  if (node.nodeType === 'HBoxContainer') {
    const sep = parseFloat(node.props['theme_override_constants/separation'] ?? '4');
    const sizes = children.map(c => controlMinSize(c).w);
    const fixedTotal = sizes.reduce((a, b) => a + b, 0) + sep * (children.length - 1);
    const stretchChildren = children.filter(c => parseInt(c.props['size_flags_horizontal'] ?? '1', 10) & 2);
    const extra = Math.max(0, rect.w - fixedTotal);
    const extraPerStretch = stretchChildren.length > 0 ? extra / stretchChildren.length : 0;

    let x = rect.x;
    const result = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const stretches = parseInt(child.props['size_flags_horizontal'] ?? '1', 10) & 2;
      const w = sizes[i] + (stretches ? extraPerStretch : 0);
      result.push({ child, rect: { x, y: rect.y, w, h: rect.h } });
      x += w + sep;
    }
    return result;
  }

  // Unknown/leaf container: stack children using their own min size at the top-left
  return children.map(child => ({ child, rect: { ...rect, ...controlMinSize(child) } }));
}

/**
 * Resolves a child's rect within its parent, honoring anchors_preset=15 (full
 * rect) and explicit offsets when present; otherwise falls back to the
 * child's own natural min size positioned at the top-left of the parent rect.
 * @param {import('../src/tscnPreview').SceneTreeNode} child
 * @param {{x:number, y:number, w:number, h:number}} parentRect
 */
function controlChildRect(child, parentRect) {
  const anchorsPreset = child.props['anchors_preset'];
  const hasOffsets = ['offset_left', 'offset_top', 'offset_right', 'offset_bottom']
    .some(k => child.props[k] !== undefined);

  if (anchorsPreset === '15') {
    return { ...parentRect };
  }

  if (hasOffsets) {
    const rect = offsetRect(child);
    return {
      x: parentRect.x + rect.x,
      y: parentRect.y + rect.y,
      w: rect.w,
      h: rect.h
    };
  }

  return { ...parentRect, ...controlMinSize(child) };
}

/**
 * Computes the natural (minimum) size of a Control node, recursing into containers.
 * Falls back to declared custom_minimum_size / size when present.
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @returns {{w:number, h:number}}
 */
function controlMinSize(node) {
  const declared = parseVec2(node.props['custom_minimum_size'] ?? 'Vector2(0, 0)');
  const children = node.children.filter(isControlNode);

  let contentW = declared.x;
  let contentH = declared.y;

  if (children.length > 0) {
    if (node.nodeType === 'MarginContainer') {
      const ml = parseFloat(node.props['theme_override_constants/margin_left'] ?? '0');
      const mt = parseFloat(node.props['theme_override_constants/margin_top'] ?? '0');
      const mr = parseFloat(node.props['theme_override_constants/margin_right'] ?? '0');
      const mb = parseFloat(node.props['theme_override_constants/margin_bottom'] ?? '0');
      const childSize = controlMinSize(children[0]);
      contentW = Math.max(contentW, childSize.w + ml + mr);
      contentH = Math.max(contentH, childSize.h + mt + mb);
    } else if (node.nodeType === 'VBoxContainer') {
      const sep = parseFloat(node.props['theme_override_constants/separation'] ?? '4');
      let w = 0;
      let h = 0;
      for (const child of children) {
        const size = controlMinSize(child);
        w = Math.max(w, size.w);
        h += size.h;
      }
      h += sep * (children.length - 1);
      contentW = Math.max(contentW, w);
      contentH = Math.max(contentH, h);
    } else if (node.nodeType === 'HBoxContainer') {
      const sep = parseFloat(node.props['theme_override_constants/separation'] ?? '4');
      let w = 0;
      let h = 0;
      for (const child of children) {
        const size = controlMinSize(child);
        w += size.w;
        h = Math.max(h, size.h);
      }
      w += sep * (children.length - 1);
      contentW = Math.max(contentW, w);
      contentH = Math.max(contentH, h);
    } else if (node.nodeType === 'Control' || node.nodeType === 'ScrollContainer') {
      // Plain Control: take the largest declared/natural size among children,
      // since they're typically full-rect anchored rather than stacked.
      for (const child of children) {
        const size = controlMinSize(child);
        contentW = Math.max(contentW, size.w);
        contentH = Math.max(contentH, size.h);
      }
    } else {
      // PanelContainer / CenterContainer / unknown: wrap single/first child
      const size = controlMinSize(children[0]);
      contentW = Math.max(contentW, size.w);
      contentH = Math.max(contentH, size.h);
    }
  }

  if (contentW <= 0 || contentH <= 0) {
    const fallback = leafMinSize(node);
    contentW = contentW > 0 ? contentW : fallback.w;
    contentH = contentH > 0 ? contentH : fallback.h;
  }

  return { w: contentW, h: contentH };
}

/**
 * Estimated natural size for leaf controls that have no children to derive size from.
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 */
function leafMinSize(node) {
  const fontSize = parseFloat(node.props['theme_override_font_sizes/font_size'] ?? '14');
  const text = nodeDisplayText(node) ?? '';

  switch (node.nodeType) {
    case 'Label':
    case 'RichTextLabel': {
      const lineCount = Math.max(1, text.split('\n').length);
      const longestLine = text.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
      return { w: Math.max(20, longestLine * fontSize * 0.55), h: lineCount * (fontSize + 6) };
    }
    case 'Button':
    case 'TextureButton':
    case 'CheckBox':
    case 'CheckButton':
    case 'OptionButton':
      return { w: Math.max(36, text.length * fontSize * 0.6 + 24), h: fontSize + 14 };
    case 'HSlider':
      return { w: 120, h: 20 };
    case 'VSlider':
      return { w: 20, h: 120 };
    case 'LineEdit':
    case 'SpinBox':
      return { w: 100, h: fontSize + 12 };
    case 'TextEdit':
      return { w: 160, h: 80 };
    case 'ColorRect':
    case 'TextureRect':
    case 'NinePatchRect':
      return { w: 32, h: 32 };
    default:
      return { w: 32, h: 24 };
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @param {boolean} isSelected
 */
const INVISIBLE_LAYOUT_TYPES = new Set([
  'Control', 'MarginContainer', 'VBoxContainer', 'HBoxContainer', 'CenterContainer', 'ScrollContainer'
]);

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {{x:number, y:number, w:number, h:number}} rect
 * @param {boolean} isSelected
 */
function drawUiNode(ctx, node, rect, isSelected) {
  const { x, y, w, h } = rect;
  if (w <= 0 || h <= 0) {
    return;
  }

  const isLayoutOnly = INVISIBLE_LAYOUT_TYPES.has(node.nodeType) && !findStyleBox(node, 'panel');

  const texturePropName = node.nodeType === 'TextureRect' || node.nodeType === 'NinePatchRect'
    ? 'texture'
    : node.nodeType === 'TextureButton'
      ? 'texture_normal'
      : null;
  const textureImg = texturePropName ? nodeTextureImage(node, texturePropName) : null;

  if (textureImg) {
    ctx.drawImage(textureImg, x, y, w, h);
  } else if (!isLayoutOnly) {
    ctx.fillStyle = nodeBgColor(node);
    ctx.fillRect(x, y, w, h);
  }

  // ProgressBar fill portion
  if (node.nodeType === 'ProgressBar' || node.nodeType === 'TextureProgressBar') {
    const pct = clamp(parseFloat(node.props['value'] ?? '70'), 0, 100) / 100;
    ctx.fillStyle = progressFillColor(node);
    ctx.fillRect(x + 1, y + 1, Math.max(0, (w - 2) * pct), h - 2);
  }

  // HSlider/VSlider track + handle
  if (node.nodeType === 'HSlider' || node.nodeType === 'VSlider') {
    drawSlider(ctx, node, rect);
  }

  // CheckBox/CheckButton box
  if (node.nodeType === 'CheckBox' || node.nodeType === 'CheckButton') {
    drawCheckbox(ctx, node, rect);
  }

  // Border (skip for pure layout containers and textured nodes with their own art)
  if ((!isLayoutOnly && !textureImg) || isSelected) {
    ctx.strokeStyle = isSelected ? '#f0c040' : nodeBorderColor(node);
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  // Label text
  const label = nodeDisplayText(node);
  if (label && node.nodeType !== 'HSlider' && node.nodeType !== 'VSlider') {
    const textOffsetX = node.nodeType === 'CheckBox' || node.nodeType === 'CheckButton' ? h + 4 : 4;
    const fontSize = clamp(parseFloat(node.props['theme_override_font_sizes/font_size'] ?? '0') || h * 0.5, 9, 16);
    ctx.fillStyle = nodeTextColor(node);
    ctx.font = `${fontSize}px monospace`;
    ctx.textAlign = node.nodeType === 'Label' || node.nodeType === 'RichTextLabel' ? 'left' : 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const lines = label.split('\n');
    const lineHeight = fontSize + 4;
    const startY = y + h / 2 - ((lines.length - 1) * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
      const lx = ctx.textAlign === 'center' ? x + w / 2 : x + textOffsetX;
      ctx.fillText(lines[i], lx, startY + i * lineHeight, w - textOffsetX - 4);
    }
    ctx.restore();
  }

  // Selection overlay
  if (isSelected) {
    ctx.fillStyle = 'rgba(240, 192, 64, 0.12)';
    ctx.fillRect(x, y, w, h);
  }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {{x:number, y:number, w:number, h:number}} rect
 */
function drawSlider(ctx, node, rect) {
  const { x, y, w, h } = rect;
  const minVal = parseFloat(node.props['min_value'] ?? '0');
  const maxVal = parseFloat(node.props['max_value'] ?? '100');
  const value = parseFloat(node.props['value'] ?? String(minVal));
  const pct = maxVal > minVal ? clamp((value - minVal) / (maxVal - minVal), 0, 1) : 0;

  const trackY = y + h / 2 - 2;
  ctx.fillStyle = 'rgba(80, 90, 85, 0.6)';
  ctx.fillRect(x, trackY, w, 4);

  ctx.fillStyle = '#6fae7e';
  ctx.fillRect(x, trackY, w * pct, 4);

  const handleX = x + w * pct;
  ctx.fillStyle = '#e8f1de';
  ctx.beginPath();
  ctx.arc(handleX, y + h / 2, 5, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {{x:number, y:number, w:number, h:number}} rect
 */
function drawCheckbox(ctx, node, rect) {
  const { x, y, h } = rect;
  const boxSize = Math.min(h - 4, 16);
  const boxY = y + (h - boxSize) / 2;
  const checked = node.props['button_pressed'] === 'true';

  ctx.fillStyle = 'rgba(20, 30, 26, 0.9)';
  ctx.fillRect(x, boxY, boxSize, boxSize);
  ctx.strokeStyle = '#73a890';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, boxY + 0.5, boxSize - 1, boxSize - 1);

  if (checked) {
    ctx.strokeStyle = '#f5fff8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 3, boxY + boxSize / 2);
    ctx.lineTo(x + boxSize / 2, boxY + boxSize - 3);
    ctx.lineTo(x + boxSize - 3, boxY + 3);
    ctx.stroke();
  }
}

/** @param {import('../src/tscnPreview').SceneTreeNode} node */
function nodeBgColor(node) {
  const subRes = findStyleBox(node, 'panel')
    ?? findStyleBox(node, 'background')
    ?? findStyleBox(node, 'normal');
  if (subRes?.props['bg_color']) {
    return godotColor(subRes.props['bg_color']);
  }
  const defaults = /** @type {Record<string, string>} */ ({
    Panel: 'rgba(16, 25, 22, 0.92)',
    PanelContainer: 'rgba(16, 25, 22, 0.92)',
    Label: 'rgba(0, 0, 0, 0)',
    RichTextLabel: 'rgba(0, 0, 0, 0)',
    ProgressBar: 'rgba(17, 24, 21, 0.9)',
    Button: 'rgba(37, 68, 59, 0.9)',
    TextureButton: 'rgba(37, 68, 59, 0.9)',
    CheckBox: 'rgba(0, 0, 0, 0)',
    CheckButton: 'rgba(0, 0, 0, 0)',
    HSlider: 'rgba(0, 0, 0, 0)',
    VSlider: 'rgba(0, 0, 0, 0)',
    LineEdit: 'rgba(10, 14, 12, 0.85)',
    OptionButton: 'rgba(37, 68, 59, 0.9)'
  });
  return defaults[node.nodeType] ?? 'rgba(40, 40, 40, 0.8)';
}

/** @param {import('../src/tscnPreview').SceneTreeNode} node */
function nodeBorderColor(node) {
  const subRes = findStyleBox(node, 'panel')
    ?? findStyleBox(node, 'background')
    ?? findStyleBox(node, 'normal');
  if (subRes?.props['border_color']) {
    return godotColor(subRes.props['border_color']);
  }
  return 'rgba(100, 100, 100, 0.6)';
}

/** @param {import('../src/tscnPreview').SceneTreeNode} node */
function progressFillColor(node) {
  const subRes = findStyleBox(node, 'fill');
  if (subRes?.props['bg_color']) {
    return godotColor(subRes.props['bg_color']);
  }
  return '#8b2222';
}

/** @param {import('../src/tscnPreview').SceneTreeNode} node */
function nodeTextColor(node) {
  const colorProp = node.props['theme_override_colors/font_color'];
  if (colorProp) {
    return godotColor(colorProp);
  }
  return 'rgba(230, 230, 230, 0.85)';
}

const TEXT_FALLBACK_TYPES = new Set(['Button', 'TextureButton', 'CheckBox', 'CheckButton', 'OptionButton']);

/** @param {import('../src/tscnPreview').SceneTreeNode} node */
function nodeDisplayText(node) {
  const textProp = node.props['text'];
  if (textProp !== undefined) {
    return unquote(textProp);
  }
  return TEXT_FALLBACK_TYPES.has(node.nodeType) ? node.name : '';
}

/** @param {string} value */
function unquote(value) {
  return value.replace(/^"/, '').replace(/"$/, '');
}

/**
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {string} styleKey
 */
function findStyleBox(node, styleKey) {
  const value = node.props[`theme_override_styles/${styleKey}`];
  if (!value) {
    return null;
  }
  const match = value.match(/SubResource\("([^"]+)"\)/);
  if (!match) {
    return null;
  }
  return scene?.subResources.find(r => r.id === match[1]) ?? null;
}

// ── Map Scene ─────────────────────────────────────────────────────────────────

/** @param {CanvasRenderingContext2D} ctx @param {number} zoom */
function renderMapScene(ctx, zoom) {
  const layerCount = scene?.nodes.filter(n => n.nodeType === 'TileMapLayer').length ?? 0;
  const cols = 32;
  const rows = 24;
  const tileSize = 16;

  sceneCanvas.width = Math.round(cols * tileSize * zoom);
  sceneCanvas.height = Math.round(rows * tileSize * zoom);

  ctx.save();
  ctx.scale(zoom, zoom);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, cols * tileSize, rows * tileSize);

  if (showGridInput.checked) {
    drawGrid(ctx, cols * tileSize, rows * tileSize, tileSize);
  }

  ctx.fillStyle = '#7799bb';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `TileMapLayer × ${layerCount} — open .pixelmap.json to edit`,
    (cols * tileSize) / 2,
    (rows * tileSize) / 2
  );

  ctx.restore();
}

// ── Generic Scene ─────────────────────────────────────────────────────────────

/** @param {CanvasRenderingContext2D} ctx */
function renderGenericScene(ctx) {
  sceneCanvas.width = 480;
  sceneCanvas.height = 240;
  ctx.fillStyle = '#1e1e1e';
  ctx.fillRect(0, 0, 480, 240);
  ctx.fillStyle = '#888';
  ctx.font = '13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('No visual preview for this scene type.', 240, 120);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {number} step
 */
function drawGrid(ctx, width, height, step) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= width; gx += step) {
    ctx.beginPath();
    ctx.moveTo(gx + 0.5, 0);
    ctx.lineTo(gx + 0.5, height);
    ctx.stroke();
  }
  for (let gy = 0; gy <= height; gy += step) {
    ctx.beginPath();
    ctx.moveTo(0, gy + 0.5);
    ctx.lineTo(width, gy + 0.5);
    ctx.stroke();
  }
}

/** @param {string} value */
function godotColor(value) {
  const match = value.match(/Color\(([^)]+)\)/);
  if (!match) {
    return '#333';
  }
  const [r = 0, g = 0, b = 0, a = 1] = match[1].split(',').map(s => parseFloat(s.trim()));
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a.toFixed(3)})`;
}

/** @param {string} value */
function parseVec2(value) {
  const match = value.match(/Vector2\(([^)]+)\)/);
  if (!match) {
    return { x: 0, y: 0 };
  }
  const [x = 0, y = 0] = match[1].split(',').map(s => parseFloat(s.trim()));
  return { x, y };
}

/**
 * @param {number} v
 * @param {number} min
 * @param {number} max
 */
function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Click on canvas → select node
sceneCanvas.addEventListener('click', e => {
  const bounds = sceneCanvas.getBoundingClientRect();
  const px = e.clientX - bounds.left;
  const py = e.clientY - bounds.top;

  // Iterate in reverse to prefer top-most (last drawn) nodes
  const entries = [...nodeRects.entries()].reverse();
  for (const [nodePath, nr] of entries) {
    if (px >= nr.x && px < nr.x + nr.w && py >= nr.y && py < nr.y + nr.h) {
      const rowEl = treeContainer.querySelector(`[data-path="${CSS.escape(nodePath)}"]`);
      if (rowEl && tree) {
        const node = findNodeByPath(tree, nodePath, '.');
        if (node) {
          selectNode(nodePath, rowEl, node);
          rowEl.scrollIntoView({ block: 'nearest' });
        }
      }
      break;
    }
  }
});

/**
 * @param {import('../src/tscnPreview').SceneTreeNode} node
 * @param {string} targetPath
 * @param {string} currentPath
 * @returns {import('../src/tscnPreview').SceneTreeNode | null}
 */
function findNodeByPath(node, targetPath, currentPath) {
  if (currentPath === targetPath) {
    return node;
  }
  for (const child of node.children) {
    const childPath = currentPath === '.' ? child.name : `${currentPath}/${child.name}`;
    const found = findNodeByPath(child, targetPath, childPath);
    if (found) {
      return found;
    }
  }
  return null;
}
