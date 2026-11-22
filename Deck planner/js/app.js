// AUTO-LOAD scheme + calibration + deck state (autosave) from browser memory.
var SCHEME_KEY = 'deckSchemeDataURL';

function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }

function showToast(message, type) {
    try {
        var colors = { ok: '#22c55e', warn: '#f59e0b', err: '#ef4444', info: '#3b82f6' };
        var t = document.createElement('div'); t.textContent = message;
        t.style.cssText = 'position:fixed; left:50%; bottom:28px; transform:translateX(-50%) translateY(18px); opacity:0; z-index:3000; pointer-events:none; max-width:80vw; padding:11px 18px; border-radius:10px; font-size:0.86rem; line-height:1.35; color:#fff; background:rgba(13,17,23,0.96); border:1px solid ' + (colors[type] || colors.info) + '; box-shadow:0 10px 30px rgba(0,0,0,0.55); backdrop-filter:blur(6px); transition:opacity .35s ease, transform .35s ease; text-align:center;';
        document.body.appendChild(t);
        requestAnimationFrame(function () { requestAnimationFrame(function () { t.style.opacity = '1'; t.style.transform = 'translateX(-50%) translateY(0)'; }); });
        setTimeout(function () { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(18px)'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }, 3600);
    } catch (e) {}
}

function loadSchemeFromDataURL(dataURL, fromMemory) {
    var img = new Image();
    img.onload = function () { deckImage = img; afterSchemeLoaded(fromMemory); };
    img.onerror = function () { showToast('Не удалось прочитать сохранённую схему — загрузите файл заново', 'warn'); };
    img.src = dataURL;
}
function afterSchemeLoaded(fromMemory) {
    var saved = null, raw = storageGet('deckCalibrationPoints');
    if (raw) { try { saved = JSON.parse(raw); } catch (e) { saved = null; } }
    if (!saved && (typeof DECK_CALIBRATION !== 'undefined') && DECK_CALIBRATION) saved = DECK_CALIBRATION;
    if (saved && saved.minX && saved.maxX && saved.maxY && saved.minY) {
        state.points = saved; applySavedCalibration();
        if (fromMemory) showToast('Схема и калибровка загружены из памяти', 'ok');
    } else {
        state.calibrated = false; state.step = 0; state.points = {}; restoreHud(); resetView();
        if (fromMemory) showToast('Схема загружена — откалибруйте один раз', 'info');
    }
}

var vesselSelectedForScheme = false;
var is3DView = false;
var view3DCanvas = null;
var view3DCtx = null;
var view3DButton = null;
var view3DState = { azimuth: -0.65, elevation: 0.62, zoom: 1, dragging: false, lastX: 0, lastY: 0 };
var view3DLockedControls = [];

function initializeVesselSelector() {
    var toolbar = document.querySelector('.toolbar');
    var loadSchemeButton = toolbar && toolbar.querySelector('button');
    if (!toolbar || !loadSchemeButton || document.getElementById('vesselNameSelect')) return;

    var label = document.createElement('label');
    label.textContent = 'Судно:';
    label.style.cssText = 'display:inline-flex; align-items:center; gap:5px; color:var(--text); font-size:0.82rem;';
    var select = document.createElement('select');
    select.id = 'vesselNameSelect';
    select.title = 'Сначала выберите судно, затем загрузите его схему';
    select.style.cssText = 'background:#21262d; border:1px solid var(--border); color:var(--text); border-radius:6px; padding:7px 9px; font-size:0.85rem;';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Выберите судно';
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);
    VESSEL_NAMES.forEach(function (name) {
        var option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
    select.onchange = function () {
        setCurrentVesselName(select.value);
        vesselSelectedForScheme = true;
    };
    label.appendChild(select);
    toolbar.insertBefore(label, loadSchemeButton);

    loadSchemeButton.addEventListener('click', function (e) {
        if (vesselSelectedForScheme) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof showToast === 'function') showToast('Сначала выберите название судна', 'info');
    }, true);
}

function initialize3DViewer() {
    var toolbar = document.querySelector('.toolbar');
    if (!toolbar || !canvas || !wrap) return;

    view3DButton = document.createElement('button');
    view3DButton.type = 'button';
    view3DButton.id = 'btnView3D';
    view3DButton.className = 'btn-ghost';
    view3DButton.textContent = '🧊 3D просмотр';
    view3DButton.title = 'Переключить между редактируемой схемой 2D и просмотром 3D';
    view3DButton.onclick = toggle3DView;
    toolbar.appendChild(view3DButton);

    view3DCanvas = document.createElement('canvas');
    view3DCanvas.id = 'deckCanvas3D';
    view3DCanvas.className = 'view3d-canvas';
    view3DCanvas.setAttribute('aria-label', 'Палуба в режиме 3D, только для просмотра');
    canvas.parentNode.insertBefore(view3DCanvas, canvas.nextSibling);
    view3DCtx = view3DCanvas.getContext('2d');

    view3DCanvas.addEventListener('pointerdown', function (event) {
        if (event.button !== 0) return;
        view3DState.dragging = true;
        view3DState.lastX = event.clientX;
        view3DState.lastY = event.clientY;
        view3DCanvas.classList.add('view3d-dragging');
        view3DCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    view3DCanvas.addEventListener('pointermove', function (event) {
        if (!view3DState.dragging) return;
        view3DState.azimuth += (event.clientX - view3DState.lastX) * 0.008;
        view3DState.elevation = Math.max(0.25, Math.min(1.2,
            view3DState.elevation - (event.clientY - view3DState.lastY) * 0.006));
        view3DState.lastX = event.clientX;
        view3DState.lastY = event.clientY;
        draw3DView();
    });
    function stop3DOrbit() {
        view3DState.dragging = false;
        view3DCanvas.classList.remove('view3d-dragging');
    }
    view3DCanvas.addEventListener('pointerup', stop3DOrbit);
    view3DCanvas.addEventListener('pointercancel', stop3DOrbit);
    view3DCanvas.addEventListener('wheel', function (event) {
        event.preventDefault();
        view3DState.zoom = Math.max(0.55, Math.min(2.5,
            view3DState.zoom * Math.exp(event.deltaY < 0 ? 0.12 : -0.12)));
        draw3DView();
    }, { passive: false });
    view3DCanvas.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    window.addEventListener('resize', function () {
        if (is3DView) draw3DView();
    });
}

function toggle3DView() {
    if (!state.calibrated || !deckImage) {
        if (typeof showToast === 'function') showToast('Сначала загрузите и откалибруйте схему палубы', 'info');
        return;
    }
    is3DView = !is3DView;
    canvas.style.display = is3DView ? 'none' : '';
    view3DCanvas.style.display = is3DView ? 'block' : 'none';
    view3DButton.textContent = is3DView ? '🗺️ Вернуться в 2D' : '🧊 3D просмотр';
    view3DButton.setAttribute('aria-pressed', String(is3DView));
    wrap.classList.toggle('view3d-active', is3DView);
    set3DViewControlsLocked(is3DView);

    var hud = document.getElementById('calibrationHud');
    var info = wrap.querySelector('.info-overlay');
    var zoom = wrap.querySelector('.zoom-controls');
    if (hud) hud.style.display = is3DView ? 'none' : '';
    if (info) info.style.display = is3DView ? 'none' : '';
    if (zoom) zoom.style.display = is3DView ? 'none' : '';
    if (is3DView) {
        if (typeof closeContextMenu === 'function') closeContextMenu();
        if (typeof closeEmptyMenu === 'function') closeEmptyMenu();
        draw3DView();
    } else {
        draw();
    }
}

function set3DViewControlsLocked(locked) {
    if (locked) {
        view3DLockedControls = [];
        document.querySelectorAll('.toolbar button, .toolbar select, #undoControls button, #btnClearDeck')
            .forEach(function (control) {
                if (control === view3DButton || control.id === 'btnExportPDF' ||
                    control.id === 'btnPrintSummary') return;
                view3DLockedControls.push({ control: control, wasDisabled: control.disabled });
                control.disabled = true;
            });
        return;
    }
    view3DLockedControls.forEach(function (entry) {
        entry.control.disabled = entry.wasDisabled;
    });
    view3DLockedControls = [];
}

function get3DStackLayout() {
    var layout = [];
    var collisionContainers = new Set();
    placedContainers.forEach(function (container, index) {
        var height = Number(container.height);
        if (!isFinite(height) || height <= 0) height = 2.5;
        var z = 0;
        layout.forEach(function (lower) {
            if (!getContainerOverlap(container, lower.container)) return;
            collisionContainers.add(container);
            collisionContainers.add(lower.container);
            z = Math.max(z, lower.z + lower.height);
        });
        layout.push({ container: container, z: z, height: height, index: index });
    });
    return { containers: layout, collisionContainers: collisionContainers };
}

function draw3DPolygon(points, fill, stroke, lineWidth) {
    var context = view3DCtx;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (var i = 1; i < points.length; i++) context.lineTo(points[i].x, points[i].y);
    context.closePath();
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = lineWidth || 1; context.stroke(); }
}

function shade3DColor(color, factor) {
    var match = /^#([0-9a-f]{6})$/i.exec(color || '');
    if (!match) return color || '#777777';
    var value = parseInt(match[1], 16);
    var red = Math.max(0, Math.min(255, Math.round((value >> 16) * factor)));
    var green = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * factor)));
    var blue = Math.max(0, Math.min(255, Math.round((value & 255) * factor)));
    return '#' + [red, green, blue].map(function (part) {
        return part.toString(16).padStart(2, '0');
    }).join('');
}

