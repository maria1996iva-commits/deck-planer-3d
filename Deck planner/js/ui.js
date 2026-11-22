// UI: sidebar, events, summary, context menus, stats
function updateStats() {
    var onDeck = placedContainers;
    document.getElementById('stat-count').textContent = onDeck.length;
    document.getElementById('stat-weight').textContent = onDeck.reduce(function (s, c) { return s + (c.weight || 0); }, 0).toFixed(1);
    document.getElementById('stat-imdg').textContent = onDeck.filter(function (c) { return c.isHazardous; }).length;
    document.getElementById('stat-ref').textContent = onDeck.filter(function (c) { return c.isReefer; }).length;
    document.getElementById('stat-food').textContent = onDeck.filter(function (c) { return c.isFood; }).length;
    document.getElementById('stat-dup').textContent = onDeck.filter(function (c) { return c.isDuplicate; }).length;
}

function toggleSidebar() {
    var sidebar = document.getElementById('sidebar'), btn = document.getElementById('sidebarToggleBtn');
    sidebar.classList.toggle('collapsed'); btn.classList.toggle('sidebar-open');
    if (sidebar.classList.contains('collapsed')) { btn.textContent = '▶'; btn.title = 'Развернуть сводку'; }
    else { btn.textContent = '◀'; btn.title = 'Свернуть сводку'; }
    setTimeout(function () { resizeCanvas(); if (state.calibrated) resetView(); }, 320);
}
function resizeCanvas() { if (!wrap || !canvas) return; canvas.width = wrap.clientWidth; canvas.height = wrap.clientHeight; draw(); }
function resetView() {
    if (!canvas || !wrap) return;
    if (placedContainers.some(function (c) { return c.isDirectionalZone; })) fitViewToPlan();
    else { state.panX = canvas.width / 2; state.panY = canvas.height / 2; }
    draw();
}
function fitViewToPlan() {
    if (!canvas || !placedContainers.length) return;
    var minX = DECK_COORDS.minX, maxX = DECK_COORDS.maxX;
    var minY = DECK_COORDS.minY, maxY = DECK_COORDS.maxY;
    placedContainers.forEach(function (c) {
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x + c.length);
        minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y + c.width);
    });
    var worldW = Math.max(1, maxX - minX), worldH = Math.max(1, maxY - minY);
    state.ppm = Math.max(0.02, Math.min(canvas.width / worldW, canvas.height / worldH) * 0.88);
    state.panX = canvas.width / 2 - (minX + maxX) / 2 * state.ppm;
    state.panY = canvas.height / 2 + (minY + maxY) / 2 * state.ppm;
}
function zoomIn() { state.ppm *= 1.25; draw(); }
function zoomOut() { state.ppm /= 1.25; draw(); }

function canMoveContainerGroup(group, dx, dy) {
    for (var i = 0; i < group.length; i++) {
        var container = group[i];
        var x = container.x + dx, y = container.y + dy;
        var bounds = getContainerMovementBounds(container);
        if (x < bounds.minX || y < bounds.minY ||
            x + container.length > bounds.maxX || y + container.width > bounds.maxY) return false;
    }
    return true;
}

function moveContainerGroup(dx, dy) {
    var group = pointerInteraction.group;
    var minDx = -Infinity, maxDx = Infinity, minDy = -Infinity, maxDy = Infinity;
    group.forEach(function (container) {
        var bounds = getContainerMovementBounds(container);
        minDx = Math.max(minDx, bounds.minX - container.x);
        maxDx = Math.min(maxDx, bounds.maxX - container.length - container.x);
        minDy = Math.max(minDy, bounds.minY - container.y);
        maxDy = Math.min(maxDy, bounds.maxY - container.width - container.y);
    });
    dx = Math.max(minDx, Math.min(maxDx, dx));
    dy = Math.max(minDy, Math.min(maxDy, dy));
    if (dx || dy) {
        group.forEach(function (container) { container.x += dx; container.y += dy; });
        group.forEach(function (container) { updateContainerSegregationViolations(container); });
    }
    updateGeometryWarnings();
}

function getContainerOverlap(a, b) {
    var overlapX = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x);
    var overlapY = Math.min(a.y + a.width, b.y + b.width) - Math.max(a.y, b.y);
    return overlapX > 0.000000001 && overlapY > 0.000000001 ?
        { x: overlapX, y: overlapY } : null;
}

function canApplyGroupOffset(group, dx, dy) {
    return group.every(function (container) {
        var bounds = getContainerMovementBounds(container);
        return container.x + dx >= bounds.minX && container.y + dy >= bounds.minY &&
            container.x + dx + container.length <= bounds.maxX &&
            container.y + dy + container.width <= bounds.maxY;
    });
}

