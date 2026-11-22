// RENDERING
function hexLuminance(hex) {
    if (!hex || hex.charAt(0) !== '#') return 1;
    var h = hex.slice(1); if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    var r = parseInt(h.substr(0,2),16), g = parseInt(h.substr(2,2),16), b = parseInt(h.substr(4,2),16);
    if (isNaN(r)) return 1;
    return (0.2126*r + 0.7152*g + 0.0722*b) / 255;
}
function getDestColor(dest) {
    var d = (dest || '').toUpperCase();
    for (var i = 0; i < DEST_PALETTE.length; i++) {
        var keys = DEST_PALETTE[i].keys;
        for (var k = 0; k < keys.length; k++) {
            if (keys[k] && d.indexOf(String(keys[k]).toUpperCase()) !== -1) return DEST_PALETTE[i].color;
        }
    }
    return DEST_FALLBACK_COLOR;
}
function textOnColor(fillHex) { return hexLuminance(fillHex) < 0.30 ? '#ffffff' : '#000000'; }
function outlineColorFor(fillHex) { return hexLuminance(fillHex) < 0.45 ? '#ffffff' : '#000000'; }
function wrapCanvasText(text, maxWidth) {
    var lines = [], line = '';
    String(text).trim().split(/\s+/).forEach(function (word) {
        var candidate = line ? line + ' ' + word : word;
        if (ctx.measureText(candidate).width <= maxWidth) { line = candidate; return; }
        if (line) { lines.push(line); line = ''; }
        for (var i = 0; i < word.length; i++) {
            candidate = line + word[i];
            if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word[i]; }
            else line = candidate;
        }
    });
    if (line) lines.push(line);
    return lines;
}

// Extract "PREFIX" + "number" from a manifest string like "SARF 008" / "ERAU 0011".
function splitPrefix(src) {
    var m = String(src || '').match(/^(SARF|VFH|SEIC|OHS|KAA|ERAU|CSL|SAW|MOOU)\s*/i);
    if (!m) return null;
    return {
        pfx: m[1].toUpperCase(),
        num: String(src).replace(/^(SARF|VFH|SEIC|OHS|KAA|ERAU|CSL|SAW|MOOU)\s*/i, '').trim()
    };
}

