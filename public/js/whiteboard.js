/**
 * Whiteboard canvas island.
 *
 * Owns a scene of shapes, a camera, undo/redo and debounced autosave.
 * The scene JSON it writes is the same shape the server stores in
 * Whiteboard.scene, and remote edits arrive over the plan WebSocket.
 */

const TOOLS = ["select", "pen", "rect", "ellipse", "arrow", "note", "text", "eraser", "pan"];
const NOTE_W = 180;
const NOTE_H = 140;
const SAVE_DEBOUNCE = 900;
const MAX_HISTORY = 60;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function boot(root) {
  if (root.dataset.mounted) return;
  root.dataset.mounted = "1";

  const canvas = root.querySelector("canvas");
  const ctx = canvas.getContext("2d");
  const saveUrl = root.dataset.saveUrl;
  const boardId = root.dataset.boardId;
  const readOnly = root.dataset.readonly === "true";
  const saveState = root.querySelector("[data-save-state]");
  const zoomValue = root.querySelector("[data-zoom-value]");

  // ------------------------------- State ----------------------------------

  let scene = [];
  try {
    scene = JSON.parse(root.dataset.scene || "[]");
    if (!Array.isArray(scene)) scene = [];
  } catch {
    scene = [];
  }

  const camera = { x: 0, y: 0, zoom: 1 };
  let tool = "select";
  let color = "#2383e2";
  let strokeWidth = 3;

  let history = [];
  let future = [];

  let drawing = null; // shape being created
  let selectedId = null;
  let dragging = null; // { id, dx, dy } while moving a shape
  let panning = null; // { x, y } while panning
  let spaceHeld = false;
  let editingText = false; // true while a wb-text-input editor is open

  // ---------------------------- Coordinates -------------------------------

  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - camera.x) / camera.zoom,
      y: (clientY - rect.top - camera.y) / camera.zoom,
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = root.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  // ------------------------------ Rendering -------------------------------

  function render() {
    const rect = root.getBoundingClientRect();
    ctx.save();
    ctx.clearRect(0, 0, rect.width, rect.height);

    drawGrid(rect);

    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);

    for (const shape of scene) drawShape(shape);
    if (drawing) drawShape(drawing);
    if (selectedId) drawSelection(scene.find((s) => s.id === selectedId));

    ctx.restore();
  }

  function drawGrid(rect) {
    const step = 24 * camera.zoom;
    if (step < 8) return;

    const styles = getComputedStyle(document.documentElement);
    ctx.fillStyle = styles.getPropertyValue("--border-strong").trim() || "rgba(0,0,0,.15)";

    const offsetX = camera.x % step;
    const offsetY = camera.y % step;

    for (let x = offsetX; x < rect.width; x += step) {
      for (let y = offsetY; y < rect.height; y += step) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function drawShape(shape) {
    ctx.save();
    ctx.strokeStyle = shape.color;
    ctx.fillStyle = shape.color;
    ctx.lineWidth = shape.width ?? strokeWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (shape.type) {
      case "pen": {
        const pts = shape.points ?? [];
        if (pts.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        // Quadratic smoothing through midpoints keeps strokes from looking faceted.
        for (let i = 1; i < pts.length - 1; i++) {
          const mx = (pts[i][0] + pts[i + 1][0]) / 2;
          const my = (pts[i][1] + pts[i + 1][1]) / 2;
          ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
        }
        ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
        ctx.stroke();
        break;
      }

      case "rect": {
        const { x, y, w, h } = normRect(shape);
        roundRect(x, y, w, h, 6);
        ctx.stroke();
        break;
      }

      case "ellipse": {
        const { x, y, w, h } = normRect(shape);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }

      case "arrow": {
        const { x1, y1, x2, y2 } = shape;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 10 + ctx.lineWidth;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
        ctx.stroke();
        break;
      }

      case "note": {
        const { x, y, w, h } = normRect(shape);
        ctx.fillStyle = shape.color;
        ctx.globalAlpha = 0.9;
        roundRect(x, y, w, h, 4);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Sticky notes always use dark ink; the palette for them is light.
        ctx.fillStyle = "#2b2b28";
        wrapText(shape.text ?? "", x + 12, y + 26, w - 24, 18, 14);
        break;
      }

      case "text": {
        ctx.fillStyle = shape.color;
        wrapText(shape.text ?? "", shape.x, shape.y + (shape.size ?? 18), 480, (shape.size ?? 18) * 1.35, shape.size ?? 18);
        break;
      }

      default:
        break;
    }

    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
  }

  function wrapText(text, x, y, maxWidth, lineHeight, fontSize) {
    ctx.font = `${fontSize}px ui-sans-serif, -apple-system, "Segoe UI", "Noto Sans Thai", sans-serif`;
    ctx.textBaseline = "alphabetic";

    let line = "";
    let cursorY = y;

    for (const word of String(text).split(/(\s+)/)) {
      const candidate = line + word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line.trimEnd(), x, cursorY);
        line = word.trimStart();
        cursorY += lineHeight;
      } else {
        line = candidate;
      }
      if (word.includes("\n")) {
        ctx.fillText(line.replace(/\n/g, ""), x, cursorY);
        line = "";
        cursorY += lineHeight;
      }
    }
    if (line.trim()) ctx.fillText(line.trimEnd(), x, cursorY);
  }

  function normRect(shape) {
    const w = shape.w ?? 0;
    const h = shape.h ?? 0;
    return {
      x: w < 0 ? shape.x + w : shape.x,
      y: h < 0 ? shape.y + h : shape.y,
      w: Math.abs(w),
      h: Math.abs(h),
    };
  }

  function drawSelection(shape) {
    if (!shape) return;
    const box = bounds(shape);
    if (!box) return;

    ctx.save();
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    ctx.lineWidth = 1.5 / camera.zoom;
    ctx.setLineDash([5 / camera.zoom, 4 / camera.zoom]);
    ctx.strokeRect(box.x - 6, box.y - 6, box.w + 12, box.h + 12);
    ctx.restore();
  }

  function bounds(shape) {
    switch (shape.type) {
      case "pen": {
        const pts = shape.points ?? [];
        if (!pts.length) return null;
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        const x = Math.min(...xs);
        const y = Math.min(...ys);
        return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
      }
      case "arrow": {
        const x = Math.min(shape.x1, shape.x2);
        const y = Math.min(shape.y1, shape.y2);
        return { x, y, w: Math.abs(shape.x2 - shape.x1), h: Math.abs(shape.y2 - shape.y1) };
      }
      case "text": {
        const size = shape.size ?? 18;
        return { x: shape.x, y: shape.y, w: Math.min(480, String(shape.text ?? "").length * size * 0.55), h: size * 1.4 };
      }
      default:
        return normRect(shape);
    }
  }

  function hitTest(point) {
    // Topmost shape wins, so iterate back to front.
    for (let i = scene.length - 1; i >= 0; i--) {
      const shape = scene[i];
      const box = bounds(shape);
      if (!box) continue;
      const pad = 8;
      if (
        point.x >= box.x - pad &&
        point.x <= box.x + box.w + pad &&
        point.y >= box.y - pad &&
        point.y <= box.y + box.h + pad
      ) {
        return shape;
      }
    }
    return null;
  }

  function translateShape(shape, dx, dy) {
    switch (shape.type) {
      case "pen":
        shape.points = shape.points.map(([x, y]) => [x + dx, y + dy]);
        break;
      case "arrow":
        shape.x1 += dx;
        shape.y1 += dy;
        shape.x2 += dx;
        shape.y2 += dy;
        break;
      default:
        shape.x += dx;
        shape.y += dy;
    }
  }

  // ------------------------------- History --------------------------------

  function snapshot() {
    history.push(JSON.stringify(scene));
    if (history.length > MAX_HISTORY) history.shift();
    future = [];
    updateHistoryButtons();
  }

  function undo() {
    if (!history.length) return;
    future.push(JSON.stringify(scene));
    scene = JSON.parse(history.pop());
    selectedId = null;
    render();
    updateHistoryButtons();
    queueSave();
  }

  function redo() {
    if (!future.length) return;
    history.push(JSON.stringify(scene));
    scene = JSON.parse(future.pop());
    selectedId = null;
    render();
    updateHistoryButtons();
    queueSave();
  }

  function updateHistoryButtons() {
    const undoBtn = root.querySelector('[data-action="undo"]');
    const redoBtn = root.querySelector('[data-action="redo"]');
    if (undoBtn) undoBtn.disabled = history.length === 0;
    if (redoBtn) redoBtn.disabled = future.length === 0;
  }

  // -------------------------------- Save ----------------------------------

  let saveTimer = null;

  function setSaveState(state, text) {
    if (!saveState) return;
    saveState.dataset.state = state;
    saveState.querySelector("[data-save-text]").textContent = text;
  }

  function queueSave() {
    if (readOnly || !saveUrl) return;
    setSaveState("dirty", "Unsaved");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, SAVE_DEBOUNCE);
  }

  async function save() {
    if (readOnly || !saveUrl) return;
    setSaveState("saving", "Saving...");
    try {
      const response = await fetch(saveUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scene }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setSaveState("saved", "Saved");
    } catch {
      setSaveState("error", "Save failed - retrying");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 4000);
    }
  }

  // Never lose the last strokes on navigation.
  window.addEventListener("beforeunload", (event) => {
    if (saveState?.dataset.state === "dirty" || saveState?.dataset.state === "saving") {
      save();
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // ----------------------------- Text editing ------------------------------

  function openTextEditor(shape, clientX, clientY) {
    // One editor at a time.
    if (editingText) return;
    editingText = true;

    const editor = document.createElement("textarea");
    editor.className = "wb-text-input";
    editor.value = shape.text ?? "";
    // Use viewport coordinates so the textarea isn't clipped by .wb overflow:hidden.
    editor.style.left = `${clientX}px`;
    editor.style.top = `${clientY}px`;
    editor.style.width = `${(shape.type === "note" ? NOTE_W : 220) * camera.zoom}px`;
    editor.style.fontSize = `${(shape.size ?? 14) * camera.zoom}px`;
    editor.rows = shape.type === "note" ? 5 : 2;
    editor.setAttribute("aria-label", "Shape text");
    document.body.appendChild(editor);
    editor.focus();
    editor.select();

    const commit = () => {
      editingText = false;
      shape.text = editor.value;
      editor.remove();
      // An empty text shape is noise; drop it.
      if (shape.type === "text" && !shape.text.trim()) {
        scene = scene.filter((s) => s.id !== shape.id);
      }
      render();
      queueSave();
    };

    editor.addEventListener("blur", commit, { once: true });
    editor.addEventListener("keydown", (event) => {
      // Stop keystrokes from reaching the global shortcut handlers.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        editor.blur();
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        editor.blur();
      }
    });
  }

  // ----------------------------- Pointer input -----------------------------

  canvas.addEventListener("pointerdown", (event) => {
    // While a text editor is open, let blur handle the commit; don't start
    // any new canvas action (which would create a second shape if tool=text).
    if (editingText) return;

    if (event.button === 1 || tool === "pan" || spaceHeld) {
      panning = { x: event.clientX - camera.x, y: event.clientY - camera.y };
      root.dataset.panning = "true";
      canvas.setPointerCapture(event.pointerId);
      return;
    }

    if (readOnly) return;

    const point = toWorld(event.clientX, event.clientY);
    canvas.setPointerCapture(event.pointerId);

    if (tool === "select") {
      const hit = hitTest(point);
      selectedId = hit?.id ?? null;
      if (hit) {
        snapshot();
        dragging = { id: hit.id, lastX: point.x, lastY: point.y };
      }
      render();
      return;
    }

    if (tool === "eraser") {
      const hit = hitTest(point);
      if (hit) {
        snapshot();
        scene = scene.filter((s) => s.id !== hit.id);
        render();
        queueSave();
      }
      return;
    }

    if (tool === "text" || tool === "note") {
      snapshot();
      const shape =
        tool === "note"
          ? { id: uid(), type: "note", x: point.x, y: point.y, w: NOTE_W, h: NOTE_H, color, text: "" }
          : { id: uid(), type: "text", x: point.x, y: point.y, color, size: 18, text: "" };
      scene.push(shape);
      render();

      openTextEditor(shape, event.clientX + 6, event.clientY + 6);
      return;
    }

    snapshot();

    if (tool === "pen") {
      drawing = { id: uid(), type: "pen", color, width: strokeWidth, points: [[point.x, point.y]] };
    } else if (tool === "arrow") {
      drawing = { id: uid(), type: "arrow", color, width: strokeWidth, x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    } else {
      drawing = { id: uid(), type: tool, color, width: strokeWidth, x: point.x, y: point.y, w: 0, h: 0 };
    }
  });

  canvas.addEventListener("pointermove", (event) => {
    if (panning) {
      camera.x = event.clientX - panning.x;
      camera.y = event.clientY - panning.y;
      render();
      return;
    }

    const point = toWorld(event.clientX, event.clientY);

    if (dragging) {
      const shape = scene.find((s) => s.id === dragging.id);
      if (shape) {
        translateShape(shape, point.x - dragging.lastX, point.y - dragging.lastY);
        dragging.lastX = point.x;
        dragging.lastY = point.y;
        render();
      }
      return;
    }

    if (!drawing) return;

    if (drawing.type === "pen") {
      drawing.points.push([point.x, point.y]);
    } else if (drawing.type === "arrow") {
      drawing.x2 = point.x;
      drawing.y2 = point.y;
    } else {
      drawing.w = point.x - drawing.x;
      drawing.h = point.y - drawing.y;
    }
    render();
  });

  function endPointer(event) {
    if (panning) {
      panning = null;
      delete root.dataset.panning;
    }

    if (dragging) {
      dragging = null;
      queueSave();
    }

    if (drawing) {
      const box = bounds(drawing);
      // Discard accidental taps that produced nothing visible.
      const meaningful =
        drawing.type === "pen" ? drawing.points.length > 1 : box && (box.w > 3 || box.h > 3);

      if (meaningful) {
        scene.push(drawing);
        queueSave();
      } else {
        history.pop();
        updateHistoryButtons();
      }
      drawing = null;
      render();
    }

    if (event?.pointerId !== undefined && canvas.hasPointerCapture?.(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("dblclick", (event) => {
    if (readOnly || editingText) return;
    const hit = hitTest(toWorld(event.clientX, event.clientY));
    if (hit && (hit.type === "note" || hit.type === "text")) {
      snapshot();
      openTextEditor(hit, event.clientX + 6, event.clientY + 6);
    }
  });

  // -------------------------------- Zoom -----------------------------------

  function zoomAt(factor, cx, cy) {
    const next = Math.min(4, Math.max(0.15, camera.zoom * factor));
    const rect = canvas.getBoundingClientRect();
    const px = cx - rect.left;
    const py = cy - rect.top;

    // Keep the point under the cursor fixed while scaling.
    camera.x = px - ((px - camera.x) * next) / camera.zoom;
    camera.y = py - ((py - camera.y) * next) / camera.zoom;
    camera.zoom = next;

    if (zoomValue) zoomValue.textContent = `${Math.round(camera.zoom * 100)}%`;
    render();
  }

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomAt(event.deltaY < 0 ? 1.1 : 0.9, event.clientX, event.clientY);
      } else {
        camera.x -= event.deltaX;
        camera.y -= event.deltaY;
        render();
      }
    },
    { passive: false },
  );

  // ------------------------------ Toolbar ----------------------------------

  root.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      tool = button.dataset.tool;
      root.dataset.tool = tool;
      root.querySelectorAll("[data-tool]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
      });
      if (tool !== "select") selectedId = null;
      render();
    });
  });

  root.querySelectorAll("[data-color]").forEach((button) => {
    button.addEventListener("click", () => {
      color = button.dataset.color;
      root.querySelectorAll("[data-color]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.color === color));
      });
      // Recolour the current selection too - that is what people expect.
      if (selectedId) {
        const shape = scene.find((s) => s.id === selectedId);
        if (shape) {
          snapshot();
          shape.color = color;
          render();
          queueSave();
        }
      }
    });
  });

  root.querySelector('[data-action="undo"]')?.addEventListener("click", undo);
  root.querySelector('[data-action="redo"]')?.addEventListener("click", redo);
  root.querySelector('[data-action="zoom-in"]')?.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(1.2, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  root.querySelector('[data-action="zoom-out"]')?.addEventListener("click", () => {
    const rect = canvas.getBoundingClientRect();
    zoomAt(0.8, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  root.querySelector('[data-action="zoom-reset"]')?.addEventListener("click", () => {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
    if (zoomValue) zoomValue.textContent = "100%";
    render();
  });
  root.querySelector('[data-action="clear"]')?.addEventListener("click", () => {
    if (readOnly || scene.length === 0) return;
    if (!confirm("Clear the whole board? This can be undone with Ctrl+Z.")) return;
    snapshot();
    scene = [];
    selectedId = null;
    render();
    queueSave();
  });

  // ----------------------------- Keyboard ----------------------------------

  const TOOL_KEYS = { v: "select", p: "pen", r: "rect", o: "ellipse", a: "arrow", n: "note", t: "text", e: "eraser", h: "pan" };

  window.addEventListener("keydown", (event) => {
    if (!root.isConnected) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;

    if (event.code === "Space" && !spaceHeld) {
      spaceHeld = true;
      root.dataset.panning = "true";
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }

    if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !readOnly) {
      event.preventDefault();
      snapshot();
      scene = scene.filter((s) => s.id !== selectedId);
      selectedId = null;
      render();
      queueSave();
      return;
    }

    const mapped = TOOL_KEYS[event.key.toLowerCase()];
    if (mapped && !event.metaKey && !event.ctrlKey) {
      root.querySelector(`[data-tool="${mapped}"]`)?.click();
    }
  });

  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      spaceHeld = false;
      if (!panning) delete root.dataset.panning;
    }
  });

  // ------------------------------ Realtime ---------------------------------
  // Remote saves replace the scene unless this client has unsaved local work.

  if (boardId && window.gpRealtime) {
    window.gpRealtime.on("whiteboard.updated", (payload) => {
      if (payload.whiteboardId !== boardId) return;
      if (saveState?.dataset.state === "dirty" || saveState?.dataset.state === "saving") return;
      if (!Array.isArray(payload.scene)) return;
      scene = payload.scene;
      selectedId = null;
      render();
    });
  }

  // ------------------------------- Start -----------------------------------

  new ResizeObserver(resize).observe(root);
  resize();
  updateHistoryButtons();
  setSaveState("saved", "Saved");
  root.dataset.tool = tool;
}

function mount(scope = document) {
  scope.querySelectorAll?.("[data-whiteboard]").forEach(boot);
  if (scope.matches?.("[data-whiteboard]")) boot(scope);
}

document.addEventListener("DOMContentLoaded", () => mount());
document.addEventListener("htmx:afterSwap", (event) => mount(event.target));

export { mount };
