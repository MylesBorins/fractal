precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;
    uniform int uFractalType;
    uniform int uDebugMode; // 0=normal, 1=debug color output
    uniform int uSuperSample; // 0=off, 1=2x supersample

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (0.5 - uv.y);

        // Julia set constant (fixed c for Julia) — DS format
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
            zx = vec2(0.0);
            zy = vec2(0.0);
        }

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // DS squaring of real and imaginary parts
            vec2 zxSqr = dsSqr(zx);  // (zx.hi², 2*zx.hi*zx.lo)
            vec2 zySqr = dsSqr(zy);  // (zy.hi², 2*zy.hi*zy.lo)

            // z² = (zx² - zy²) + i·(2·zx·zy)
            vec2 realPart = dsSub(zxSqr, zySqr);  // zx² - zy² (DS)

            // 2·zx·zy = zx·zy + zx·zy (DS multiply + add)
            vec2 zProd = dsMul(zx, zy);           // (zx.hi*zy.hi, zx.hi*zy.lo + zx.lo*zy.hi)
            vec2 imagPart = dsAdd(zProd, zProd);  // 2·zx·zy (DS)

            vec2 nx, ny;

            if (uFractalType == 0 || uFractalType == 1) {
                // Mandelbrot: z = z² + c
                // Julia: z = z² + juliaC
                vec2 c_xAdd = (uFractalType == 0) ? c_x : juliaCReal;
                vec2 c_yAdd = (uFractalType == 0) ? c_y : juliaCImag;
                nx = dsAdd(realPart, c_xAdd);
                ny = dsAdd(imagPart, c_yAdd);
            } else {
                // Tricorn: z = conj(z)² + c → real same, imag = -imag + c_y
                // conj(z)² = (zx² - zy²) + i·(-2·zx·zy)
                vec2 negImag = dsSub(vec2(0.0, 0.0), imagPart);  // -(2·zx·zy)
                nx = dsAdd(realPart, c_x);
                ny = dsAdd(negImag, c_y);
            }

            zx = nx;
            zy = ny;

            // Magnitude check: use hi component only
            float mag2 = (zx.x + zx.y) * (zx.x + zx.y) + (zy.x + zy.y) * (zy.x + zy.y);
            if (mag2 > 256.0) break;

            iter++;
        }

        // Debug mode: output hi/lo values as colors
        if (uDebugMode == 1) {
            vec2 centerDist = abs(uv - 0.5);
            bool isCenter = (centerDist.x < 0.02) && (centerDist.y < 0.02);

            if (isCenter) {
                float cXH = (log2(max(abs(c_x.x), 1e-30)) + 40.0) / 80.0 * (c_x.x >= 0.0 ? 1.0 : 0.0);
                float cXL = (log2(max(abs(c_x.y), 1e-30)) + 40.0) / 80.0 * (c_x.y >= 0.0 ? 1.0 : 0.0);
                float cYH = (log2(max(abs(c_y.x), 1e-30)) + 40.0) / 80.0 * (c_y.x >= 0.0 ? 1.0 : 0.0);
                gl_FragColor = vec4(cXH, cXL, cYH, 1.0);
            } else if ((centerDist.x > 0.3) && (centerDist.y > 0.3)) {
                float zxH = (log2(max(abs(zx.x), 1e-30)) + 40.0) / 80.0 * (zx.x >= 0.0 ? 1.0 : 0.0);
                float zxL = (log2(max(abs(zx.y), 1e-30)) + 40.0) / 80.0 * (zx.y >= 0.0 ? 1.0 : 0.0);
                float zyH = (log2(max(abs(zy.x), 1e-30)) + 40.0) / 80.0 * (zy.x >= 0.0 ? 1.0 : 0.0);
                gl_FragColor = vec4(zxH, zxL, zyH, 1.0);
            } else {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            }
            return;
        }

        if (iter == maxIter) {
            // Inside set — output c_x.y (DS low component) as brightness
            float debugBright = clamp(log2(max(abs(c_x.y), 1e-30)) / 20.0 + 0.5, 0.0, 1.0);
            gl_FragColor = vec4(debugBright * 0.3, debugBright * 0.5, debugBright * 0.7, 1.0);
        } else {
            float mag2 = (zx.x + zx.y) * (zx.x + zx.y) + (zy.x + zy.y) * (zy.x + zy.y);
            float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));
            float color = smoothVal / uIterations;
            vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
            gl_FragColor = vec4(col, 1.0);
        }
    }