function getGroupPlacementScore(group, neighbors, dx, dy, snapDistance) {
    var score = {
        shallowCount: 0,
        shallowDepth: 0,
        nearGapCount: 0,
        nearGapDistance: 0,
        contactCount: 0,
        movement: dx * dx + dy * dy
    };
    group.forEach(function (container) {
        var x = container.x + dx, y = container.y + dy;
        neighbors.forEach(function (other) {
            var overlapX = Math.min(x + container.length, other.x + other.length) -
                Math.max(x, other.x);
            var overlapY = Math.min(y + container.width, other.y + other.width) -
                Math.max(y, other.y);
            if (overlapX > 0.000000001 && overlapY > 0.000000001) {
                var depth = Math.min(overlapX, overlapY);
                if (depth <= 1.000000001) {
                    score.shallowCount++;
                    score.shallowDepth += depth;
                }
                return;
            }
            var gapX = Math.max(other.x - (x + container.length),
                x - (other.x + other.length), 0);
            var gapY = Math.max(other.y - (y + container.width),
                y - (other.y + other.width), 0);
            var gapSquared = gapX * gapX + gapY * gapY;
            if (gapSquared <= 0.000000000001) {
                score.contactCount++;
                return;
            }
            if (gapSquared < snapDistance * snapDistance) {
                score.nearGapCount++;
                score.nearGapDistance += Math.sqrt(gapSquared);
            }
        });
    });
    return score;
}

function isBetterCollisionPlacement(candidate, current) {
    var keys = ['shallowCount', 'shallowDepth', 'movement'];
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (candidate[key] < current[key] - 0.000000001) return true;
        if (candidate[key] > current[key] + 0.000000001) return false;
    }
    return false;
}

function isBetterContactPlacement(candidate, current) {
    var keys = ['nearGapCount', 'nearGapDistance'];
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (candidate[key] < current[key] - 0.000000001) return true;
        if (candidate[key] > current[key] + 0.000000001) return false;
    }
    if (candidate.contactCount !== current.contactCount) {
        return candidate.contactCount > current.contactCount;
    }
    return candidate.movement < current.movement - 0.000000001;
}

function resolveShallowDragOverlaps(interaction) {
    var group = interaction.group;
    var moving = new Set(group);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    var margin = 1;
    group.forEach(function (container) {
        minX = Math.min(minX, container.x);
        maxX = Math.max(maxX, container.x + container.length);
        minY = Math.min(minY, container.y);
        maxY = Math.max(maxY, container.y + container.width);
        margin = Math.max(margin, container.length + 1, container.width + 1);
    });
    var neighborMargin = margin * 3;
    var neighbors = placedContainers.filter(function (other) {
        return !moving.has(other) && other.x < maxX + neighborMargin &&
            other.x + other.length > minX - neighborMargin &&
            other.y < maxY + neighborMargin &&
            other.y + other.width > minY - neighborMargin;
    });
    var currentScore = getGroupPlacementScore(group, neighbors, 0, 0, 0.1);
    if (!currentScore.shallowCount && !currentScore.nearGapCount) return;
    var snapDistance = currentScore.shallowCount ? 0.25 : 0.1;
    currentScore = getGroupPlacementScore(group, neighbors, 0, 0, snapDistance);

    var xOffsets = [0], yOffsets = [0];
    group.forEach(function (container) {
        neighbors.forEach(function (other) {
            var left = other.x - (container.x + container.length);
            var right = other.x + other.length - container.x;
            var below = other.y - (container.y + container.width);
            var above = other.y + other.width - container.y;
            xOffsets.push(left, right);
            yOffsets.push(below, above);
        });
    });
    function uniqueOffsets(offsets) {
        offsets.sort(function (a, b) { return a - b; });
        return offsets.filter(function (offset, index) {
            return index === 0 || Math.abs(offset - offsets[index - 1]) > 0.000000001;
        });
    }
    xOffsets = uniqueOffsets(xOffsets);
    yOffsets = uniqueOffsets(yOffsets);
    var maxAxisCandidates = Math.max(3, Math.min(64,
        Math.floor(Math.sqrt(300000 / (group.length * neighbors.length)))));
    function limitOffsets(offsets) {
        if (offsets.length <= maxAxisCandidates) return offsets;
        var candidates = offsets.filter(function (offset) { return offset !== 0; })
            .sort(function (a, b) { return Math.abs(a) - Math.abs(b); });
        var selected = [0];
        var negative = candidates.filter(function (offset) { return offset < 0; });
        var positive = candidates.filter(function (offset) { return offset > 0; });
        var negativeIndex = 0, positiveIndex = 0;
        while (selected.length < maxAxisCandidates &&
            (negativeIndex < negative.length || positiveIndex < positive.length)) {
            if (negativeIndex < negative.length) selected.push(negative[negativeIndex++]);
            if (selected.length < maxAxisCandidates && positiveIndex < positive.length) {
                selected.push(positive[positiveIndex++]);
            }
        }
        selected.sort(function (a, b) { return a - b; });
        return selected;
    }
    xOffsets = limitOffsets(xOffsets);
    yOffsets = limitOffsets(yOffsets);

    var candidates = [{ offset: { x: 0, y: 0 }, score: currentScore }];
    var bestPlacement = candidates[0];
    xOffsets.forEach(function (dx) {
        yOffsets.forEach(function (dy) {
            if ((!dx && !dy) || Math.abs(dx) > margin * 2 ||
                Math.abs(dy) > margin * 2 || !canApplyGroupOffset(group, dx, dy)) return;
            var candidate = {
                offset: { x: dx, y: dy },
                score: getGroupPlacementScore(group, neighbors, dx, dy, snapDistance)
            };
            candidates.push(candidate);
            if (isBetterCollisionPlacement(candidate.score, bestPlacement.score)) {
                bestPlacement = candidate;
            }
        });
    });

    var bestOffset = bestPlacement.offset;
    var bestContactPlacement = bestPlacement;
    candidates.forEach(function (candidate) {
        if (Math.hypot(candidate.offset.x - bestOffset.x, candidate.offset.y - bestOffset.y) >
                snapDistance + 0.000000001 ||
            candidate.score.shallowCount !== bestPlacement.score.shallowCount ||
            Math.abs(candidate.score.shallowDepth - bestPlacement.score.shallowDepth) > 0.000000001) return;
        if (isBetterContactPlacement(candidate.score, bestContactPlacement.score)) {
            bestContactPlacement = candidate;
        }
    });
    bestOffset = bestContactPlacement.offset;

    if (bestOffset.x || bestOffset.y) {
        group.forEach(function (container) {
            container.x += bestOffset.x;
            container.y += bestOffset.y;
        });
    }
}

