// DECK GEOMETRY
var DECK_COORDS = { minX: -5.75, maxX: 44.3, minY: -7.5, maxY: 7.5 };
var DECK_W = DECK_COORDS.maxX - DECK_COORDS.minX; // 50.05
var DECK_H = DECK_COORDS.maxY - DECK_COORDS.minY; // 15

// What to draw on each container by default (per-container overridable via "Details")
var DEFAULT_DISPLAY = { seq: true, id: true, weight: false, imdg: true, temp: true, priority: true, crane: true, type: false };

// Prefixes that can be toggled on the deck (global checkboxes)
var PREFIX_LIST = ['SARF', 'SEIC', 'ERAU', 'OHS', 'KAA', 'CSL', 'SAW', 'MOOU'];
// Defaults mirror current look; MOOU is hidden by default (number only)
var DEFAULT_PREFIX_DISPLAY = { SARF: false, SEIC: false, ERAU: true, OHS: false, KAA: true, CSL: true, SAW: true, MOOU: false };
var prefixDisplay = null; // filled by display.js from localStorage
function prefixOn(pfx) { var pd = prefixDisplay || DEFAULT_PREFIX_DISPLAY; return pd[pfx] === undefined ? !!DEFAULT_PREFIX_DISPLAY[pfx] : !!pd[pfx]; }

var CONTAINER_TYPE_CODES = [
    { code: 'ERAU 001', suffix: '-', label: "10'" },
    { prefix: 'KAA', suffix: '-S', label: "10'" },
    { prefix: 'AMD', suffix: '-S', label: "5'" },
    { prefix: 'OHS', label: 'Nitrogen Cont' },
    { prefix: 'OSR', label: "20' Open top" },
    { code: '012A', label: '500 gal chem tank' },
    { code: '001', label: "6'" },
    { code: '002', label: "6'" },
    { code: '003', label: "8'" },
    { code: '004', label: "8'" },
    { code: '005', label: "10'" },
    { code: '006', label: "10' HH" },
    { code: '007', label: "10' OT" },
    { code: '008', label: "20' HH" },
    { code: '009', label: 'Gas rack' },
    { code: '010', label: '300 gal tank' },
    { code: '011', label: '500 gal tank' },
    { code: '012', label: '300 gal chem tank' },
    { code: '014', label: 'IBC tank' },
    { code: '015', label: 'Skip' },
    { code: '016', label: 'Skip' },
    { code: '017', label: "24' basket" },
    { code: '018', label: "10' Ref" },
    { code: '019', label: "10' Heater" },
    { code: '020', label: "20' Heater" },
    { code: '021', label: "10'" },
    { code: '023', label: 'Skip' },
    { code: '024', label: 'Gas rack' },
    { code: '028', label: "53' Basket" },
    { code: '030', label: "20' Open top" },
    { code: '031', label: '300 gal tank' }
];
var CONTAINER_ID_PREFIXES = /^(?:SARF|VFH|SEIC|OHS|KAA|ERAU|CSL|SAW|MOOU)\s*/i;

function getContainerDisplayType(container) {
    if (!container) return '';
    if (container.isManual) return String(container.type || '').trim();

    var identifiers = [container.rawId, container.id];
    if (container.prefix && container.num) identifiers.push(container.prefix + ' ' + container.num);
    identifiers = identifiers.filter(Boolean).map(function (value) {
        return String(value).trim().toUpperCase().replace(/\s+/g, ' ');
    });

    for (var i = 0; i < CONTAINER_TYPE_CODES.length; i++) {
        var rule = CONTAINER_TYPE_CODES[i];
        var matched = identifiers.some(function (identifier) {
            if (rule.prefix) {
                var prefixPattern = new RegExp('^' + rule.prefix + '(?:\\s+|$)');
                if (!prefixPattern.test(identifier)) return false;
                if (!rule.suffix) return true;
                return identifier.endsWith(rule.suffix);
            }
            if (rule.code === 'ERAU 001') return /^ERAU\s+001.*-.*$/.test(identifier);

            var withoutPrefix = identifier.replace(CONTAINER_ID_PREFIXES, '');
            return withoutPrefix.indexOf(rule.code) === 0;
        });
        if (matched) return rule.label;
    }

    return String(container.type || '').trim();
}

function getDirectionalZone(destination) {
    var value = String(destination || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (['MOLIKPAQ', 'MOLIK'].some(function (key) { return value.indexOf(key) !== -1; })) return 'aft';
    if (['LUNA', 'LUN'].some(function (key) { return value.indexOf(key) !== -1; })) return 'port';
    if (['PAB'].some(function (key) { return value.indexOf(key) !== -1; })) return 'starboard';
    return 'fore';
}

function isInDirectionalZone(container, x, y, zone) {
    zone = zone || container.placementZone || getDirectionalZone(container.destination);
    if (zone === 'aft') return x + container.length <= DECK_COORDS.minX;
    if (zone === 'port') return y >= DECK_COORDS.maxY;
    if (zone === 'starboard') return y + container.width <= DECK_COORDS.minY;
    return x >= DECK_COORDS.maxX;
}

var DEST_PALETTE = [
    { label: 'LUN-A',       keys: ['LUN-A','LUN','LUNA'],         color: '#7FA8D8' },
    { label: 'MPQ',         keys: ['MPQ'],                        color: '#92D050' },
    { label: 'Molikpaq',    keys: ['MOLIKPAQ','MOLIK'],           color: '#92D050' },
    { label: 'PA-B',        keys: ['PA-B','PAB','PA B'],          color: '#FFE900' },
    { label: 'Kholmsk',     keys: ['KHOLMSK','KOLMSK'],           color: '#00B050' },
    { label: 'S.Makarov',   keys: ['S.MAKAROV','MAKAROV'],        color: '#A6A6A6' },
    { label: 'F.Ushakov',   keys: ['F.USHAKOV','USHAKOV'],        color: '#C0504D' },
    { label: 'G.Nevelskoy', keys: ['G.NEVELSKOY','NEVELSKOY'],    color: '#000000' },
    { label: 'Y.Primakov',  keys: ['Y.PRIMAKOV','PRIMAKOV'],      color: '#F79646' }
];

var PLANNED_COLOR = 'rgba(255,255,255,0.16)';
var DEST_FALLBACK_COLOR = '#555555';