#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2 iResolution;
uniform vec2 texelSize;
uniform float iTime;
uniform float iDeltaTime;
uniform int iFrame;
uniform int iPassIndex;
uniform bool doInit;
uniform bool spawnRandomly;
uniform vec4 iMouse;
uniform bool iMouseDown;
uniform vec3 iMouseHover;
uniform int displayMode;
uniform sampler2D texInit;
uniform sampler2D texPrevious;
uniform float iHashSeed;

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

vec2 gridStep;

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

float hash12(vec2 p, float seed) {
    p = vec2(dot(p, vec2(127.1, 311.7)) + seed * 17.3, seed * 23.7);
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float perlin2D(vec2 p, float seed) {
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = smoothstep(0., 1., pf);

    float f00 = hash12(pi + c.yy, seed);
    float f01 = hash12(pi + c.yx, seed);
    float f10 = hash12(pi + c.xy, seed);
    float f11 = hash12(pi + c.xx, seed);

    float xm1 = mix(f00, f10, w.x);
    float xm2 = mix(f01, f11, w.x);
    return mix(xm1, xm2, w.y);
}

vec4 initializeFrame(in vec2 st) {
    // Initialisieren von der statischen Textur
    st.y = 1. - st.y;
    return texture(texInit, st);
}

bool isAlive(vec2 st) {
    // derive clear cell state from RGBA input... for starters:
    vec4 color = texture(texPrevious, st);
    return color.r < 1.;
}

struct CellInfo {
    bool alive;
    int neighbors;
};

CellInfo checkCell(ivec2 cell) {
    // Obacht: ivec2 coord hat Auflösung des Gitters,
    //         Framebuffer-Textur aber Auflösung des Bilds!
    // -> Berechne Zellmitte als "st" normiert auf [0..1]
    vec2 stCell = (vec2(cell) + 0.5) * gridStep;

    CellInfo info;
    info.alive = isAlive(stCell);
    info.neighbors = 0;
    for (int ix = -1; ix < 2; ix++) {
        for (int iy = -1; iy < 2; iy++) {
            if (ix == 0 && iy == 0) {
                continue;
            }
            vec2 stNeighbor = stCell + gridStep * vec2(ix, iy);
            if (isAlive(stNeighbor)) {
                info.neighbors++;
            }
        }
    }
    return info;
}

float sdBox(in vec2 p, in vec2 b)
{
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

vec3 randomCellColor(ivec2 cell) {
    vec2 randomVec2 = hash22(vec2(cell) * 3423., 0.);
    return vec3(
        0.5 + 0.3 * randomVec2.x,
        0.,
        0.5 + 0.3 * randomVec2.y
    );
}

float smoothMinimum(float d1, float d2, float k)
{
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h);
}

float sdRhombus( in vec2 p, in vec2 b )
{
    b.y = -b.y;
    p = abs(p);
    float h = clamp( (dot(b,p)+b.y*b.y)/dot(b,b), 0.0, 1.0 );
    p -= b*vec2(h,h-1.0);
    return length(p)*sign(p.x);
}

vec3 someRenderPass(ivec2 cell, vec2 st) {
    vec3 col = texture(texPrevious, st).rgb;
    // In der Textur steht zwar ein RGB-Vektor,
    // aber als Farbe interpretieren wir den erst im Renderschritt.

    // Durchreichen wäre hier die einfachste Option.
    // Oder wir rechnen daraus irgendwelche anderen Farben aus.
//    col = 1. - 0.5 * col;
//    col.g *= st.y;

    return col;
}

#define PASS_EVOLVE_GAME 0
#define PASS_RENDER_SCREEN 1

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    // Gitter gegeben durch Bild, das wir zu Beginn reingeben
    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    gridStep = 1. / gridSize;

    ivec2 mouseCell = ivec2(iMouseHover.xy / iResolution.xy * gridSize);

    if (iPassIndex == PASS_RENDER_SCREEN) {
        fragColor = texture(texPrevious, st);
        fragColor.a = 1.;

//        float d = abs(length(gl_FragCoord.xy - iMouseHover.xy)) - 5.;
//        fragColor.rgb = mix(fragColor.rgb, c.xyw, step(d, 0.2));
        /*
        if (mouseCell == cell) {
            const vec3 someBlue = 0.3 + 0.7 * c.ywx;
            fragColor.rgb = mix(fragColor.rgb, someBlue, 0.5);
        }
        */
        return;
    }

    if (doInit || iFrame == 0) {
        fragColor = initializeFrame(st);
        return;
    }

    CellInfo previous = checkCell(cell);
    bool alive;

    if (previous.alive) {
        // rules 1-3
        alive = previous.neighbors == 2
            || previous.neighbors == 3;
    } else {
        // rule 4
        alive = previous.neighbors == 3;
    }

    if (spawnRandomly) {
        float random = perlin2D(vec2(cell), iTime);
        alive = abs(random) < 0.1;
        // could also randomly kill
    }

    fragColor = alive ? c.yyyx : c.xxxx;
}