function updateGeometryWarnings() {
    geometryWarnings = [];
    geometryWarningContainers = new Set();
    placedContainers.forEach(function (container) {
        if (container.rotationOutOfBounds &&
            (container.x < DECK_COORDS.minX || container.y < DECK_COORDS.minY ||
             container.x + container.length > DECK_COORDS.maxX ||
             container.y + container.width > DECK_COORDS.maxY)) {
            geometryWarnings.push({ type: 'bounds', container: container });
            geometryWarningContainers.add(container);
        }
    });
    for (var i = 0; i < placedContainers.length; i++) {
        for (var j = i + 1; j < placedContainers.length; j++) {
            var overlap = getContainerOverlap(placedContainers[i], placedContainers[j]);
            if (!overlap) continue;
            geometryWarnings.push({
                type: 'overlap',
                container: placedContainers[i],
                otherContainer: placedContainers[j],
                depthX: overlap.x,
                depthY: overlap.y
            });
            geometryWarningContainers.add(placedContainers[i]);
            geometryWarningContainers.add(placedContainers[j]);
        }
    }
}

function updateMarqueeSelection(interaction) {
    var left = Math.min(interaction.startX, interaction.currentX);
    var right = Math.max(interaction.startX, interaction.currentX);
    var top = Math.min(interaction.startY, interaction.currentY);
    var bottom = Math.max(interaction.startY, interaction.currentY);
    selectedContainers = new Set(interaction.selectionBefore);
    for (var i = 0; i < placedContainers.length; i++) {
        var container = placedContainers[i];
        var topLeft = toScreen(container.x, container.y + container.width);
        var rightEdge = topLeft.x + container.length * state.ppm;
        var bottomEdge = topLeft.y + container.width * state.ppm;
        if (left <= rightEdge && right >= topLeft.x && top <= bottomEdge && bottom >= topLeft.y) {
            selectedContainers.add(container);
        }
    }
}

function finishPointerInteraction() {
    var interaction = pointerInteraction;
    if (!interaction) return;
    if (interaction.mode === 'container') {
        if (!interaction.started) {
            if (interaction.ctrlKey) {
                if (selectedContainers.has(interaction.target)) selectedContainers.delete(interaction.target);
                else selectedContainers.add(interaction.target);
            } else {
                selectedContainers = new Set([interaction.target]);
            }
        } else {
            resolveShallowDragOverlaps(interaction);
            interaction.group.forEach(function (container) { updateContainerSegregationViolations(container); });
            updateGeometryWarnings();
            if (interaction.group.some(function (container) { return container.isManual; }) &&
                typeof saveManualToStorage === 'function') saveManualToStorage();
            if (typeof commitUndoableAction === 'function') commitUndoableAction();
            checkAllSegregationViolations();
            updateStats();
            renderList();
            if (typeof autosaveDeck === 'function') autosaveDeck();
        }
    }
    canvas.classList.remove('grabbing', 'selecting');
    canvas.style.cursor = state.calibrated ? 'grab' : 'default';
    pointerInteraction = null;
    draw();
}

function getContainerMovementBounds(container) {
    var bounds = {
        minX: DECK_COORDS.minX - 5,
        maxX: DECK_COORDS.maxX + 5,
        minY: DECK_COORDS.minY - 5,
        maxY: DECK_COORDS.maxY + 5
    };
    if (!container.isDirectionalZone) return bounds;
    placedContainers.forEach(function (other) {
        bounds.minX = Math.min(bounds.minX, other.x - 5);
        bounds.maxX = Math.max(bounds.maxX, other.x + other.length + 5);
        bounds.minY = Math.min(bounds.minY, other.y - 5);
        bounds.maxY = Math.max(bounds.maxY, other.y + other.width + 5);
    });
    return bounds;
}

