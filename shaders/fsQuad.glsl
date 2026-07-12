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
        float fy = (0.5 - uv.y);

        // Julia set constant (fixed c for Julia)
        vec2 juliaC = vec2(-0.7269, -0.1889);

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
// (Also called the "Anti-Mandelbrot" - rotated & spiky version)
// Good viewing params: offset(-0.4, 0.0), zoom 2.0
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
