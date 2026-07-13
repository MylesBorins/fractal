precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;
    uniform int uDebugMode; // 0=normal, 1=debug color output
    uniform int uSuperSample; // 0=off, 1=2x supersample

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (0.5 - uv.y);

        // c as DS number
        vec2 c_x = dsAdd(vec2(uOffsetHi.x, uOffsetLo.x),
                         dsMulScalar(fx, vec2(uZoomHi, uZoomLo)));
        vec2 c_y = dsAdd(vec2(uOffsetHi.y, uOffsetLo.y),
                         dsMulScalar(fy, vec2(uZoomHi, uZoomLo)));

        // Sinusoidal: z = 0
        vec2 zx = vec2(0.0);
        vec2 zy = vec2(0.0);

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // sin(z) + c where z = zx + i*zy (DS numbers)
            // sin(a + ib) = sin(a)cosh(b) + i·cos(a)sinh(b)

            float exp_zh = exp(zy.x);
            float exp_mzh = exp(-zy.x);
            float cosh_zh = 0.5 * (exp_zh + exp_mzh);
            float sinh_zh = 0.5 * (exp_zh - exp_mzh);

            float sin_zx_h = sin(zx.x);
            float cos_zx_h = cos(zx.x);

            // High parts
            float sin_zx_cos_h = sin_zx_h * cosh_zh;
            float cos_zx_sin_h = cos_zx_h * sinh_zh;

            // Low parts via first-order Taylor expansion (derivatives)
            // d/dzx: cos(zx)*cosh(zy) → multiply by zx.y
            // d/dzy: cos(zx)*sinh(zy) → multiply by zy.y
            float cos_zx_cos_h = cos_zx_h * cosh_zh;
            float sin_zx_sin_h = sin_zx_h * sinh_zh;

            // Real low: cos(zx)*cosh(zy)*zx.y - sin(zx)*sinh(zy)*zy.y
            float derivReal = cos_zx_cos_h * zx.y - sin_zx_sin_h * zy.y;
            // Imag low: cos(zx)*cosh(zy)*zy.y + sin(zx)*sinh(zy)*zx.y
            float derivImag = cos_zx_cos_h * zy.y + sin_zx_sin_h * zx.y;

            // nx = (sin_zx_cos_h + derivReal) + c_x
            // ny = (cos_zx_sin_h + derivImag) + c_y
            vec2 nx = dsAdd(vec2(sin_zx_cos_h, derivReal), c_x);
            vec2 ny = dsAdd(vec2(cos_zx_sin_h, derivImag), c_y);

            zx = nx;
            zy = ny;

            // Magnitude check
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