function setupEvents() {
    canvas.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        if (placementMode) { e.preventDefault(); e.stopPropagation(); doPlacementClick(e); return; }
        if (!state.calibrated && deckImage && state.step < 4) {
            e.preventDefault(); e.stopPropagation();
            var rect = canvas.getBoundingClientRect();
            var imgPx = (e.clientX - rect.left - lastImgDraw.x) / lastImgDraw.scale;
            var imgPy = (e.clientY - rect.top - lastImgDraw.y) / lastImgDraw.scale;
            if (state.step === 0) state.points.minX = { imgX: imgPx, imgY: imgPy };
            else if (state.step === 1) state.points.maxX = { imgX: imgPx, imgY: imgPy };
            else if (state.step === 2) state.points.maxY = { imgX: imgPx, imgY: imgPy };
            else if (state.step === 3) state.points.minY = { imgX: imgPx, imgY: imgPy };
            state.step++; updateHud(); draw();
            if (state.step >= 4) setTimeout(finishCalibration, 500);
            return;
        }
        if (state.calibrated) {
            e.preventDefault();
            var rect = canvas.getBoundingClientRect();
            var x = e.clientX - rect.left, y = e.clientY - rect.top;
            var coords = toDeck(x, y);
            var target = findContainerAt(coords.x, coords.y);
            pointerInteraction = {
                mode: target ? 'container' : (e.ctrlKey ? 'marquee' : 'pan'),
                target: target,
                ctrlKey: !!e.ctrlKey,
                startX: x,
                startY: y,
                currentX: x,
                currentY: y,
                lastDeckX: coords.x,
                lastDeckY: coords.y,
                initialPanX: state.panX,
                initialPanY: state.panY,
                started: false,
                selectionBefore: new Set(selectedContainers),
                group: []
            };
            if (!target && !e.ctrlKey) {
                selectedContainers.clear();
                canvas.style.cursor = 'grabbing';
                draw();
            }
        }
    });

    window.addEventListener('mousemove', function (e) {
        if (placementMode) {
            var rr = canvas.getBoundingClientRect();
            var dd = toDeck(e.clientX - rr.left, e.clientY - rr.top);
            document.getElementById('coordX').textContent = dd.x.toFixed(1);
            document.getElementById('coordY').textContent = dd.y.toFixed(1);
            var t = placementTemplate;
            placementGhost.x = dd.x - t.length / 2; placementGhost.y = dd.y - t.width / 2;
            draw(); return;
        }
        if (!pointerInteraction) {
            if (state.calibrated) { var r = canvas.getBoundingClientRect(); var d = toDeck(e.clientX - r.left, e.clientY - r.top); document.getElementById('coordX').textContent = d.x.toFixed(1); document.getElementById('coordY').textContent = d.y.toFixed(1); }
            return;
        }
        var interaction = pointerInteraction;
        var rect = canvas.getBoundingClientRect();
        interaction.currentX = e.clientX - rect.left;
        interaction.currentY = e.clientY - rect.top;
        var currentDeck = toDeck(interaction.currentX, interaction.currentY);
        document.getElementById('coordX').textContent = currentDeck.x.toFixed(1);
        document.getElementById('coordY').textContent = currentDeck.y.toFixed(1);
        var screenDx = interaction.currentX - interaction.startX;
        var screenDy = interaction.currentY - interaction.startY;

        if (!interaction.started && Math.hypot(screenDx, screenDy) < 4) return;
        if (!interaction.started) {
            interaction.started = true;
            if (interaction.mode === 'container') {
                if (!selectedContainers.has(interaction.target)) {
                    if (!interaction.ctrlKey) selectedContainers.clear();
                    selectedContainers.add(interaction.target);
                }
                interaction.group = Array.from(selectedContainers);
                interaction.startPositions = interaction.group.map(function (container) {
                    return { x: container.x, y: container.y };
                });
                if (typeof beginUndoableAction === 'function') beginUndoableAction();
                canvas.classList.add('grabbing');
                canvas.style.cursor = 'grabbing';
            } else if (interaction.mode === 'marquee') {
                canvas.classList.add('selecting');
            }
        }

        if (interaction.mode === 'container') {
            var dx = currentDeck.x - interaction.lastDeckX;
            var dy = currentDeck.y - interaction.lastDeckY;
            moveContainerGroup(dx, dy);
        } else if (interaction.mode === 'pan' && interaction.started) {
            state.panX = interaction.initialPanX + screenDx;
            state.panY = interaction.initialPanY + screenDy;
        } else if (interaction.mode === 'marquee') {
            updateMarqueeSelection(interaction);
        }
        interaction.lastDeckX = currentDeck.x;
        interaction.lastDeckY = currentDeck.y;
        draw();
    });

    window.addEventListener('mouseup', function (e) {
        if (e.button === 0) finishPointerInteraction();
    });

    wrap.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        if (!state.calibrated) { if (typeof showToast === 'function') showToast('Сначала загрузите схему и откалибруйте палубу', 'info'); return; }
        if (placementMode) { exitPlacement(); return; }
        var r = canvas.getBoundingClientRect(); var d = toDeck(e.clientX - r.left, e.clientY - r.top);
        var cont = findContainerAt(d.x, d.y);
        if (cont) { if (typeof closeEmptyMenu === 'function') closeEmptyMenu(); showContextMenu(e, cont); }
        else {
            closeContextMenu();
            if (typeof showEmptyMenu === 'function') showEmptyMenu(e, d);
            else if (typeof showToast === 'function') showToast('Модуль «+ Контейнер» не загрузился — откройте консоль (F12)', 'err');
        }
    });

    document.addEventListener('mousedown', function (e) {
        var m = document.getElementById('contextMenu');
        if (!m.contains(e.target) && e.button !== 2) closeContextMenu();
        if (typeof closeEmptyMenu === 'function') { var em = document.getElementById('emptyContextMenu'); if (em && !em.contains(e.target) && e.button !== 2) closeEmptyMenu(); }
    });

    document.addEventListener('keydown', function (e) {
        if (typeof is3DView !== 'undefined' && is3DView) return;
        if (e.key === 'Delete' && state.calibrated) {
            var deleteTarget = e.target;
            var deleteTyping = deleteTarget &&
                (deleteTarget.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(deleteTarget.tagName));
            var editDialogOpen = (typeof isManualModalOpen === 'function' && isManualModalOpen()) ||
                (typeof isStatesModalOpen === 'function' && isStatesModalOpen());
            if (!deleteTyping && !editDialogOpen && selectedContainers.size) {
                e.preventDefault();
                deleteContainers(selectedContainers);
                return;
            }
        }
        if (/^Arrow(?:Left|Right|Up|Down)$/.test(e.key) && state.calibrated &&
            !(e.ctrlKey || e.metaKey || e.altKey)) {
            var target = e.target;
            var typing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
            var manualOpen = typeof isManualModalOpen === 'function' && isManualModalOpen();
            var statesOpen = typeof isStatesModalOpen === 'function' && isStatesModalOpen();
            if (!typing && !manualOpen && !statesOpen) {
                var step = e.shiftKey ? 60 : 20;
                if (e.key === 'ArrowLeft') state.panX -= step;
                else if (e.key === 'ArrowRight') state.panX += step;
                else if (e.key === 'ArrowUp') state.panY -= step;
                else state.panY += step;
                e.preventDefault();
                draw();
                return;
            }
        }
        if (e.key === 'Escape') {
            if (typeof isStatesModalOpen === 'function' && isStatesModalOpen()) { closeStatesModal(); return; }
            if (typeof isManualModalOpen === 'function' && isManualModalOpen()) { closeManualModal(); return; }
            if (placementMode) { exitPlacement(); return; }
            closeContextMenu(); if (typeof closeEmptyMenu === 'function') closeEmptyMenu();
        }
    });

    wrap.addEventListener('wheel', function (e) {
        if (!state.calibrated) return;
        e.preventDefault();
        var rect = canvas.getBoundingClientRect();
        var mx = e.clientX - rect.left, my = e.clientY - rect.top;
        var wheel = e.deltaY < 0 ? 1 : -1, zoomFactor = Math.exp(wheel * 0.1);
        var worldX = (mx - state.panX) / state.ppm, worldY = (state.panY - my) / state.ppm;
        state.ppm = Math.max(0.1, Math.min(100, state.ppm * zoomFactor));
        state.panX = mx - worldX * state.ppm; state.panY = my + worldY * state.ppm;
        draw();
    }, { passive: false });
}