function draw3DContainer(item, project, collisionContainers) {
    var container = item.container;
    var x = container.x, y = container.y, length = container.length, width = container.width;
    var z = item.z, topZ = z + item.height;
    var frontX = Math.sin(view3DState.azimuth) >= 0 ? x : x + length;
    var frontY = Math.cos(view3DState.azimuth) >= 0 ? y : y + width;
    var base = [
        project(x, y, z), project(x + length, y, z),
        project(x + length, y + width, z), project(x, y + width, z)
    ];
    var top = [
        project(x, y, topZ), project(x + length, y, topZ),
        project(x + length, y + width, topZ), project(x, y + width, topZ)
    ];
    var color = container.customColor || getDestColor(container.destination);
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) color = '#92d050';
    var sideX = frontX === x + length ?
        [base[1], base[2], top[2], top[1]] : [base[0], base[3], top[3], top[0]];
    var sideY = frontY === y + width ?
        [base[3], base[2], top[2], top[3]] : [base[0], base[1], top[1], top[0]];
    var isCollision = collisionContainers.has(container);
    var edge = isCollision ? '#ff3030' : 'rgba(0,0,0,0.65)';
    draw3DPolygon(sideX, shade3DColor(color, 0.58), edge, isCollision ? 1.5 : 0.7);
    draw3DPolygon(sideY, shade3DColor(color, 0.76), edge, isCollision ? 1.5 : 0.7);
    draw3DPolygon(top, color, edge, isCollision ? 2 : 0.8);

    var center = project(x + length / 2, y + width / 2, topZ);
    var fontSize = Math.max(8, Math.min(18, Math.min(length, width) * 2.1));
    view3DCtx.save();
    view3DCtx.fillStyle = container.isDuplicate ? '#ff3838' : '#101820';
    view3DCtx.font = 'bold ' + fontSize + 'px sans-serif';
    view3DCtx.textAlign = 'center';
    view3DCtx.textBaseline = 'middle';
    view3DCtx.fillText(String(container.id || ''), center.x, center.y - fontSize * 0.3);
    if (container.weight) {
        view3DCtx.font = Math.max(8, fontSize * 0.8) + 'px sans-serif';
        view3DCtx.fillText(Number(container.weight).toFixed(1) + ' т',
            center.x, center.y + fontSize * 0.8);
    }
    view3DCtx.restore();
}

