// GLOBAL STATE
let containers = [], placedContainers = [];
let canvas, ctx, wrap;
let deckImage = null;
let lastImgDraw = { x: 0, y: 0, scale: 1 };
let state = { ppm: 10, panX: 0, panY: 0, calibrated: false, step: 0, points: {} };
let contextTarget = null;
let selectedContainers = new Set();
let pointerInteraction = null;
let geometryWarnings = [];
let geometryWarningContainers = new Set();
let duplicateIds = new Set();
let violations = [];
let segregationWarnings = [];
let showSegregationViolations = true;
let manifestChangeNotice = null;

// manual placement mode (shared with render.js / ui.js / manual.js)
let placementMode = false;
let placementGhost = null;
let placementTemplate = null;