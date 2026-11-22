// ============================================================================
// ПОЛНАЯ СИСТЕМА СЕГРЕГАЦИИ IMDG
// ============================================================================
const SEGREGATION_MINI_METERS = 1.83;
const SEGREGATION_DISTANCES = { 'X': 0, 'A': SEGREGATION_MINI_METERS, 'B': SEGREGATION_MINI_METERS * 2 };
const SEGREGATION_GROUPS = [
    ['1.1', '1.2', '1.5'], ['1.3', '1.6'], ['1.4'], ['2.1'], ['2.2'], ['2.3'], ['3'],
    ['4.1'], ['4.2'], ['4.3'], ['5.1'], ['5.2'], ['6.1'], ['6.2'], ['7'], ['8'], ['9']
];
const IMDG_CLASSES = SEGREGATION_GROUPS.reduce(function (classes, group) { return classes.concat(group); }, []);
const SEGREGATION_TABLE = [
    ['*', '*', '*', 'C', 'B', 'B', 'C', 'C', 'C', 'C', 'C', 'C', 'B', 'C', 'B', 'C', 'X'],
    ['*', '*', '*', 'C', 'B', 'B', 'C', 'C', 'C', 'C', 'C', 'C', 'B', 'C', 'B', 'B', 'X'],
    ['*', '*', '*', 'B', 'A', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'X', 'C', 'B', 'B', 'X'],
    ['C', 'C', 'B', 'X', 'X', 'X', 'B', 'A', 'B', 'X', 'B', 'B', 'X', 'C', 'B', 'A', 'X'],
    ['B', 'B', 'A', 'X', 'X', 'X', 'A', 'X', 'A', 'X', 'X', 'A', 'X', 'B', 'A', 'X', 'X'],
    ['B', 'B', 'A', 'X', 'X', 'X', 'B', 'X', 'B', 'X', 'X', 'B', 'X', 'B', 'A', 'X', 'X'],
    ['C', 'C', 'B', 'B', 'A', 'B', 'X', 'X', 'B', 'A', 'B', 'B', 'X', 'C', 'B', 'X', 'X'],
    ['C', 'C', 'B', 'A', 'X', 'X', 'X', 'X', 'A', 'X', 'A', 'B', 'X', 'C', 'B', 'A', 'X'],
    ['C', 'C', 'B', 'B', 'A', 'B', 'B', 'A', 'B', 'A', 'B', 'B', 'A', 'C', 'B', 'A', 'X'],
    ['C', 'C', 'B', 'X', 'X', 'X', 'A', 'X', 'A', 'X', 'B', 'B', 'X', 'B', 'B', 'A', 'X'],
    ['C', 'C', 'B', 'B', 'X', 'X', 'B', 'A', 'B', 'B', 'X', 'B', 'A', 'C', 'A', 'B', 'X'],
    ['C', 'C', 'B', 'B', 'A', 'B', 'B', 'B', 'B', 'B', 'B', 'X', 'A', 'C', 'B', 'B', 'X'],
    ['B', 'B', 'X', 'X', 'X', 'X', 'X', 'X', 'A', 'X', 'A', 'A', 'X', 'A', 'X', 'X', 'X'],
    ['C', 'C', 'C', 'C', 'B', 'B', 'C', 'C', 'C', 'B', 'C', 'C', 'A', 'X', 'C', 'C', 'X'],
    ['B', 'B', 'B', 'B', 'A', 'A', 'B', 'B', 'B', 'B', 'A', 'B', 'X', 'C', 'X', 'B', 'X'],
    ['C', 'B', 'B', 'A', 'X', 'X', 'X', 'A', 'A', 'A', 'B', 'B', 'X', 'C', 'B', 'X', 'X'],
    ['X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X']
];

const SEGREGATION_MATRIX = {};
SEGREGATION_GROUPS.forEach(function (rowGroup, rowIndex) {
    rowGroup.forEach(function (rowClass) {
        SEGREGATION_MATRIX[rowClass] = {};
        SEGREGATION_GROUPS.forEach(function (columnGroup, columnIndex) {
            columnGroup.forEach(function (columnClass) {
                SEGREGATION_MATRIX[rowClass][columnClass] = SEGREGATION_TABLE[rowIndex][columnIndex];
            });
        });
    });
});

const FOOD_SEGREGATION = { '2.3': 1, '6.1': 1, '8': 1, '7': 2, '6.2': 3 };

function normalizeImdgClass(value) {
    var valueText = String(value || '').trim().toUpperCase();
    return valueText === 'NON_DG' || valueText === 'NON-DG' || valueText === 'NON DG' ? '' : valueText;
}

function isKnownImdgClass(value) {
    return IMDG_CLASSES.indexOf(normalizeImdgClass(value)) !== -1;
}

