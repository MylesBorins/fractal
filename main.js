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

const fsSource = `
    precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffset;
    uniform float uZoom;
    uniform float uIterations;
    uniform float uColorShift;

    void main() {
        // Get normalized coordinates (0 to 1)
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        
        // Adjust for aspect ratio and flip Y
        float aspect = uResolution.x / uResolution.y;
        vec2 c = (uv - 0.5) * vec2(aspect * uZoom, uZoom) + uOffset;

        vec2 z = vec2(0.0, 0.0);
        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 1000; i++) {
            if (i >= maxIter) break;
            
            // z = z^2 + c
            float x = z.x * z.x - z.y * z.y + c.x;
            float y = 2.0 * z.x * z.y + c.y;
            z = vec2(x, y);

            if (length(z) > 2.0) break;
            iter++;
        }

        if (iter == maxIter) {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
            // Smooth coloring
            float color = float(iter) / uIterations;
            vec3 color_val = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
            gl_FragColor = vec4(color_val, 1.0);
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

const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

if (!shaderProgram) {
    alert('An error occurred while initializing the shader program.');
}

const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
    },
    uniformLocations: {
        resolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
        offset: gl.getUniformLocation(shaderProgram, 'uOffset'),
        zoom: gl.getUniformLocation(shaderProgram, 'uZoom'),
        iterations: gl.getUniformLocation(shaderProgram, 'uIterations'),
        colorShift: gl.getUniformLocation(shaderProgram, 'uColorShift'),
    },
};

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
let offset = { x: 0.0, y: 0.0 };
let isAutoZooming = false;
let lastFrameTime = 0;
const minZoom = 0.0001;
const autoZoomRate = 0.985;

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

function drawScene(gl, programInfo, buffers) {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(programInfo.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
    gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);

    gl.uniform2f(programInfo.uniformLocations.resolution, canvas.width, canvas.height);
    gl.uniform2f(programInfo.uniformLocations.offset, offset.x, offset.y);
    gl.uniform1f(programInfo.uniformLocations.zoom, zoom);
    gl.uniform1f(programInfo.uniformLocations.iterations, parseFloat(document.getElementById('iterations').value));
    gl.uniform1f(programInfo.uniformLocations.colorShift, parseFloat(document.getElementById('color-shift').value));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function render(timestamp = 0) {
    resizeCanvasToDisplaySize(canvas);

    if (isAutoZooming && lastFrameTime !== 0) {
        const deltaMs = timestamp - lastFrameTime;
        const frameScale = Math.pow(autoZoomRate, deltaMs / 16.6667);
        zoom = Math.max(minZoom, zoom * frameScale);
        const zoomInput = document.getElementById('zoom');
        zoomInput.value = String(zoom);
        document.getElementById('zoom-val').textContent = zoom.toFixed(4);
    }

    lastFrameTime = timestamp;
    drawScene(gl, programInfo, buffers);
    requestAnimationFrame(render);
}

// UI Event Listeners
document.getElementById('zoom').addEventListener('input', (e) => {
    zoom = parseFloat(e.target.value);
    document.getElementById('zoom-val').textContent = zoom.toFixed(4);
});

document.getElementById('toggle-zoom').addEventListener('click', (e) => {
    isAutoZooming = !isAutoZooming;
    e.target.textContent = isAutoZooming ? 'Stop Zoom' : 'Start Zoom';
});

document.getElementById('iterations').addEventListener('input', (e) => {
    document.getElementById('iterations-val').textContent = e.target.value;
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
        
        // Adjust offset based on zoom and aspect ratio
        // When dragging, we want the content to follow the mouse.
        // If we move mouse right (dx > 0), we want the content to move right.
        // In our coordinate system, moving right means increasing c.x.
        // But our c.x is (uv.x - 0.5) * aspect * zoom + offset.x.
        // If we want to keep c.x constant for a given uv.x, we need to adjust offset.x.
        // If we move the mouse right, we are effectively changing the uv.x of the point under the mouse.
        // To keep the same point under the mouse, we need to adjust offset.
        
        // Let's use a simpler approach:
        // The change in c.x due to dx is (dx / canvas.width) * aspect * zoom.
        // To keep the same c.x, we need to subtract this from offset.x.
        // Wait, if we move mouse right, dx is positive.
        // If we want the content to move right, we want the point under the mouse to be the same.
        // Actually, if we drag the content right, we are moving the view to the left.
        // So we should decrease offset.x.
        
        offset.x -= (dx / canvas.width) * aspect * zoom;
        offset.y += (dy / canvas.height) * zoom;

        lastMousePos = { x: e.clientX, y: e.clientY };
    }
});

document.getElementById('zoom').value = String(zoom);
document.getElementById('zoom-val').textContent = zoom.toFixed(4);

window.addEventListener('resize', () => resizeCanvasToDisplaySize(canvas));
resizeCanvasToDisplaySize(canvas);
requestAnimationFrame(render);
