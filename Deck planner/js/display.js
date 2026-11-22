// DISPLAY OPTIONS: global overlays, prefixes, and per-container data lines.
var displayMenu = document.getElementById('displayMenu');
var displayBody = document.getElementById('displayBody');
var displayTarget = null;
var lastCtxPos = { x: 0, y: 0 };

function copyObj(o) { var r = {}; for (var k in o) r[k] = o[k]; return r; }
function copyDisplay(src) {
    src = src || DEFAULT_DISPLAY;
    function enabled(key) { return src[key] === undefined ? !!DEFAULT_DISPLAY[key] : !!src[key]; }
    return { seq: enabled('seq'), id: enabled('id'), weight: enabled('weight'), imdg: enabled('imdg'), temp: enabled('temp'), priority: enabled('priority'), crane: enabled('crane'), type: enabled('type') };
}
function normDisplay(c) { if (c) c.display = copyDisplay(c.display); return c ? c.display : null; }
function persistDeck() { if (typeof saveManualToStorage === 'function') saveManualToStorage(); if (typeof autosaveDeck === 'function') autosaveDeck(); }

var baseDisplayDefaults = copyDisplay(DEFAULT_DISPLAY);
function loadDisplayDefaults() {
    try {
        var saved = localStorage.getItem('containerDisplayDefaults');
        return saved ? copyDisplay(JSON.parse(saved)) : null;
    } catch (e) {
        return null;
    }
}
var savedDisplayDefaults = loadDisplayDefaults();
if (savedDisplayDefaults) Object.assign(DEFAULT_DISPLAY, savedDisplayDefaults);

function saveDisplayDefaults() {
    try {
        localStorage.setItem('containerDisplayDefaults', JSON.stringify(DEFAULT_DISPLAY));
    } catch (e) {
        if (typeof showToast === 'function') showToast('Не удалось сохранить настройки отображения', 'warn');
    }
}

try {
    var savedOverlayVisibility = localStorage.getItem('showSegregationViolations');
    if (savedOverlayVisibility !== null) showSegregationViolations = savedOverlayVisibility !== 'false';
} catch (e) {}

var prefixMenu = document.getElementById('prefixMenu');
var prefixBody = document.getElementById('prefixBody');

function loadPrefixDisplay() { var r = null; try { r = localStorage.getItem('prefixDisplay'); } catch (e) {} if (r) { try { return JSON.parse(r); } catch (e) {} } return null; }
prefixDisplay = loadPrefixDisplay() || copyObj(DEFAULT_PREFIX_DISPLAY);

function buildPrefixBody() {
    prefixBody.innerHTML = '';
    PREFIX_LIST.forEach(function (pfx) {
        var lab = document.createElement('label'); lab.className = 'display-check';
        var inp = document.createElement('input'); inp.type = 'checkbox'; inp.setAttribute('data-p', pfx); inp.checked = prefixOn(pfx);
        lab.appendChild(inp); lab.appendChild(document.createTextNode(' ' + pfx));
        prefixBody.appendChild(lab);
    });
}
buildPrefixBody();

[
    { key: 'type', label: 'Тип контейнера' },
    { key: 'priority', label: 'Приоритет выгрузки' },
    { key: 'crane', label: 'Номер крана выгрузки' }
].forEach(function (option) {
    var label = document.createElement('label');
    label.className = 'display-check';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('data-d', option.key);
    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + option.label));
    displayBody.appendChild(label);
});

var displayHeader = displayMenu.querySelector('.context-header');
if (displayHeader) displayHeader.textContent = '⚙ Настройки отображения';
var violationSection = document.createElement('div');
violationSection.className = 'display-section';
var violationTitle = document.createElement('div');
violationTitle.className = 'display-section-title';
violationTitle.textContent = 'Слои схемы';
var violationLabel = document.createElement('label');
violationLabel.className = 'display-check';
var violationToggle = document.createElement('input');
violationToggle.type = 'checkbox';
violationToggle.checked = showSegregationViolations;
violationLabel.appendChild(violationToggle);
violationLabel.appendChild(document.createTextNode('Нарушения сегрегации'));
violationSection.appendChild(violationTitle);
violationSection.appendChild(violationLabel);
displayMenu.insertBefore(violationSection, displayBody);

var detailTitle = document.createElement('div');
detailTitle.className = 'display-section-title';
detailTitle.textContent = 'Подписи контейнера';
displayMenu.insertBefore(detailTitle, displayBody);

var prefixTitle = document.createElement('div');
prefixTitle.className = 'display-section-title';
prefixTitle.textContent = 'Префиксы контейнеров';
var prefixSection = document.createElement('div');
prefixSection.className = 'display-section';
prefixSection.appendChild(prefixTitle);
prefixSection.appendChild(prefixBody);
displayMenu.insertBefore(prefixSection, displayMenu.querySelector('.context-footer'));
prefixMenu.parentNode.removeChild(prefixMenu);

