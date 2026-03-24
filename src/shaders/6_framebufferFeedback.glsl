#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2 iResolution;
uniform vec2 texelSize;
uniform float iTime;
uniform float iDeltaTime;
uniform int iFrame;
uniform int iPassIndex;
uniform sampler2D iPrevious;
uniform bool onlyFresh;
uniform float iHashSeed;
uniform float iFadeFactor;
uniform float iCircleSize;
uniform float iCircleSizeVariation;

// falls ihr die brauchen könnt...
uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform vec3 vecFree0;
uniform vec3 vecFree1;
uniform vec3 vecFree2;

const vec4 c = vec4(1,0,-1,.5);
const float pi = 3.14159;
const float twoPi = 2. * pi;

vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// OKLab / OKLCh Conversions
const mat3 Msrgb = mat3(
        0.4124564, 0.2126729, 0.0193339,
        0.3575761, 0.7151522, 0.1191920,
        0.1804375, 0.0721750, 0.9503041
    ), M1 = mat3(
        0.8189330101, 0.0329845436, 0.0482003018,
        0.3618667424, 0.9293118715, 0.2643662691,
        -0.1288597137, 0.0361456387, 0.6338517070
    ), M2 = mat3(
        0.2104542553, 1.9779984951, 0.0259040371,
        0.7936177850, -2.4285922050, 0.7827717662,
        -0.0040720468, 0.4505937099, -0.8086757660
    );
vec3 rgb2xyz_srgb(vec3 rgb) {
    return Msrgb * rgb;
}
vec3 xyz2rgb_srgb(vec3 xyz) {
    return inverse(Msrgb) * xyz;
}
vec3 xyz2oklab(vec3 xyz) {
    return M2 * pow(M1 * xyz, c.xxx/3.);
}
vec3 oklab2xyz(vec3 lab) {
    return inverse(M1) * pow(inverse(M2) * lab, 3.*c.xxx);
}
vec3 oklab2oklch(vec3 lab) {
    return vec3(lab.x, length(lab.yz), atan(lab.z, lab.y));
}
vec3 oklch2oklab(vec3 lch) {
    return vec3(lch.x, lch.y * vec2(cos(lch.z), sin(lch.z)));
}
vec3 rgb2oklab(vec3 rgb) {
    return xyz2oklab(rgb2xyz_srgb(rgb));
}
vec3 oklab2rgb(vec3 oklab) {
    return xyz2rgb_srgb(oklab2xyz(oklab));
}
vec3 rgb2oklch(vec3 rgb) {
    return oklab2oklch(xyz2oklab(rgb2xyz_srgb(rgb)));
}
vec3 oklch2rgb(vec3 lch) {
    return xyz2rgb_srgb(oklab2xyz(oklch2oklab(lch)));
}

float hash(float n) {
    // Pseudozufall = reicht dem menschlichen Auge als "zufällig genug"
    // -> GLSL ist aber bei jedem Aufruf streng deterministisch.
    return fract(sin(n + iHashSeed) * 43758.5453123);
}

float perlin1D(float x) {
    // Perlin Noise = ein "ausgewaschenes" Rauschen
    float i = floor(x);
    float f = fract(x);
    float g0 = hash(i) * 2.0 - 1.0;
    float g1 = hash(i + 1.0) * 2.0 - 1.0;
    float d0 = g0 * f;
    float d1 = g1 * (f - 1.0);
    float u = smoothstep(0., 1., f);
    return mix(d0, d1, u);
}

vec2 hash22(vec2 p, float seed)
{
    p = p*mat2(127.1,311.7,269.5,183.3);
    p = -1.0 + 2.0 * fract(sin(p + seed)*43758.5453123);
    return sin(p*6.283);
}

vec4 freshDrawing(vec2 uv) {
    float t = 0.4 * iTime;
    vec2 wirreBewegung = vec2(
        1.5 * sin((1.37 + sin(t)) * t + 0.821),
        2. * perlin1D(1.18 * t)
    );
    float radius = iCircleSize * (
        1. - iCircleSizeVariation * cos(iTime)
    );
    float d = length(uv - wirreBewegung) - radius;

    float hue = mod(0.5 * iTime, twoPi);
    vec3 oklch = vec3(1., 0.5, hue);
    vec4 col = vec4(oklch2rgb(oklch), 1.);
    return mix(c.yyyy, col, smoothstep(0.1, 0., d));
}

#define FEEDBACK_PASS 0
#define SCREEN_RENDER_PASS 1

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    if (iPassIndex == FEEDBACK_PASS && (
        iFrame == 0 || onlyFresh
    )) {
        // Allererstes Rendern: initialer Hintergrund
        fragColor = c.yyyx;
        return;
    }
    if (iPassIndex == SCREEN_RENDER_PASS) {
        fragColor = texture(iPrevious, st);
        fragColor.a = 1.;
        return;
    }

    fragColor = texture(iPrevious, st);
    fragColor.rgb *= iFadeFactor;

    vec2 jitter = iFree0 * texelSize * 10.
        * hash22(st, iTime);
    vec4 prevNoised = texture(iPrevious, st + jitter);
    fragColor.rgb += iFree1 * prevNoised.rgb;

    vec4 drawing = freshDrawing(uv);

    // Front-to-Back (Mischung anhand Alpha)
    fragColor.rgb = mix(fragColor.rgb, drawing.rgb, drawing.a);
    fragColor.a = mix(fragColor.a, 1., drawing.a);
}
