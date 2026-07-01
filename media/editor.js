"use strict";
(() => {
  // src/webview/editor/dom.ts
  function byId(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing element #${id}`);
    }
    return element;
  }
  function queryElements() {
    const canvas = byId("pixelCanvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Canvas 2D context unavailable");
    }
    return {
      canvas,
      ctx,
      canvasFrame: byId("canvasFrame"),
      workspace: byId("workspace"),
      fileStatus: byId("fileStatus"),
      colorInput: byId("colorInput"),
      brushSizeInput: byId("brushSize"),
      brushSizeLabel: byId("brushSizeLabel"),
      zoomInput: byId("zoom"),
      zoomLabel: byId("zoomLabel"),
      fitZoomButton: byId("fitZoomButton"),
      guideSizeSelect: byId("guideSize"),
      canvasSizeDisplay: byId("canvasSizeDisplay"),
      resizeHandles: Array.from(document.querySelectorAll(".resize-handle")),
      saveButton: byId("saveButton"),
      toggleGridButton: byId("toggleGrid"),
      toggleSnapButton: byId("toggleSnap"),
      paletteSelect: byId("paletteSelect"),
      paletteSwatches: byId("paletteSwatches"),
      layersList: byId("layersList"),
      addLayerButton: byId("addLayerButton"),
      duplicateLayerButton: byId("duplicateLayerButton"),
      deleteLayerButton: byId("deleteLayerButton"),
      moveLayerUpButton: byId("moveLayerUpButton"),
      moveLayerDownButton: byId("moveLayerDownButton"),
      mergeLayerDownButton: byId("mergeLayerDownButton"),
      layerOpacityInput: byId("layerOpacity"),
      layerOpacityLabel: byId("layerOpacityLabel"),
      toolButtons: Array.from(document.querySelectorAll("[data-tool]")),
      hitboxOverlay: byId("hitboxOverlay"),
      autoTraceButton: byId("autoTraceButton"),
      clearHitboxButton: byId("clearHitboxButton"),
      saveHitboxButton: byId("saveHitboxButton"),
      hitboxPointCount: byId("hitboxPointCount"),
      cursorOverlay: byId("cursorOverlay"),
      rigOverlay: byId("rigOverlay"),
      rigAngleInput: byId("rigAngle"),
      resetRigButton: byId("resetRigButton"),
      addPivotButton: byId("addPivotButton"),
      pivotsList: byId("pivotsList"),
      selectionOverlay: byId("selectionOverlay"),
      selectionDragCanvas: byId("selectionDragCanvas"),
      selectionMoveButton: byId("selectionMoveButton"),
      selectionCutButton: byId("selectionCutButton"),
      selectionClearButton: byId("selectionClearButton")
    };
  }

  // src/webview/editor/state.ts
  function createInitialState() {
    return {
      tool: "pencil",
      drawing: false,
      lastKey: "",
      pointerId: void 0,
      zoom: 16,
      ready: false,
      layers: [],
      activeLayerId: void 0,
      nextLayerId: 1,
      nextPivotId: 1,
      guideSize: 1,
      snapToGuide: false,
      pendingCollisionPoints: void 0,
      collision: {
        points: [],
        draggingIndex: -1
      },
      rig: {
        dragMode: void 0
      },
      selection: {
        active: false,
        shape: "rect",
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        lassoPoints: [],
        isDrawing: false,
        startX: 0,
        startY: 0,
        isDraggingContent: false,
        dragOffX: 0,
        dragOffY: 0,
        floatCanvas: null,
        floatX: 0,
        floatY: 0
      }
    };
  }
  function isSelectionTool(tool) {
    return tool === "select-rect" || tool === "select-ellipse" || tool === "select-lasso";
  }

  // src/webview/editor/canvasCore.ts
  function createLayerCanvas(width, height) {
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = width;
    layerCanvas.height = height;
    return layerCanvas;
  }
  function createPivot(state, x, y, name) {
    const id = `pivot-${state.nextPivotId++}`;
    return { id, name: name || `Pivot ${state.nextPivotId - 1}`, x, y, angle: 0 };
  }
  function createLayer(el, state, name, sourceCanvas) {
    const layerCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
    if (sourceCanvas) {
      layerCanvas.getContext("2d").drawImage(sourceCanvas, 0, 0);
    }
    const defaultPivot = createPivot(state, layerCanvas.width / 2, layerCanvas.height / 2);
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
  function getActiveLayer(state) {
    return state.layers.find((layer) => layer.id === state.activeLayerId) ?? state.layers[state.layers.length - 1];
  }
  function getActivePivot(state, layer) {
    const target = layer ?? getActiveLayer(state);
    if (!target) {
      return void 0;
    }
    return target.rig.pivots.find((pivot) => pivot.id === target.rig.activePivotId) ?? target.rig.pivots[0];
  }
  function updateCanvasDisplaySize(el, state) {
    el.canvas.style.width = `${el.canvas.width * state.zoom}px`;
    el.canvas.style.height = `${el.canvas.height * state.zoom}px`;
    el.canvasFrame.style.setProperty("--pixel-size", `${state.zoom}px`);
    el.canvasFrame.style.setProperty("--guide-size", `${state.zoom * state.guideSize}px`);
  }
  function setCanvasSize(el, state, width, height) {
    el.canvas.width = width;
    el.canvas.height = height;
    el.canvasSizeDisplay.textContent = `${width} x ${height}`;
    updateCanvasDisplaySize(el, state);
  }
  function renderComposite(el, state) {
    el.ctx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    el.ctx.imageSmoothingEnabled = false;
    for (const layer of state.layers) {
      if (!layer.visible || layer.opacity <= 0) {
        continue;
      }
      el.ctx.save();
      el.ctx.globalAlpha = layer.opacity;
      for (const pivot of layer.rig.pivots) {
        if (pivot.angle) {
          el.ctx.translate(pivot.x, pivot.y);
          el.ctx.rotate(pivot.angle);
          el.ctx.translate(-pivot.x, -pivot.y);
        }
      }
      el.ctx.drawImage(layer.canvas, 0, 0);
      el.ctx.restore();
    }
  }
  function loadImageElement(dataUri) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.src = dataUri;
    });
  }
  function nextIdNumber(id) {
    const match = /-(\d+)$/.exec(id ?? "");
    return match ? Number(match[1]) : 0;
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
  function serializeLayerState(state) {
    return {
      layers: state.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        opacity: layer.opacity,
        dataUri: layer.canvas.toDataURL("image/png"),
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
  function commit(vscode, el, state, label) {
    if (!state.ready) {
      return;
    }
    renderComposite(el, state);
    vscode.postMessage({
      type: "edit",
      label,
      dataUri: el.canvas.toDataURL("image/png"),
      layerState: serializeLayerState(state)
    });
  }

  // src/webview/editor/autoTrace.ts
  function convexHull(rawPoints) {
    const unique = Array.from(new Map(rawPoints.map((point) => [`${point.x}:${point.y}`, point])).values()).sort((first, second) => first.x === second.x ? first.y - second.y : first.x - second.x);
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
  function traceAlphaHull(ctx, width, height) {
    const image = ctx.getImageData(0, 0, width, height).data;
    const alphaAt = (x, y) => image[(y * width + x) * 4 + 3];
    const candidates = [];
    for (let y = 0; y < height; y += 1) {
      let left = -1;
      let right = -1;
      for (let x = 0; x < width; x += 1) {
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
    for (let x = 0; x < width; x += 1) {
      let top = -1;
      let bottom = -1;
      for (let y = 0; y < height; y += 1) {
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
    return convexHull(candidates);
  }

  // src/webview/editor/hitbox.ts
  function flattenHitboxPoints(el, state) {
    const halfWidth = el.canvas.width / 2;
    const halfHeight = el.canvas.height / 2;
    const flat = [];
    for (const point of state.collision.points) {
      flat.push(point.x - halfWidth, point.y - halfHeight);
    }
    return flat;
  }
  function hitboxPointThreshold(state) {
    return 8 / state.zoom;
  }
  function findNearestHitboxPointIndex(state, x, y, threshold) {
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
  function handleHitboxPointerDown(el, state, x, y) {
    const nearestIndex = findNearestHitboxPointIndex(state, x, y, hitboxPointThreshold(state));
    if (nearestIndex >= 0) {
      state.collision.draggingIndex = nearestIndex;
    } else {
      state.collision.points.push({ x, y });
      state.collision.draggingIndex = state.collision.points.length - 1;
    }
    renderHitboxOverlay(el, state);
  }
  function handleHitboxPointerMove(el, state, point) {
    if (state.collision.draggingIndex < 0) {
      return;
    }
    state.collision.points[state.collision.draggingIndex] = point;
    renderHitboxOverlay(el, state);
  }
  function deleteNearestHitboxPoint(el, state, x, y) {
    const index = findNearestHitboxPointIndex(state, x, y, hitboxPointThreshold(state));
    if (index >= 0) {
      state.collision.points.splice(index, 1);
      renderHitboxOverlay(el, state);
    }
  }
  function autoTraceHitbox(el, state) {
    if (!state.ready) {
      return;
    }
    const hull = traceAlphaHull(el.ctx, el.canvas.width, el.canvas.height);
    if (hull.length < 3) {
      return;
    }
    state.collision.points = hull;
    state.collision.draggingIndex = -1;
    renderHitboxOverlay(el, state);
  }
  function renderHitboxOverlay(el, state) {
    if (!state.ready) {
      return;
    }
    el.hitboxOverlay.setAttribute("viewBox", `0 0 ${el.canvas.width} ${el.canvas.height}`);
    el.hitboxOverlay.replaceChildren();
    el.hitboxPointCount.textContent = String(state.collision.points.length);
    const points = state.collision.points;
    if (points.length >= 2) {
      const polygon = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
      polygon.setAttribute("class", "hitbox-polygon");
      el.hitboxOverlay.append(polygon);
    }
    const radius = Math.max(0.5, 5 / state.zoom);
    for (const point of points) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", String(radius));
      circle.setAttribute("class", "hitbox-point");
      el.hitboxOverlay.append(circle);
    }
  }

  // src/webview/editor/selection.ts
  function clearSelection(el, state) {
    state.selection.active = false;
    state.selection.isDrawing = false;
    state.selection.isDraggingContent = false;
    state.selection.lassoPoints = [];
    state.selection.floatCanvas = null;
    renderSelectionOverlay(el, state);
    updateSelectionButtons(el, state);
  }
  function updateSelectionButtons(el, state) {
    const has = state.selection.active;
    el.selectionMoveButton.disabled = !has;
    el.selectionCutButton.disabled = !has;
    el.selectionClearButton.disabled = !has;
  }
  function applySelectionMask(state, targetCtx) {
    const sel = state.selection;
    targetCtx.save();
    if (sel.shape === "lasso") {
      if (sel.lassoPoints.length < 2) {
        targetCtx.restore();
        return;
      }
      targetCtx.beginPath();
      targetCtx.moveTo(sel.lassoPoints[0].x, sel.lassoPoints[0].y);
      for (let i = 1; i < sel.lassoPoints.length; i++) {
        targetCtx.lineTo(sel.lassoPoints[i].x, sel.lassoPoints[i].y);
      }
      targetCtx.closePath();
    } else if (sel.shape === "ellipse") {
      const cx = sel.x + sel.w / 2;
      const cy = sel.y + sel.h / 2;
      targetCtx.beginPath();
      targetCtx.ellipse(cx, cy, Math.abs(sel.w / 2), Math.abs(sel.h / 2), 0, 0, Math.PI * 2);
    } else {
      targetCtx.beginPath();
      targetCtx.rect(sel.x, sel.y, sel.w, sel.h);
    }
    targetCtx.clip();
  }
  function selectionBounds(state) {
    const sel = state.selection;
    if (sel.shape === "lasso") {
      if (!sel.lassoPoints.length) return { x1: 0, y1: 0, x2: 0, y2: 0 };
      let x12 = Infinity, y12 = Infinity, x22 = -Infinity, y22 = -Infinity;
      for (const p of sel.lassoPoints) {
        if (p.x < x12) x12 = p.x;
        if (p.y < y12) y12 = p.y;
        if (p.x > x22) x22 = p.x;
        if (p.y > y22) y22 = p.y;
      }
      return { x1: Math.floor(x12), y1: Math.floor(y12), x2: Math.ceil(x22), y2: Math.ceil(y22) };
    }
    const x1 = sel.w >= 0 ? sel.x : sel.x + sel.w;
    const y1 = sel.h >= 0 ? sel.y : sel.y + sel.h;
    const x2 = sel.w >= 0 ? sel.x + sel.w : sel.x;
    const y2 = sel.h >= 0 ? sel.y + sel.h : sel.y;
    return { x1: Math.floor(x1), y1: Math.floor(y1), x2: Math.ceil(x2), y2: Math.ceil(y2) };
  }
  function pointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect = yi > y !== yj > y && x < (xj - xi) * (y - yi) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }
  function isInsideSelection(state, x, y) {
    const sel = state.selection;
    if (!sel.active) return false;
    if (sel.shape === "lasso") {
      return pointInPolygon(x, y, sel.lassoPoints);
    }
    const b = selectionBounds(state);
    if (x < b.x1 || x >= b.x2 || y < b.y1 || y >= b.y2) return false;
    if (sel.shape === "ellipse") {
      const cx = (b.x1 + b.x2) / 2;
      const cy = (b.y1 + b.y2) / 2;
      const rx = (b.x2 - b.x1) / 2;
      const ry = (b.y2 - b.y1) / 2;
      if (rx <= 0 || ry <= 0) return false;
      return ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    }
    return true;
  }
  function liftSelection(el, state) {
    const sel = state.selection;
    if (sel.floatCanvas) return;
    const layer = getActiveLayer(state);
    if (!layer) return;
    const bounds = selectionBounds(state);
    const floatW = bounds.x2 - bounds.x1;
    const floatH = bounds.y2 - bounds.y1;
    if (floatW <= 0 || floatH <= 0) return;
    const floatCanvas = createLayerCanvas(floatW, floatH);
    const floatCtx = floatCanvas.getContext("2d");
    floatCtx.save();
    floatCtx.translate(-bounds.x1, -bounds.y1);
    applySelectionMask(state, floatCtx);
    floatCtx.drawImage(layer.canvas, 0, 0);
    floatCtx.restore();
    const layerCtx = layer.canvas.getContext("2d", { willReadFrequently: true });
    layerCtx.save();
    applySelectionMask(state, layerCtx);
    layerCtx.clearRect(0, 0, el.canvas.width, el.canvas.height);
    layerCtx.restore();
    sel.floatCanvas = floatCanvas;
    sel.floatX = bounds.x1;
    sel.floatY = bounds.y1;
    renderComposite(el, state);
  }
  function flattenSelection(el, state, onCommit) {
    const sel = state.selection;
    if (!sel.floatCanvas) {
      clearSelection(el, state);
      return;
    }
    const layer = getActiveLayer(state);
    if (!layer) {
      clearSelection(el, state);
      return;
    }
    const layerCtx = layer.canvas.getContext("2d", { willReadFrequently: true });
    layerCtx.drawImage(sel.floatCanvas, sel.floatX, sel.floatY);
    renderComposite(el, state);
    onCommit("Move selection");
    clearSelection(el, state);
  }
  function cutSelection(el, state, onCommit) {
    const sel = state.selection;
    if (!sel.active) return;
    if (!sel.floatCanvas) liftSelection(el, state);
    sel.floatCanvas = null;
    renderComposite(el, state);
    onCommit("Cut selection");
    clearSelection(el, state);
  }
  function startMoveSelection(el, state, x, y) {
    const sel = state.selection;
    if (!sel.active) return false;
    if (!isInsideSelection(state, x, y)) return false;
    if (!sel.floatCanvas) liftSelection(el, state);
    sel.isDraggingContent = true;
    sel.dragOffX = x - sel.floatX;
    sel.dragOffY = y - sel.floatY;
    return true;
  }
  function moveDragSelection(el, state, x, y) {
    const sel = state.selection;
    if (!sel.isDraggingContent) return;
    const newX = x - sel.dragOffX;
    const newY = y - sel.dragOffY;
    const dx = newX - sel.floatX;
    const dy = newY - sel.floatY;
    sel.floatX = newX;
    sel.floatY = newY;
    if (sel.shape === "lasso") {
      for (const p of sel.lassoPoints) {
        p.x += dx;
        p.y += dy;
      }
    } else {
      sel.x += dx;
      sel.y += dy;
    }
    renderSelectionOverlay(el, state);
    renderCompositeWithFloat(el, state);
  }
  function renderCompositeWithFloat(el, state) {
    renderComposite(el, state);
    const sel = state.selection;
    if (sel.floatCanvas) {
      el.ctx.save();
      el.ctx.imageSmoothingEnabled = false;
      el.ctx.drawImage(sel.floatCanvas, sel.floatX, sel.floatY);
      el.ctx.restore();
    }
  }
  function handleSelectionPointerDown(el, state, onCommit, x, y) {
    const sel = state.selection;
    if (sel.active && isInsideSelection(state, x, y)) {
      startMoveSelection(el, state, x, y);
      return;
    }
    if (sel.active) flattenSelection(el, state, onCommit);
    sel.isDrawing = true;
    sel.startX = x;
    sel.startY = y;
    sel.active = false;
    sel.lassoPoints = sel.shape === "lasso" ? [{ x, y }] : [];
    sel.x = x;
    sel.y = y;
    sel.w = 0;
    sel.h = 0;
    renderSelectionOverlay(el, state);
    updateSelectionButtons(el, state);
  }
  function handleSelectionPointerMove(el, state, x, y) {
    const sel = state.selection;
    if (sel.isDraggingContent) {
      moveDragSelection(el, state, x, y);
      return;
    }
    if (!sel.isDrawing) return;
    if (sel.shape === "lasso") {
      sel.lassoPoints.push({ x, y });
    } else {
      sel.w = x - sel.startX;
      sel.h = y - sel.startY;
    }
    renderSelectionOverlay(el, state);
  }
  function handleSelectionPointerUp(el, state, x, y) {
    const sel = state.selection;
    if (sel.isDraggingContent) {
      sel.isDraggingContent = false;
      return;
    }
    if (!sel.isDrawing) return;
    sel.isDrawing = false;
    if (sel.shape === "lasso") {
      if (sel.lassoPoints.length >= 3) {
        sel.active = true;
      } else {
        sel.lassoPoints = [];
      }
    } else {
      sel.w = x - sel.startX;
      sel.h = y - sel.startY;
      sel.active = Math.abs(sel.w) >= 1 && Math.abs(sel.h) >= 1;
    }
    renderSelectionOverlay(el, state);
    updateSelectionButtons(el, state);
  }
  function renderSelectionOverlay(el, state) {
    if (!state.ready) return;
    el.selectionOverlay.setAttribute("viewBox", `0 0 ${el.canvas.width} ${el.canvas.height}`);
    el.selectionOverlay.replaceChildren();
    if (el.selectionDragCanvas) {
      el.selectionDragCanvas.hidden = true;
    }
    const sel = state.selection;
    if (!sel.active && !sel.isDrawing) return;
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", "marching-ants");
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    const pxSize = Math.max(0.5, 1 / state.zoom);
    pattern.setAttribute("width", String(pxSize * 4));
    pattern.setAttribute("height", String(pxSize * 4));
    const r1 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r1.setAttribute("width", String(pxSize * 4));
    r1.setAttribute("height", String(pxSize * 4));
    r1.setAttribute("fill", "white");
    const r2 = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r2.setAttribute("width", String(pxSize * 2));
    r2.setAttribute("height", String(pxSize * 2));
    r2.setAttribute("fill", "black");
    pattern.append(r1, r2);
    defs.append(pattern);
    el.selectionOverlay.append(defs);
    const strokeW = Math.max(0.5, 1 / state.zoom);
    if (sel.shape === "lasso" && sel.lassoPoints.length >= 2) {
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      poly.setAttribute("points", sel.lassoPoints.map((p) => `${p.x},${p.y}`).join(" "));
      poly.setAttribute("fill", "rgba(100,160,255,0.15)");
      poly.setAttribute("stroke", "url(#marching-ants)");
      poly.setAttribute("stroke-width", String(strokeW));
      if (sel.active) {
        poly.setAttribute("points", sel.lassoPoints.map((p) => `${p.x},${p.y}`).join(" ") + ` ${sel.lassoPoints[0].x},${sel.lassoPoints[0].y}`);
      }
      el.selectionOverlay.append(poly);
    } else if (sel.shape === "ellipse") {
      const b = selectionBounds(state);
      const cx = (b.x1 + b.x2) / 2;
      const cy = (b.y1 + b.y2) / 2;
      const rx = (b.x2 - b.x1) / 2;
      const ry = (b.y2 - b.y1) / 2;
      if (rx > 0 && ry > 0) {
        const ellipse = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
        ellipse.setAttribute("cx", String(cx));
        ellipse.setAttribute("cy", String(cy));
        ellipse.setAttribute("rx", String(rx));
        ellipse.setAttribute("ry", String(ry));
        ellipse.setAttribute("fill", "rgba(100,160,255,0.15)");
        ellipse.setAttribute("stroke", "url(#marching-ants)");
        ellipse.setAttribute("stroke-width", String(strokeW));
        el.selectionOverlay.append(ellipse);
      }
    } else if (sel.shape === "rect") {
      const b = selectionBounds(state);
      const w = b.x2 - b.x1;
      const h = b.y2 - b.y1;
      if (w > 0 && h > 0) {
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(b.x1));
        rect.setAttribute("y", String(b.y1));
        rect.setAttribute("width", String(w));
        rect.setAttribute("height", String(h));
        rect.setAttribute("fill", "rgba(100,160,255,0.15)");
        rect.setAttribute("stroke", "url(#marching-ants)");
        rect.setAttribute("stroke-width", String(strokeW));
        el.selectionOverlay.append(rect);
      }
    }
    if (sel.floatCanvas) {
      el.selectionDragCanvas.width = sel.floatCanvas.width;
      el.selectionDragCanvas.height = sel.floatCanvas.height;
      el.selectionDragCanvas.getContext("2d").drawImage(sel.floatCanvas, 0, 0);
      el.selectionDragCanvas.style.left = `${sel.floatX * state.zoom}px`;
      el.selectionDragCanvas.style.top = `${sel.floatY * state.zoom}px`;
      el.selectionDragCanvas.style.width = `${sel.floatCanvas.width * state.zoom}px`;
      el.selectionDragCanvas.style.height = `${sel.floatCanvas.height * state.zoom}px`;
      el.selectionDragCanvas.hidden = false;
    }
  }

  // src/webview/editor/rig.ts
  function rigHandleDistance(el) {
    return Math.max(el.canvas.width, el.canvas.height) / 4;
  }
  function rigHandlePosition(el, pivot) {
    const distance = rigHandleDistance(el);
    return {
      x: pivot.x + Math.cos(pivot.angle - Math.PI / 2) * distance,
      y: pivot.y + Math.sin(pivot.angle - Math.PI / 2) * distance
    };
  }
  function renderPivotsPanel(el, state) {
    if (!el.pivotsList) {
      return;
    }
    el.pivotsList.replaceChildren();
    const layer = getActiveLayer(state);
    if (!layer) {
      return;
    }
    for (const pivot of layer.rig.pivots) {
      const item = document.createElement("div");
      item.className = "pivot-item";
      item.classList.toggle("active", pivot.id === layer.rig.activePivotId);
      item.dataset.pivotId = pivot.id;
      const nameSpan = document.createElement("span");
      nameSpan.className = "pivot-name";
      nameSpan.textContent = pivot.name;
      item.append(nameSpan);
      if (layer.rig.pivots.length > 1) {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "icon-button pivot-delete";
        deleteButton.title = "Delete pivot";
        deleteButton.setAttribute("aria-label", "Delete pivot");
        deleteButton.textContent = "\xD7";
        deleteButton.addEventListener("click", (event) => {
          event.stopPropagation();
          deletePivot(el, state, pivot.id);
        });
        item.append(deleteButton);
      }
      item.addEventListener("click", () => setActivePivot(el, state, pivot.id));
      el.pivotsList.append(item);
    }
  }
  function setActivePivot(el, state, pivotId) {
    const layer = getActiveLayer(state);
    if (!layer || !layer.rig.pivots.some((pivot) => pivot.id === pivotId)) {
      return;
    }
    layer.rig.activePivotId = pivotId;
    updateRigAngleInput(el, state, layer);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
  }
  function addPivot(el, state) {
    const layer = getActiveLayer(state);
    if (!layer) {
      return;
    }
    const pivot = createPivot(state, el.canvas.width / 2, el.canvas.height / 2);
    layer.rig.pivots.push(pivot);
    layer.rig.activePivotId = pivot.id;
    updateRigAngleInput(el, state, layer);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
  }
  function deletePivot(el, state, pivotId) {
    const layer = getActiveLayer(state);
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
    updateRigAngleInput(el, state, layer);
    renderComposite(el, state);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
  }
  function renderRigOverlay(el, state) {
    if (!state.ready) {
      return;
    }
    el.rigOverlay.setAttribute("viewBox", `0 0 ${el.canvas.width} ${el.canvas.height}`);
    el.rigOverlay.replaceChildren();
    if (state.tool !== "rig") {
      return;
    }
    const layer = getActiveLayer(state);
    if (!layer) {
      return;
    }
    const pivotRadius = Math.max(0.75, 6 / state.zoom);
    const handleRadius = Math.max(0.5, 4 / state.zoom);
    for (const pivot of layer.rig.pivots) {
      const isActive = pivot.id === layer.rig.activePivotId;
      const handle = rigHandlePosition(el, pivot);
      if (isActive) {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", String(pivot.x));
        line.setAttribute("y1", String(pivot.y));
        line.setAttribute("x2", String(handle.x));
        line.setAttribute("y2", String(handle.y));
        line.setAttribute("class", "rig-line");
        el.rigOverlay.append(line);
        const handlePoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        handlePoint.setAttribute("cx", String(handle.x));
        handlePoint.setAttribute("cy", String(handle.y));
        handlePoint.setAttribute("r", String(handleRadius));
        handlePoint.setAttribute("class", "rig-handle");
        el.rigOverlay.append(handlePoint);
      }
      const pivotPoint = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      pivotPoint.setAttribute("cx", String(pivot.x));
      pivotPoint.setAttribute("cy", String(pivot.y));
      pivotPoint.setAttribute("r", String(pivotRadius));
      pivotPoint.setAttribute("class", isActive ? "rig-pivot" : "rig-pivot inactive");
      el.rigOverlay.append(pivotPoint);
    }
  }
  function updateRigAngleInput(el, state, layer) {
    const pivot = getActivePivot(state, layer);
    const degrees = pivot ? Math.round(pivot.angle * 180 / Math.PI) : 0;
    el.rigAngleInput.value = String(degrees);
  }
  function setRigAngleFromInput(el, state, onCommit) {
    const layer = getActiveLayer(state);
    const pivot = getActivePivot(state, layer);
    if (!layer || !pivot) {
      return;
    }
    const degrees = Number(el.rigAngleInput.value) || 0;
    pivot.angle = degrees * Math.PI / 180;
    renderComposite(el, state);
    renderRigOverlay(el, state);
    if (bakeRigRotation(el, state, layer)) {
      onCommit("Rotate layer");
    }
  }
  function handleRigPointerDown(el, state, x, y) {
    const layer = getActiveLayer(state);
    const pivot = getActivePivot(state, layer);
    if (!layer || !pivot) {
      return;
    }
    const threshold = 10 / state.zoom;
    const handle = rigHandlePosition(el, pivot);
    const distanceToHandle = Math.hypot(handle.x - x, handle.y - y);
    const distanceToPivot = Math.hypot(pivot.x - x, pivot.y - y);
    const otherPivot = layer.rig.pivots.find(
      (candidate) => candidate.id !== pivot.id && Math.hypot(candidate.x - x, candidate.y - y) <= threshold
    );
    if (distanceToHandle <= threshold) {
      state.rig.dragMode = "rotate";
    } else if (distanceToPivot <= threshold) {
      state.rig.dragMode = "pivot";
    } else if (otherPivot) {
      setActivePivot(el, state, otherPivot.id);
      return;
    } else {
      state.rig.dragMode = "rotate";
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      pivot.angle = Math.atan2(dy, dx) + Math.PI / 2;
      updateRigAngleInput(el, state, layer);
      renderComposite(el, state);
    }
    renderRigOverlay(el, state);
  }
  function handleRigPointerMove(el, state, x, y) {
    if (!state.rig.dragMode) {
      return;
    }
    const layer = getActiveLayer(state);
    const pivot = getActivePivot(state, layer);
    if (!layer || !pivot) {
      return;
    }
    if (state.rig.dragMode === "pivot") {
      pivot.x = x;
      pivot.y = y;
    } else if (state.rig.dragMode === "rotate") {
      const dx = x - pivot.x;
      const dy = y - pivot.y;
      pivot.angle = Math.atan2(dy, dx) + Math.PI / 2;
      updateRigAngleInput(el, state, layer);
    }
    renderComposite(el, state);
    renderRigOverlay(el, state);
  }
  function bakeRigRotation(el, state, layer) {
    if (!layer || !layer.rig.pivots.some((pivot) => pivot.angle)) {
      return false;
    }
    const rotated = createLayerCanvas(el.canvas.width, el.canvas.height);
    const rotatedCtx = rotated.getContext("2d");
    rotatedCtx.imageSmoothingEnabled = false;
    rotatedCtx.save();
    for (const pivot of layer.rig.pivots) {
      if (pivot.angle) {
        rotatedCtx.translate(pivot.x, pivot.y);
        rotatedCtx.rotate(pivot.angle);
        rotatedCtx.translate(-pivot.x, -pivot.y);
      }
    }
    rotatedCtx.drawImage(layer.canvas, 0, 0);
    rotatedCtx.restore();
    layer.canvas = rotated;
    for (const pivot of layer.rig.pivots) {
      pivot.angle = 0;
    }
    updateRigAngleInput(el, state, layer);
    renderComposite(el, state);
    renderRigOverlay(el, state);
    return true;
  }
  function resetRig(el, state) {
    const layer = getActiveLayer(state);
    const pivot = getActivePivot(state, layer);
    if (!layer || !pivot) {
      return;
    }
    pivot.x = el.canvas.width / 2;
    pivot.y = el.canvas.height / 2;
    pivot.angle = 0;
    updateRigAngleInput(el, state, layer);
    renderComposite(el, state);
    renderRigOverlay(el, state);
  }

  // src/webview/editor/drawing.ts
  function clampCanvasNumber(value, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    return Math.max(1, Math.min(1024, parsed));
  }
  function eventToPixel(el, event) {
    const rect = el.canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * el.canvas.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * el.canvas.height);
    return {
      x: Math.max(0, Math.min(el.canvas.width - 1, x)),
      y: Math.max(0, Math.min(el.canvas.height - 1, y))
    };
  }
  function unrotatePoint(x, y, pivot, angle) {
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const dx = x - pivot.x;
    const dy = y - pivot.y;
    return {
      x: pivot.x + (dx * cos - dy * sin),
      y: pivot.y + (dx * sin + dy * cos)
    };
  }
  function eventToLayerPixel(el, state, event, layer) {
    const rect = el.canvas.getBoundingClientRect();
    let x = (event.clientX - rect.left) / rect.width * el.canvas.width;
    let y = (event.clientY - rect.top) / rect.height * el.canvas.height;
    if (layer) {
      const pivots = layer.rig.pivots;
      for (let i = pivots.length - 1; i >= 0; i -= 1) {
        const pivot = pivots[i];
        if (pivot.angle) {
          ({ x, y } = unrotatePoint(x, y, pivot, pivot.angle));
        }
      }
    }
    let px, py;
    if (state.snapToGuide && state.guideSize > 1) {
      px = Math.floor(x / state.guideSize) * state.guideSize;
      py = Math.floor(y / state.guideSize) * state.guideSize;
    } else {
      px = Math.floor(x);
      py = Math.floor(y);
    }
    if (px < 0 || py < 0 || px >= el.canvas.width || py >= el.canvas.height) {
      return null;
    }
    return { x: px, y: py };
  }
  function hideCursorOverlay(el) {
    el.cursorOverlay.hidden = true;
  }
  function updateCursorOverlay(el, state, x, y) {
    if (state.tool === "hitbox" || state.tool === "rig" || isSelectionTool(state.tool)) {
      hideCursorOverlay(el);
      return;
    }
    if (state.snapToGuide && state.guideSize > 1) {
      const left2 = x;
      const top2 = y;
      const width2 = Math.min(state.guideSize, el.canvas.width - left2);
      const height2 = Math.min(state.guideSize, el.canvas.height - top2);
      el.cursorOverlay.style.left = `${left2 * state.zoom}px`;
      el.cursorOverlay.style.top = `${top2 * state.zoom}px`;
      el.cursorOverlay.style.width = `${width2 * state.zoom}px`;
      el.cursorOverlay.style.height = `${height2 * state.zoom}px`;
      el.cursorOverlay.hidden = false;
      return;
    }
    const size = state.tool === "picker" || state.tool === "fill" ? 1 : Number(el.brushSizeInput.value) || 1;
    const half = Math.floor(size / 2);
    const left = Math.max(0, x - half);
    const top = Math.max(0, y - half);
    const width = Math.min(size, el.canvas.width - left);
    const height = Math.min(size, el.canvas.height - top);
    el.cursorOverlay.style.left = `${left * state.zoom}px`;
    el.cursorOverlay.style.top = `${top * state.zoom}px`;
    el.cursorOverlay.style.width = `${width * state.zoom}px`;
    el.cursorOverlay.style.height = `${height * state.zoom}px`;
    el.cursorOverlay.hidden = false;
  }
  function hexToRgb(hex) {
    const normalized = hex.replace("#", "");
    return {
      r: parseInt(normalized.slice(0, 2), 16),
      g: parseInt(normalized.slice(2, 4), 16),
      b: parseInt(normalized.slice(4, 6), 16),
      a: 255
    };
  }
  function rgbToHex(r, g, b) {
    return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }
  function drawAt(el, state, x, y) {
    const layer = getActiveLayer(state);
    if (!layer) {
      return;
    }
    const layerCtx = layer.canvas.getContext("2d", { willReadFrequently: true });
    let left, top, width, height;
    if (state.snapToGuide && state.guideSize > 1) {
      left = x;
      top = y;
      width = Math.min(state.guideSize, el.canvas.width - left);
      height = Math.min(state.guideSize, el.canvas.height - top);
    } else {
      const size = Number(el.brushSizeInput.value);
      const half = Math.floor(size / 2);
      left = Math.max(0, x - half);
      top = Math.max(0, y - half);
      width = Math.min(size, el.canvas.width - left);
      height = Math.min(size, el.canvas.height - top);
    }
    if (state.tool === "eraser") {
      layerCtx.clearRect(left, top, width, height);
    } else {
      layerCtx.fillStyle = el.colorInput.value;
      layerCtx.fillRect(left, top, width, height);
    }
    renderComposite(el, state);
  }
  function pickColor(el, state, setTool, x, y) {
    const [r, g, b, a] = el.ctx.getImageData(x, y, 1, 1).data;
    if (a === 0) {
      setTool("eraser");
      return;
    }
    el.colorInput.value = rgbToHex(r, g, b);
    setTool("pencil");
  }
  function sameColor(data, index, target) {
    return data[index] === target.r && data[index + 1] === target.g && data[index + 2] === target.b && data[index + 3] === target.a;
  }
  function setPixel(data, index, color) {
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
  }
  function floodFill(el, state, startX, startY) {
    const layer = getActiveLayer(state);
    if (!layer) {
      return;
    }
    const layerCtx = layer.canvas.getContext("2d", { willReadFrequently: true });
    const image = layerCtx.getImageData(0, 0, el.canvas.width, el.canvas.height);
    const data = image.data;
    const startIndex = (startY * el.canvas.width + startX) * 4;
    const target = {
      r: data[startIndex],
      g: data[startIndex + 1],
      b: data[startIndex + 2],
      a: data[startIndex + 3]
    };
    const replacement = state.tool === "eraser" ? { r: 0, g: 0, b: 0, a: 0 } : hexToRgb(el.colorInput.value);
    if (target.r === replacement.r && target.g === replacement.g && target.b === replacement.b && target.a === replacement.a) {
      return;
    }
    const stack = [[startX, startY]];
    while (stack.length) {
      const point = stack.pop();
      if (!point) {
        continue;
      }
      const [x, y] = point;
      if (x < 0 || y < 0 || x >= el.canvas.width || y >= el.canvas.height) {
        continue;
      }
      const index = (y * el.canvas.width + x) * 4;
      if (!sameColor(data, index, target)) {
        continue;
      }
      setPixel(data, index, replacement);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    layerCtx.putImageData(image, 0, 0);
    renderComposite(el, state);
  }

  // src/webview/editor/layersPanel.ts
  function addLayer(el, state, callbacks) {
    const layer = createLayer(el, state, `Layer ${state.layers.length + 1}`);
    state.layers.push(layer);
    state.activeLayerId = layer.id;
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
    callbacks.onCommit("Add layer");
  }
  function duplicateLayer(el, state, callbacks) {
    const activeLayer = getActiveLayer(state);
    if (!activeLayer) {
      return;
    }
    const layer = createLayer(el, state, `${activeLayer.name} copy`, activeLayer.canvas);
    const index = state.layers.findIndex((item) => item.id === activeLayer.id);
    state.layers.splice(index + 1, 0, layer);
    state.activeLayerId = layer.id;
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
    callbacks.onCommit("Duplicate layer");
  }
  function deleteLayer(el, state, callbacks) {
    if (state.layers.length <= 1) {
      return;
    }
    const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    if (index < 0) {
      return;
    }
    state.layers.splice(index, 1);
    state.activeLayerId = state.layers[Math.max(0, index - 1)].id;
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
    callbacks.onCommit("Delete layer");
  }
  function drawLayerInto(targetCtx, layer) {
    targetCtx.save();
    targetCtx.globalAlpha = layer.opacity;
    for (const pivot of layer.rig.pivots) {
      if (pivot.angle) {
        targetCtx.translate(pivot.x, pivot.y);
        targetCtx.rotate(pivot.angle);
        targetCtx.translate(-pivot.x, -pivot.y);
      }
    }
    targetCtx.drawImage(layer.canvas, 0, 0);
    targetCtx.restore();
  }
  function mergeLayerDown(el, state, callbacks) {
    const index = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    if (index <= 0) {
      return;
    }
    const activeLayer = state.layers[index];
    const belowLayer = state.layers[index - 1];
    const mergedCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
    const mergedCtx = mergedCanvas.getContext("2d");
    mergedCtx.imageSmoothingEnabled = false;
    drawLayerInto(mergedCtx, belowLayer);
    drawLayerInto(mergedCtx, activeLayer);
    belowLayer.canvas = mergedCanvas;
    belowLayer.opacity = 1;
    belowLayer.rig.pivots.forEach((pivot) => {
      pivot.angle = 0;
    });
    state.layers.splice(index, 1);
    state.activeLayerId = belowLayer.id;
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    renderPivotsPanel(el, state);
    renderRigOverlay(el, state);
    callbacks.onCommit("Merge layer down");
  }
  function moveLayer(el, state, callbacks, offset) {
    const index = state.layers.findIndex((layer2) => layer2.id === state.activeLayerId);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= state.layers.length) {
      return;
    }
    const [layer] = state.layers.splice(index, 1);
    state.layers.splice(nextIndex, 0, layer);
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    callbacks.onCommit(offset > 0 ? "Move layer up" : "Move layer down");
  }
  function toggleLayerVisibility(el, state, callbacks, id) {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) {
      return;
    }
    layer.visible = !layer.visible;
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    callbacks.onCommit(layer.visible ? "Show layer" : "Hide layer");
  }
  function setActiveLayerOpacity(el, state, callbacks, value, shouldCommit) {
    const layer = getActiveLayer(state);
    if (!layer) {
      return;
    }
    const opacity = Math.max(0, Math.min(100, Number(value) || 0));
    layer.opacity = opacity / 100;
    el.layerOpacityInput.value = String(opacity);
    el.layerOpacityLabel.value = `${opacity}%`;
    renderLayersPanel(el, state, callbacks);
    renderComposite(el, state);
    if (shouldCommit) {
      callbacks.onCommit("Change layer opacity");
    }
  }
  function renameLayer(el, state, callbacks, id, value) {
    const layer = state.layers.find((item) => item.id === id);
    if (!layer) {
      return;
    }
    const name = value.trim();
    if (!name || name === layer.name) {
      renderLayersPanel(el, state, callbacks);
      return;
    }
    layer.name = name;
    renderLayersPanel(el, state, callbacks);
  }
  function renderLayersPanel(el, state, callbacks) {
    el.layersList.replaceChildren();
    const activeLayer = getActiveLayer(state);
    const activeOpacity = activeLayer ? Math.round(activeLayer.opacity * 100) : 100;
    el.layerOpacityInput.value = String(activeOpacity);
    el.layerOpacityLabel.value = `${activeOpacity}%`;
    for (let index = state.layers.length - 1; index >= 0; index -= 1) {
      const layer = state.layers[index];
      const row = document.createElement("div");
      row.className = "layer-row";
      row.classList.toggle("active", layer.id === state.activeLayerId);
      row.dataset.layerId = layer.id;
      const visibility = document.createElement("button");
      visibility.className = "icon-button layer-visibility";
      visibility.type = "button";
      visibility.title = layer.visible ? "Hide layer" : "Show layer";
      visibility.setAttribute("aria-label", visibility.title);
      visibility.textContent = layer.visible ? "\u{1F441}\uFE0F" : "\u{1F6AB}";
      visibility.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleLayerVisibility(el, state, callbacks, layer.id);
      });
      const name = document.createElement("input");
      name.className = "layer-name-input";
      name.type = "text";
      name.value = layer.name;
      name.title = "Layer name";
      name.addEventListener("click", (event) => event.stopPropagation());
      name.addEventListener("change", () => renameLayer(el, state, callbacks, layer.id, name.value));
      name.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          name.blur();
        }
      });
      const opacity = document.createElement("span");
      opacity.className = "layer-opacity";
      opacity.textContent = `${Math.round(layer.opacity * 100)}%`;
      row.append(visibility, name, opacity);
      row.addEventListener("click", () => callbacks.onSetActiveLayer(layer.id));
      el.layersList.append(row);
    }
    el.deleteLayerButton.disabled = state.layers.length <= 1;
    const activeIndex = state.layers.findIndex((layer) => layer.id === state.activeLayerId);
    el.moveLayerDownButton.disabled = activeIndex <= 0;
    el.moveLayerUpButton.disabled = activeIndex === -1 || activeIndex >= state.layers.length - 1;
    el.mergeLayerDownButton.disabled = activeIndex <= 0;
  }

  // src/webview/editor/palettes.ts
  var palettes = [
    {
      name: "PICO-8",
      colors: [
        "#000000",
        "#1d2b53",
        "#7e2553",
        "#008751",
        "#ab5236",
        "#5f574f",
        "#c2c3c7",
        "#fff1e8",
        "#ff004d",
        "#ffa300",
        "#ffec27",
        "#00e436",
        "#29adff",
        "#83769c",
        "#ff77a8",
        "#ffccaa"
      ]
    },
    {
      name: "Game Boy",
      colors: ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"]
    },
    {
      name: "DawnBringer 16",
      colors: [
        "#140c1c",
        "#442434",
        "#30346d",
        "#4e4a4e",
        "#854c30",
        "#346524",
        "#d04648",
        "#757161",
        "#597dce",
        "#d27d2c",
        "#8595a1",
        "#6daa2c",
        "#d2aa99",
        "#6dc2ca",
        "#dad45e",
        "#deeed6"
      ]
    },
    {
      name: "AAP-16",
      colors: [
        "#070708",
        "#332222",
        "#774433",
        "#cc8855",
        "#993311",
        "#dd7711",
        "#ffdd55",
        "#ffffcc",
        "#55aa44",
        "#115522",
        "#44bbcc",
        "#2255aa",
        "#553388",
        "#9955aa",
        "#dd99bb",
        "#ffffff"
      ]
    },
    {
      name: "UI Basics",
      colors: [
        "#111827",
        "#374151",
        "#6b7280",
        "#d1d5db",
        "#ffffff",
        "#ef4444",
        "#f97316",
        "#f59e0b",
        "#eab308",
        "#22c55e",
        "#06b6d4",
        "#3b82f6",
        "#6366f1",
        "#8b5cf6",
        "#ec4899",
        "#f43f5e"
      ]
    }
  ];

  // src/webview/editor/palettePanel.ts
  function renderPalettes(el, onColorPicked) {
    for (const palette of palettes) {
      const option = document.createElement("option");
      option.value = palette.name;
      option.textContent = palette.name;
      el.paletteSelect.append(option);
    }
    el.paletteSelect.value = palettes[0].name;
    renderPaletteSwatches(el, onColorPicked);
  }
  function renderPaletteSwatches(el, onColorPicked) {
    const palette = palettes.find((item) => item.name === el.paletteSelect.value) ?? palettes[0];
    el.paletteSwatches.replaceChildren();
    for (const color of palette.colors) {
      const swatch = document.createElement("button");
      swatch.className = "color-swatch";
      swatch.type = "button";
      swatch.title = color;
      swatch.setAttribute("aria-label", color);
      swatch.style.backgroundColor = color;
      swatch.classList.toggle("active", color.toLowerCase() === el.colorInput.value.toLowerCase());
      swatch.addEventListener("click", () => {
        el.colorInput.value = color;
        onColorPicked();
        renderPaletteSwatches(el, onColorPicked);
      });
      el.paletteSwatches.append(swatch);
    }
  }

  // src/webview/editor/resizeHandles.ts
  function initResizeHandles(el, state, applyCanvasResize) {
    let dragEdge = null;
    let startX = 0, startY = 0;
    let startW = 0, startH = 0;
    let pending = null;
    function snapToGuide(v) {
      if (!state.snapToGuide || state.guideSize <= 1) return v;
      return Math.max(state.guideSize, Math.round(v / state.guideSize) * state.guideSize);
    }
    function calcResize(e) {
      const dx = Math.round((e.clientX - startX) / state.zoom);
      const dy = Math.round((e.clientY - startY) / state.zoom);
      let newW = startW, newH = startH, offX = 0, offY = 0;
      if (dragEdge.includes("e")) newW = snapToGuide(Math.max(1, startW + dx));
      if (dragEdge.includes("s")) newH = snapToGuide(Math.max(1, startH + dy));
      if (dragEdge.includes("w")) {
        const raw = startW + Math.max(0, -dx);
        newW = snapToGuide(Math.max(1, raw));
        offX = newW - startW;
      }
      if (dragEdge.includes("n")) {
        const raw = startH + Math.max(0, -dy);
        newH = snapToGuide(Math.max(1, raw));
        offY = newH - startH;
      }
      return { newW, newH, offX, offY };
    }
    let resizePreview = null;
    function showPreview(newW, newH, offX, offY) {
      if (!resizePreview) {
        resizePreview = document.createElement("div");
        resizePreview.className = "resize-preview";
        el.canvasFrame.appendChild(resizePreview);
      }
      resizePreview.style.width = `${newW * state.zoom}px`;
      resizePreview.style.height = `${newH * state.zoom}px`;
      resizePreview.style.left = `${-offX * state.zoom}px`;
      resizePreview.style.top = `${-offY * state.zoom}px`;
    }
    function removePreview() {
      if (resizePreview) {
        resizePreview.remove();
        resizePreview = null;
      }
    }
    function onPointerMove(e) {
      if (!dragEdge) return;
      pending = calcResize(e);
      el.canvasSizeDisplay.textContent = `${pending.newW} x ${pending.newH}`;
      showPreview(pending.newW, pending.newH, pending.offX, pending.offY);
    }
    function onPointerUp() {
      if (!dragEdge) return;
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      removePreview();
      if (pending) {
        applyCanvasResize(pending.newW, pending.newH, pending.offX, pending.offY);
      } else {
        updateCanvasDisplaySize(el, state);
      }
      dragEdge = null;
      pending = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    for (const handle of el.resizeHandles) {
      handle.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        dragEdge = handle.dataset.edge ?? null;
        startX = e.clientX;
        startY = e.clientY;
        startW = el.canvas.width;
        startH = el.canvas.height;
        document.body.style.cursor = getComputedStyle(handle).cursor;
        document.body.style.userSelect = "none";
        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
      });
    }
  }

  // src/webview/editor/main.ts
  (function main() {
    const vscode = acquireVsCodeApi();
    const el = queryElements();
    const state = createInitialState();
    function doCommit(label) {
      commit(vscode, el, state, label);
    }
    function setTool(tool) {
      if (state.tool !== tool && isSelectionTool(state.tool)) {
        flattenSelection(el, state, doCommit);
      }
      state.tool = tool;
      for (const button of el.toolButtons) {
        button.classList.toggle("active", button.dataset.tool === tool);
      }
      if (tool === "picker") {
        el.canvas.style.cursor = "copy";
      } else {
        el.canvas.style.cursor = "crosshair";
      }
      const layer = getActiveLayer(state);
      if (tool === "rig" && layer) {
        updateRigAngleInput(el, state, layer);
        renderPivotsPanel(el, state);
      }
      renderRigOverlay(el, state);
      if (!isSelectionTool(tool)) {
        clearSelection(el, state);
      }
    }
    function setZoom(value) {
      const zoom = Math.max(0.1, Math.min(40, Number(value) || 16));
      state.zoom = zoom;
      el.zoomInput.value = String(zoom);
      el.zoomLabel.value = `${Math.round(zoom * 100) / 100}x`;
      updateCanvasDisplaySize(el, state);
      renderHitboxOverlay(el, state);
      renderRigOverlay(el, state);
      renderSelectionOverlay(el, state);
    }
    function fitZoomToWorkspace() {
      if (!el.canvas.width || !el.canvas.height || !el.workspace) {
        return;
      }
      const padding = 64;
      const availableWidth = Math.max(1, el.workspace.clientWidth - padding);
      const availableHeight = Math.max(1, el.workspace.clientHeight - padding);
      const fitZoom = Math.min(availableWidth / el.canvas.width, availableHeight / el.canvas.height);
      const niceZoom = fitZoom >= 1 ? Math.max(1, Math.floor(fitZoom)) : fitZoom;
      setZoom(niceZoom);
    }
    function setGuideSize(value) {
      const guideSize = Math.max(1, Math.min(128, Number(value) || 1));
      state.guideSize = guideSize;
      el.guideSizeSelect.value = String(guideSize);
      el.canvasFrame.style.setProperty("--guide-size", `${state.zoom * guideSize}px`);
    }
    function setBrushSize(value) {
      const size = Math.max(1, Math.min(64, Number(value) || 1));
      el.brushSizeInput.value = String(size);
      el.brushSizeLabel.value = String(size);
    }
    function setActiveLayer(id) {
      if (!state.layers.some((layer2) => layer2.id === id)) {
        return;
      }
      state.activeLayerId = id;
      renderLayersPanel(el, state, layersPanelCallbacks);
      renderComposite(el, state);
      const layer = getActiveLayer(state);
      if (state.tool === "rig" && layer) {
        updateRigAngleInput(el, state, layer);
      }
      renderPivotsPanel(el, state);
      renderRigOverlay(el, state);
    }
    const layersPanelCallbacks = {
      onCommit: doCommit,
      onSetActiveLayer: setActiveLayer
    };
    function finishLoad(filename) {
      el.fileStatus.textContent = filename || "pixel.png";
      state.ready = true;
      state.collision.points = flatToHitboxPoints(state.pendingCollisionPoints, el.canvas.width, el.canvas.height);
      state.collision.draggingIndex = -1;
      state.pendingCollisionPoints = void 0;
      renderLayersPanel(el, state, layersPanelCallbacks);
      renderComposite(el, state);
      renderHitboxOverlay(el, state);
      renderPivotsPanel(el, state);
      renderRigOverlay(el, state);
    }
    function loadImage(dataUri, filename) {
      loadImageElement(dataUri).then((image) => {
        setCanvasSize(el, state, image.naturalWidth, image.naturalHeight);
        fitZoomToWorkspace();
        const baseCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
        baseCanvas.getContext("2d").drawImage(image, 0, 0);
        state.layers = [createLayer(el, state, "Layer 1", baseCanvas)];
        state.activeLayerId = state.layers[0].id;
        finishLoad(filename);
      });
    }
    async function loadLayerState(layerState, filename) {
      if (!layerState || !Array.isArray(layerState.layers) || layerState.layers.length === 0) {
        return false;
      }
      const images = await Promise.all(layerState.layers.map((entry) => loadImageElement(entry.dataUri)));
      setCanvasSize(el, state, images[0].naturalWidth, images[0].naturalHeight);
      fitZoomToWorkspace();
      let maxLayerId = 0;
      let maxPivotId = 0;
      state.layers = layerState.layers.map((entry, index) => {
        const layerCanvas = createLayerCanvas(el.canvas.width, el.canvas.height);
        layerCanvas.getContext("2d").drawImage(images[index], 0, 0);
        maxLayerId = Math.max(maxLayerId, nextIdNumber(entry.id));
        const pivots = entry.rig.pivots.map((pivot) => {
          maxPivotId = Math.max(maxPivotId, nextIdNumber(pivot.id));
          return {
            id: pivot.id,
            name: pivot.name,
            x: pivot.x,
            y: pivot.y,
            angle: pivot.angle
          };
        });
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
      state.nextLayerId = Math.max(state.nextLayerId, maxLayerId + 1);
      state.nextPivotId = Math.max(state.nextPivotId, maxPivotId + 1);
      state.activeLayerId = state.layers[state.layers.length - 1].id;
      finishLoad(filename);
      return true;
    }
    function applyCanvasResize(newWidth, newHeight, offX, offY) {
      const width = clampCanvasNumber(newWidth, 1);
      const height = clampCanvasNumber(newHeight, 1);
      if (width === el.canvas.width && height === el.canvas.height) return;
      for (const layer of state.layers) {
        const oldCanvas = layer.canvas;
        const nextCanvas = createLayerCanvas(width, height);
        nextCanvas.getContext("2d").drawImage(oldCanvas, offX, offY);
        layer.canvas = nextCanvas;
        for (const pivot of layer.rig.pivots) {
          pivot.x += offX;
          pivot.y += offY;
        }
      }
      setCanvasSize(el, state, width, height);
      state.collision.points = [];
      state.collision.draggingIndex = -1;
      renderComposite(el, state);
      renderHitboxOverlay(el, state);
      renderRigOverlay(el, state);
      doCommit("Resize canvas");
    }
    function handlePointerDown(event) {
      if (!state.ready || event.button !== 0) {
        return;
      }
      const screenPoint = eventToPixel(el, event);
      state.pointerId = event.pointerId;
      el.canvas.setPointerCapture(event.pointerId);
      if (state.tool === "hitbox") {
        handleHitboxPointerDown(el, state, screenPoint.x, screenPoint.y);
        return;
      }
      if (state.tool === "rig") {
        handleRigPointerDown(el, state, screenPoint.x, screenPoint.y);
        return;
      }
      if (isSelectionTool(state.tool)) {
        state.selection.shape = state.tool === "select-rect" ? "rect" : state.tool === "select-ellipse" ? "ellipse" : "lasso";
        handleSelectionPointerDown(el, state, doCommit, screenPoint.x, screenPoint.y);
        return;
      }
      if (state.tool === "picker") {
        pickColor(el, state, setTool, screenPoint.x, screenPoint.y);
        return;
      }
      const layer = getActiveLayer(state);
      const layerPoint = eventToLayerPixel(el, state, event, layer);
      if (!layerPoint) {
        return;
      }
      const { x, y } = layerPoint;
      if (state.tool === "fill") {
        floodFill(el, state, x, y);
        doCommit("Fill layer");
        return;
      }
      state.drawing = true;
      state.lastKey = `${x}:${y}`;
      drawAt(el, state, x, y);
    }
    function handlePointerMove(event) {
      const layer = getActiveLayer(state);
      const layerPoint = eventToLayerPixel(el, state, event, layer);
      if (layerPoint) {
        updateCursorOverlay(el, state, layerPoint.x, layerPoint.y);
      } else {
        hideCursorOverlay(el);
      }
      if (event.pointerId !== state.pointerId) {
        return;
      }
      if (state.tool === "hitbox") {
        handleHitboxPointerMove(el, state, eventToPixel(el, event));
        return;
      }
      if (state.tool === "rig") {
        const screenPoint = eventToPixel(el, event);
        handleRigPointerMove(el, state, screenPoint.x, screenPoint.y);
        return;
      }
      if (isSelectionTool(state.tool)) {
        const screenPoint = eventToPixel(el, event);
        handleSelectionPointerMove(el, state, screenPoint.x, screenPoint.y);
        return;
      }
      if (!state.drawing || !layerPoint) {
        return;
      }
      const key = `${layerPoint.x}:${layerPoint.y}`;
      if (key === state.lastKey) {
        return;
      }
      state.lastKey = key;
      drawAt(el, state, layerPoint.x, layerPoint.y);
    }
    function stopDrawing(event) {
      if (event.pointerId !== state.pointerId) {
        return;
      }
      if (state.tool === "hitbox") {
        state.collision.draggingIndex = -1;
        state.pointerId = void 0;
        return;
      }
      if (state.tool === "rig") {
        const wasDragging = Boolean(state.rig.dragMode);
        state.rig.dragMode = void 0;
        state.pointerId = void 0;
        if (wasDragging) {
          const layer = getActiveLayer(state);
          if (bakeRigRotation(el, state, layer)) {
            doCommit("Rotate layer");
          }
        }
        return;
      }
      if (isSelectionTool(state.tool)) {
        const screenPoint = eventToPixel(el, event);
        handleSelectionPointerUp(el, state, screenPoint.x, screenPoint.y);
        state.pointerId = void 0;
        return;
      }
      if (!state.drawing) {
        return;
      }
      state.drawing = false;
      state.pointerId = void 0;
      state.lastKey = "";
      doCommit(state.tool === "eraser" ? "Erase layer" : "Draw layer");
    }
    for (const button of el.toolButtons) {
      button.addEventListener("click", () => setTool(button.dataset.tool));
    }
    el.brushSizeInput.addEventListener("input", () => setBrushSize(el.brushSizeInput.value));
    el.zoomInput.addEventListener("input", () => setZoom(el.zoomInput.value));
    el.fitZoomButton.addEventListener("click", fitZoomToWorkspace);
    el.guideSizeSelect.addEventListener("change", () => setGuideSize(el.guideSizeSelect.value));
    initResizeHandles(el, state, applyCanvasResize);
    el.saveButton.addEventListener("click", () => vscode.postMessage({ type: "save" }));
    el.colorInput.addEventListener("input", () => renderPaletteSwatches(el, () => setTool("pencil")));
    el.paletteSelect.addEventListener("change", () => renderPaletteSwatches(el, () => setTool("pencil")));
    el.addLayerButton.addEventListener("click", () => addLayer(el, state, layersPanelCallbacks));
    el.duplicateLayerButton.addEventListener("click", () => duplicateLayer(el, state, layersPanelCallbacks));
    el.deleteLayerButton.addEventListener("click", () => deleteLayer(el, state, layersPanelCallbacks));
    el.moveLayerUpButton.addEventListener("click", () => moveLayer(el, state, layersPanelCallbacks, 1));
    el.moveLayerDownButton.addEventListener("click", () => moveLayer(el, state, layersPanelCallbacks, -1));
    el.mergeLayerDownButton.addEventListener("click", () => mergeLayerDown(el, state, layersPanelCallbacks));
    el.layerOpacityInput.addEventListener("input", () => setActiveLayerOpacity(el, state, layersPanelCallbacks, el.layerOpacityInput.value, false));
    el.layerOpacityInput.addEventListener("change", () => setActiveLayerOpacity(el, state, layersPanelCallbacks, el.layerOpacityInput.value, true));
    el.toggleGridButton.addEventListener("click", () => {
      el.canvasFrame.classList.toggle("grid");
      el.toggleGridButton.classList.toggle("active", el.canvasFrame.classList.contains("grid"));
    });
    el.toggleSnapButton.addEventListener("click", () => {
      state.snapToGuide = !state.snapToGuide;
      el.toggleSnapButton.classList.toggle("active", state.snapToGuide);
    });
    el.selectionMoveButton.addEventListener("click", () => {
      if (!state.selection.active) return;
      if (!state.selection.floatCanvas) liftSelection(el, state);
      renderSelectionOverlay(el, state);
    });
    el.selectionCutButton.addEventListener("click", () => cutSelection(el, state, doCommit));
    el.selectionClearButton.addEventListener("click", () => {
      flattenSelection(el, state, doCommit);
    });
    el.autoTraceButton.addEventListener("click", () => autoTraceHitbox(el, state));
    el.clearHitboxButton.addEventListener("click", () => {
      state.collision.points = [];
      state.collision.draggingIndex = -1;
      renderHitboxOverlay(el, state);
    });
    el.saveHitboxButton.addEventListener("click", () => {
      vscode.postMessage({ type: "saveCollision", points: flattenHitboxPoints(el, state) });
    });
    el.rigAngleInput.addEventListener("change", () => setRigAngleFromInput(el, state, doCommit));
    el.resetRigButton.addEventListener("click", () => resetRig(el, state));
    el.addPivotButton.addEventListener("click", () => addPivot(el, state));
    el.canvas.addEventListener("pointerdown", handlePointerDown);
    el.canvas.addEventListener("pointermove", handlePointerMove);
    el.canvas.addEventListener("pointerup", stopDrawing);
    el.canvas.addEventListener("pointercancel", stopDrawing);
    el.canvas.addEventListener("pointerleave", (event) => {
      stopDrawing(event);
      hideCursorOverlay(el);
    });
    document.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (isSelectionTool(state.tool) && state.selection.active) {
        if (event.key === "Escape") {
          flattenSelection(el, state, doCommit);
          event.preventDefault();
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          cutSelection(el, state, doCommit);
          event.preventDefault();
        }
      }
    });
    el.canvas.addEventListener("contextmenu", (event) => {
      if (state.tool !== "hitbox") {
        return;
      }
      event.preventDefault();
      const { x, y } = eventToPixel(el, event);
      deleteNearestHitboxPoint(el, state, x, y);
    });
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "init") {
        state.pendingCollisionPoints = message.collisionPoints;
        loadLayerState(message.layerState, message.filename).then((loaded) => {
          if (!loaded) {
            loadImage(message.dataUri, message.filename);
          }
        });
      }
    });
    renderPalettes(el, () => setTool("pencil"));
    setTool("pencil");
    setBrushSize(el.brushSizeInput.value);
    setZoom(el.zoomInput.value);
    setGuideSize(el.guideSizeSelect.value);
    vscode.postMessage({ type: "ready" });
  })();
})();
//# sourceMappingURL=editor.js.map