function renderList() {
    updateGeometryWarnings();
    var list = document.getElementById('cargoList'); list.innerHTML = '';
    var manual = placedContainers.filter(function (c) { return c.isManual; });
    if (manifestChangeNotice) {
        var notice = document.createElement('div');
        notice.className = 'manifest-change-notice';
        var dismiss = document.createElement('button');
        dismiss.className = 'manifest-change-dismiss';
        dismiss.type = 'button';
        dismiss.textContent = '×';
        dismiss.setAttribute('aria-label', 'Скрыть уведомление об изменении манифеста');
        dismiss.onclick = function () { manifestChangeNotice = null; renderList(); };
        var title = document.createElement('strong');
        title.textContent = 'Манифест обновлён · ' + new Date(manifestChangeNotice.importedAt).toLocaleString();
        var details = document.createElement('div');
        details.textContent = 'Сохранено позиций: ' + manifestChangeNotice.preserved +
            ' · Добавлено: ' + manifestChangeNotice.added +
            ' · Удалено: ' + manifestChangeNotice.removed;
        if (manifestChangeNotice.updated) details.textContent += ' · Обновлены размеры: ' + manifestChangeNotice.updated;
        if (manifestChangeNotice.duplicateRenames) details.textContent += ' · Совпадения дубликатов: ' + manifestChangeNotice.duplicateRenames;
        if (manifestChangeNotice.unplaced.length) {
            details.textContent += ' · Не размещено: ' + manifestChangeNotice.unplaced.join(', ');
        }
        notice.appendChild(dismiss);
        notice.appendChild(title);
        notice.appendChild(details);
        list.appendChild(notice);
    }
    if (placedContainers.length === 0) {
        var empty = document.createElement('div');
        empty.style.cssText = 'text-align:center; padding:20px; color:#666;';
        empty.textContent = 'На палубе пока нет контейнеров';
        list.appendChild(empty);
        return;
    }

    if (violations.length > 0) {
        var vt = document.createElement('div'); vt.className = 'summary-section-title'; vt.style.color = '#ef4444';
        vt.textContent = '⚠️ Нарушения IMDG: ' + violations.length; list.appendChild(vt);
        violations.slice(0, 5).forEach(function (v) {
            var div = document.createElement('div');
            div.style.cssText = 'font-size:0.72rem; padding:5px; margin-bottom:4px; background:rgba(239,68,68,0.15); border-left:3px solid #ef4444;';
            div.innerHTML = '<div style="color:#ef4444; font-weight:bold;">' + v.container1.id + (v.container1.isFood ? ' (FOOD)' : v.container1.isHazardous ? ' (IMDG ' + v.container1.imdgClass + ')' : '') + ' ↔ ' + v.container2.id + (v.container2.isFood ? ' (FOOD)' : v.container2.isHazardous ? ' (IMDG ' + v.container2.imdgClass + ')' : '') + '</div>' +
                '<div style="color:#c9d1d9; margin-top:2px;">Код: <b>' + v.code + '</b> | Требуется: <b>' + (v.requiredDistance ? v.requiredDistance.toFixed(2) + ' м' : 'отсек / проверка') + '</b> | Факт: <b>' + v.actualDistance.toFixed(2) + ' м</b><br>' + v.reason + '</div>';
            list.appendChild(div);
        });
        if (violations.length > 5) { var more = document.createElement('div'); more.style.cssText = 'font-size:0.72rem; padding:4px; color:#8b949e; text-align:center;'; more.textContent = '... и ещё ' + (violations.length - 5) + ' нарушений'; list.appendChild(more); }
    }

    if (segregationWarnings.length > 0) {
        var wt = document.createElement('div');
        wt.className = 'summary-section-title';
        wt.style.color = 'var(--warning)';
        wt.textContent = 'Нужна проверка IMDG/зон: ' + segregationWarnings.length;
        list.appendChild(wt);
        segregationWarnings.forEach(function (warning) {
            var item = document.createElement('div');
            item.style.cssText = 'font-size:0.72rem; padding:5px; margin-bottom:4px; color:#fcd34d; background:rgba(245,158,11,0.10);';
            item.textContent = warning.otherContainer ?
                warning.container.id + ' ↔ ' + warning.otherContainer.id + ' · ' + warning.reason :
                warning.container.id + ' · IMDG ' + warning.container.imdgClass + ' · ' + warning.reason;
            list.appendChild(item);
        });
    }

    if (geometryWarnings.length > 0) {
        var geometryTitle = document.createElement('div');
        geometryTitle.className = 'summary-section-title';
        geometryTitle.style.color = 'var(--danger)';
        geometryTitle.textContent = 'Геометрические предупреждения: ' + geometryWarnings.length;
        list.appendChild(geometryTitle);
        geometryWarnings.forEach(function (warning) {
            var item = document.createElement('div');
            item.style.cssText = 'font-size:0.72rem; padding:5px; margin-bottom:4px; color:#fca5a5; background:rgba(239,68,68,0.12);';
            if (warning.type === 'overlap') {
                item.textContent = warning.container.id + ' ↔ ' + warning.otherContainer.id +
                    ' · наложение: X ' + warning.depthX.toFixed(2) +
                    ' м, Y ' + warning.depthY.toFixed(2) + ' м';
            } else {
                item.textContent = warning.container.id + ' · повернут за пределы откалиброванной зоны';
            }
            list.appendChild(item);
        });
    }

    var t1 = document.createElement('div'); t1.className = 'summary-section-title'; t1.textContent = '📊 Статистика палубы'; list.appendChild(t1);
    var totalWeight = placedContainers.reduce(function (s, c) { return s + (c.weight || 0); }, 0);
    var st = document.createElement('table'); st.className = 'summary-table';
    st.innerHTML =
        '<tr><td>На палубе</td><td style="text-align:center;">' + placedContainers.length + '</td></tr>' +
        '<tr><td>Добавлено вручную</td><td style="text-align:center; color:var(--info);">' + manual.length + '</td></tr>' +
        '<tr><td>Общий вес на палубе</td><td style="text-align:center;">' + totalWeight.toFixed(1) + ' т</td></tr>' +
        '<tr><td>IMDG на палубе</td><td style="text-align:center; color:var(--danger);">' + placedContainers.filter(function (c) { return c.isHazardous; }).length + '</td></tr>' +
        '<tr><td>Реф на палубе</td><td style="text-align:center; color:var(--warning);">' + placedContainers.filter(function (c) { return c.isReefer; }).length + '</td></tr>' +
        '<tr><td>Пищевые контейнеры</td><td style="text-align:center; color:var(--success);">' + placedContainers.filter(function (c) { return c.isFood; }).length + '</td></tr>' +
        '<tr><td>Дубликаты</td><td style="text-align:center; color:var(--danger);">' + placedContainers.filter(function (c) { return c.isDuplicate; }).length + '</td></tr>' +
        '<tr><td>Нарушения IMDG</td><td style="text-align:center; color:var(--danger); font-weight:bold;">' + violations.length + '</td></tr>';
    list.appendChild(st);

    if (placedContainers.length > 0) {
        var t4 = document.createElement('div'); t4.className = 'summary-section-title'; t4.textContent = '🧭 По направлениям'; list.appendChild(t4);
        var byDest = {};
        placedContainers.forEach(function (c) { var d = c.destination || 'Не указано'; if (!byDest[d]) byDest[d] = []; byDest[d].push(c); });
        Object.keys(byDest).sort().forEach(function (dest) {
            var items = byDest[dest];
            var dw = items.reduce(function (s, c) { return s + c.weight; }, 0);
            var dt = document.createElement('table'); dt.className = 'summary-table';
            dt.innerHTML = '<tr><th colspan="4" style="background:#1a2332; color:var(--info);">' + dest + ' (' + items.length + ' ед., ' + dw.toFixed(1) + ' т)</th></tr><tr><th>№</th><th>ID</th><th>Тип</th><th>Вес</th></tr>';
            items.sort(function (a, b) { return a.seq - b.seq; }).forEach(function (c) {
                var tr = document.createElement('tr'); tr.style.cursor = 'pointer';
                var special = (c.isHazardous ? '⚠️' : '') + (c.isReefer ? '⚡' : '') + (c.isFood ? ' FOOD' : '');
                var idStyle = c.isDuplicate ? 'color:var(--danger); font-weight:bold;' : '';
                tr.innerHTML = '<td>' + c.seq + special + '</td><td style="' + idStyle + '" title="' + c.id + '">' + c.id.substring(0, 10) + '</td><td>' + c.type + '</td><td style="text-align:center;">' + c.weight.toFixed(1) + '</td>';
                tr.onclick = function () { var pp = toScreen(c.x + c.length / 2, c.y + c.width / 2); state.panX = canvas.width / 2 - pp.x + state.panX; state.panY = canvas.height / 2 - pp.y + state.panY; draw(); };
                dt.appendChild(tr);
            });
            list.appendChild(dt);
        });
    }

    if (manual.length > 0) {
        var tm = document.createElement('div'); tm.className = 'summary-section-title'; tm.style.color = 'var(--info)'; tm.textContent = '➕ Добавленные вручную (' + manual.length + ')'; list.appendChild(tm);
        var mt = document.createElement('table'); mt.className = 'summary-table';
        mt.innerHTML = '<tr><th>ID</th><th>Размер</th><th>Вес</th><th>IMDG/REF</th></tr>';
        manual.forEach(function (c) {
            var tr = document.createElement('tr'); tr.style.cursor = 'pointer';
            var tags = '✋ ' + (c.isHazardous ? '⚠️' : '') + (c.isReefer ? '⚡' : '') + (c.isFood ? 'FOOD ' : '') + (c.isPlanned ? '◌' : '');
            tr.innerHTML = '<td style="color:var(--info); font-weight:bold;" title="' + (c.destination || '') + '">' + c.id + '</td><td>' + c.length.toFixed(2) + '×' + c.width.toFixed(2) + '</td><td style="text-align:center;">' + c.weight.toFixed(1) + '</td><td>' + tags + '</td>';
            tr.onclick = function () { var pp = toScreen(c.x + c.length / 2, c.y + c.width / 2); state.panX = canvas.width / 2 - pp.x + state.panX; state.panY = canvas.height / 2 - pp.y + state.panY; draw(); };
            mt.appendChild(tr);
        });
        list.appendChild(mt);
    }
}