function getSegregationCode(class1, class2) {
    class1 = normalizeImdgClass(class1);
    class2 = normalizeImdgClass(class2);
    if (!class1 || !class2) return 'X';
    if (SEGREGATION_MATRIX[class1] && SEGREGATION_MATRIX[class1][class2] !== undefined) return SEGREGATION_MATRIX[class1][class2];
    if (SEGREGATION_MATRIX[class2] && SEGREGATION_MATRIX[class2][class1] !== undefined) return SEGREGATION_MATRIX[class2][class1];
    return '?';
}

function isFlammableImdgClass(imdgClass) {
    return ['2.1', '3', '4.1', '4.2', '4.3'].indexOf(normalizeImdgClass(imdgClass)) !== -1;
}

function getClassSegregationRule(class1, class2) {
    class1 = normalizeImdgClass(class1);
    class2 = normalizeImdgClass(class2);
    if (!class1 || !class2) return { code: 'X', minimumDistance: 0 };

    var code = getSegregationCode(class1, class2);
    if (code === '?') return { code: code, manualReview: true, reason: 'Класс отсутствует в загруженной матрице сегрегации.' };
    if (code === '*') return { code: code, minimumDistance: 0, manualReview: true, reason: 'Таблица отсылает к введению класса 1: требуется отдельная проверка сегрегации внутри группы.' };
    if (code === 'C') return { code: code, minimumDistance: 0, requiresCompartment: true, reason: 'Требуется разделение полным отсеком; наличие отсека на схеме не моделируется.' };
    return { code: code, minimumDistance: SEGREGATION_DISTANCES[code] };
}

function getFoodSeparationMiniCount(imdgClass) {
    imdgClass = normalizeImdgClass(imdgClass);
    if (FOOD_SEGREGATION[imdgClass] !== undefined) return FOOD_SEGREGATION[imdgClass];
    return isFlammableImdgClass(imdgClass) || imdgClass === '5.1' || imdgClass === '5.2' ? 1 : 0;
}

function getPairSegregationRule(container1, container2) {
    var requirements = [];
    if (container1.isHazardous && !normalizeImdgClass(container1.imdgClass)) {
        requirements.push({ code: '?', manualReview: true, reason: 'Для опасного груза не указан класс IMDG.' });
    }
    if (container2.isHazardous && !normalizeImdgClass(container2.imdgClass)) {
        requirements.push({ code: '?', manualReview: true, reason: 'Для опасного груза не указан класс IMDG.' });
    }
    if (container1.isHazardous && container2.isHazardous) {
        if (normalizeImdgClass(container1.imdgClass) && normalizeImdgClass(container2.imdgClass)) {
            requirements.push(getClassSegregationRule(container1.imdgClass, container2.imdgClass));
        }
    }

    if (container1.isFood && container2.isHazardous) {
        if (normalizeImdgClass(container2.imdgClass).indexOf('1.') === 0) {
            requirements.push({ code: 'FOOD', manualReview: true, reason: 'Таблица не задаёт расстояние для пищевого груза рядом с классом 1; требуется ручная проверка.' });
        } else {
            var foodMini1 = getFoodSeparationMiniCount(container2.imdgClass);
            if (foodMini1) requirements.push({ code: 'FOOD', minimumDistance: foodMini1 * SEGREGATION_MINI_METERS, reason: 'Пищевой контейнер: требуется отступ ' + foodMini1 + ' mini по таблице.' });
        }
    }
    if (container2.isFood && container1.isHazardous) {
        if (normalizeImdgClass(container1.imdgClass).indexOf('1.') === 0) {
            requirements.push({ code: 'FOOD', manualReview: true, reason: 'Таблица не задаёт расстояние для пищевого груза рядом с классом 1; требуется ручная проверка.' });
        } else {
            var foodMini2 = getFoodSeparationMiniCount(container1.imdgClass);
            if (foodMini2) requirements.push({ code: 'FOOD', minimumDistance: foodMini2 * SEGREGATION_MINI_METERS, reason: 'Пищевой контейнер: требуется отступ ' + foodMini2 + ' mini по таблице.' });
        }
    }

    var rule = { code: 'X', minimumDistance: 0 };
    requirements.forEach(function (required) {
        if (required.forbidden) rule = required;
        else if (!rule.forbidden && (required.manualReview || required.requiresCompartment)) rule = required;
        else if (!rule.forbidden && !rule.manualReview && !rule.requiresCompartment && required.minimumDistance > rule.minimumDistance) rule = required;
    });
    return rule;
}

function getContainerSeparationDistance(container1, container2) {
    var dx = Math.max(0, container1.x - (container2.x + container2.length), container2.x - (container1.x + container1.length));
    var dy = Math.max(0, container1.y - (container2.y + container2.width), container2.y - (container1.y + container1.width));
    return Math.sqrt(dx * dx + dy * dy);
}

