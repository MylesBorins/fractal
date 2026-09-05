// Entry point — wires all modules together
import './state.js';
import './shaders.js';
import './render.js';
import './interaction.js';

import { gl, canvas, IS_WEBGL2_FLAG } from './state.js';
import { initShaderPrograms, shaderPrograms, getUniformLocations } from './shaders.js';
import { createRefTexture } from './reference.js';
import { S } from './stateStore.js';
import { resizeCanvasToDisplaySize } from './state.js';
import { render } from './render.js';
import { updatePerturbToggle } from './interaction.js';

// Load shader sources with DS math module injected
// All shaders are GLSL ES 1.00 — dsMath uses split-based math (no fma)
// Precision directive must come BEFORE any function definitions
function loadShaderSources() {
    const precisionPrefix = 'precision highp float;\n';
    const t = Date.now(); // cache-bust
    return Promise.all([
        fetch(`shaders/fsQuad.glsl?t=${t}`).then(r => r.text()).then(quadSource => {
            quadSource = quadSource.replace('precision highp float;', '');
            return fetch(`shaders/dsMath.glsl?t=${t}`).then(r => r.text()).then(mathSource =>
                precisionPrefix + mathSource + quadSource
            );
        }),
        fetch(`shaders/fsBS.glsl?t=${t}`).then(r => r.text()).then(bsSource => {
            bsSource = bsSource.replace('precision highp float;', '');
            return fetch(`shaders/dsMath.glsl?t=${t}`).then(r => r.text()).then(mathSource =>
                precisionPrefix + mathSource + bsSource
            );
        }),
        fetch(`shaders/fsSin.glsl?t=${t}`).then(r => r.text()).then(sinSource => {
            sinSource = sinSource.replace('precision highp float;', '');
            return fetch(`shaders/dsMath.glsl?t=${t}`).then(r => r.text()).then(mathSource =>
                precisionPrefix + mathSource + sinSource
            );
        }),
        fetch(`shaders/fsPerturb.glsl?t=${t}`).then(r => r.text()).then(perturbSource => {
            perturbSource = perturbSource.replace('precision highp float;', '');
            return fetch(`shaders/dsMath.glsl?t=${t}`).then(r => r.text()).then(mathSource =>
                precisionPrefix + mathSource + perturbSource
            );
        }),
    ]);
}

async function init() {
    // Inject shader sources into hidden <script> blocks for initShaderPrograms()
    const sources = await loadShaderSources();
    const dsFixed = sources[0].includes('s - (s - a)');
    console.log('%cdsMath pipeline: ' + (dsFixed
        ? 'FIXED split (Veltkamp s-(s-a)) — if still blocky, suspect GPU driver'
        : '⚠️ STALE split (s-a) — page served old shader source, hard-reload again'),
        dsFixed ? 'color:#4f8;font:bold' : 'color:#f44;font:bold');
    const shaderContainers = document.querySelectorAll('script[type="shader-source"]');
    shaderContainers.forEach((el, i) => {
        el.textContent = sources[i];
    });

    initShaderPrograms(gl);
    S.perturbSupported = !!createRefTexture(gl, IS_WEBGL2_FLAG);
    console.log(S.perturbSupported
        ? '✅ Perturb mode ready (RGBA32F ref orbit)'
        : '⚠️ Perturb mode unavailable (no float-texture support)');
    updatePerturbToggle();
    initShader();
    resizeCanvasToDisplaySize();
    requestAnimationFrame(render);
}

console.log('FRAC-BUILD v4-intref');
function initShader() {
    console.log('initShader: shaderPrograms["quad"] =', shaderPrograms['quad']);
    S.shaderProgram = shaderPrograms['quad'];
    S.shaderUniforms = getUniformLocations(gl, S.shaderProgram);
    S.shaderFamily = 'quad';
    console.log('initShader: S.shaderProgram =', S.shaderProgram);
}

// Start
init().catch(err => console.error('Initialization failed:', err));