function showContextMenu(e, cont) {
    contextTarget = cont;
    var m = document.getElementById('contextMenu');
    document.getElementById('ctxHeader').textContent = (cont.isManual ? '✋ ' : '№') + cont.seq + ' ' + cont.id;
    var b = '';
    if (cont.isHazardous) b += '<span style="color:var(--danger);font-weight:bold;">IMDG ' + cont.imdgClass + '</span> ';
    if (cont.isReefer) b += '<span style="color:var(--warning);font-weight:bold;">REF ' + cont.temp + '</span> ';
    if (cont.isFood) b += '<span style="color:var(--success);font-weight:bold;">FOOD</span> ';
    if (cont.isDuplicate) b += '<span style="color:var(--danger);font-weight:bold;">ДУБЛИКАТ</span>';
    if (cont.isManual) b += '<span style="color:var(--info);font-weight:bold;">РУЧНОЙ</span>';
    if (cont.isPlanned) b += '<span style="color:var(--text);font-weight:bold;">ПЛАН</span>';
    document.getElementById('ctxBody').innerHTML = '<div class="context-row"><span class="context-label">Тип:</span><span class="context-value">' + cont.type + '</span></div><div class="context-row"><span class="context-label">Назначение:</span><span class="context-value">' + (cont.destination || '-') + '</span></div><div class="context-row"><span class="context-label">Размеры:</span><span class="context-value">' + cont.length.toFixed(2) + '×' + cont.width.toFixed(2) + '×' + cont.height.toFixed(2) + ' м</span></div><div class="context-row"><span class="context-label">Вес:</span><span class="context-value">' + cont.weight.toFixed(1) + ' т</span></div><div style="margin-top:6px;">' + b + '</div>';
    var eb = document.getElementById('ctxEdit'); if (eb) { if (cont.isManual) eb.classList.remove('hidden'); else eb.classList.add('hidden'); }
    if (eb && !document.getElementById('ctxWeightEdit')) {
        var weightButton = document.createElement('button');
        weightButton.type = 'button';
        weightButton.id = 'ctxWeightEdit';
        weightButton.className = 'context-btn';
        weightButton.textContent = '⚖️ Изменить вес';
        weightButton.onclick = editContainerWeight;
        eb.parentNode.insertBefore(weightButton, eb.nextSibling);
    }
    var weightEditButton = document.getElementById('ctxWeightEdit');
    if (weightEditButton) weightEditButton.classList.toggle('hidden', !!cont.isManual);
    m.style.left = e.clientX + 'px'; m.style.top = e.clientY + 'px'; m.classList.add('active');
    setTimeout(function () { var r = m.getBoundingClientRect(); if (r.right > window.innerWidth) m.style.left = (e.clientX - r.width) + 'px'; if (r.bottom > window.innerHeight) m.style.top = (e.clientY - r.height) + 'px'; }, 0);
}
function closeContextMenu() { document.getElementById('contextMenu').classList.remove('active'); contextTarget = null; }
function editContainerWeight() {
    if (!contextTarget || contextTarget.isManual) return;
    var container = contextTarget;
    var input = prompt('Введите новый вес контейнера, т:', String(container.weight || 0));
    if (input === null) return;
    var value = input.trim().replace(',', '.');
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !isFinite(Number(value))) {
        if (typeof showToast === 'function') showToast('Укажите вес числом не меньше нуля', 'err');
        return;
    }
    if (typeof beginUndoableAction === 'function') beginUndoableAction();
    container.weight = Number(value);
    container.weightOverride = true;
    closeContextMenu();
    updateStats();
    renderList();
    draw();
    if (typeof autosaveDeck === 'function') autosaveDeck();
    if (typeof commitUndoableAction === 'function') commitUndoableAction();
    if (typeof showToast === 'function') showToast('Вес контейнера обновлён', 'ok');
}

