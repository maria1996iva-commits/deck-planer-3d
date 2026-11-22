﻿// EXCEL import with smart reconcile
//  - same id + occurrence  -> keep position AND placed orientation
//  - virtual(dup) id replaced by a real id with same signature -> rename in place
//  - gone ids -> removed; new ids -> auto-placed on free space
//  - manual/planned containers are never touched

// ---------- REEFER / IMDG DETECTION ----------

// Распознаёт уставку температуры из строки.
// Поддерживает: "-18 C", "+3 C", "25 ± 2 C", "-18°C", "25±2C", "-18,5 C", "25C",
//               а также просто число без C: "-18", "+3", "25", "-18.5", "-18,5", "25 ± 2".
// Возвращает число (уставку) или null, если температуры нет.
function parseTemp(str) {
    if (!str) return null;
    var s = String(str).trim();

    // 1) Сначала ищем явную температуру с C/°C/° (самый надёжный признак)
    var m1 = s.match(/([+-]?\d+(?:[.,]\d+)?)\s*(?:±\s*\d+(?:[.,]\d+)?)?\s*°?\s*C\b/i);
    if (m1) {
        var v1 = parseFloat(String(m1[1]).replace(',', '.'));
        if (!isNaN(v1)) return v1;
    }

    // 2) Температура с градусом, но без C: "-18°", "25 ± 2°"
    var m2 = s.match(/([+-]?\d+(?:[.,]\d+)?)\s*(?:±\s*\d+(?:[.,]\d+)?)?\s*°/i);
    if (m2) {
        var v2 = parseFloat(String(m2[1]).replace(',', '.'));
        if (!isNaN(v2)) return v2;
    }

    // 3) Просто число (с/без знака, с/без допуска) — форманы иногда забывают C.
    //    Берём ПЕРВОЕ число в строке, которое похоже на температуру (-50..+50).
    //    Исключаем случаи, когда в строке только HAZ.class (тогда температура = null).
    if (!/HAZ\.class/i.test(s)) {
        var m3 = s.match(/([+-]?\d+(?:[.,]\d+)?)(?:\s*±\s*\d+(?:[.,]\d+)?)?$/);
        if (m3) {
            var v3 = parseFloat(String(m3[1]).replace(',', '.'));
            if (!isNaN(v3) && v3 >= -50 && v3 <= 50) return v3;
        }
    }
    return null;
}

// Реф‑контейнер по типу или описанию (REF / REEFER), без ложных срабатываний типа "REFERENCE".
function isReeferByTypeOrDesc(typeStr, descStr) {
    var re = /(^|[^A-Z])(REF|REEFER)([^A-Z]|$)/;
    var t = String(typeStr || '').toUpperCase();
    var d = String(descStr || '').toUpperCase();
    return re.test(t) || re.test(d);
}

function isFoodByTypeOrDesc(typeStr, descStr) {
    var re = /\b(?:FOOD(?:STUFFS?)?|PROVISIONS?)\b/i;
    return re.test(String(typeStr || '')) || re.test(String(descStr || ''));
}

function parseColumnF(value) {
    try {
        if (!value) return { isHazardous: false, isReefer: false };
        var str = String(value).trim();
        var result = { isHazardous: false, isReefer: false, imdgClass: null, temp: null };
        var hazMatch = str.match(/HAZ\.class\s*([\d.]+)/i);
        if (hazMatch) { result.isHazardous = true; result.imdgClass = hazMatch[1]; }
        var temp = parseTemp(str);
        if (temp !== null) { result.isReefer = true; result.temp = temp + '°C'; }
        return result;
    } catch (err) { return { isHazardous: false, isReefer: false }; }
}