function draw() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!deckImage) {
        ctx.fillStyle = '#666'; ctx.font = '20px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚙️ Загрузите схему для начала работы', canvas.width / 2, canvas.height / 2);
        return;
    }

    var fitScale = Math.min(canvas.width / deckImage.width, canvas.height / deckImage.height) * 0.9;
    var imgW = deckImage.width * fitScale, imgH = deckImage.height * fitScale;
    var imgX = (canvas.width - imgW) / 2, imgY = (canvas.height - imgH) / 2;
    lastImgDraw = { x: imgX, y: imgY, scale: fitScale };

    if (!state.calibrated) {
        ctx.drawImage(deckImage, imgX, imgY, imgW, imgH);
        ctx.fillStyle = '#ff0000'; ctx.font = 'bold 14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var drawMarker = function (pt, label) {
            if (!pt) return;
            var x = imgX + pt.imgX * fitScale, y = imgY + pt.imgY * fitScale;
            ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillText(label, x, y); ctx.fillStyle = '#ff0000';
        };
        drawMarker(state.points.minX, '1'); drawMarker(state.points.maxX, '2');
        drawMarker(state.points.maxY, '3'); drawMarker(state.points.minY, '4');
        return;
    }

    var deckZoneScreenX = state.panX + DECK_COORDS.minX * state.ppm;
    var deckZoneScreenY = state.panY - DECK_COORDS.maxY * state.ppm;
    var deckZoneScreenW = DECK_W * state.ppm, deckZoneScreenH = DECK_H * state.ppm;

    var p = state.points;
    var srcW = p.maxX.imgX - p.minX.imgX, srcH = p.minY.imgY - p.maxY.imgY;
    var scaleToScreen = deckZoneScreenW / srcW;
    var drawImgX = deckZoneScreenX - p.minX.imgX * scaleToScreen;
    var drawImgY = deckZoneScreenY - p.maxY.imgY * scaleToScreen;
    var drawImgW = deckImage.width * scaleToScreen, drawImgH = deckImage.height * scaleToScreen;
    ctx.drawImage(deckImage, drawImgX, drawImgY, drawImgW, drawImgH);

    ctx.strokeStyle = 'rgba(255, 0, 0, 0.7)'; ctx.lineWidth = 2;
    ctx.strokeRect(deckZoneScreenX, deckZoneScreenY, deckZoneScreenW, deckZoneScreenH);

    var zoneStyles = {
        aft: { label: 'КОРМА · MOLIKPAQ', color: 'rgba(59,130,246,0.9)' },
        port: { label: 'ЛЕВЫЙ БОРТ · LUN-A', color: 'rgba(34,197,94,0.9)' },
        starboard: { label: 'ПРАВЫЙ БОРТ · PA-B', color: 'rgba(249,115,22,0.9)' },
        fore: { label: 'НОС · ОСТАЛЬНЫЕ НАПРАВЛЕНИЯ', color: 'rgba(168,85,247,0.9)' }
    };
    var zoneBounds = {};
    placedContainers.forEach(function (c) {
        if (!c.isDirectionalZone || !zoneStyles[c.placementZone] ||
            !isInDirectionalZone(c, c.x, c.y, c.placementZone)) return;
        var b = zoneBounds[c.placementZone];
        if (!b) b = zoneBounds[c.placementZone] = { minX: c.x, maxX: c.x + c.length, minY: c.y, maxY: c.y + c.width };
        else {
            b.minX = Math.min(b.minX, c.x); b.maxX = Math.max(b.maxX, c.x + c.length);
            b.minY = Math.min(b.minY, c.y); b.maxY = Math.max(b.maxY, c.y + c.width);
        }
    });
    Object.keys(zoneBounds).forEach(function (zone) {
        var b = zoneBounds[zone], style = zoneStyles[zone], topLeft = toScreen(b.minX, b.maxY);
        var zoneW = (b.maxX - b.minX) * state.ppm, zoneH = (b.maxY - b.minY) * state.ppm;
        ctx.save();
        ctx.fillStyle = style.color.replace('0.9', '0.07'); ctx.fillRect(topLeft.x, topLeft.y, zoneW, zoneH);
        ctx.strokeStyle = style.color; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
        ctx.strokeRect(topLeft.x, topLeft.y, zoneW, zoneH); ctx.setLineDash([]);
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = style.color; ctx.fillText(style.label + ' · ПЛАНОВАЯ ЗОНА', topLeft.x + 4, topLeft.y + 4);
        ctx.restore();
    });

    placedContainers.forEach(function (c) {
        var sp = toScreen(c.x, c.y + c.width);
        var w = c.length * state.ppm, h = c.width * state.ppm;
        var planned = !!c.isPlanned;

        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(sp.x + 2, sp.y + 2, w, h);

        if (planned) {
            ctx.fillStyle = PLANNED_COLOR; ctx.fillRect(sp.x, sp.y, w, h);
            ctx.save();
            ctx.beginPath(); ctx.rect(sp.x, sp.y, w, h); ctx.clip();
            ctx.strokeStyle = 'rgba(255,255,255,0.30)'; ctx.lineWidth = 1;
            for (var dd = -h; dd < w; dd += 8) { ctx.beginPath(); ctx.moveTo(sp.x + dd, sp.y + h); ctx.lineTo(sp.x + dd + h, sp.y); ctx.stroke(); }
            ctx.restore();
            ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
            ctx.strokeRect(sp.x + 0.5, sp.y + 0.5, w - 1, h - 1); ctx.setLineDash([]);
        } else {
            var color = c.customColor || getDestColor(c.destination);
            ctx.fillStyle = color; ctx.fillRect(sp.x, sp.y, w, h);
            ctx.strokeStyle = outlineColorFor(color); ctx.lineWidth = 1;
            ctx.strokeRect(sp.x + 0.5, sp.y + 0.5, w - 1, h - 1);
            if (c.isReefer && w > 8 && h > 8) {
                ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 1;
                ctx.strokeRect(sp.x + 2.5, sp.y + 2.5, w - 5, h - 5);
            }
            if (c.isManual && w > 8 && h > 8) {
                ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
                ctx.strokeRect(sp.x + 2.5, sp.y + 2.5, w - 5, h - 5); ctx.setLineDash([]); ctx.restore();
            }
        }

        if (c._hl && (Date.now() - c._hl) < 3000) {
            ctx.save(); ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3; ctx.setLineDash([7, 4]);
            ctx.strokeRect(sp.x - 1.5, sp.y - 1.5, w + 3, h + 3);
            ctx.setLineDash([]); ctx.restore();
        }

        if (w > 20 && h > 15) {
            var padding = 4, maxW = w - padding * 2;
            var d = c.display || DEFAULT_DISPLAY;
            var showPriority = d.priority === undefined ? DEFAULT_DISPLAY.priority : d.priority;
            var showCrane = d.crane === undefined ? DEFAULT_DISPLAY.crane : d.crane;
            var showType = d.type === undefined ? DEFAULT_DISPLAY.type : d.type;
            var fontSize = (c.customFontSize !== null) ? c.customFontSize : Math.max(6, Math.min(maxW / 4.5, h / 4.5));
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            var fillForText = planned ? '#1b2530' : (c.customColor || getDestColor(c.destination));
            var textColor = c.isDuplicate ? '#ef4444' : (planned ? '#f1f5f9' : textOnColor(fillForText));
            ctx.fillStyle = textColor; ctx.font = 'bold ' + fontSize + 'px sans-serif';

            var lines = [];
            if (!planned) {
                if (d.seq && c.seq) lines.push((c.isManual ? '✋ ' : '') + '№' + c.seq);
                if (d.id) {
                    // prefix/number, with fallback to the raw manifest string when not stored
                    var pfx = c.prefix || '', num = c.num || '';
                    if (!pfx || !num) {
                        var sp2 = splitPrefix(c.rawId || c.id || '');
                        if (sp2) { pfx = sp2.pfx; num = sp2.num; }
                    }
                    var idText = '';
                    if (pfx && num) idText = prefixOn(pfx) ? (pfx + ' ' + num) : num;
                    else idText = c.id || '';
                    if (idText) {
                        var cur = '';
                        for (var i = 0; i < idText.length; i++) {
                            var ch = idText[i], test = cur + ch;
                            if (ctx.measureText(test).width > maxW && cur.length > 0) { lines.push(cur); cur = ch; } else cur = test;
                        }
                        if (cur) lines.push(cur);
                    }
                }
            } else {
                if (d.id) lines.push('◌ ' + (c.id || 'ПЛАН'));
            }
            if (d.weight && c.weight) lines.push(c.weight.toFixed(1) + ' т');
            if (d.imdg && c.isHazardous && c.imdgClass) lines.push('IMDG ' + c.imdgClass);
            if (d.temp && c.isReefer && c.temp) lines.push('⚡' + c.temp);
            var displayType = getContainerDisplayType(c);
            if (showType && displayType) lines = lines.concat(wrapCanvasText(displayType, maxW));
            if (!planned && showPriority && c.priority) lines.push('Приор. ' + c.priority);
            if (!planned && showCrane && c.crane) lines.push('Кран ' + c.crane);
            if (c.isFood) lines.push('FOOD');

            if (lines.length) {
                var lh = fontSize * 1.15, total = lines.length * lh;
                var startY = sp.y + h / 2 - (total / 2) + (lh / 2);
                ctx.fillStyle = textColor; ctx.font = 'bold ' + fontSize + 'px sans-serif';
                lines.forEach(function (line, idx) { ctx.fillText(line, sp.x + w / 2, startY + idx * lh); });
            }
        }
    });

    if (placementMode && placementGhost) {
        var g = placementGhost;
        var ev = (typeof evaluateGhostAt === 'function') ? evaluateGhostAt(g.x, g.y) : { ok: true };
        var gp = toScreen(g.x, g.y + g.width);
        var gw = g.length * state.ppm, gh = g.width * state.ppm;
        var hasSegregationIssue = showSegregationViolations && !!(ev.segregationIssues && ev.segregationIssues.length);
        ctx.save();
        ctx.fillStyle = ev.ok && !hasSegregationIssue ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.35)';
        ctx.fillRect(gp.x, gp.y, gw, gh);
        ctx.strokeStyle = ev.ok && !hasSegregationIssue ? '#22c55e' : '#ef4444'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        ctx.strokeRect(gp.x, gp.y, gw, gh); ctx.setLineDash([]);
        if ((!ev.ok || hasSegregationIssue) && gw > 50) {
            ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            var message = ev.ok ? 'Нарушение сегрегации: ' + ev.segregationIssues[0].code : ev.reason;
            ctx.fillText(message, gp.x + gw / 2, gp.y + gh / 2);
        }
        ctx.restore();
    }

    if (showSegregationViolations) violations.forEach(function (v) {
        var c1 = v.container1, c2 = v.container2;
        var closest = getClosestContainerBoundaryPoints(c1, c2);
        var p1 = toScreen(closest.container1.x, closest.container1.y);
        var p2 = toScreen(closest.container2.x, closest.container2.y);
        ctx.save();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        var c1TopLeft = toScreen(c1.x, c1.y + c1.width);
        ctx.strokeRect(c1TopLeft.x, c1TopLeft.y, c1.length * state.ppm, c1.width * state.ppm);
        if (c2 !== c1) {
            var c2TopLeft = toScreen(c2.x, c2.y + c2.width);
            ctx.strokeRect(c2TopLeft.x, c2TopLeft.y, c2.length * state.ppm, c2.width * state.ppm);
        }
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.setLineDash([]);
        var midX = (p1.x + p2.x) / 2, midY = (p1.y + p2.y) / 2;
        var label = v.code + (v.requiredDistance ? ' (' + v.actualDistance.toFixed(1) + '/' + v.requiredDistance.toFixed(1) + 'м)' : '');
        ctx.font = 'bold 11px sans-serif';
        var tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(239,68,68,0.95)'; ctx.fillRect(midX - tw / 2 - 4, midY - 8, tw + 8, 16);
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY); ctx.restore();
    });

    if (typeof selectedContainers !== 'undefined' && selectedContainers.size) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 3;
        selectedContainers.forEach(function (container) {
            if (placedContainers.indexOf(container) === -1) return;
            var topLeft = toScreen(container.x, container.y + container.width);
            var width = container.length * state.ppm, height = container.width * state.ppm;
            ctx.strokeRect(topLeft.x + 1.5, topLeft.y + 1.5,
                Math.max(0, width - 3), Math.max(0, height - 3));
        });
        var badgeText = 'Выделено: ' + selectedContainers.size;
        ctx.font = 'bold 12px sans-serif';
        var badgeWidth = ctx.measureText(badgeText).width + 18;
        ctx.fillStyle = 'rgba(13,17,23,0.88)';
        ctx.fillRect(canvas.width - badgeWidth - 12, 12, badgeWidth, 26);
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, canvas.width - badgeWidth / 2 - 12, 25);
        ctx.restore();
    }

    if (typeof geometryWarningContainers !== 'undefined' && geometryWarningContainers.size) {
        ctx.save();
        ctx.strokeStyle = '#ff1f1f';
        ctx.lineWidth = 4;
        geometryWarningContainers.forEach(function (container) {
            if (placedContainers.indexOf(container) === -1) return;
            var topLeft = toScreen(container.x, container.y + container.width);
            var width = container.length * state.ppm, height = container.width * state.ppm;
            ctx.strokeRect(topLeft.x + 2, topLeft.y + 2,
                Math.max(0, width - 4), Math.max(0, height - 4));
        });
        ctx.restore();
    }

    if (typeof pointerInteraction !== 'undefined' &&
        pointerInteraction && pointerInteraction.mode === 'marquee' && pointerInteraction.started) {
        var selectionLeft = Math.min(pointerInteraction.startX, pointerInteraction.currentX);
        var selectionTop = Math.min(pointerInteraction.startY, pointerInteraction.currentY);
        var selectionWidth = Math.abs(pointerInteraction.currentX - pointerInteraction.startX);
        var selectionHeight = Math.abs(pointerInteraction.currentY - pointerInteraction.startY);
        ctx.save();
        ctx.fillStyle = 'rgba(56,189,248,0.16)';
        ctx.fillRect(selectionLeft, selectionTop, selectionWidth, selectionHeight);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(selectionLeft, selectionTop, selectionWidth, selectionHeight);
        ctx.restore();
    }
}

function toScreen(deckX, deckY) { return { x: state.panX + deckX * state.ppm, y: state.panY - deckY * state.ppm }; }
function toDeck(screenX, screenY) { return { x: (screenX - state.panX) / state.ppm, y: (state.panY - screenY) / state.ppm }; }

function findContainerAt(x, y) {
    for (var i = placedContainers.length - 1; i >= 0; i--) {
        var c = placedContainers[i];
        if (x >= c.x && x <= c.x + c.length && y >= c.y && y <= c.y + c.width) return c;
    }
    return null;
}