function draw3DView() {
    if (!is3DView || !view3DCanvas || !view3DCtx || !wrap) return;
    var rect = wrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    view3DCanvas.width = Math.round(rect.width);
    view3DCanvas.height = Math.round(rect.height);
    var context = view3DCtx, width = rect.width, height = rect.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#0c121a';
    context.fillRect(0, 0, width, height);

    var stack = get3DStackLayout();
    var minX = DECK_COORDS.minX, maxX = DECK_COORDS.maxX;
    var minY = DECK_COORDS.minY, maxY = DECK_COORDS.maxY, maxZ = 0;
    stack.containers.forEach(function (item) {
        var container = item.container;
        minX = Math.min(minX, container.x); maxX = Math.max(maxX, container.x + container.length);
        minY = Math.min(minY, container.y); maxY = Math.max(maxY, container.y + container.width);
        maxZ = Math.max(maxZ, item.z + item.height);
    });
    var angle = view3DState.azimuth, elevation = view3DState.elevation;
    var cos = Math.cos(angle), sin = Math.sin(angle), sinElevation = Math.sin(elevation);
    function rawProject(x, y, z) {
        return {
            x: x * cos - y * sin,
            y: -(x * sin + y * cos) * sinElevation - z * Math.cos(elevation)
        };
    }
    var corners = [];
    [minX, maxX].forEach(function (x) {
        [minY, maxY].forEach(function (y) { corners.push(rawProject(x, y, 0)); });
    });
    stack.containers.forEach(function (item) {
        var container = item.container;
        [container.x, container.x + container.length].forEach(function (x) {
            [container.y, container.y + container.width].forEach(function (y) {
                corners.push(rawProject(x, y, item.z + item.height));
            });
        });
    });
    var projected = {
        minX: Math.min.apply(null, corners.map(function (p) { return p.x; })),
        maxX: Math.max.apply(null, corners.map(function (p) { return p.x; })),
        minY: Math.min.apply(null, corners.map(function (p) { return p.y; })),
        maxY: Math.max.apply(null, corners.map(function (p) { return p.y; }))
    };
    var scale = Math.min((width - 100) / Math.max(1, projected.maxX - projected.minX),
        (height - 110) / Math.max(1, projected.maxY - projected.minY)) * view3DState.zoom;
    var originX = (width - (projected.maxX - projected.minX) * scale) / 2 - projected.minX * scale;
    var originY = (height - (projected.maxY - projected.minY) * scale) / 2 - projected.minY * scale + 12;
    function project(x, y, z) {
        var point = rawProject(x, y, z);
        return { x: originX + point.x * scale, y: originY + point.y * scale };
    }

    var calibration = state.points;
    if (deckImage && calibration.minX && calibration.maxX && calibration.maxY && calibration.minY) {
        var sourceWidth = calibration.maxX.imgX - calibration.minX.imgX;
        var sourceHeight = calibration.minY.imgY - calibration.maxY.imgY;
        if (sourceWidth > 0 && sourceHeight > 0) {
            var a = scale * cos * DECK_W / sourceWidth;
            var b = -scale * sin * sinElevation * DECK_W / sourceWidth;
            var c = scale * sin * DECK_H / sourceHeight;
            var d = scale * cos * sinElevation * DECK_H / sourceHeight;
            var anchor = project(DECK_COORDS.minX, DECK_COORDS.maxY, 0);
            context.save();
            context.setTransform(a, b, c, d,
                anchor.x - a * calibration.minX.imgX - c * calibration.maxY.imgY,
                anchor.y - b * calibration.minX.imgX - d * calibration.maxY.imgY);
            context.drawImage(deckImage, 0, 0);
            context.restore();
        }
    }

    var deckCorners = [
        project(DECK_COORDS.minX, DECK_COORDS.minY, 0),
        project(DECK_COORDS.maxX, DECK_COORDS.minY, 0),
        project(DECK_COORDS.maxX, DECK_COORDS.maxY, 0),
        project(DECK_COORDS.minX, DECK_COORDS.maxY, 0)
    ];
    draw3DPolygon(deckCorners, null, 'rgba(96,165,250,0.9)', 2);

    stack.containers.sort(function (a, b) {
        if (a.z !== b.z) return a.z - b.z;
        var aDepth = rawProject(a.container.x + a.container.length / 2,
            a.container.y + a.container.width / 2, 0).y;
        var bDepth = rawProject(b.container.x + b.container.length / 2,
            b.container.y + b.container.width / 2, 0).y;
        return aDepth - bDepth || a.index - b.index;
    }).forEach(function (item) {
        draw3DContainer(item, project, stack.collisionContainers);
    });

    context.save();
    context.fillStyle = 'rgba(13,17,23,0.88)';
    context.fillRect(14, 14, 205, 48);
    context.strokeStyle = 'rgba(148,163,184,0.35)';
    context.strokeRect(14, 14, 205, 48);
    context.fillStyle = '#e6edf3';
    context.font = 'bold 13px sans-serif';
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText('3D · ТОЛЬКО ПРОСМОТР', 26, 30);
    context.fillStyle = '#9da7b3';
    context.font = '11px sans-serif';
    context.fillText('Перетаскивание: вращение · Колесо: масштаб', 26, 49);
    context.restore();
}

