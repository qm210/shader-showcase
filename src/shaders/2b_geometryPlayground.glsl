#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float helloThere;

vec4 c = vec4(1., 0., -1., .5);

const float pi = 3.14159;
const float piHalf = pi * 0.5;
const float twoPi = 2. * pi;

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s,  c); // <-- ??
}

float sdCircle( vec2 p, float r )
{
    return length(p) - r;
}

float sdBox( in vec2 p, in vec2 b)
{
    vec2 d = abs(p)-b;
    // return max(d.x, d.y);
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a;
    vec2 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float sdSegment(vec3 p, vec3 a, vec3 b) { // <-- überladen in GLSL möglich.
    vec3 pa = p - a;
    vec3 ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float sdEquilateralTriangle(vec2 p, float size) {
    const float k = sqrt(3.0);
    p /= -size;
    p.x = abs(p.x) - 1.0;
    p.y = p.y + 1.0/k;
    if(p.x + k * p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0, 0.0);
    return -length(p)*sign(p.y);
}

float hash(float n) {
    // _eine_ Möglichkeit für Pseudo-Zufallszahlen.
    // Pseudo = reicht dem menschlichen Auge meist als "zufällig genug"
    return fract(sin(n) * 43758.5453123);
    // return fract(n * 17.0 * fract(n * 0.3183099));
    // es gibt weitere Methoden -> das in späterer VL
}

float smootherstep(float x) {
    // cf. https://graphtoy.com/?f1(x,t)=x%20*%20x%20*%20x%20*%20(x%20*%20(x%20*%206.0%20-%2015.0)%20+%2010.0)&v1=true&f2(x,t)=smoothstep(0.,%201.,%20x)&v2=true&f3(x,t)=&v3=false&f4(x,t)=&v4=false&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=0.8245328922861012,0.4568651909764677,1.3401378935309718
    return x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
    // ... what about outside [0, 1]?
}

float perlin1D(float x) {
    // Perlin Noise = ein gängiges, "ausgewaschenes" Rauschen (hash => pseudorandom)
    float i = floor(x);
    float f = fract(x);
    float g0 = hash(i) * 2.0 - 1.0;
    float g1 = hash(i + 1.0) * 2.0 - 1.0;
    float d0 = g0 * f;
    float d1 = g1 * (f - 1.0);
    float u = smootherstep(f);
    return mix(d0, d1, u);
}

void whatAmI(inout vec3 col, in vec2 uv) {
    // einfacher "Funktionsplotter", kann aber Senkrechten nicht darstellen
    float x = uv.x * 10. + 0.5 * iTime;
    float mysterious = -0.65 + 0.2 * perlin1D(x);
    float d = abs(uv.y - mysterious);
    col = mix(col, c.ywx, smoothstep(0.01, 0., d));
    d = abs(uv.y - (-0.8 + 0.05 * sin(twoPi * x)));
    col = mix(col, c.ywx, smoothstep(0.01, 0., d));
    d = abs(uv.y - (-0.98 + 0.1 * fract(x)));
    col = mix(col, c.ywx, smoothstep(0.01, 0., d));
}

float polar(vec2 v) {
    // what is that, geometrically for a vec2?
    return atan(v.y, v.x);
}

float arrow(inout vec3 col, in vec2 uv, vec2 from, vec2 to) {
    const float arrowSize = .04;
    to = mix(to, from, 2. * arrowSize);
    vec2 head = uv - to;
    head *= rotate(-piHalf - polar(to - from));
    float dHead = sdEquilateralTriangle(head, arrowSize);
    // what is... that??
    // what does min() do, in graphical words?
    float d = sdSegment(uv, from, to);
    d = min(d - 0.01, dHead);
    return smoothstep(0.0, 0.001, -d);
}

float sdSampleScene(vec3 p) {
    // is sdEgg (https://iquilezles.org/articles/distfunctions2d/),
    // but the point here is that this could be any scene as SDF
    const float ra = 0.25;
    const float rb = 0.1;
    const float he = 0.3;
    float ce = 0.5*(he*he-(ra-rb)*(ra-rb))/(ra-rb);

    p.x = abs(p.x);

    if( p.y<0.0 )             return length(p)-ra;
    if( p.y*ce-p.x*he>he*ce ) return length(vec2(p.x,p.y-he))-rb;
    return length(vec2(p.x+ce,p.y))-(ce+ra);
}

#define SDF sdSampleScene

vec3 getNormal(vec3 p) {
    // this is a common differential approximation, there are others
    const float eps = 1.e-4; // <-- you know?
    return normalize(vec3(
        SDF(p + vec3(eps, 0.0, 0.0)) - SDF(p - vec3(eps, 0.0, 0.0)),
        SDF(p + vec3(0.0, eps, 0.0)) - SDF(p - vec3(0.0, eps, 0.0)),
        SDF(p + vec3(0.0, 0.0, eps)) - SDF(p - vec3(0.0, 0.0, eps))
    ));
}

const vec2 samplePoints[3] = vec2[3](
    vec2(.89, -0.2),
    vec2(.9, -0.4),
    vec2(1.35, -0.1)
);

void demonstrateNormalVector(inout vec3 col, in vec2 uv) {
    vec2 center = vec2(1.15, -0.3);
    uv -= center;
    uv *= (1. + 0.03 * sin(0.4 * twoPi * iTime)); // <-- was only for fun during lesson
    vec3 uv3 = vec3(uv, 0.);
    float d = SDF(uv3);
    d = smoothstep(0.01, 0., d);
    col = mix(col, c.yyy, d);
    vec3 point, vecNormal;
    for (int s=0; s < 3; s++) {
        point = vec3(samplePoints[s] - center, 0.);
        vecNormal = getNormal(point);
        d = arrow(col, uv, point.xy, point.xy + 0.2 * vecNormal.xy);
        col = mix(col, vec3(0.8), d);
    }
    vec3 vecDown = vec3(0, -.5, 0);
    d = arrow(col, uv, point.xy - vecDown.xy, point.xy);
    col = mix(col, c.xyy, d);
    vec3 vecReflect = reflect(vecDown, vecNormal);
    d = arrow(col, uv, point.xy, point.xy + vecReflect.xy);
    col = mix(col, c.xyy, d);
}

void letsGoElsewhere(inout vec3 col, in vec2 uv) {
    vec2 p = (uv - vec2(-1.2, 0.0)) * rotate(iTime);
    // vec2 p = (uv * rotate(iTime) - vec2(-1.2, -0.1));
    float d = sdBox(p, vec2(0.4, .25));
    col.g = max(step(abs(d), 0.004), col.g); // <-- Randa uch mit step(abs(d), dicke)
    col.r = 0.75 * sin(80. * d);
    col.r = exp(-30. * d);
    col.r = clamp(col.r, 0., 1.);
    // <-- ...warum wohl? --> man achte mal auf die Deckkraft mit vs. ohne
    col.r *= 0.7;
}

void vectorStuff(inout vec3  col, in vec2 uv) {
    vec2 vecA = vec2(0, -.5);
    float d = arrow(col, uv, vec2(0), vecA);
    col.g = mix(col.g, 0., d);
    vec2 vecB = vec2(0.5, 0);
    d = arrow(col, uv, vecA, vecA + vecB);
    col.r = mix(col.r, 0., d);

    vec2 vecC = 0.5 * normalize(vec2(0.35, 1.7));
    vecC *= rotate(iTime);
    d = arrow(col, uv, c.yy, vecC);
    col = mix(col, c.xxx, d);

    // Projektion auf x-Achse mit x-Einheitsvektor
    vec2 vecX = vec2(1, 0);
    vec2 vecCX = dot(vecC, vecX) * vecX;
    d = arrow(col, uv, c.yy, vecCX);
    col = mix(col, c.xxx, 0.5 * d);

    // relation to vecC, yes, obviously? ;)
    vec2 vecD = vec2(-vecC.y, vecC.x);
    d = arrow(col, uv, c.yy, vecD);
    col = mix(col, c.wyx, d);
    //vec3 vecE = normalize(vecD)

    // a way over 3D to get an orthogonal vector
    vec3 vecC3 = vec3(vecC, 0.);
    vec3 vecZ = vec3(0, 0, 1);
    vec2 vecE = cross(vecZ, vecC3).xy;
    // wir machen -vecE nur, damit es nicht direkt auf vecD liegt, d.h. unsichtbar wäre
    // damit zeigt -vecE in die entgegengesetzte Richtung von vecD
    d = arrow(col, uv, c.yy, -vecE);
    col = mix(col, c.wyx, d);

    vec2 someShift = vec2(0.5, 0.5);
    vec2 vecF = vec2(0.7, 0.4);
    vec2 vecG = vec2(0.3, -0.2);
    vec2 vecGF = vecG - vecF;
    d = arrow(col, uv, someShift, someShift + vecF);
    col = mix(col, c.yyx, d);
    d = arrow(col, uv, someShift, someShift + vecG);
    col = mix(col, c.xyx, d);
    float alpha = 0.;
    alpha = 0.5 - 0.5 * cos(twoPi * 0.25 * iTime);
    d = arrow(col, uv, someShift + vecG, someShift + vecG + vecF);
    col = mix(col, c.yyx, d * alpha);
    d = arrow(col, uv, someShift + vecF, someShift + vecF + vecG);
    col = mix(col, c.xyx, d * alpha);

    d = arrow(col, uv, someShift + vecF, someShift + vecF + vecGF);
    col = mix(col, c.wyx, d);

    demonstrateNormalVector(col, uv);
}

void applyGrid(inout vec3 col, in vec2 uv) {
    const float gridStep = 0.5;
    float d = min(mod(uv.x, gridStep), mod(uv.y, gridStep));
    // war in Vorlesung: fract(...) == mod(..., 1.)
    // float d = min(mod(uv.x, gridStep), fract(uv.y));
    col *= 1. - 0.3 * (step(d, 0.005)); // <- in lesson: step(d,0) - step(d,.01)
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    /*
    vec3 col = c.xxx;

    vec2 p = vec2(uv.x, sin(twoPi * uv.x));
    float d = sdCircle(uv - p, 0.);
    d = smoothstep(0.01, 0.0, d);
    col = vec3(d, 0, d);

    fragColor = vec4(col, 1.);
*/
    vec3 col = 0.5 + 0.25 * cos(uv.xyx + vec3(4, 0, 4));

    if (length(uv) < 0.04) {
        col = vec3(0);
    }

    vec3 blue = c.yyx;

    vec2 pos = vec2(-1.4, 0.7);
    if (length(uv - pos) < 0.05) {
        col = blue;
    }

    pos.x += 0.2;
    float d = sdCircle(uv - pos, 0.05);
    if (d < 0.) {
        // ums schonmal gehört haben: branches sind uncool im Shader
        col = blue;
    }

    pos.x += 0.2;
    d = sdCircle(uv - pos, 0.05);
    d = smoothstep(0.01, 0., d);
    col = mix(col, blue, d);
    // smoothstep again! see examples at
    // https://graphtoy.com/?f1(x,t)=smoothstep(0.0,1.,x)&v1=true&f2(x,t)=smoothstep(0.1,0.,x)&v2=true&f3(x,t)=1%20-%20smoothstep(0.0,1.,x)&v3=true&f4(x,t)=&v4=false&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=0.8245328922861012,0.4568651909764677,1.3401378935309718

    pos.x += 0.2;
    d = sdCircle(uv - pos, 0.05);
    d = smoothstep(0.03, 0., d);
    col = mix(col, blue, d);

    pos.x += 0.22;
    d = sdCircle(uv - pos, 0.05);
    d = abs(d - 0.02);
    d = smoothstep(0.02, 0., d);
    col = mix(col, blue, d);

    // for starters, check SDFs at https://iquilezles.org/articles/distfunctions2d/

    pos.x += 0.22;
    d = sdBox(uv - pos, vec2(0.05));
    d = smoothstep(0.01, 0., d);
    col = mix(col, blue, d);

    pos.x += 0.22;
    d = sdBox(uv - pos, vec2(0.05));
    d -= 0.02;
    d = smoothstep(0.01, 0., d);
    col = mix(col, blue, d);

    pos.x += 0.22;
    d = sdBox(uv - pos, vec2(0.05));
    float dRing = abs(sdCircle(uv - pos, 0.05) - 0.02);
    d = min(d, dRing); // <-- kombiniert
    d = smoothstep(0.01, 0., d);
    col = mix(col, blue, d);

    pos.x += 0.22;
    d = sdBox(uv - pos, vec2(0.05));
    dRing = abs(sdCircle(uv - pos, 0.05) - 0.02);
    d = max(d, dRing); // <-- schneidet aus
    d = smoothstep(0.01, 0., d);
    col = mix(col, blue, d);

    applyGrid(col, uv);

    letsGoElsewhere(col, uv);

    vectorStuff(col, uv);

    whatAmI(col, uv);

    // Beispiel: Color Grading (Gammakorrektur) - nächste Woche mehr zu Farben
    float contrast = helloThere;
    col = (col - 0.5) * contrast + 0.5;

    // check whether the y-normalization is [-0.5, +0.5] or [-1, 1] (it is the latter)
    /*
    if (abs(uv.y) > 0.5) {
        col *= 0.95;
    }
    */

    // Output to screen
    fragColor = vec4(col, 1.0);
}
