import { S } from './stateStore.js';
import { buffers, perfCanvas, perfCtx, getFractalFamily, canvas, gl, resizeCanvasToDisplaySize } from './state.js';
import { shaderPrograms, getUniformLocations } from './shaders.js';

function drawScene() {
    console.log('drawScene: S.shaderProgram =', S.shaderProgram, 'type =', typeof S.shaderProgram);
    console.log('drawScene: S.shaderUniforms =', S.shaderUniforms);
    console.log('drawScene: shaderPrograms =', shaderPrograms);
    const ft = parseInt(document.getElementById('fractal-type').value);
    const tf = getFractalFamily(ft);
    if (tf !== S.shaderFamily) {
        S.shaderFamily = tf;
        S.shaderProgram = shaderPrograms[tf];
        S.shaderUniforms = getUniformLocations(gl, S.shaderProgram);
        console.log('Switched to ' + tf + ' shader');
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
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawPerfOverlay() {
    const w = perfCanvas.width, h = perfCanvas.height;
    const ctx = perfCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, w, h);
    ctx.font = '12px monospace'; let y = 20; const lh = 20;
    const zDepth = -Math.log10(S.zoom);
    const iterVal = parseFloat(document.getElementById('iterations').value);
    const fNames = { quad: 'z\u00b2+c', bs: 'Burning Ship', sin: 'Sinusoidal' };
    const fColors = { quad: '#4fc3f7', bs: '#ff7043', sin: '#ab47bc' };
    ctx.fillStyle = '#fff'; ctx.fillText('\u26a1 PERFORMANCE MODE', 10, y); y += lh;
    const fpsCol = S.avgFPS > 30 ? '#4caf50' : S.avgFPS > 15 ? '#ff9800' : '#f44336';
    ctx.fillStyle = fpsCol; ctx.fillText('FPS:         ' + S.avgFPS.toFixed(1), 10, y); y += lh;
    ctx.fillStyle = '#aaa'; ctx.fillText('Frame time:  ' + (1000/S.avgFPS).toFixed(1) + 'ms', 10, y); y += lh;
    y += 4; ctx.fillStyle = '#555'; ctx.fillRect(10, y, 300, 1); y += lh;
    const curType = parseInt(document.getElementById('fractal-type').value);
    const tNames = ['Mandelbrot', 'Julia', 'Burning Ship', 'Tricorn', 'Sinusoidal'];
    ctx.fillStyle = fColors[S.shaderFamily] || '#fff'; ctx.fillText('Fractal:     ' + tNames[curType], 10, y); y += lh;
    ctx.fillText('Shader:      ' + fNames[S.shaderFamily] || 'N/A', 10, y); y += lh;
    ctx.fillStyle = '#90caf9'; ctx.fillText('Zoom:        10^' + zDepth.toFixed(1), 10, y); y += lh;
    ctx.fillStyle = '#aaa'; ctx.fillText('Zoom value:  ' + S.zoom.toExponential(3), 10, y); y += lh;
    ctx.fillStyle = '#ce93d8'; ctx.fillText('Iter limit:  ' + iterVal, 10, y); y += lh;
    const opsP = S.shaderFamily === 'quad' ? 16 : S.shaderFamily === 'bs' ? 18 : 24;
    ctx.fillStyle = '#81c784'; ctx.fillText('DS ops/pix:  ~' + ((iterVal * opsP) / 1e6).toFixed(1) + 'M (' + opsP + '\u00d7' + iterVal + ')', 10, y); y += lh;
    ctx.fillStyle = '#aaa'; ctx.fillText('Resolution:  ' + canvas.width + '\u00d7' + canvas.height, 10, y); y += lh;
    ctx.fillText('Pixels:      ' + (canvas.width * canvas.height / 1e6).toFixed(2) + 'M', 10, y);
    y = 180; ctx.fillStyle = '#333'; ctx.fillRect(10, y, 300, 10);
    const fpR = Math.min(S.avgFPS / 60, 1);
    const gc = fpR > 0.7 ? '#4caf50' : fpR > 0.3 ? '#ff9800' : '#f44336';
    ctx.fillStyle = gc; ctx.fillRect(10, y, 300 * fpR, 10);
    ctx.fillStyle = '#fff'; ctx.font = '10px monospace'; ctx.fillText('FPS Gauge', 140, y + 9);
    ctx.font = '12px monospace';
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

