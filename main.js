const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

if (!gl) {
    alert('WebGL not supported');
    throw new Error('WebGL not supported');
}

// Shader sources
const vsSource = `
    attribute vec4 aVertexPosition;
    void main() {
        gl_Position = aVertexPosition;
    }
`;

// Mandelbrot/Julia/Tricorn - z^2 + c style (no abs, no transcendental)
const fsSourceQuad = `
    precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;
    uniform int uFractalType;

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (uv.y - 0.5);

        // Julia set constant (fixed c for Julia)
        vec2 juliaC = vec2(-0.7, 0.27015);

        // z in DS: z = (z_h + z_l)
        float zx_h, zx_l, zy_h, zy_l;
        if (uFractalType == 1) {
            // Julia: z = zoomed pixel position, c = juliaC (fixed)
            zx_h = uOffsetHi.x + fx * uZoomHi;
            zx_l = uOffsetLo.x + fx * uZoomLo;
            zy_h = uOffsetHi.y + fy * uZoomHi;
            zy_l = uOffsetLo.y + fy * uZoomLo;
        } else {
            // Mandelbrot & Tricorn: z = 0, c = pixel position
            zx_h = 0.0; zx_l = 0.0;
            zy_h = 0.0; zy_l = 0.0;
        }

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // Common z^2 computation (used by Mandelbrot, Julia, Tricorn)
            float zx2_h = zx_h * zx_h;
            float zx2_l = 2.0 * zx_h * zx_l;
            float zy2_h = zy_h * zy_h;
            float zy2_l = 2.0 * zy_h * zy_l;
            float zxy_h = 2.0 * zx_h * zy_h;
            float zxy_l = 2.0 * (zx_h * zy_l + zx_l * zy_h);

            float c_x_h = uOffsetHi.x + fx * uZoomHi;
            float c_x_l = uOffsetLo.x + fx * uZoomLo;
            float c_y_h = uOffsetHi.y + fy * uZoomHi;
            float c_y_l = uOffsetLo.y + fy * uZoomLo;

            float nx_h, nx_l, ny_h, ny_l;

            if (uFractalType == 0 || uFractalType == 1) {
                // Mandelbrot: z = z^2 + c
                // Julia: z = z^2 + juliaC
                float cj_x = (uFractalType == 0) ? c_x_h : juliaC.x;
                float cj_l_x = (uFractalType == 0) ? c_x_l : 0.0;
                float cj_y = (uFractalType == 0) ? c_y_h : juliaC.y;
                float cj_l_y = (uFractalType == 0) ? c_y_l : 0.0;
                nx_h = zx2_h - zy2_h + cj_x;
                nx_l = zx2_l - zy2_l + cj_l_x;
                ny_h = zxy_h + cj_y;
                ny_l = zxy_l + cj_l_y;
            } else {
                // Tricorn: z = conj(z)^2 + c
                nx_h = zx2_h - zy2_h + c_x_h;
                ny_h = -zxy_h + c_y_h;
                nx_l = zx2_l - zy2_l + c_x_l;
                ny_l = -zxy_l + c_y_l;
            }

            zx_h = nx_h;
            zx_l = nx_l;
            zy_h = ny_h;
            zy_l = ny_l;

            float mag2 = zx_h * zx_h + zy_h * zy_h;
            if (mag2 > 256.0) break;

            iter++;
        }

        if (iter == maxIter) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            // Smooth coloring with DS magnitude
            float mag2 = zx_h * zx_h + zy_h * zy_h + 2.0 * (zx_h * zx_l + zy_h * zy_l);
            float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));

            float color = smoothVal / uIterations;
            vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
            gl_FragColor = vec4(col, 1.0);
        }
    }
`;

