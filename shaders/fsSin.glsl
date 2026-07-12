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
        float fy = (0.5 - uv.y);

        float c_x_h = uOffsetHi.x + fx * uZoomHi;
        float c_x_l = uOffsetLo.x + fx * uZoomLo;
        float c_y_h = uOffsetHi.y + fy * uZoomHi;
        float c_y_l = uOffsetLo.y + fy * uZoomLo;

        float zx_h = 0.0, zx_l = 0.0;
        float zy_h = 0.0, zy_l = 0.0;

        int iter = 0;
        int maxIter = int(uIterations);

        for (int i = 0; i < 2000; i++) {
            if (i >= maxIter) break;

            // sin(z) + c in DS precision
            float exp_zh = exp(zy_h);
            float exp_mzh = exp(-zy_h);
            float cosh_zh = 0.5 * (exp_zh + exp_mzh);
            float sinh_zh = 0.5 * (exp_zh - exp_mzh);

            // sin(z) = sin(x)cosh(y) + i*cos(x)sinh(y)
            float sin_zx_h = sin(zx_h);
            float cos_zx_h = cos(zx_h);
            
            float nx_h = sin_zx_h * cosh_zh + c_x_h;
            float ny_h = cos_zx_h * sinh_zh + c_y_h;

            // DS precision lower parts via chain rule:
            // f(z) = sin(z) + c, f'(z) = cos(z)
            // f'(z_h) = cos(zx_h)cosh(zy_h) + i*sin(zx_h)sinh(zy_h)
            // f'(z_h) * z_l = (cos_zx_h*cosh_zh*zx_l - sin_zx_h*sinh_zh*zy_l) + i*(cos_zx_h*cosh_zh*zy_l + sin_zx_h*sinh_zh*zx_l)
            float cos_zx_zh = cos_zx_h * cosh_zh;
            float sin_zx_sh = sin_zx_h * sinh_zh;
            float nx_l = cos_zx_zh * zx_l - sin_zx_sh * zy_l + c_x_l;
            float ny_l = cos_zx_zh * zy_l + sin_zx_sh * zx_l + c_y_l;

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
