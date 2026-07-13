precision highp float;

uniform highp vec2 uResolution;
uniform highp vec2 uOffsetHi;
uniform highp vec2 uOffsetLo;
uniform highp float uZoomHi;
uniform highp float uZoomLo;
uniform highp float uIterations;
uniform highp float uColorShift;
uniform int uFractalType;
uniform int uDebugMode;
uniform int uSuperSample;

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution.xy;
    float aspect = uResolution.x / uResolution.y;

    float fx = (uv.x - 0.5) * aspect;
    float fy = (0.5 - uv.y);

    vec2 juliaCReal = vec2(-0.7269, 0.0);
    vec2 juliaCImag = vec2(-0.1889, 0.0);

    // c as DS number: c = c.hi + c.lo = (offset + pixel*zoom)
    vec2 c_x = dsAdd(vec2(uOffsetHi.x, uOffsetLo.x),
                     dsMulScalar(fx, vec2(uZoomHi, uZoomLo)));
    vec2 c_y = dsAdd(vec2(uOffsetHi.y, uOffsetLo.y),
                     dsMulScalar(fy, vec2(uZoomHi, uZoomLo)));

    // z as DS number: z = (z.x + z.y)
    vec2 zx, zy;
    if (uFractalType == 1) {
        // Julia: z = pixel position as DS
        zx = c_x;
        zy = c_y;
    } else {
        // Mandelbrot & Tricorn: z = 0
        zx = vec2(0.0, 0.0);
        zy = vec2(0.0, 0.0);
    }

    int iter = 0;
    int maxIter = int(uIterations);

    for (int i = 0; i < 2000; i++) {
        if (i >= maxIter) break;

        vec2 zxSqr = dsSqr(zx);
        vec2 zySqr = dsSqr(zy);
        vec2 realPart = dsSub(zxSqr, zySqr);
        vec2 zProd = dsMul(zx, zy);
        vec2 imagPart = dsAdd(zProd, zProd);

        vec2 nx, ny;

        if (uFractalType == 0 || uFractalType == 1) {
            vec2 c_xAdd = (uFractalType == 0) ? c_x : juliaCReal;
            vec2 c_yAdd = (uFractalType == 0) ? c_y : juliaCImag;
            nx = dsAdd(realPart, c_xAdd);
            ny = dsAdd(imagPart, c_yAdd);
        } else {
            vec2 negImag = dsSub(vec2(0.0, 0.0), imagPart);
            nx = dsAdd(realPart, c_x);
            ny = dsAdd(negImag, c_y);
        }

        zx = nx;
        zy = ny;

        float mag2 = (zx.x + zx.y) * (zx.x + zx.y) + (zy.x + zy.y) * (zy.x + zy.y);
        if (mag2 > 256.0) break;

        iter++;
    }

    // Debug mode: output hi/lo values as colors
    // Also log exact values to console via canvas readback
    if (uDebugMode == 1) {
        vec2 centerDist = abs(uv - 0.5);
        if (centerDist.x < 0.02 && centerDist.y < 0.02) {
            // Log to console: c_x.hi, c_x.lo, c_y.hi, c_y.lo
            // Also log zx.x (hi), zx.y (lo) after 10 iterations
            console.log(`[SHADER] c_x_h=${c_x.x.toExponential(7)} c_x_l=${c_x.y.toExponential(7)}`);
            console.log(`[SHADER] c_y_h=${c_y.x.toExponential(7)} c_y_l=${c_y.y.toExponential(7)}`);
            console.log(`[SHADER] zx_h=${zx.x.toExponential(7)} zx_l=${zx.y.toExponential(7)}`);
            console.log(`[SHADER] zy_h=${zy.x.toExponential(7)} zy_l=${zy.y.toExponential(7)}`);
            console.log(`[SHADER] uZoomHi=${uZoomHi.toExponential(7)} uZoomLo=${uZoomLo.toExponential(7)}`);
            console.log(`[SHADER] uOffHi_x=${uOffsetHi.x.toExponential(7)} uOffLo_x=${uOffsetLo.x.toExponential(7)}`);
        }
        vec2 centerDist = abs(uv - 0.5);
        bool isCenter = (centerDist.x < 0.02) && (centerDist.y < 0.02);

        if (isCenter) {
            float cXH = (log2(max(abs(c_x.x), 1e-30)) + 40.0) / 80.0 * (c_x.x >= 0.0 ? 1.0 : 0.0);
            float cXL = (log2(max(abs(c_x.y), 1e-30)) + 40.0) / 80.0 * (c_x.y >= 0.0 ? 1.0 : 0.0);
            float cYH = (log2(max(abs(c_y.x), 1e-30)) + 40.0) / 80.0 * (c_y.x >= 0.0 ? 1.0 : 0.0);
            gl_FragColor = vec4(cXH, cXL, cYH, 1.0);
        } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
        return;
    }

    if (iter == maxIter) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    } else {
        float mag2 = (zx.x + zx.y) * (zx.x + zx.y) + (zy.x + zy.y) * (zy.x + zy.y);
        float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));
        float color = smoothVal / uIterations;
        vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
        gl_FragColor = vec4(col, 1.0);
    }
}
