#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float iGamma;
uniform float iContrast;
uniform float iGray;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform sampler2D iTexture0;
uniform sampler2D iTexture1;
uniform sampler2D iTexture2;
uniform float iTexture2AspectRatio;

uniform bool mistakeUVforST;
uniform bool forgetAspectRatioCorrection;
uniform bool forgetYDirectionConvention;
uniform bool onlyBlendLinearly;
uniform float iMixingForLinearBlending;
uniform bool onlyTakeMaximum;
uniform bool onlyTakeMinimum;
uniform bool onlyBlendByMultiply;
uniform bool onlyBlendByDivision;
uniform bool onlyBlendByScreen;
uniform float iMixingForScreenBlending;
uniform bool onlyBlendBySoftLight;
uniform float iMixingForSoftLightBlending;
uniform bool onlyBlendByOverlay;
uniform float iMixingForOverlayBlending;
uniform bool showABadIdeaOfDoingAHueShift;

vec4 c = vec4(1., 0., -1., .5);

const float twoPi = 6.28319;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s,  c);
}

void applyGrid(inout vec3 col, in vec2 uv, float gridStep) {
    uv = mod(uv, gridStep);
    // <-- verallgemeinert fract(x) == mod(x, 1.)
    float dMin = min(uv.x, uv.y);
    col *= 1. - 0.5 * (step(dMin, 0.005));
}

vec3 grayscale(vec3 col) {
    // Gewichtet in etwa nach dem menschlichen Empfinden (-> Spektren der Zapfen)
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    return vec3(gray);
}

vec4 cmy_coeff_from(vec3 rgb) {
    // rgb = K0 + K_C * c.yxx + K_M * c.xyx + K_Y * c.xxy;
    // K_C = (g + b - r - 1) / 2
    // K_M = (b + r - g - 1) / 2
    // K_Y = (r + g - b - 1) / 2
    // K0 == 1
    return vec4(
        0.5 * (rgb.g + rgb.b - rgb.r - 1.),
        0.5 * (rgb.b + rgb.r - rgb.g - 1.),
        0.5 * (rgb.r + rgb.g - rgb.b - 1.),
        1.0
    );
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    fragColor = c.yyyx;
    vec3 col, bg, col0, col1, col2;

    float d = sdCircle(uv, 0.02);
    bg = d * c.xxx;
    bg = mix(c.yyy, c.xxx, smoothstep(0., 0.001, d));

    applyGrid(bg, uv, 0.5);
    fragColor.rgb = bg;

    vec2 st = 0.5 * uv - 0.5;
    st.x *= iResolution.x / iResolution.y;
    st.y = 1. - st.y;

    col0 = texture(iTexture2, st).rgb;
    fragColor.rgb = col0;

    vec2 offset1 = vec2(0.05, 0.02) * sin(iTime);
    col1 = texture(iTexture2, st + offset1).rgb;
    col2 = texture(iTexture2, st + offset1).rgb;

//    fragColor.r = col1.r;
//    fragColor.b = col2.b;
    // col1 == c.xxx - (1. - col1.r) * c.xyy - (1. - col1.g) * c.yxy - (1. - col1.b) * c.yyx;
    vec3 col0_cmy = 1. - col0;
    vec3 col1_cmy = 1. - col1;
    vec3 col2_cmy = 1. - col2;
//    col0_cmy.r = col1_cmy.r;
//    col0_cmy.b = col2_cmy.b;
//    fragColor.rgb = 1. - col0_cmy;
    // fragColor.rgb = c.xxx - col0_cmy.r * c.xyy - col0_cmy.g * c.yxy - col0_cmy.b * c.yyx;

    vec4 cmy0 = cmy_coeff_from(col0);
    vec4 cmy1 = cmy_coeff_from(col1);
    vec4 cmy2 = cmy_coeff_from(col2);

    fragColor.rgb = cmy0.w + cmy1.r * c.yxx + cmy0.g * c.xyx + cmy0.b * c.xxy;

    return;

    fragColor.rgb = col;
    col = fragColor.rgb;

    // -> Gammakorrektur:
    col = pow(col, vec3(1./iGamma));

    // -> Kontrastanpassung
    col = (col - 0.5) * iContrast + 0.5;

    // -> auf Graustufen reduzieren:
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    // float gray = 0.33 * col.r + 0.33 * col.g + 0.33 * col.b;
    col = mix(col, vec3(gray), iGray);

//    if (showABadIdeaOfDoingAHueShift) {
//        // Das soll zeigen, dass man, sobald man etwas erreichen will, das recht einfach gesagt ist
//        // wie z.B: "das soll weniger "rot, mehr "gelb" aussehen, auf RGB nicht wirklich umsetzbar ist.
//        // (Könnte man ja denken, man hat ja diese Farbkanäle so vorliegen.)
//        // Aber die Farbwahrnehmung durchs Auge funnktioniert eben ganz anders als RGB,
//
//        // Beispiel: "leichte" Farbvariation wirkt schnell "unnatürlich"
//            col.r -= 0.1;
//            col.g *= 0.15;
//
//    }

    fragColor = vec4(col, 1);
}
