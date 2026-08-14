#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float iGridOpacity;
uniform float iNoiseLevelA;
uniform float iNoiseLevelB;
uniform float iNoiseLevelC;
uniform float iNoiseScaleA;
uniform float iNoiseScaleB;
uniform float iNoiseScaleC;
uniform vec2 iOverallNoiseShift;
uniform float iOverallScale;
uniform float iOverallHashOffset;
uniform float iNoiseMorphingA;
uniform float iNoiseMorphingB;
uniform float iNoiseMorphingC;
uniform int iFractionalOctaves;
uniform float iFractionalScale;
uniform float iFractionalDecay;
uniform float iTurbulenceNormFactor;
uniform float iTurbulenceMeanOffset;
uniform vec2 iMarbleSqueeze;
uniform float iMarbleGranularity;
uniform float iMarbleGradingExponent;
uniform float iMarbleRange;
uniform float iColorStrength;
uniform vec3 iColorCosineFreq;
uniform vec3 iColorCosinePhase;
uniform vec3 vecFree;
uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;

vec4 c = vec4(1., 0., -1., .5);

const float twoPi = 6.28319;

//// Gitter nur zur Veranschaulichung der Längeneinheiten

void applyGrid(inout vec3 col, in vec2 uv, float gridStep) {
    uv = mod(uv, gridStep);
    float dMin = min(uv.x, uv.y);
    col = c.xxx * step(dMin, fwidth(uv.x));
}

////

vec2 hash22(vec2 p)
{
    // Einfacher Pseudorandom-Generator der "Hash"-Art, mit der Anforderung,
    // "mathematisch recht einfache" Operationen zu verwenden (-> sin(), fract(), dot(), ...)
    // aber bei leichter Veränderung vom Argument p so stark variieren,
    // dass sie beim einfachen menschlichen Draufschauen aussehen wie zufällig ausgewürfelt.
    //
    // Hashfunktionen gibt es für verschiedene Dimensionalität des Arguments (float / vec2 / vec3 / vec4 p),
    // und in verschiedenen Ausgabedimensionen (return float / vec2 / vec3 / vec4).
    // Eine Hashfunktion gibt aber immer denselben Wert für dasselbe Argument zurück (= deterministisch)
    // und hat oft auch Bereiche des Arguments, in denen es überhaupt nicht sehr "zufällig" aussieht.
    // Manche sind auch auf bestimmte Anwendungsfälle optimiert,
    // d.h. man sucht sich in der Praxis eben eine - oder mehrere und vergleicht diese.
    p = p*mat2(127.1,311.7,269.5,183.3);
    return -1.0 + 2.0 * fract(sin(p + .01 * iOverallHashOffset)*43758.5453123);
}

vec2 modulatedHash22(vec2 p, float phase) {
    return sin(twoPi * hash22(p) + phase);
}

float modulatedPerlin2D(vec2 p, float phase) {
    // Modifikation, um Phasenverschiebung in die Hashfunktion zu bekommen.
    // Das ist nicht äußerst performant, aber reicht hier, und zeigt eine Bandbreite
    // komplexer Effekte, die durch solche Pseudorandom-Noise-Überlagerungen kommen können.
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = pf * pf * (3.-2.*pf);

    float f00 = dot(modulatedHash22(pi+vec2(.0,.0), phase),pf-vec2(.0,.0));
    float f01 = dot(modulatedHash22(pi+vec2(.0,1.), phase),pf-vec2(.0,1.));
    float f10 = dot(modulatedHash22(pi+vec2(1.0,0.), phase),pf-vec2(1.0,0.));
    float f11 = dot(modulatedHash22(pi+vec2(1.0,1.), phase),pf-vec2(1.0,1.));

    float xm1 = mix(f00,f10,w.x);
    float xm2 = mix(f01,f11,w.x);
    float ym = mix(xm1,xm2,w.y);
    return ym;
}