// Burning Ship - uses abs() in the iteration
const fsSourceBS = `
    precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (uv.y - 0.5);

        float c_x_h = uOffsetHi.x + fx * uZoomHi;
        float c_x_l = uOffsetLo.x + fx * uZoomLo;
        float c_y_h = uOffsetHi.y + fy * uZoomHi;
        float c_y_l = uOffsetLo.y + fy * uZoomLo;

        // Burning Ship: z = 0, c = pixel position
        float zx_h = 0.0, zx_l = 0.0;
        float zy_h = 0.0, zy_l = 0.0;

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // abs(z) with DS precision
            float ax_h = abs(zx_h);
            float ax_l = (zx_h >= 0.0) ? zx_l : -zx_l;
            float ay_h = abs(zy_h);
            float ay_l = (zy_h >= 0.0) ? zy_l : -zy_l;

            // w² = w_h² + 2*w_h*w_l
            float ax2_h = ax_h * ax_h;
            float ax2_l = 2.0 * ax_h * ax_l;
            float ay2_h = ay_h * ay_h;
            float ay2_l = 2.0 * ay_h * ay_l;

            // (ax + i*ay)² = (ax² - ay²) + 2i*ax*ay
            float nx_h = ax2_h - ay2_h + c_x_h;
            float nx_l = ax2_l - ay2_l + c_x_l;
            float ny_h = 2.0 * ax_h * ay_h + c_y_h;
            float ny_l = 2.0 * (ax_h * ay_l + ax_l * ay_h) + c_y_l;

            zx_h = nx_h;
            zx_l = nx_l;
            zy_h = ny_h;
            zy_l = ny_l;

            float mag2 = zx_h * zx_h + zy_h * zy_h;
            if (mag2 > 256.0) break;

            iter++;
        }

        if (iter == maxIter) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            float mag2 = zx_h * zx_h + zy_h * zy_h + 2.0 * (zx_h * zx_l + zy_h * zy_l);
            float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));
            float color = smoothVal / uIterations;
            vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
            gl_FragColor = vec4(col, 1.0);
        }
    }
`;

// Sinusoidal - most expensive, uses exp/sin/cos
const fsSourceSin = `
    precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (uv.y - 0.5);

        float c_x_h = uOffsetHi.x + fx * uZoomHi;
        float c_x_l = uOffsetLo.x + fx * uZoomLo;
        float c_y_h = uOffsetHi.y + fy * uZoomHi;
        float c_y_l = uOffsetLo.y + fy * uZoomLo;

        float zx_h = 0.0, zx_l = 0.0;
        float zy_h = 0.0, zy_l = 0.0;

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // sin(z) + c in DS
            float exp_zh = exp(zy_h);
            float exp_mzh = exp(-zy_h);
            float cosh_zh = 0.5 * (exp_zh + exp_mzh);
            float sinh_zh = 0.5 * (exp_zh - exp_mzh);
            float nx_h = sin(zx_h) * cosh_zh + c_x_h;
            float ny_h = cos(zx_h) * sinh_zh + c_y_h;
            float nx_l = c_x_l;
            float ny_l = c_y_l;

            zx_h = nx_h;
            zx_l = nx_l;
            zy_h = ny_h;
            zy_l = ny_l;

            float mag2 = zx_h * zx_h + zy_h * zy_h;
            if (mag2 > 256.0) break;

            iter++;
        }

        if (iter == maxIter) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            float mag2 = zx_h * zx_h + zy_h * zy_h + 2.0 * (zx_h * zx_l + zy_h * zy_l);
            float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));
            float color = smoothVal / uIterations;
            vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
            gl_FragColor = vec4(col, 1.0);
        }
    }
`;

function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.error('Error linking shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

function loadShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Error compiling shader: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// Multiple shader programs - one per fractal family
const shaderPrograms = {};

function createShaderProgram(gl, source) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, source);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Error linking shader program: ' + gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

function initShaderPrograms() {
    shaderPrograms['quad'] = createShaderProgram(gl, fsSourceQuad);
    shaderPrograms['bs'] = createShaderProgram(gl, fsSourceBS);
    shaderPrograms['sin'] = createShaderProgram(gl, fsSourceSin);

    // Validate all loaded
    for (const [name, prog] of Object.entries(shaderPrograms)) {
        if (!prog) {
            console.error(`Failed to load ${name} shader`);
        } else {
            console.log(`✅ Shader loaded: ${name}`);
        }
    }
}

initShaderPrograms();

// Current active program (starts with Mandelbrot = quad)
let currentShaderProgram = shaderPrograms['quad'];
let currentFractalFamily = 'quad'; // 'quad' | 'bs' | 'sin'

