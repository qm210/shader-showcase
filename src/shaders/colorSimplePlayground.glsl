#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float iGamma;
uniform float iContrast;
uniform float iGray;
uniform vec3 iFactor;
uniform vec2 iClamp;
uniform float iCutOut;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform sampler2D iTexture0;

vec4 c = vec4(1., 0., -1., .5);

const float twoPi = 6.28319;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

vec3 grayscale(vec3 col) {
    // Gewichtet nach menschlichem Empfinden (Zapfen im Auge)
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    return vec3(gray);
}

void applyColorEffects(inout vec3 col, in vec2 uv) {
    col *= iFactor;

    col = pow(col, vec3(iGamma));

    vec3 gray = grayscale(col);
    float radius = length(uv);
    col = mix(col, gray, iGray);
    // ÜBUNG
    // col = mix(gray, col, smoothstep(1., 0., radius));

    col = (col - 0.5) * iContrast + 0.5;

    col = clamp(col, vec3(iClamp.x), vec3(iClamp.y));

    // ÜBUNG
    col = mix(col, c.yyy, step(1. - iCutOut, radius * 0.5));

}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    float pixelSize = 1. / iResolution.y;

    fragColor = c.yyyx;
    vec3 col, bg, col0, col1, col2;

    vec2 st = gl_FragCoord.xy / iResolution.y;
    ivec2 texSize = textureSize(iTexture0, 0);
    float texAspectRatio = float(texSize.x) / float(texSize.y);
    st.x /= texAspectRatio;
    st.y = 1. - st.y;
    col0 = texture(iTexture0, st).rgb;

    if (abs(uv.x) < pixelSize) {
        discard;
    }
    else if (uv.x < 0.) {
        fragColor.rgb = col0.rgb;
    }
    else {
        st.x -= 1.;
        col0 = texture(iTexture0, st).rgb;
        fragColor.rgb = col0.rgb;

        uv.x -= 0.5 * iResolution.x / iResolution.y;
        applyColorEffects(fragColor.rgb, uv);
    }
}