float noiseStack(vec2 p){
    // das Verfahren heißt auch "fBM" = "fractional Brownian Motion",
    // weil es ähnlich ist zu Diffusionsprozessen in der Natur
    // (https://de.wikipedia.org/wiki/Brownsche_Bewegung)
    // Diese Gegebenheiten sind aber für unsere Anwendungen nicht relevant,
    // es ist hier nur erwähnt, um den Namen zu begründen.
    float a = 1., s = 0., noise;
    float sum = 0.;
    for (int i=0; i < iFractionalOctaves; i++) {
        noise = modulatedPerlin2D(iNoiseScaleA * p, iNoiseMorphingA * iTime);
        sum += a * noise;

        s += a;
        p *= iFractionalScale;
        a *= iFractionalDecay;
    }
    // Ausgabewert soll in [0, 1] liegen, mit 0.5 = neutral.
    // Der Faktor 1.5 ist nach einigen Versuchen so gewählt,
    // man könnte ihn auch konfigurierbar machen, weil manche Kombinationen aus
    // iFractionalScale & iFractionalDecay das Intervall dennoch verlassen könnten.
    return 0.5 + 0.5 * (sum / s * 1.5);
}

float noiseAbsoluteStack(vec2 p){
    // fast gleich zu addUpLayersOfNoise(p),
    // nur das hier abs(noise) pro Schicht genommen wird,
    // und deswegen das Result am Ende auch anders normiert werden muss.
    float a = 1., s = 0., noise;
    float sum = 0.;
    for (int i=0; i < iFractionalOctaves; i++) {
        noise = modulatedPerlin2D(iNoiseScaleB * p, iNoiseMorphingB * iTime);
        sum += a * abs(noise);

        s += a;
        p *= iFractionalScale;
        a *= iFractionalDecay;
    }
    // Ausgabewert soll in [0, 1] liegen
    // (wobei ungünstige Kombinationen iFractionalScale / iFractionalDecay auch > 1. summieren KÖNNTEN)
    // Auslesen der Werte über gl.readPixels() für verschiedene Kombinationen legt nahe,
    // dass wir erstmal flexibel sein wollen (...das geht aber auch in die Marble-Funktion ein!)
    return (sum / s - iTurbulenceMeanOffset) / iTurbulenceNormFactor;
}

float noiseAbsoluteStackWithFurtherProcessing(vec2 p){
    // übersetzt aus https://www.shadertoy.com/view/Md3SzB
    // nur ein Beispiel für eine Anwendung nach weiteren Berechnungen
    p *= iNoiseScaleC;
    float s = modulatedPerlin2D(p, iNoiseMorphingC * iTime);
    s = sin(s * iMarbleGranularity + p.x * iMarbleSqueeze.x + p.y * iMarbleSqueeze.y);
    s = pow(0.5 + 0.5 * s, iMarbleGradingExponent);
    return 1. + iMarbleRange * (s - 1.24);
}

vec3 colorPalette(float t) {
    return vec3(0.5) + 0.5 * cos(iColorCosineFreq * t + iColorCosinePhase);
}

float symmetricalMix(float v0, float v1, float ratio) {
    /*
    siehe Showcase 5a:
    Kleine Hilfsfunktion, um für ratio von 0 bis -1 so zu blenden,
    als ob man das Negativ von v1 mit dem zugehörigen abs(ratio) mixt:
      symmetricalMix(v0, v1, -1) == 1. - v1
    */
    if (ratio < 0.) {
        v1 = 1. - v1;
        ratio = -ratio;
    }
    return mix(v0, v1, ratio);
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    uv *= iOverallScale;

    vec3 gridCol;
    applyGrid(gridCol, uv, 0.5);

    // Auswertung sin-basierter Hashes (s.o.) ist nahe Nullwerten häufig
    // zu strukturbehaftet, taugt da also nicht als guter "Zufallsgenerator".
    // D.h. man verschiebt sich gewöhnlich in regelmäßigere Bereiche.
    // Ruhig aber mal den iOverallNoiseShift auf 0 stellen, um diesen Effekt auch zu sehen...
    uv += iOverallNoiseShift;

    float noiseClouds = symmetricalMix(1., noiseStack(uv), iNoiseLevelA);
    float noiseTurbulence = symmetricalMix(1., noiseAbsoluteStack(uv), iNoiseLevelB);
    float noiseMarble = symmetricalMix(1., noiseAbsoluteStackWithFurtherProcessing(uv), iNoiseLevelC);
    float totalNoise = (
        noiseClouds *
        noiseTurbulence *
        noiseMarble
    );
    totalNoise = clamp(totalNoise, 0., 1.);
    vec3 col = mix(
        vec3(totalNoise),
        colorPalette(totalNoise * iColorStrength),
        iColorStrength
    );
    col = col - iGridOpacity * gridCol;
    fragColor = vec4(col, 1.);
}
