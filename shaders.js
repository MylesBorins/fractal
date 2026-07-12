const vsSource = `
    attribute vec2 aVertexPosition;
    void main() {
        gl_Position = vec4(aVertexPosition, 0.0, 1.0);
    }
`;

export let shaderPrograms = {};

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

function createShaderProgram(gl, fragmentSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fragmentSource);

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

export function initShaderPrograms(gl) {
    shaderPrograms['quad'] = createShaderProgram(gl, document.getElementById('shader-src-quad').textContent);
    shaderPrograms['bs'] = createShaderProgram(gl, document.getElementById('shader-src-bs').textContent);
    shaderPrograms['sin'] = createShaderProgram(gl, document.getElementById('shader-src-sin').textContent);

    for (const [name, prog] of Object.entries(shaderPrograms)) {
        if (!prog) {
            console.error(`Failed to load ${name} shader`);
        } else {
            console.log(`✅ Shader loaded: ${name}`);
        }
    }
}

export function getUniformLocations(gl, program) {
    return {
        resolution: gl.getUniformLocation(program, 'uResolution'),
        offsetHi: gl.getUniformLocation(program, 'uOffsetHi'),
        offsetLo: gl.getUniformLocation(program, 'uOffsetLo'),
        zoomHi: gl.getUniformLocation(program, 'uZoomHi'),
        zoomLo: gl.getUniformLocation(program, 'uZoomLo'),
        iterations: gl.getUniformLocation(program, 'uIterations'),
        colorShift: gl.getUniformLocation(program, 'uColorShift'),
        fractalType: gl.getUniformLocation(program, 'uFractalType'),
    };
}
