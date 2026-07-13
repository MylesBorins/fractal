precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;
    uniform int uDebugMode;
    uniform int uSuperSample;

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (0.5 - uv.y);

        vec2 c_x = dsAdd(vec2(uOffsetHi.x, uOffsetLo.x),
                         dsMulScalar(fx, vec2(uZoomHi, uZoomLo)));
        vec2 c_y = dsAdd(vec2(uOffsetHi.y, uOffsetLo.y),
                         dsMulScalar(fy, vec2(uZoomHi, uZoomLo)));

        vec2 zx = vec2(0.0, 0.0);
        vec2 zy = vec2(0.0, 0.0);

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            vec2 ax = (zx.x >= 0.0) ? zx : vec2(-zx.x, -zx.y);
            vec2 ay = (zy.x >= 0.0) ? zy : vec2(-zy.x, -zy.y);

            vec2 axSqr = dsSqr(ax);
            vec2 aySqr = dsSqr(ay);
            vec2 realPart = dsSub(axSqr, aySqr);
            vec2 zProd = dsMul(ax, ay);
            vec2 imagPart = dsAdd(zProd, zProd);

            vec2 nx = dsAdd(realPart, c_x);
            vec2 ny = dsAdd(imagPart, c_y);

            zx = nx;
            zy = ny;

            float mag2 = (zx.x + zx.y) * (zx.x + zx.y) + (zy.x + zy.y) * (zy.x + zy.y);
            if (mag2 > 256.0) break;

            iter++;
        }

        if (uDebugMode == 1) {
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
