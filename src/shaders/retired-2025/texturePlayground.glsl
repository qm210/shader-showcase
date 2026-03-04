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
uniform float iNoiseFreq;
uniform float iNoiseLevel;
uniform float iNoiseSeed;

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

// Absicht: Flags zum einfachen Vergleich ("rumspielen"),
//          aber auch die if (false) {...} anschauen oder die uniforms mal ändern
//          gerne auch "irgendwo anders dranhängen" :)
#define SHOW_SAMPLE_TEXTURE 0
#define SHOW_STARFIELD 1
#define APPLY_ST_CORRECTION_FOR_TEXTURE2 1
#define APPLY_BLENDING_METHODS 1
#define APPLY_MANUAL_RGB_SHIFT 0

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    fragColor = c.yyyx;
    vec3 col, bg, col0, col1, col2;

    // (*) just for orientation, a small circle
    float d = sdCircle(uv, 0.02);
    // Zum Einstieg nochmal vergleichen:
    // a) was ist d, für sich genommen?
    bg = d * c.xxx;
    // b) Gewöhnliche Behandlung des Rands (d==0) der Geometrie:
    bg = mix(c.yyy, c.xxx, smoothstep(0., 0.001, d));

    applyGrid(bg, uv, 0.5);
    fragColor.rgb = bg;

    col0 = texture(iTexture0, uv).rgb; // .rgb == .xyz
    if (uv.x > 0. && uv.y > 0.) {
        fragColor.rgb = col0;
    }

    #if SHOW_SAMPLE_TEXTURE
        return;
    #endif

    vec2 st = gl_FragCoord.xy / iResolution.y;
    // st <-> uv? was ist mathematisch der Unterschied, was optisch?
    if (false) { // <-- VERGLEICHT DAS
        col1 = texture(iTexture1, uv).rgb;
    } else {
        // st *= rotate(0.1 * iTime);
        col1 = texture(iTexture1, st).rgb;
    }
    #if SHOW_STARFIELD
        fragColor.rgb = col1;
        return;
    #endif

    col2 = texture(iTexture2, st).rgb;
    // VERGLEICHT DAS MAL, und beschreibt es.
    #if APPLY_ST_CORRECTION_FOR_TEXTURE2
        st.x /= iTexture2AspectRatio;
        st.y = 1. - st.y;
        // Oneliner: st = gl_FragCoord.xy * vec2(1. / iTexture2AspectRatio, -1.) / iResolution.y + vec2(0, 1);
        col2 = texture(iTexture2, st).rgb;
    #endif
    fragColor.xyz = col2;
    col = col2;

    #if APPLY_BLENDING_METHODS
        // "Hello Shadertoy"-Gradient für die Mischbeispiele
        vec3 colGradient = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));

        // Blending Methods zweier Texturen (oder allgemein "Ebenen"),
        // lassen sich über die optionalen early returns leicht einzeln anschauen.

        // - Linear Mischen
        col = mix(col2, colGradient, iFree1);
        col = clamp(col, 0., 1.);
        if (false) {
            fragColor.rgb = col;
            return;
        }
        // - Maximum = kann nur Aufhellen
        if (false) {
            fragColor.rgb = max(col, col2);
            return;
        }
        // - Minimum = kann nur Abdunkeln
        if (false) {
            fragColor.rgb = min(col, col2);
            return;
        }
        // Multiplizieren:
        if (false) {
            fragColor.rgb = col * col2;
            // fragColor.rgb = col * (1. - col2);
            // fragColor.rgb = (1. - col0) * col2;
            return;
        }
        // Dividieren: ... eher... "artsy" bis unnütz.
        if (false) {
            fragColor.rgb = col2 / col1;
            return;
        }
        // "Screen":
        vec3 colScreen = (1. - (1. - colGradient) * (1. - col2));
        if (false) {
            fragColor.rgb = colScreen;
            return;
        }
        col = mix(col, colScreen, iFree2);
        col = clamp(col, 0., 1.);
        // "Soft Light"
        vec3 colSoftLight = colGradient - col2 + 2. * colGradient * col2;
        if (false) {
            fragColor.rgb = colSoftLight;
            return;
        }
        col = mix(col, colSoftLight, iFree3);
        col = clamp(col, 0., 1.);
        // "Overlay" (nur zur Demo, muss nicht direkt verstanden werden)
        vec3 colOverlay = length(col2) < 0.5
            ? 2. * col2 * colGradient
            : 1. - 2. * (1. - col2) * (1. - colGradient);
        if (false) {
            fragColor.rgb = colOverlay;
            return;
        }
        col = mix(col, colOverlay, iFree4);
        col = clamp(col, 0., 1.);
    #endif

    // einfache Farbtransformationen -- könnt ihr die nachvollziehen?
    fragColor.rgb = col;
    col = fragColor.rgb;

    // -> Gammakorrektur:
    col = pow(col, vec3(1./iGamma));

    // -> Kontrast:
    col = (col - 0.5) * iContrast + 0.5;

    // -> auf Graustufen reduzieren:
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    // float gray = 0.33 * col.r + 0.33 * col.g + 0.33 * col.b;
    col = mix(col, vec3(gray), iGray);

    #if APPLY_MANUAL_RGB_SHIFT
        // Beispiel: "leichte" Farbvariation wirkt schnell "unnatürlich"
        if (uv.x > -0.32) {
            col.r -= 0.1;
            col.g += 0.1;
        }
    #endif

    fragColor.rgb = col;
}