window.addEventListener('DOMContentLoaded', function () {
    canvas = document.getElementById('deckCanvas'); ctx = canvas.getContext('2d'); wrap = document.getElementById('deckView');
    var hud = document.getElementById('calibrationHud'); if (hud) hud.classList.remove('visible'); canvas.classList.remove('calibrating');
    initializeVesselSelector();
    initialize3DViewer();
    resizeCanvas(); setupEvents();
    document.getElementById('sidebarToggleBtn').addEventListener('click', toggleSidebar);
    var cm = document.getElementById('contextMenu'); cm.addEventListener('mousedown', function (e) { e.stopPropagation(); }); cm.addEventListener('click', function (e) { e.stopPropagation(); });
    var em = document.getElementById('emptyContextMenu'); if (em) { em.addEventListener('mousedown', function (e) { e.stopPropagation(); }); em.addEventListener('click', function (e) { e.stopPropagation(); }); }

    // Restore the whole deck (manifest + placement) from autosave; fall back to legacy manual-only.
    var autoLoaded = (typeof loadDeckAutosave === 'function') ? loadDeckAutosave() : false;
    if (!autoLoaded && typeof loadManualFromStorage === 'function') loadManualFromStorage();
    checkAllSegregationViolations();
    updateStats(); renderList();

    var savedScheme = storageGet(SCHEME_KEY);
    if (savedScheme) loadSchemeFromDataURL(savedScheme, true); else draw();
});

document.getElementById('deckImageInput').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    if (!vesselSelectedForScheme) {
        e.target.value = '';
        if (typeof showToast === 'function') showToast('Сначала выберите название судна', 'info');
        return;
    }
    var reader = new FileReader();
    reader.onload = function (evt) {
        var dataURL = evt.target.result; var remembered = storageSet(SCHEME_KEY, dataURL);
        deckImage = new Image();
        deckImage.onload = function () {
            state.calibrated = false; state.step = 0; state.points = {}; restoreHud(); resetView();
            if (remembered) showToast('Схема сохранена в память — больше загружать не придётся', 'ok');
            else showToast('Схема не поместилась в память: экспорт PDF может не работать', 'warn');
        };
        deckImage.src = dataURL;
    };
    reader.readAsDataURL(file);
});