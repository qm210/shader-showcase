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

    vec2 st = gl_FragCoord.xy / iResolution.y;
    // st <-> uv? was ist mathematisch der Unterschied, was optisch?
    if (mistakeUVforST) {
        // keine sehr nützliche Idee, aber kann man hier sehen
        st = uv;
    }

    if (!forgetAspectRatioCorrection) {
        st.x /= iTexture2AspectRatio;
    }
    if (!forgetYDirectionConvention) {
        st.y = 1. - st.y;
    }
    col1 = texture(iTexture1, st).rgb;
    col2 = texture(iTexture2, st).rgb;

    fragColor.xyz = col2;
    col = col2;

    // einfach ein Gradient (auch bekannt als "Hello Shadertoy")
    // um noch eine zweite "Ebene" Farben zu haben, die wir mischen könnn.
    vec3 colGradient = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));

    // Es geht hier darum -- wenn man zwei Bilder "gleichzeitig" anzeigen will"
    // (i.e. nicht einfach eins das andere komplett überdeckt),
    // welche mathematischen Operationen hat man dann auf den vec4-(RGBA)-Farben zur Verfügung?
    //
    // Und in diesem Beispiel sogar nur RGB, da beide Ebenen absolut deckend sind.
    // Ansonsten könnte man sich ja überlegen, wie man Alpha nutzt, um jeweils R, G und B
    // ineinander zu mix()en oder zu addieren, aber wenn man nur RGB hat, kann man ja mal
    // schauen, was für Berechnungen wie so aussehen.
    //
    // Es ist wie so oft in der Grafikprogrammierung: Man hat sehr viele Optionen der Farbmischung
    // und man sollte sich zu Beginn einfach mal die ersten paar durch den Kopf gehen lassen.
    // Aber einfach mal über die Frage nachdenken,
    // "Hier ist 1. das Capybara und 2. ein wabernder Gradient,
    //          ... wie sieht das wohl aus, wenn ich alle Farbkanäle jeweils multipliziere?
    //          ... oder aber einfach addiere?
    //          ... etc.
    //
    // -> Muss man nicht alle auswendig lernen, aber hat eine Vorstellung haben,
    //    was für eine Art von Mischung die häufigsten sind.
    // -> Ob alle dieser Methoden "sinnvoll" sind oder jemals gut aussehen,
    //    ist hier nicht die Frage. Die Frage ist, was man leicht ausrechnen kann,
    //    um sich DANN zu überlegen, was man damit machen kann ;)
    //
    // -> Ihr könnt zum Gegencheck auch immer mal z.B. GIMP öffnen und zwei Bilder
    //    mit den ganzen "Ebenenmodi" verschmelzen
    //    https://docs.gimp.org/2.6/de/gimp-concepts-layer-modes.html
    //    Die Begriffe wie "Multiply" tauchen da sogar genau so auf.


    // - Linear Mischen
    if (onlyBlendLinearly) {
        col = mix(col2, colGradient, iMixingForLinearBlending);
        col = clamp(col, 0., 1.);
        fragColor.rgb = col;
    }

    // - Maximum = kann nur Aufhellen
    if (onlyTakeMaximum) {
        fragColor.rgb = max(col2, colGradient);
        return;
    }

    // - Minimum = kann nur Abdunkeln
    if (onlyTakeMinimum) {
        fragColor.rgb = min(col2, colGradient);
        return;
    }

    // Multiplizieren:
    if (onlyBlendByMultiply)  {
        fragColor.rgb = col2 * colGradient;
        return;
    }

    // Dividieren: ... eher... "artsy" bis unnütz.
    if (onlyBlendByDivision) {
        fragColor.rgb = col2 / colGradient;
        return;
    }

    // "Screen":
    vec3 colScreen = (1. - (1. - colGradient) * (1. - col2));

    if (onlyBlendByScreen) {
        fragColor.rgb = colScreen;
        return;
    }

    col = mix(col, colScreen, iMixingForScreenBlending);
    col = clamp(col, 0., 1.);

    // "Soft Light"
    vec3 colSoftLight = colGradient - col2 + 2. * colGradient * col2;

    if (onlyBlendBySoftLight) {
        fragColor.rgb = colSoftLight;
        return;
    }

    col = mix(col, colSoftLight, iMixingForSoftLightBlending);
    col = clamp(col, 0., 1.);

    // "Overlay" (nur zur Demo, muss nicht direkt verstanden werden)
    vec3 colOverlay = length(col2) < 0.5
        ? 2. * col2 * colGradient
        : 1. - 2. * (1. - col2) * (1. - colGradient);
    if (onlyBlendByOverlay) {
        fragColor.rgb = colOverlay;
        return;
    }
    col = mix(col, colOverlay, iMixingForOverlayBlending);
    col = clamp(col, 0., 1.);

    // einfache Farbtransformationen -- könnt ihr die nachvollziehen?
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
