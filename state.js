const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl');

function initBuffers(gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,1,1,-1,-1,1,-1]), gl.STATIC_DRAW);
    return { position: buf };
}
export const buffers = initBuffers(gl);

const perfCanvas = document.createElement('canvas');
perfCanvas.id = 'perfOverlay';
perfCanvas.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:rgba(0,0,0,0.85);color:#0f0;font:12px monospace;padding:12px;border-radius:8px;pointer-events:none;display:none;';
document.body.appendChild(perfCanvas);
export const perfCtx = perfCanvas.getContext('2d');
export { canvas, gl, perfCanvas };

export function getFractalFamily(type) {
    if (type === 2) return 'bs';
    if (type === 4) return 'sin';
    return 'quad';
}

export function resizeCanvasToDisplaySize() {
    const dpr = window.devicePixelRatio || 1;
    const dw = Math.floor(window.innerWidth * dpr);
    const dh = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== dw || canvas.height !== dh) {
        canvas.width = dw;
        canvas.height = dh;
        gl.viewport(0, 0, canvas.width, canvas.height);
        return true;
    }
    return false;
}