var prefixButton = document.getElementById('btnPrefix');
if (prefixButton) {
    prefixButton.textContent = '⚙ Отображение';
    prefixButton.title = 'Настройки отображения схемы и подписей';
}

document.addEventListener('contextmenu', function (e) { lastCtxPos = { x: e.clientX, y: e.clientY }; closeDisplayMenu(); });

function openDisplayMenu() {
    displayTarget = contextTarget;
    if (displayTarget) normDisplay(displayTarget);
    syncDisplayChecks();
    displayMenu.classList.add('active');
    placeMenuAt(displayMenu, lastCtxPos.x, lastCtxPos.y);
}
function openGlobalDisplayMenu() {
    displayTarget = null;
    syncDisplayChecks();
    displayMenu.classList.add('active');
    var button = document.getElementById('btnPrefix');
    var rect = button ? button.getBoundingClientRect() : null;
    placeMenuAt(displayMenu, rect ? rect.right - displayMenu.offsetWidth : 10, rect ? rect.bottom + 6 : 10);
}
function openPrefixMenu() { openGlobalDisplayMenu(); }
function closeDisplayMenu() { displayMenu.classList.remove('active'); }
function closePrefixMenu() { closeDisplayMenu(); }
function syncDisplayChecks() {
    var d = displayTarget ? displayTarget.display : DEFAULT_DISPLAY;
    displayBody.querySelectorAll('input[data-d]').forEach(function (inp) { inp.checked = !!d[inp.getAttribute('data-d')]; });
    violationToggle.checked = showSegregationViolations;
    if (displayHeader) displayHeader.textContent = displayTarget ?
        '⚙ Отображение: ' + (displayTarget.id || 'контейнер') : '⚙ Настройки отображения';
}
if (prefixButton) prefixButton.onclick = openGlobalDisplayMenu;
var detailsButton = document.getElementById('ctxDetails');
if (detailsButton) detailsButton.onclick = openDisplayMenu;

// keep any floating menu inside the viewport
function placeMenuAt(menu, x, y) {
    var mw = menu.offsetWidth, mh = menu.offsetHeight;
    if (x + mw > window.innerWidth - 8) x = window.innerWidth - mw - 8;
    if (y + mh > window.innerHeight - 8) y = window.innerHeight - mh - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

violationToggle.addEventListener('change', function () {
    showSegregationViolations = violationToggle.checked;
    try {
        localStorage.setItem('showSegregationViolations', String(showSegregationViolations));
    } catch (e) {
        if (typeof showToast === 'function') showToast('Не удалось сохранить настройку отображения', 'warn');
    }
    draw();
});
displayBody.addEventListener('change', function (e) {
    var inp = e.target; var key = inp.getAttribute && inp.getAttribute('data-d');
    if (!key) return;
    if (displayTarget) {
        normDisplay(displayTarget); displayTarget.display[key] = inp.checked;
    } else {
        DEFAULT_DISPLAY[key] = inp.checked;
        containers.forEach(function (c) { c.display = copyDisplay(DEFAULT_DISPLAY); });
        placedContainers.forEach(function (c) { c.display = copyDisplay(DEFAULT_DISPLAY); });
        saveDisplayDefaults();
    }
    draw(); persistDeck();
});
document.getElementById('dispClose').onclick = closeDisplayMenu;
document.getElementById('dispReset').onclick = function () {
    if (displayTarget) {
        displayTarget.display = copyDisplay(baseDisplayDefaults);
    } else {
        Object.assign(DEFAULT_DISPLAY, baseDisplayDefaults);
        containers.forEach(function (c) { c.display = copyDisplay(DEFAULT_DISPLAY); });
        placedContainers.forEach(function (c) { c.display = copyDisplay(DEFAULT_DISPLAY); });
        saveDisplayDefaults();
    }
    syncDisplayChecks(); draw(); persistDeck();
};
document.getElementById('dispApplyAll').onclick = function () {
    var src = displayTarget ? copyDisplay(normDisplay(displayTarget)) : copyDisplay(DEFAULT_DISPLAY);
    containers.forEach(function (c) { c.display = copyDisplay(src); });
    placedContainers.forEach(function (c) { c.display = copyDisplay(src); });
    draw(); persistDeck();
    if (typeof showToast === 'function') showToast('Отображение применено ко всем контейнерам', 'ok');
};

prefixBody.addEventListener('change', function (e) {
    var inp = e.target; var pfx = inp.getAttribute && inp.getAttribute('data-p'); if (!pfx) return;
    if (!prefixDisplay) prefixDisplay = {};
    prefixDisplay[pfx] = inp.checked;
    try { localStorage.setItem('prefixDisplay', JSON.stringify(prefixDisplay)); } catch (err) {}
    draw();
});

document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeDisplayMenu(); closePrefixMenu(); } });
document.addEventListener('mousedown', function (e) {
    if (displayMenu && !displayMenu.contains(e.target)) closeDisplayMenu();
});