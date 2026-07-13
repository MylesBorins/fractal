const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
const IS_WEBGL2 = gl instanceof WebGL2RenderingContext;

if (IS_WEBGL2) {
    console.log('✅ WebGL 2 active');
} else {
    console.warn('⚠️ Running on WebGL 1 — error-free DS math will use split-based twoProd');
}
export const IS_WEBGL2_FLAG = IS_WEBGL2;

function initBuffers(gl) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,1,1,1,-1,-1,1,-1]), gl.STATIC_DRAW);
    return { position: buf };
}
export const buffers = initBuffers(gl);

const perfDiv = document.createElement('div');
perfDiv.id = 'perfOverlay';
perfDiv.style.cssText = 'position:fixed;top:10px;right:10px;z-index:9999;background:rgba(0,0,0,0.85);color:#0f0;font:12px monospace;padding:12px;border-radius:8px;pointer-events:none;display:none;white-space:pre;line-height:1.4;max-width:300px;min-width:250px;';
document.body.appendChild(perfDiv);
export const perfCtx = perfDiv;
export { canvas, gl };

let _supersampleFBO = null;
let _supersampleTex = null;

export function getSupersampleFBO() { return _supersampleFBO; }
export function setSupersampleFBO(fbo) { _supersampleFBO = fbo; }
export function getSupersampleTex() { return _supersampleTex; }
export function setSupersampleTex(tex) { _supersampleTex = tex; }

export function createSupersampleFBO(w, h) {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    setSupersampleFBO(fbo);
    setSupersampleTex(tex);
    return { fbo, tex };
}

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