function rotateContainer() {
    if (!contextTarget) return;
    var c = contextTarget;
    var oldLength = c.length, oldWidth = c.width;
    if (typeof beginUndoableAction === 'function') beginUndoableAction();
    c.length = oldWidth;
    c.width = oldLength;
    c.rotated = !c.rotated;
    c.rotationOutOfBounds = c.x < DECK_COORDS.minX || c.y < DECK_COORDS.minY ||
        c.x + c.length > DECK_COORDS.maxX || c.y + c.width > DECK_COORDS.maxY;
    closeContextMenu();
    checkAllSegregationViolations();
    updateGeometryWarnings();
    updateStats();
    renderList();
    draw();
    if (c.isManual && typeof saveManualToStorage === 'function') saveManualToStorage();
    if (typeof autosaveDeck === 'function') autosaveDeck();
    if (typeof commitUndoableAction === 'function') commitUndoableAction();
}
function increaseContainerFont() {
    if (!contextTarget) return;
    if (typeof beginUndoableAction === 'function') beginUndoableAction();
    contextTarget.customFontSize = (contextTarget.customFontSize === null) ? 10 : Math.min(24, contextTarget.customFontSize + 2);
    draw(); if (typeof autosaveDeck === 'function') autosaveDeck();
    if (typeof commitUndoableAction === 'function') commitUndoableAction();
}
function decreaseContainerFont() {
    if (!contextTarget) return;
    if (typeof beginUndoableAction === 'function') beginUndoableAction();
    contextTarget.customFontSize = (contextTarget.customFontSize === null) ? 10 : Math.max(6, contextTarget.customFontSize - 2);
    draw(); if (typeof autosaveDeck === 'function') autosaveDeck();
    if (typeof commitUndoableAction === 'function') commitUndoableAction();
}
function resetContainerFont() {
    if (!contextTarget) return;
    if (typeof beginUndoableAction === 'function') beginUndoableAction();
    contextTarget.customFontSize = null;
    draw(); if (typeof autosaveDeck === 'function') autosaveDeck();
    if (typeof commitUndoableAction === 'function') commitUndoableAction();
}
function deleteSelected() {
    if (!contextTarget) return;
    var targets = selectedContainers.has(contextTarget) ?
        Array.from(selectedContainers) : [contextTarget];
    deleteContainers(targets);
}
function deleteContainers(targets) {
    var removing = new Set(targets);
    if (!removing.size) return;
    if (typeof beginUndoableAction === 'function') beginUndoableAction();
    selectedContainers.forEach(function (container) {
        if (removing.has(container)) selectedContainers.delete(container);
    });
    placedContainers = placedContainers.filter(function (container) { return !removing.has(container); });
    closeContextMenu(); checkAllSegregationViolations(); updateStats(); renderList(); draw();
    if (typeof saveManualToStorage === 'function') saveManualToStorage();
    if (typeof autosaveDeck === 'function') autosaveDeck();
    if (typeof commitUndoableAction === 'function') commitUndoableAction();
}