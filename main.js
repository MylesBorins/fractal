// Entry point — wires all modules together
import './state.js';
import './shaders.js';
import './render.js';
import './interaction.js';

import { gl, canvas } from './state.js';
import { initShaderPrograms, shaderPrograms, getUniformLocations } from './shaders.js';
import { S } from './stateStore.js';
import { resizeCanvasToDisplaySize } from './state.js';
import { render } from './render.js';

// Load shader sources as inline text blocks
function loadShaderSources() {
    return Promise.all([
        fetch('shaders/fsQuad.glsl').then(r => r.text()),
        fetch('shaders/fsBS.glsl').then(r => r.text()),
        fetch('shaders/fsSin.glsl').then(r => r.text()),
    ]);
}

async function init() {
    // Inject shader sources into hidden <script> blocks for initShaderPrograms()
    const sources = await loadShaderSources();
    const shaderContainers = document.querySelectorAll('script[type="shader-source"]');
    shaderContainers.forEach((el, i) => {
        el.textContent = sources[i];
    });

    initShaderPrograms(gl);
    initShader();
    resizeCanvasToDisplaySize();
    requestAnimationFrame(render);
}

function initShader() {
    console.log('initShader: shaderPrograms["quad"] =', shaderPrograms['quad']);
    S.shaderProgram = shaderPrograms['quad'];
    S.shaderUniforms = getUniformLocations(gl, S.shaderProgram);
    S.shaderFamily = 'quad';
    console.log('initShader: S.shaderProgram =', S.shaderProgram);
}

// Start
init().catch(err => console.error('Initialization failed:', err));