function getUniformLocations(program) {
    return {
        resolution: gl.getUniformLocation(program, 'uResolution'),
        offsetHi: gl.getUniformLocation(program, 'uOffsetHi'),
        offsetLo: gl.getUniformLocation(program, 'uOffsetLo'),
        zoomHi: gl.getUniformLocation(program, 'uZoomHi'),
        zoomLo: gl.getUniformLocation(program, 'uZoomLo'),
        iterations: gl.getUniformLocation(program, 'uIterations'),
        colorShift: gl.getUniformLocation(program, 'uColorShift'),
    };
}

let uniformLocations = getUniformLocations(currentShaderProgram);

const buffers = initBuffers(gl);

function initBuffers(gl) {
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    const positions = [
        -1.0,  1.0,
        1.0,  1.0,
        -1.0, -1.0,
        1.0, -1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    return {
        position: positionBuffer,
    };
}

let zoom = 3.0;
let offset = { x: -0.743643887037158, y: 0.131825904205311 }; // Seahorse Valley
let isAutoZooming = false;
let lastFrameTime = 0;
const minZoom = 1e-30;
let colorCycle = 0;
let isColorCycling = false;
let useAutoIterations = true;
let targetIterations = 100;
let currentIterations = 100;
let currentLerpSpeed = 0.02; // Smoother transitions (lower = smoother)
let isIterOscillating = false;
let iterOscillatePhase = 0;
let iterOscillateSpeed = 0.5; // radians per second
let iterOscillateMin = 50;
let iterOscillateMax = 1000;
let oscillateTargetIter = 100;
let oscillateSmoothIter = 100;

// Performance tracking
let perfMode = false;
let frameTimes = []; // Recent frame times for FPS calculation
let avgFPS = 0;
let avgIterations = 0;
let maxIterationsSeen = 0;
let totalPixelOps = 0;
let frameCount = 0;
let perfDisplayTimer = 0;
const MAX_FRAME_HISTORY = 30; // Keep 30 frames for rolling average

function resizeCanvasToDisplaySize(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = Math.floor(window.innerWidth * dpr);
    const displayHeight = Math.floor(window.innerHeight * dpr);

    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
        canvas.width = displayWidth;
        canvas.height = displayHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        return true;
    }
    return false;
}

function getFractalFamily(type) {
    // 'quad': Mandelbrot, Julia, Tricorn (z^2 + c style)
    // 'bs': Burning Ship (uses abs)
    // 'sin': Sinusoidal (uses exp, sin, cos)
    if (type === 2) return 'bs';
    if (type === 4) return 'sin';
    return 'quad';
}

