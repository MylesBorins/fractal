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
        bool isCenter = (centerDist.x < 0.02) && (centerDist.y < 0.02);
        // IEEE-single self-test patch, just left of center:
        //   t1 = 1 + 2^-20: exact in 24-bit mantissa, rounds to 1.0 in 11-bit (mediump)
        //   split(uOffsetHi.x) must reconstruct exactly (Dekker/Veltkamp)
        bool isSelfTest = (uv.x > 0.42 && uv.x < 0.48) && (centerDist.y < 0.02);

        if (isSelfTest) {
            bool okAdd = (1.0 + 1.0 / 1048576.0) > 1.0;
            vec2 sp = split(uOffsetHi.x);
            bool okSplit = (sp.x + sp.y) == uOffsetHi.x;
            gl_FragColor = (okAdd && okSplit) ? vec4(0.0, 1.0, 0.0, 1.0)  // both pass: true IEEE single
                          : okAdd             ? vec4(1.0, 1.0, 0.0, 1.0)  // yellow: add ok, split broken
                          : okSplit           ? vec4(0.0, 1.0, 1.0, 1.0)  // cyan: split ok, add broken
                          :                    vec4(1.0, 0.0, 0.0, 1.0);  // red: driver degraded
        } else if (isCenter) {
            // Map log2 magnitude to [0,1] via offset/2*range: log2(val) ≈ [-40, 40] → [0, 1]
            // R = c_x.hi magnitude, G = c_x.lo magnitude, B = c_y.hi magnitude
            float cXH = (log2(max(abs(c_x.x), 1e-30)) + 40.0) / 80.0;
            float cXL = (log2(max(abs(c_x.y), 1e-30)) + 40.0) / 80.0;
            float cYH = (log2(max(abs(c_y.x), 1e-30)) + 40.0) / 80.0;
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
