    precision highp float;

    uniform vec2 uResolution;
    uniform vec2 uOffsetHi;
    uniform vec2 uOffsetLo;
    uniform float uZoomHi;
    uniform float uZoomLo;
    uniform float uIterations;
    uniform float uColorShift;

    void main() {
        vec2 uv = gl_FragCoord.xy / uResolution.xy;
        float aspect = uResolution.x / uResolution.y;

        float fx = (uv.x - 0.5) * aspect;
        float fy = (uv.y - 0.5);

        float c_x_h = uOffsetHi.x + fx * uZoomHi;
        float c_x_l = uOffsetLo.x + fx * uZoomLo;
        float c_y_h = uOffsetHi.y + fy * uZoomHi;
        float c_y_l = uOffsetLo.y + fy * uZoomLo;

        // Burning Ship: z = 0, c = pixel position
        float zx_h = 0.0, zx_l = 0.0;
        float zy_h = 0.0, zy_l = 0.0;

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // abs(z) with DS precision
            float ax_h = abs(zx_h);
            float ax_l = (zx_h >= 0.0) ? zx_l : -zx_l;
            float ay_h = abs(zy_h);
            float ay_l = (zy_h >= 0.0) ? zy_l : -zy_l;

            // w² = w_h² + 2*w_h*w_l
            float ax2_h = ax_h * ax_h;
            float ax2_l = 2.0 * ax_h * ax_l;
            float ay2_h = ay_h * ay_h;
            float ay2_l = 2.0 * ay_h * ay_l;

            // (ax + i*ay)² = (ax² - ay²) + 2i*ax*ay
            float nx_h = ax2_h - ay2_h + c_x_h;
            float nx_l = ax2_l - ay2_l + c_x_l;
            float ny_h = 2.0 * ax_h * ay_h + c_y_h;
            float ny_l = 2.0 * (ax_h * ay_l + ax_l * ay_h) + c_y_l;

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
            float mag2 = zx_h * zx_h + zy_h * zy_h + 2.0 * (zx_h * zx_l + zy_h * zy_l);
            float smoothVal = float(iter) + 1.0 - log2(max(mag2, 1e-20));
            float color = smoothVal / uIterations;
            vec3 col = 0.5 + 0.5 * cos(6.28318 * (vec3(1.0, 0.6, 0.4) * color + uColorShift));
            gl_FragColor = vec4(col, 1.0);
        }
    }