function drawScene(gl, buffers) {
    const fractalType = parseInt(document.getElementById('fractal-type').value);
    const targetFamily = getFractalFamily(fractalType);

    // Switch shader if fractal family changed
    if (targetFamily !== currentFractalFamily) {
        currentFractalFamily = targetFamily;
        currentShaderProgram = shaderPrograms[targetFamily];
        uniformLocations = getUniformLocations(currentShaderProgram);
        console.log(`🔄 Switched to ${targetFamily} shader`);
    }

    gl.useProgram(currentShaderProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(gl.getAttribLocation(currentShaderProgram, 'aVertexPosition'), 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(gl.getAttribLocation(currentShaderProgram, 'aVertexPosition'));

    gl.uniform2f(uniformLocations.resolution, canvas.width, canvas.height);

    // DS math for offset
    const offsetHi = [Math.fround(offset.x), Math.fround(offset.y)];
    const offsetLo = [offset.x - Math.fround(offset.x), offset.y - Math.fround(offset.y)];
    gl.uniform2f(uniformLocations.offsetHi, offsetHi[0], offsetHi[1]);
    gl.uniform2f(uniformLocations.offsetLo, offsetLo[0], offsetLo[1]);

    // DS math for zoom
    const zoomHi = Math.fround(zoom);
    const zoomLo = zoom - Math.fround(zoom);
    gl.uniform1f(uniformLocations.zoomHi, zoomHi);
    gl.uniform1f(uniformLocations.zoomLo, zoomLo);

    const iterValue = parseFloat(document.getElementById('iterations').value);
    gl.uniform1f(uniformLocations.iterations, iterValue);
    gl.uniform1f(uniformLocations.colorShift,
parseFloat(document.getElementById('color-shift').value));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function drawPerfOverlay() {
    const w = perfCanvas.width;
    const h = perfCanvas.height;
    perfCtx.clearRect(0, 0, w, h);

    perfCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    perfCtx.fillRect(0, 0, w, h);

    perfCtx.font = '12px monospace';
    const lineH = 20;
    let y = 20;

    const zoomDepth = -Math.log10(zoom);
    const iterValue = parseFloat(document.getElementById('iterations').value);
    const familyNames = { 'quad': 'z²+c', 'bs': 'Burning Ship', 'sin': 'Sinusoidal' };
    const familyColors = { 'quad': '#4fc3f7', 'bs': '#ff7043', 'sin': '#ab47bc' };

    perfCtx.fillStyle = '#fff';
    perfCtx.fillText('⚡ PERFORMANCE MODE', 10, y);
    y += lineH;

    // FPS
    const fpsColor = avgFPS > 30 ? '#4caf50' : avgFPS > 15 ? '#ff9800' : '#f44336';
    perfCtx.fillStyle = fpsColor;
    perfCtx.fillText(`FPS:         ${avgFPS.toFixed(1)}`, 10, y);
    y += lineH;

    // Frame time
    perfCtx.fillStyle = '#aaa';
    perfCtx.fillText(`Frame time:  ${(1000/avgFPS).toFixed(1)}ms`, 10, y);
    y += lineH;

    // Separator
    y += 4;
    perfCtx.fillStyle = '#555';
    perfCtx.fillRect(10, y, 300, 1);
    y += lineH;

    // Fractal info
    const currentType = parseInt(document.getElementById('fractal-type').value);
    const typeNames = ['Mandelbrot', 'Julia', 'Burning Ship', 'Tricorn', 'Sinusoidal'];
    perfCtx.fillStyle = familyColors[currentFractalFamily] || '#fff';
    perfCtx.fillText(`Fractal:     ${typeNames[currentType] || 'Unknown'}`, 10, y);
    y += lineH;

    perfCtx.fillStyle = familyColors[currentFractalFamily] || '#fff';
    perfCtx.fillText(`Shader:      ${familyNames[currentFractalFamily] || 'N/A'}`, 10, y);
    y += lineH;

    // Zoom info
    perfCtx.fillStyle = '#90caf9';
    perfCtx.fillText(`Zoom:        10^${zoomDepth.toFixed(1)}`, 10, y);
    y += lineH;

    perfCtx.fillStyle = '#aaa';
    perfCtx.fillText(`Zoom value:  ${zoom.toExponential(3)}`, 10, y);
    y += lineH;

    // Iterations
    perfCtx.fillStyle = '#ce93d8';
    perfCtx.fillText(`Iter limit:  ${iterValue}`, 10, y);
    y += lineH;

    // DS cost estimate
    const opsPerIter = currentFractalFamily === 'quad' ? 16 : 
                       currentFractalFamily === 'bs' ? 18 : 24; // sin has expensive ops
    const totalOps = iterValue * opsPerIter;
    perfCtx.fillStyle = '#81c784';
    perfCtx.fillText(`DS ops/pix:  ~${(totalOps / 1e6).toFixed(1)}M (${opsPerIter}×${iterValue})`, 10, y);
    y += lineH;

    // Resolution
    perfCtx.fillStyle = '#aaa';
    perfCtx.fillText(`Resolution:  ${canvas.width}×${canvas.height}`, 10, y);
    y += lineH;

    // Total pixels
    const totalPixels = canvas.width * canvas.height;
    perfCtx.fillStyle = '#aaa';
    perfCtx.fillText(`Total pixels: ${(totalPixels / 1e6).toFixed(2)}M`, 10, y);

    // FPS gauge bar
    y = 180;
    perfCtx.fillStyle = '#333';
    perfCtx.fillRect(10, y, 300, 10);
    const fpsRatio = Math.min(avgFPS / 60, 1);
    const gaugeColor = fpsRatio > 0.7 ? '#4caf50' : fpsRatio > 0.3 ? '#ff9800' : '#f44336';
    perfCtx.fillStyle = gaugeColor;
    perfCtx.fillRect(10, y, 300 * fpsRatio, 10);
    perfCtx.fillStyle = '#fff';
    perfCtx.font = '10px monospace';
    perfCtx.fillText('FPS Gauge', 140, y + 9);
    perfCtx.font = '12px monospace';
}

// Performance overlay canvas (hidden by default)
const perfCanvas = document.createElement('canvas');
perfCanvas.id = 'perfOverlay';
perfCanvas.style.cssText = `
    position: fixed; top: 10px; right: 10px; z-index: 9999;
    background: rgba(0,0,0,0.85); color: #0f0; font: 12px monospace;
    padding: 12px; border-radius: 8px; pointer-events: none;
    display: none; line-height: 1.6;
`;
document.body.appendChild(perfCanvas);
const perfCtx = perfCanvas.getContext('2d');
perfCanvas.width = 320;
perfCanvas.height = 200;

function render(timestamp = 0) {
    const frameStart = performance.now();
    resizeCanvasToDisplaySize(canvas);

    if (lastFrameTime !== 0) {
        const deltaMs = timestamp - lastFrameTime;
        const deltaSec = deltaMs / 1000;

        // Frame time tracking
        frameTimes.push(deltaMs);
        if (frameTimes.length > MAX_FRAME_HISTORY) frameTimes.shift();
        frameCount++;
        const currentFPS = 1000 / deltaMs;
        const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        avgFPS = Math.round(1000 / avgFrameTime * 10) / 10;

        // Update perf display every ~500ms
        if (perfMode) {
            perfDisplayTimer += deltaMs;
            if (perfDisplayTimer > 500) {
                perfDisplayTimer = 0;
                drawPerfOverlay();
            }
        }

        // Continuous zoom
        if (isAutoZooming) {
            const zoomSpeedVal = parseFloat(document.getElementById('zoom-speed').value);
            zoom *= (1.0 - zoomSpeedVal);

            if (zoom < minZoom) {
                // Reset to a new interesting point when we hit precision limits
                zoom = 3.0;
                const interestingPoints = [
                    { x: -0.743643887037158, y: 0.131825904205311 }, // Seahorse Valley
                    { x: -0.1607205, y: 1.037724 }, // Elephant Valley
                    { x: -1.76, y: 0 }, // West arm
                    { x: 0.275, y: 0.008 }, // Mini Mandelbrot
                    { x: -0.745, y: 0.12 }, // Another seahorse
                    { x: -0.743643887037158, y: 0.131825904205311 }, // Seahorse Valley
                    { x: -0.1011, y: 0.9563 }, // Another point
                    { x: 0.3602, y: 0.131 }, // Another point
                ];
                const point = interestingPoints[Math.floor(Math.random() * interestingPoints.length)];
                offset.x = point.x;
                offset.y = point.y;
            }
            const zoomInput = document.getElementById('zoom');
            zoomInput.value = String(zoom);
        }

        // Color cycling
        if (isColorCycling) {
            colorCycle = (colorCycle + deltaSec * 0.1) % 1;
            const colorShiftInput = document.getElementById('color-shift');
            colorShiftInput.value = String(colorCycle);
            document.getElementById('color-shift-val').textContent = colorCycle.toFixed(2);
        }

        // Iteration oscillation (smoothed)
        if (isIterOscillating) {
            iterOscillatePhase += iterOscillateSpeed * deltaSec;
            oscillateTargetIter = Math.floor(
                iterOscillateMin + (iterOscillateMax - iterOscillateMin) * 
                (0.5 + 0.5 * Math.sin(iterOscillatePhase))
            );
            // Smooth interpolation using transition speed
            oscillateSmoothIter += (oscillateTargetIter - oscillateSmoothIter) * currentLerpSpeed;
            const roundedIter = Math.round(oscillateSmoothIter);
            const iterInput = document.getElementById('iterations');
            iterInput.value = String(roundedIter);
            document.getElementById('iterations-val').textContent = roundedIter;
        }

        // Auto iterations based on zoom depth (smoothed)
        if (useAutoIterations && !isIterOscillating) {
            const baseIterations = 100;
            const zoomDepth = Math.max(0, -Math.log10(zoom));
            targetIterations = Math.min(2000, Math.floor(baseIterations + zoomDepth * 150));
            // Smoothly interpolate to target
            currentIterations = Math.round(currentIterations + (targetIterations - currentIterations) * currentLerpSpeed);
            const iterInput = document.getElementById('iterations');
            if (parseInt(iterInput.value) !== currentIterations) {
                iterInput.value = String(currentIterations);
                document.getElementById('iterations-val').textContent = currentIterations;
            }
        }
    }

    lastFrameTime = timestamp;
    drawScene(gl, buffers);
    requestAnimationFrame(render);
}

// UI Event Listeners
document.getElementById('zoom').addEventListener('input', (e) => {
    zoom = parseFloat(e.target.value);
});

document.getElementById('zoom-speed').addEventListener('input', (e) => {
    document.getElementById('zoom-speed-val').textContent = parseFloat(e.target.value).toFixed(3);
});

document.getElementById('toggle-zoom').addEventListener('click', (e) => {
    isAutoZooming = !isAutoZooming;
    e.target.textContent = isAutoZooming ? 'On' : 'Off';
    e.target.classList.toggle('active', isAutoZooming);
});

document.getElementById('toggle-auto-iter').addEventListener('click', (e) => {
    useAutoIterations = !useAutoIterations;
    e.target.textContent = useAutoIterations ? 'On' : 'Off';
    e.target.classList.toggle('active', useAutoIterations);
});

document.getElementById('toggle-color-cycle').addEventListener('click', (e) => {
    isColorCycling = !isColorCycling;
    e.target.textContent = isColorCycling ? 'On' : 'Off';
    e.target.classList.toggle('active', isColorCycling);
});

document.getElementById('toggle-iter-osc').addEventListener('click', (e) => {
    isIterOscillating = !isIterOscillating;
    e.target.textContent = isIterOscillating ? 'On' : 'Off';
    e.target.classList.toggle('active', isIterOscillating);
    // Show/hide oscillation controls
    const oscControls = document.querySelectorAll('.osc-control');
    oscControls.forEach(ctrl => {
        ctrl.style.display = isIterOscillating ? 'block' : 'none';
    });
});

document.getElementById('toggle-perf').addEventListener('click', (e) => {
    perfMode = !perfMode;
    e.target.textContent = perfMode ? 'On' : 'Off';
    e.target.classList.toggle('active', perfMode);
    perfCanvas.style.display = perfMode ? 'block' : 'none';
});

document.getElementById('osc-min').addEventListener('input', (e) => {
    iterOscillateMin = parseInt(e.target.value);
    document.getElementById('osc-min-val').textContent = iterOscillateMin;
});

document.getElementById('osc-max').addEventListener('input', (e) => {
    iterOscillateMax = parseInt(e.target.value);
    document.getElementById('osc-max-val').textContent = iterOscillateMax;
});

document.getElementById('osc-speed').addEventListener('input', (e) => {
    iterOscillateSpeed = parseFloat(e.target.value);
    document.getElementById('osc-speed-val').textContent = iterOscillateSpeed.toFixed(1);
});

document.getElementById('reset-view').addEventListener('click', () => {
    zoom = 3.0;
    offset = { x: -0.743643887037158, y: 0.131825904205311 };
    const zoomInput = document.getElementById('zoom');
    zoomInput.value = String(zoom);
});

// Preset loading
document.getElementById('preset-select').addEventListener('change', (e) => {
    const option = e.target.options[e.target.selectedIndex];
    if (option.value && option.dataset.x) {
        offset.x = parseFloat(option.dataset.x);
        offset.y = parseFloat(option.dataset.y);
        zoom = parseFloat(option.dataset.z);
        document.getElementById('zoom').value = String(zoom);
        // Reset to Mandelbrot for presets (most are Mandelbrot coordinates)
        document.getElementById('fractal-type').value = '0';
    }
});



document.getElementById('iterations').addEventListener('input', (e) => {
    document.getElementById('iterations-val').textContent = e.target.value;
});

document.getElementById('iter-lerp').addEventListener('input', (e) => {
    currentLerpSpeed = parseFloat(e.target.value);
    document.getElementById('iter-lerp-val').textContent = currentLerpSpeed.toFixed(3);
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

        offset.x -= (dx / canvas.width) * aspect * zoom;
        offset.y += (dy / canvas.height) * zoom;

        lastMousePos = { x: e.clientX, y: e.clientY };
    }
});

// Touch/Pinch interaction
let lastTouchDistance = 0;
let lastTouchCenter = { x: 0, y: 0 };

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
        // Single touch for panning
        isDragging = true;
        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        // Two touches for pinch zoom
        isDragging = false;
        lastTouchDistance = getTouchDistance(e.touches);
        lastTouchCenter = getTouchCenter(e.touches);
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && isDragging) {
        // Single touch panning
        const dx = e.touches[0].clientX - lastMousePos.x;
        const dy = e.touches[0].clientY - lastMousePos.y;
        const aspect = canvas.width / canvas.height;

        offset.x -= (dx / canvas.width) * aspect * zoom;
        offset.y += (dy / canvas.height) * zoom;

        lastMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2) {
        // Pinch zoom
        const distance = getTouchDistance(e.touches);
        const center = getTouchCenter(e.touches);

        if (lastTouchDistance > 0) {
            const scale = distance / lastTouchDistance;
            const targetZoom = zoom / scale;

            // Adjust offset to zoom toward pinch center (canvas-relative coordinates)
            const rect = canvas.getBoundingClientRect();
            const centerX = (center.x - rect.left) / rect.width;
            const centerY = 1.0 - (center.y - rect.top) / rect.height;

            const aspect = canvas.width / canvas.height;
            const screenX = (centerX - 0.5) * aspect;
            const screenY = (centerY - 0.5);

            const worldX = offset.x + screenX * zoom;
            const worldY = offset.y + screenY * zoom;

            zoom = Math.max(minZoom, Math.min(3.0, targetZoom));

            offset.x = worldX - screenX * zoom;
            offset.y = worldY - screenY * zoom;

            lastTouchDistance = distance;
            lastTouchCenter = center;

            document.getElementById('zoom').value = String(zoom);
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

// On mobile, start collapsed (panel hidden)
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

// FAB toggle for mobile when panel is hidden
mobileFab.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleUI();
});

// Close panel when tapping overlay on mobile
uiOverlay.addEventListener('click', () => {
    if (!uiCollapsed) {
        toggleUI();
    }
});

// Handle resize: clean up mobile classes when switching to desktop
window.addEventListener('resize', () => {
    if (!isMobile()) {
        ui.classList.remove('mobile-visible');
        uiOverlay.classList.remove('visible');
    }
});

// Section collapse/expand
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

// Set initial state for oscillation controls
document.querySelectorAll('.osc-control').forEach(ctrl => {
    ctrl.style.display = 'none';
});

// Set initial active states for toggle buttons
document.getElementById('toggle-zoom').classList.toggle('active', isAutoZooming);
document.getElementById('toggle-auto-iter').classList.toggle('active', useAutoIterations);
document.getElementById('toggle-color-cycle').classList.toggle('active', isColorCycling);
document.getElementById('toggle-iter-osc').classList.toggle('active', isIterOscillating);

// Press H to toggle UI
document.addEventListener('keydown', (e) => {
    if (e.key === 'h' || e.key === 'H') {
        toggleUI();
    }
    if (e.key === 'p' || e.key === 'P') {
        perfMode = !perfMode;
        const btn = document.getElementById('toggle-perf');
        btn.textContent = perfMode ? 'On' : 'Off';
        btn.classList.toggle('active', perfMode);
        perfCanvas.style.display = perfMode ? 'block' : 'none';
    }
});

// Mouse wheel zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = 1.05;
    const direction = e.deltaY > 0 ? zoomFactor : 1 / zoomFactor;

    // Zoom toward mouse position (canvas-relative coordinates)
    const rect = canvas.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / rect.width;
    const mouseY = 1.0 - (e.clientY - rect.top) / rect.height;

    const aspect = canvas.width / canvas.height;
    const screenX = (mouseX - 0.5) * aspect;
    const screenY = (mouseY - 0.5);

    const worldX = offset.x + screenX * zoom;
    const worldY = offset.y + screenY * zoom;

    zoom = Math.max(minZoom, Math.min(3.0, zoom * direction));

    offset.x = worldX - screenX * zoom;
    offset.y = worldY - screenY * zoom;

    document.getElementById('zoom').value = String(zoom);
}, { passive: false });

document.getElementById('zoom').value = String(zoom);

window.addEventListener('resize', () => resizeCanvasToDisplaySize(canvas));
resizeCanvasToDisplaySize(canvas);
requestAnimationFrame(render);
