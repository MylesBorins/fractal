import { canvas, perfCtx } from './state.js';
import { S } from './stateStore.js';

// UI Event Listeners
document.getElementById('zoom').addEventListener('input', (e) => {
    S.zoom = parseFloat(e.target.value);
});

document.getElementById('zoom-speed').addEventListener('input', (e) => {
    document.getElementById('zoom-speed-val').textContent = parseFloat(e.target.value).toFixed(3);
});

document.getElementById('toggle-zoom').addEventListener('click', (e) => {
    S.isAutoZooming = !S.isAutoZooming;
    e.target.textContent = S.isAutoZooming ? 'On' : 'Off';
    e.target.classList.toggle('active', S.isAutoZooming);
});

document.getElementById('toggle-auto-iter').addEventListener('click', (e) => {
    S.useAutoIterations = !S.useAutoIterations;
    e.target.textContent = S.useAutoIterations ? 'On' : 'Off';
    e.target.classList.toggle('active', S.useAutoIterations);
});

document.getElementById('toggle-color-cycle').addEventListener('click', (e) => {
    S.isColorCycling = !S.isColorCycling;
    e.target.textContent = S.isColorCycling ? 'On' : 'Off';
    e.target.classList.toggle('active', S.isColorCycling);
});

document.getElementById('toggle-iter-osc').addEventListener('click', (e) => {
    S.isIterOscillating = !S.isIterOscillating;
    e.target.textContent = S.isIterOscillating ? 'On' : 'Off';
    e.target.classList.toggle('active', S.isIterOscillating);
    const oscControls = document.querySelectorAll('.osc-control');
    oscControls.forEach(ctrl => {
        ctrl.style.display = S.isIterOscillating ? 'block' : 'none';
    });
});

document.getElementById('toggle-perf').addEventListener('click', (e) => {
    S.perfMode = !S.perfMode;
    e.target.textContent = S.perfMode ? 'On' : 'Off';
    e.target.classList.toggle('active', S.perfMode);
    perfCtx.style.display = S.perfMode ? 'block' : 'none';
});

document.getElementById('osc-min').addEventListener('input', (e) => {
    S.iterOscillateMin = parseInt(e.target.value);
    document.getElementById('osc-min-val').textContent = S.iterOscillateMin;
});

document.getElementById('osc-max').addEventListener('input', (e) => {
    S.iterOscillateMax = parseInt(e.target.value);
    document.getElementById('osc-max-val').textContent = S.iterOscillateMax;
});

document.getElementById('osc-speed').addEventListener('input', (e) => {
    S.iterOscillateSpeed = parseFloat(e.target.value);
    document.getElementById('osc-speed-val').textContent = S.iterOscillateSpeed.toFixed(1);
});

document.getElementById('reset-view').addEventListener('click', () => {
    resetToFractalDefaults(parseInt(document.getElementById('fractal-type').value));
});

// Default views per fractal type
const fractalDefaults = {
    0: { offset: { x: -0.743643887037158, y: 0.131825904205311 }, zoom: 3.0 },
    1: { offset: { x: 0, y: 0 }, zoom: 3.0 },
    2: { offset: { x: -0.85, y: -0.7 }, zoom: 3.0 },
    3: { offset: { x: -0.5, y: 0 }, zoom: 2.0 },
    4: { offset: { x: 0, y: 0 }, zoom: 2.0 },
};

function resetToFractalDefaults(type) {
    const d = fractalDefaults[type];
    if (d) {
        S.offset.x = d.offset.x;
        S.offset.y = d.offset.y;
        S.zoom = d.zoom;
        document.getElementById('zoom').value = String(S.zoom);
    }
}

document.getElementById('fractal-type').addEventListener('change', (e) => {
    resetToFractalDefaults(parseInt(e.target.value));
});

document.getElementById('preset-select').addEventListener('change', (e) => {
    const option = e.target.options[e.target.selectedIndex];
    if (option.value && option.dataset.x) {
        S.offset.x = parseFloat(option.dataset.x);
        S.offset.y = parseFloat(option.dataset.y);
        S.zoom = parseFloat(option.dataset.z);
        document.getElementById('zoom').value = String(S.zoom);
        document.getElementById('fractal-type').value = '0';
    }
});

document.getElementById('iterations').addEventListener('input', (e) => {
    document.getElementById('iterations-val').textContent = e.target.value;
});

document.getElementById('iter-lerp').addEventListener('input', (e) => {
    S.currentLerpSpeed = parseFloat(e.target.value);
    document.getElementById('iter-lerp-val').textContent = S.currentLerpSpeed.toFixed(3);
});

document.getElementById('color-shift').addEventListener('input', (e) => {
    document.getElementById('color-shift-val').textContent = parseFloat(e.target.value).toFixed(2);
});

// Mouse interaction for panning
let isDragging = false;
let lastMousePos = { x: 0, y: 0 };

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastMousePos = { x: e.clientX, y: e.clientY };
});

window.addEventListener('mouseup', () => {
    isDragging = false;
});

window.addEventListener('mousemove', (e) => {
    if (isDragging) {
        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;

        const aspect = canvas.width / canvas.height;

        S.offset.x -= (dx / canvas.width) * aspect * S.zoom;
        S.offset.y -= (dy / canvas.height) * S.zoom;

        lastMousePos = { x: e.clientX, y: e.clientY };
    }
});