function eq2(a, b) { return Math.abs(a - b) < 0.02; }
function dimsMatch(aL, aW, bL, bW) { return (eq2(aL, bL) && eq2(aW, bW)) || (eq2(aL, bW) && eq2(aW, bL)); }
// signature is rotation-insensitive (uses min x max of dims) so a rotated virtual still matches its real number
function sigOf(o) {
    var dl = Math.min(o.length || 0, o.width || 0).toFixed(2);
    var dw = Math.max(o.length || 0, o.width || 0).toFixed(2);
    return dl + 'x' + dw + '|' + (o.weight || 0) + '|' + (o.destination || '') + '|' + (o.type || '');
}
function isUnboundedGeometricPositionValid(container, x, y) {
    for (var i = 0; i < placedContainers.length; i++) {
        var other = placedContainers[i];
        if (other === container) continue;
        if (x < other.x + other.length && x + container.length > other.x &&
            y < other.y + other.width && y + container.width > other.y) return false;
    }
    return true;
}
function findDirectionalPosition(container) {
    var zone = getDirectionalZone(container.destination);
    container.placementZone = zone;
    for (var layer = 0; ; layer++) {
        var offset = 0.5 + layer * 0.5;
        var crossMin, crossMax, fixedX = null, fixedY = null;
        if (zone === 'aft') {
            fixedX = DECK_COORDS.minX - offset - container.length;
            crossMin = DECK_COORDS.minY - layer * 0.5;
            crossMax = DECK_COORDS.maxY + layer * 0.5 - container.width;
        } else if (zone === 'fore') {
            fixedX = DECK_COORDS.maxX + offset;
            crossMin = DECK_COORDS.minY - layer * 0.5;
            crossMax = DECK_COORDS.maxY + layer * 0.5 - container.width;
        } else if (zone === 'port') {
            fixedY = DECK_COORDS.maxY + offset;
            crossMin = DECK_COORDS.minX - layer * 0.5;
            crossMax = DECK_COORDS.maxX + layer * 0.5 - container.length;
        } else {
            fixedY = DECK_COORDS.minY - offset - container.width;
            crossMin = DECK_COORDS.minX - layer * 0.5;
            crossMax = DECK_COORDS.maxX + layer * 0.5 - container.length;
        }
        for (var cross = crossMin; cross <= crossMax + 0.001; cross += 0.5) {
            var x = fixedX === null ? cross : fixedX;
            var y = fixedY === null ? cross : fixedY;
            if (!isUnboundedGeometricPositionValid(container, x, y)) continue;
            if (!isSegregationSafeAt(container, x, y)) continue;
            container.x = x;
            container.y = y;
            return true;
        }
    }
}
function autoPlaceRows(rows, useDirectionalZones) {
    var pOrd = { 'H': 3, 'M': 2, 'L': 1, '': 0 };
    var sorted = rows.slice().sort(function (a, b) {
        var pA = pOrd[a.priority] || 0, pB = pOrd[b.priority] || 0;
        if (pA !== pB) return pB - pA;
        return (b.length * b.width) - (a.length * a.width);
    });
    var placedNow = [];
    var unplacedNow = [];
    sorted.forEach(function (cont) {
        if (useDirectionalZones) {
            findDirectionalPosition(cont);
            cont.isDirectionalZone = true;
            placedContainers.push(cont);
            placedNow.push(cont);
            return;
        }
        function tryPlace(allowSegregationViolation) {
            for (var y = DECK_COORDS.maxY - 1; y >= DECK_COORDS.minY; y -= 0.5) {
                for (var x = DECK_COORDS.minX; x < DECK_COORDS.maxX; x += 0.5) {
                    var valid = allowSegregationViolation ?
                        isGeometricallyValidPosition(cont, x, y) : isValidPosition(cont, x, y);
                    if (valid) {
                        cont.x = x;
                        cont.y = y;
                        placedContainers.push(cont);
                        placedNow.push(cont);
                        return true;
                    }
                }
            }
            return false;
        }
        if (!tryPlace(false) && !tryPlace(true)) unplacedNow.push(cont);
    });
    return { placed: placedNow, unplaced: unplacedNow };
}
document.getElementById('fileInput').addEventListener('change', function (e) {
    if (!state.calibrated) { alert('Сначала откалибруйте схему!'); return; }
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = function (evt) {
        var undoImportStarted = false;
        try {
            var data = new Uint8Array(evt.target.result);
            var workbook = XLSX.read(data, { type: 'array' });
            var summarySheet = workbook.SheetNames.find(function (n) { return n.toLowerCase().includes('summary'); });
            if (!summarySheet) { alert('Лист Summary не найден!'); return; }
            var jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[summarySheet], { header: 1 });
            // ---- parse new manifest rows ----
            var newRows = [];
            var idCount = {};
            for (var i = 12; i < jsonData.length; i++) {
                var row = jsonData[i]; if (!row || !row[3]) continue;
                var rawId = String(row[3]).trim();
                if (rawId.includes('ERROR') || rawId === 'Item #' || !rawId) continue;
                var cleanId = rawId.replace(/^(SARF|VFH|SEIC|OHS|KAA)\s*/i, '').trim();
                if (!cleanId) continue;
                idCount[cleanId] = (idCount[cleanId] || 0) + 1;
            }
            for (var j = 12; j < jsonData.length; j++) {
                var r = jsonData[j]; if (!r || !r[3]) continue;
                var raw = String(r[3]).trim();
                if (raw.includes('ERROR') || raw === 'Item #' || !raw) continue;
                var cid = raw.replace(/^(SARF|VFH|SEIC|OHS|KAA)\s*/i, '').trim();
                if (!cid) continue;
                var f = parseColumnF(r[5]);
                var seq = parseInt(r[0]); if (isNaN(seq) || seq <= 0) seq = j - 11;
                var pm = raw.match(/^(SARF|VFH|SEIC|OHS|KAA|ERAU|CSL|SAW|MOOU)\s*/i);
                var pfx = pm ? pm[1].toUpperCase() : '';
                var num = pm ? raw.replace(/^(SARF|VFH|SEIC|OHS|KAA|ERAU|CSL|SAW|MOOU)\s*/i, '').trim() : cid;
                newRows.push({
                    seq: seq, id: cid, rawId: raw, type: String(r[2] || 'STD').trim(),
                    description: String(r[4] || '').trim(),
                    length: parseFloat(r[6]) || 2.44, width: parseFloat(r[7]) || 2.44, height: parseFloat(r[8]) || 2.59,
                    weight: (function () { var w = parseFloat(r[12]) || 0; return w > 100 ? w / 1000 : w; })(),
                    destination: String(r[13] || '').trim(), priority: String(r[15] || '').trim().toUpperCase(),
                    crane: String(r[16] || '').trim(),
                    isHazardous: f.isHazardous, imdgClass: f.imdgClass,
                    isReefer: f.isReefer || isReeferByTypeOrDesc(r[2], r[4]), temp: f.temp,
                    isFood: isFoodByTypeOrDesc(r[2], r[4]),
                    rotated: false, x: 0, y: 0, customFontSize: null,
                    isDuplicate: (idCount[cid] > 1), isManual: false, prefix: pfx, num: num
                });
            }
            // ---- split current deck ----
            if (typeof beginUndoableAction === 'function') {
                beginUndoableAction();
                undoImportStarted = true;
            }
            var manual = placedContainers.filter(function (c) { return c.isManual; });
            var oldManifest = placedContainers.filter(function (c) { return !c.isManual; });
            // safety snapshot before applying the update (only when updating an existing plan)
            if (oldManifest.length > 0 && typeof saveCurrentAsSlot === 'function') {
                saveCurrentAsSlot('Авто до обновления ' + new Date().toLocaleString());
            }
            var oldById = {};
            oldManifest.forEach(function (c) { (oldById[c.id] = oldById[c.id] || []).push(c); });
            var newById = {};
            newRows.forEach(function (r) { (newById[r.id] = newById[r.id] || []).push(r); });
            var keptRows = [], renamedRows = [], toAdd = [], toRemove = [], unmatchedOld = [];
            var updatedCount = 0;
            // Pass 1: direct match by id + occurrence index
            Object.keys(newById).forEach(function (id) {
                var newArr = newById[id], oldArr = oldById[id] || [];
                for (var a = 0; a < newArr.length; a++) {
                    if (a < oldArr.length) {
                        var old = oldArr[a];
                        var kr = newArr[a];
                        kr.x = old.x;
                        kr.y = old.y;
                        if (dimsMatch(old.length, old.width, kr.length, kr.width)) {
                            kr.length = old.length; kr.width = old.width; kr.height = old.height;
                            kr.rotated = old.rotated;
                        } else {
                            kr.rotated = false;
                            updatedCount++;
                        }
                        kr.customFontSize = old.customFontSize;
                        kr.customColor = old.customColor;
                        kr.display = old.display || null;
                        kr.isDirectionalZone = !!old.isDirectionalZone;
                        kr.placementZone = old.placementZone || '';
                        kr.rotationOutOfBounds = !!old.rotationOutOfBounds;
                        if (old.weightOverride) {
                            kr.weight = old.weight;
                            kr.weightOverride = true;
                        }
                        keptRows.push(kr);
                    } else {
                        toAdd.push(newArr[a]);
                    }
                }
                for (var b = newArr.length; b < oldArr.length; b++) unmatchedOld.push(oldArr[b]);
            });
            Object.keys(oldById).forEach(function (id) {
                if (!newById[id]) oldById[id].forEach(function (o) { unmatchedOld.push(o); });
            });
            // Pass 2: virtual(dup) -> real renumber by rotation-insensitive signature
            var freeOld = unmatchedOld.slice();
            toAdd = toAdd.filter(function (row) {
                if ((idCount[row.id] || 0) === 1) {
                    var s = sigOf(row);
                    for (var k = 0; k < freeOld.length; k++) {
                        var o = freeOld[k];
                        if (o && o.isDuplicate && sigOf(o) === s) {
                            row.x = o.x; row.y = o.y;
                            row.length = o.length; row.width = o.width; row.height = o.height;
                            row.rotated = o.rotated; row.customFontSize = o.customFontSize;
                            row.isDirectionalZone = !!o.isDirectionalZone; row.placementZone = o.placementZone || '';
                            keptRows.push(row); renamedRows.push(row);
                            freeOld[k] = null;
                            return false;
                        }
                    }
                }
                return true;
            });
            freeOld.forEach(function (o) { if (o) toRemove.push(o); });
            // ---- apply ----
            placedContainers = manual.slice();
            selectedContainers.clear();
            var useDirectionalZones = true;
            keptRows.forEach(function (container) { placedContainers.push(container); });
            var placementResult = autoPlaceRows(toAdd, useDirectionalZones);
            var addedPlaced = placementResult.placed;
            var unplacedRows = placementResult.unplaced;
            containers = newRows;
            if (addedPlaced.some(function (c) { return c.isDirectionalZone; }) &&
                typeof fitViewToPlan === 'function') fitViewToPlan();
            var hl = Date.now();
            addedPlaced.forEach(function (c) { c._hl = hl; });
            renamedRows.forEach(function (c) { c._hl = hl; });
            checkAllSegregationViolations(); updateStats(); renderList(); draw();
            if (typeof autosaveDeck === 'function') autosaveDeck();
            setTimeout(function () { draw(); }, 3100);
            manifestChangeNotice = {
                importedAt: new Date().toISOString(),
                preserved: keptRows.length,
                added: addedPlaced.length,
                removed: toRemove.length,
                updated: updatedCount,
                duplicateRenames: renamedRows.length,
                unplaced: unplacedRows.map(function (c) { return c.id; })
            };
            if (undoImportStarted && typeof commitUndoableAction === 'function') commitUndoableAction();
            undoImportStarted = false;
            renderList();
            if (typeof showToast === 'function') {
                var msg = 'Манифест: сохранено позиций ' + keptRows.length +
                    ', добавлено ' + addedPlaced.length + ', удалено ' + toRemove.length +
                    (updatedCount ? ', обновлены размеры ' + updatedCount : '') +
                    (renamedRows.length ? ', обработано дубликатов ' + renamedRows.length : '') +
                    (unplacedRows.length ? ', НЕ РАЗМЕЩЕНО ' + unplacedRows.length + ': ' + unplacedRows.slice(0, 5).map(function (c) { return c.id; }).join(', ') : '');
                showToast(msg, unplacedRows.length ? 'warn' : 'ok');
            }
        } catch (err) { if (undoImportStarted && typeof cancelUndoableAction === 'function') cancelUndoableAction(); console.error('Ошибка:', err); alert('Ошибка загрузки файла: ' + err.message); }
    };
    reader.readAsArrayBuffer(file);
});
function isValidPosition(container, x, y) {
    return isGeometricallyValidPosition(container, x, y) && isSegregationSafeAt(container, x, y);
}
function isGeometricallyValidPosition(container, x, y) {
    if (x < DECK_COORDS.minX || y < DECK_COORDS.minY || x + container.length > DECK_COORDS.maxX || y + container.width > DECK_COORDS.maxY) return false;
    for (var i = 0; i < placedContainers.length; i++) {
        var o = placedContainers[i]; if (o === container) continue;
        if (x < o.x + o.length && x + container.length > o.x && y < o.y + o.width && y + container.width > o.y) return false;
    }
    return true;
}