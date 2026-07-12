import { S } from './stateStore.js';
import { buffers, perfCtx, getFractalFamily, canvas, gl, resizeCanvasToDisplaySize } from './state.js';
import { shaderPrograms, getUniformLocations } from './shaders.js';

function drawScene() {
    const ft = parseInt(document.getElementById('fractal-type').value);
    const tf = getFractalFamily(ft);
    if (tf !== S.shaderFamily) {
        S.shaderFamily = tf;
        S.shaderProgram = shaderPrograms[tf];
        S.shaderUniforms = getUniformLocations(gl, S.shaderProgram);
    }
    gl.useProgram(S.shaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(gl.getAttribLocation(S.shaderProgram, 'aVertexPosition'), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(S.shaderProgram, 'aVertexPosition'));
    gl.uniform2f(S.shaderUniforms.resolution, canvas.width, canvas.height);
    const oHi = [Math.fround(S.offset.x), Math.fround(S.offset.y)];
    const oLo = [S.offset.x - oHi[0], S.offset.y - oHi[1]];
    gl.uniform2f(S.shaderUniforms.offsetHi, oHi[0], oHi[1]);
    gl.uniform2f(S.shaderUniforms.offsetLo, oLo[0], oLo[1]);
    const zHi = Math.fround(S.zoom);
    const zLo = S.zoom - zHi;
    gl.uniform1f(S.shaderUniforms.zoomHi, zHi);
    gl.uniform1f(S.shaderUniforms.zoomLo, zLo);
    gl.uniform1f(S.shaderUniforms.iterations, parseFloat(document.getElementById('iterations').value));
    gl.uniform1f(S.shaderUniforms.colorShift, parseFloat(document.getElementById('color-shift').value));
    if (S.shaderUniforms.fractalType) {
        gl.uniform1i(S.shaderUniforms.fractalType, ft);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawPerfOverlay() {
    const zDepth = -Math.log10(S.zoom);
    const iterVal = parseFloat(document.getElementById('iterations').value);
    const fNames = { quad: 'z\u00b2+c', bs: 'Burning Ship', sin: 'Sinusoidal' };
    const curType = parseInt(document.getElementById('fractal-type').value);
    const tNames = ['Mandelbrot', 'Julia', 'Burning Ship', 'Tricorn', 'Sinusoidal'];
    const opsP = S.shaderFamily === 'quad' ? 16 : S.shaderFamily === 'bs' ? 18 : 24;
    const fpR = Math.min(S.avgFPS / 60, 1);

    perfCtx.textContent =
`\u26a1 PERFORMANCE MODE
FPS:         ${S.avgFPS.toFixed(1)}
Frame time:  ${(1000/S.avgFPS).toFixed(1)}ms
────────────────────────
Fractal:     ${tNames[curType]}
Shader:      ${fNames[S.shaderFamily] || 'N/A'}
Zoom:        10^${zDepth.toFixed(1)}
Zoom value:  ${S.zoom.toExponential(3)}
Offset x:    ${S.offset.x.toFixed(6)}
Offset y:    ${S.offset.y.toFixed(6)}
Iter limit:  ${iterVal}
DS ops/pix:  ~${((iterVal * opsP) / 1e6).toFixed(1)}M (${opsP}\u00d7${iterVal})
Resolution:  ${canvas.width}\u00d7${canvas.height}
Pixels:      ${(canvas.width * canvas.height / 1e6).toFixed(2)}M
FPS: [${'█'.repeat(Math.floor(fpR * 10))}${'░'.repeat(10 - Math.floor(fpR * 10))}]
FPS Gauge`;
}

function render(ts) {
    resizeCanvasToDisplaySize();
    if (S.lastFrameTime !== 0) {
        const dMs = ts - S.lastFrameTime;
        const dSec = dMs / 1000;
        S.frameTimes.push(dMs);
        if (S.frameTimes.length > S.MAX_FRAME_HISTORY) S.frameTimes.shift();
        S.frameCount++;
        const avgFT = S.frameTimes.reduce((a,b) => a+b, 0) / S.frameTimes.length;
        S.avgFPS = Math.round(1000 / avgFT * 10) / 10;
        if (S.perfMode) {
            S.perfDisplayTimer += dMs;
            if (S.perfDisplayTimer > 500) { S.perfDisplayTimer = 0; drawPerfOverlay(); }
        }
        if (S.isAutoZooming) {
            const zs = parseFloat(document.getElementById('zoom-speed').value);
            S.zoom *= (1.0 - zs);
            if (S.zoom < S.minZoom) {
                S.zoom = 3.0;
                const pts = [{x:-.7436,y:.1318},{x:-.1607,y:1.0377},{x:-1.76,y:0},{x:.275,y:.008},{x:-.745,y:.12},{x:-.1011,y:.9563},{x:.3602,y:.131}];
                const p = pts[Math.floor(Math.random()*pts.length)];
                S.offset.x = p.x; S.offset.y = p.y;
            }
            document.getElementById('zoom').value = String(S.zoom);
        }
        if (S.isColorCycling) {
            S.colorCycle = (S.colorCycle + dSec * 0.1) % 1;
            document.getElementById('color-shift').value = String(S.colorCycle);
            document.getElementById('color-shift-val').textContent = S.colorCycle.toFixed(2);
        }
        if (S.isIterOscillating) {
            S.iterOscillatePhase += S.iterOscillateSpeed * dSec;
            S.oscillateTargetIter = Math.floor(S.iterOscillateMin + (S.iterOscillateMax - S.iterOscillateMin) * (0.5 + 0.5 * Math.sin(S.iterOscillatePhase)));
            S.oscillateSmoothIter += (S.oscillateTargetIter - S.oscillateSmoothIter) * S.currentLerpSpeed;
            const ri = Math.round(S.oscillateSmoothIter);
            document.getElementById('iterations').value = String(ri);
            document.getElementById('iterations-val').textContent = ri;
        }
        if (S.useAutoIterations && !S.isIterOscillating) {
            const zd = Math.max(0, -Math.log10(S.zoom));
            S.targetIterations = Math.min(2000, Math.floor(100 + zd * 150));
            S.currentIterations = Math.round(S.currentIterations + (S.targetIterations - S.currentIterations) * S.currentLerpSpeed);
            const ii = document.getElementById('iterations');
            if (parseInt(ii.value) !== S.currentIterations) {
                ii.value = String(S.currentIterations);
                document.getElementById('iterations-val').textContent = S.currentIterations;
            }
        }
    }
    S.lastFrameTime = ts;
    drawScene();
    requestAnimationFrame(render);
}

export { render };