// Touch/Pinch interaction
let lastTouchDistance = 0;
let lastTouchCenter = { x: 0, y: 0 };

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        isDragging = true;
        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        isDragging = false;
        lastTouchDistance = getTouchDistance(e.touches);
        lastTouchCenter = getTouchCenter(e.touches);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
        const dx = e.touches[0].clientX - lastMousePos.x;
        const dy = e.touches[0].clientY - lastMousePos.y;
        const aspect = canvas.width / canvas.height;

        S.offset.x -= (dx / canvas.width) * aspect * S.zoom;
        S.offset.y -= (dy / canvas.height) * S.zoom;

        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        const distance = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);

        if (lastTouchDistance > 0) {
            const scale = distance / lastTouchDistance;
            const targetZoom = S.zoom / scale;

            const rect = canvas.getBoundingClientRect();
            const centerX = (center.x - rect.left) / rect.width;
            const centerY = 1.0 - (center.y - rect.top) / rect.height;

            const aspect = canvas.width / canvas.height;
            const screenX = (centerX - 0.5) * aspect;
            const screenY = (centerY - 0.5);

            const worldX = S.offset.x + screenX * S.zoom;
            const worldY = S.offset.y + screenY * S.zoom;

            S.zoom = Math.max(S.minZoom, Math.min(3.0, targetZoom));

            S.offset.x = worldX - screenX * S.zoom;
            S.offset.y = worldY - screenY * S.zoom;

            lastTouchDistance = distance;
            lastTouchCenter = center;

            document.getElementById('zoom').value = String(S.zoom);
        }
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    isDragging = false;
    lastTouchDistance = 0;
});

function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getTouchCenter(touches) {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2
    };
}

// Toggle UI visibility
let uiCollapsed = false;
const ui = document.getElementById('ui');
const toggleBtn = document.getElementById('toggle-ui');
const uiHeader = document.getElementById('ui-header');
const uiOverlay = document.getElementById('ui-overlay');
const mobileFab = document.getElementById('mobile-toggle-fab');

function isMobile() {
    return window.innerWidth <= 600;
}

if (isMobile()) {
    uiCollapsed = true;
    ui.classList.add('collapsed');
    document.body.classList.add('mobile-panel-collapsed');
}

function toggleUI() {
    uiCollapsed = !uiCollapsed;

    if (isMobile()) {
        ui.classList.toggle('collapsed', uiCollapsed);
        ui.classList.toggle('mobile-visible', !uiCollapsed);
        uiOverlay.classList.toggle('visible', !uiCollapsed);
        document.body.classList.toggle('mobile-panel-collapsed', uiCollapsed);
        toggleBtn.textContent = uiCollapsed ? '▶' : '▼';
    } else {
        ui.classList.toggle('collapsed', uiCollapsed);
        uiOverlay.classList.remove('visible');
        ui.classList.remove('mobile-visible');
        document.body.classList.remove('mobile-panel-collapsed');
        toggleBtn.textContent = uiCollapsed ? '▶' : '◀';
    }
}

toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUI();
});

uiHeader.addEventListener('click', toggleUI);

mobileFab.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUI();
});

uiOverlay.addEventListener('click', () => {
    if (!uiCollapsed) {
        toggleUI();
    }
});

window.addEventListener('resize', () => {
    if (!isMobile()) {
        ui.classList.remove('mobile-visible');
        uiOverlay.classList.remove('visible');
    }
});

document.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', (e) => {
        if (e.target.classList.contains('section-toggle')) {
            const sectionId = header.dataset.section;
            const section = header.parentElement;
            const content = document.getElementById(`section-${sectionId}`);
            section.classList.toggle('collapsed');
            header.classList.toggle('collapsed');
        }
    });
});

document.querySelectorAll('.osc-control').forEach(ctrl => {
    ctrl.style.display = 'none';
});

document.getElementById('toggle-zoom').classList.toggle('active', S.isAutoZooming);
document.getElementById('toggle-auto-iter').classList.toggle('active', S.useAutoIterations);
document.getElementById('toggle-color-cycle').classList.toggle('active', S.isColorCycling);
document.getElementById('toggle-iter-osc').classList.toggle('active', S.isIterOscillating);

document.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
        toggleUI();
    }
    if (e.key === 'p' || e.key === 'P') {
        S.perfMode = !S.perfMode;
        const btn = document.getElementById('toggle-perf');
        btn.textContent = S.perfMode ? 'On' : 'Off';
        btn.classList.toggle('active', S.perfMode);
        perfCtx.style.display = S.perfMode ? 'block' : 'none';
    }
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const direction = e.deltaY > 0 ? zoomFactor : 1 / zoomFactor;

    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width;
    const mouseY = 1.0 - (e.clientY - rect.top) / rect.height;

    const aspect = canvas.width / canvas.height;
    const screenX = (mouseX - 0.5) * aspect;
    const screenY = (mouseY - 0.5);

    const worldX = S.offset.x + screenX * S.zoom;
    const worldY = S.offset.y + screenY * S.zoom;

    S.zoom = Math.max(S.minZoom, Math.min(3.0, S.zoom * direction));

    S.offset.x = worldX - screenX * S.zoom;
    S.offset.y = worldY - screenY * S.zoom;

    document.getElementById('zoom').value = String(S.zoom);
}, { passive: false });

document.getElementById('zoom').value = String(S.zoom);