function getClosestContainerBoundaryPoints(container1, container2) {
    function closestAxisPoints(start1, end1, start2, end2) {
        if (end1 <= start2) return [end1, start2];
        if (end2 <= start1) return [start1, end2];
        var midpoint = (Math.max(start1, start2) + Math.min(end1, end2)) / 2;
        return [midpoint, midpoint];
    }

    var x = closestAxisPoints(container1.x, container1.x + container1.length, container2.x, container2.x + container2.length);
    var y = closestAxisPoints(container1.y, container1.y + container1.width, container2.y, container2.y + container2.width);
    return {
        container1: { x: x[0], y: y[0] },
        container2: { x: x[1], y: y[1] }
    };
}

function getPairSegregationIssue(container1, container2) {
    var rule = getPairSegregationRule(container1, container2);
    var actualDistance = getContainerSeparationDistance(container1, container2);
    var distanceViolation = rule.minimumDistance > 0 && actualDistance + 0.001 < rule.minimumDistance;
    if (rule.forbidden || distanceViolation) {
        return {
            container1: container1,
            container2: container2,
            code: rule.code,
            requiredDistance: rule.minimumDistance || 0,
            actualDistance: actualDistance,
            forbidden: !!rule.forbidden,
            requiresCompartment: !!rule.requiresCompartment,
            manualReview: !!rule.manualReview,
            reason: rule.reason || 'Требуется отступ не менее ' + rule.minimumDistance.toFixed(2) + ' м.',
            unresolved: !!(rule.manualReview || rule.requiresCompartment)
        };
    }
    return null;
}

function isSegregationSafeAt(container, x, y) {
    var candidate = Object.assign({}, container, { x: x, y: y });
    for (var i = 0; i < placedContainers.length; i++) {
        var existing = placedContainers[i];
        if (existing === container) continue;
        if (getPairSegregationIssue(candidate, existing)) return false;
    }
    return true;
}

function addContainerSegregationWarnings(container) {
    var imdgClass = normalizeImdgClass(container.imdgClass);
    if (container.isHazardous && !isKnownImdgClass(imdgClass)) {
        segregationWarnings.push({
            container: container,
            reason: imdgClass === '6' ?
                'Указан только класс IMDG 6. Требуется уточнить подкласс 6.1 или 6.2; проверка сегрегации неполная.' :
                'Для опасного груза не указан распознаваемый класс IMDG.'
        });
    }
    if (container.isHazardous && (imdgClass.indexOf('1.') === 0 || imdgClass === '6.2' || imdgClass === '7')) {
        segregationWarnings.push({
            container: container,
            reason: imdgClass.indexOf('1.') === 0 ?
                'Требуется максимально возможное удаление от жилых и машинных помещений; классы зон не заданы.' :
                'Требуется максимально возможное удаление от жилых помещений; классы зон не заданы.'
        });
    }
}

function addPairSegregationWarning(container1, container2, rule) {
    if (rule.code === '?' || (!rule.manualReview && !rule.requiresCompartment)) return;
    segregationWarnings.push({
        container: container1,
        otherContainer: container2,
        reason: rule.reason
    });
}

function checkAllSegregationViolations() {
    violations = [];
    segregationWarnings = [];
    placedContainers.forEach(function (container) {
        addContainerSegregationWarnings(container);
    });
    for (var i = 0; i < placedContainers.length; i++) {
        for (var j = i + 1; j < placedContainers.length; j++) {
            var container1 = placedContainers[i], container2 = placedContainers[j];
            var rule = getPairSegregationRule(container1, container2);
            var issue = getPairSegregationIssue(container1, container2);
            if (issue) violations.push(issue);
            else addPairSegregationWarning(container1, container2, rule);
        }
    }
    var stat = document.getElementById('stat-violations');
    if (stat) stat.textContent = violations.length;
    return violations;
}

function updateContainerSegregationViolations(container) {
    violations = violations.filter(function (issue) {
        return issue.container1 !== container && issue.container2 !== container;
    });
    segregationWarnings = segregationWarnings.filter(function (warning) { return warning.container !== container; });
    segregationWarnings = segregationWarnings.filter(function (warning) { return warning.otherContainer !== container; });
    addContainerSegregationWarnings(container);
    for (var i = 0; i < placedContainers.length; i++) {
        var other = placedContainers[i];
        if (other === container) continue;
        var rule = getPairSegregationRule(container, other);
        var issue = getPairSegregationIssue(container, other);
        if (issue) violations.push(issue);
        else addPairSegregationWarning(container, other, rule);
    }
    var stat = document.getElementById('stat-violations');
    if (stat) stat.textContent = violations.length;
    return violations;
}