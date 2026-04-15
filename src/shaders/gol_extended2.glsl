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
uniform bool doEvolve;
uniform bool spawnRandomly;
uniform bool drawByMouse;
uniform vec4 iMouse;
uniform bool iMouseDown;
uniform vec3 iMouseHover;
uniform int displayMode;
uniform sampler2D texInit;
uniform sampler2D texPrevious;
uniform int transitionFrames;
uniform float iHashSeed;
uniform sampler2D texRendered;
uniform float iBarrelDistortion;
uniform float iBarrelDistortionExponent;
uniform float iShapeSize;
uniform float iShapeSmooth;
uniform float iHighLifeProbability;

// falls ihr die brauchen könnt...
uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform float iFree5;

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
    c.x /= 360.;
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

float hash12(vec2 p, float seed, float mod) {
    p = vec2(dot(p, vec2(127.1, 311.7)) + seed * 17.3, seed * 23.7);
    float s = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    return sin(s - twoPi * mod);
}

float perlin2D(vec2 p, float seed, float mod) {
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = smoothstep(0., 1., pf);

    float f00 = hash12(pi + c.yy, seed, mod);
    float f01 = hash12(pi + c.yx, seed, mod);
    float f10 = hash12(pi + c.xy, seed, mod);
    float f11 = hash12(pi + c.xx, seed, mod);

    float xm1 = mix(f00, f10, w.x);
    float xm2 = mix(f01, f11, w.x);
    return mix(xm1, xm2, w.y);
}

float perlin2D(vec2 p, float seed) {
    return perlin2D(p, seed, 0.);
}

float sdBox(in vec2 p, in vec2 b)
{
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

float randomHue(in vec2 st) {
    // wir wollen Abwechslung, aber nicht totales Chaos -> Perlin Noise
    return fract(perlin2D(8. * st - 2. * iTime, iTime));
}

vec4 initializeFrame(in vec2 st) {
    // Initialisieren von der statischen Textur
    st.y = 1. - st.y;
    vec4 color = texture(texInit, st);

    // hier wird inzwischen State initialisiert!
    // weiß soll weiterhin tot sein, Rest hat entweder Farbe oder nimm hash
    vec3 hsv = rgb2hsv(color.rgb);
    bool alive = hsv.z < 1.;
    if (hsv.y < 0.1) {
        hsv.x = randomHue(st);
    }
    float hue = hsv.x;
    // Keine Transition am Anfang.
    return vec4(float(alive), hue, 0., 0.);
}

struct CellInfo {
    vec2 st;
    bool alive;
    int neighbors;
    // extra state!
    float hue;
    float transition;
    float spawnHue; // could just use the hue field, actually. anyway.
};

CellInfo checkCell(ivec2 cell) {
    CellInfo info;

    // Obacht: ivec2 coord hat Auflösung des Gitters,
    //         Framebuffer-Textur aber Auflösung des Bilds!
    // -> Berechne Zellmitte als "st" normiert auf [0..1]
    info.st = (vec2(cell) + 0.5) * gridStep;

    vec4 prevState = texture(texPrevious, info.st);
    info.alive = bool(prevState.r);
    info.hue = prevState.g;
    info.transition = prevState.b;

    info.spawnHue = 0.;
    info.neighbors = 0;
    for (int ix = -1; ix < 2; ix++) {
        for (int iy = -1; iy < 2; iy++) {
            if (ix == 0 && iy == 0) {
                continue;
            }
            vec2 stNeighbor = info.st + gridStep * vec2(ix, iy);
            vec4 neighborState = texture(texPrevious, stNeighbor);
            bool neighborAlive = bool(neighborState.r);
            if (neighborAlive) {
                info.neighbors++;

                // for averaging
                info.spawnHue += neighborState.g;
            }
        }
    }
    if (!info.alive) {
        if (info.neighbors == 0) {
            info.spawnHue = randomHue(info.st);
        } else {
            info.spawnHue /= float(info.neighbors);
        }
    }
    return info;
}

float smoothMinimum(float d1, float d2, float k)
{
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h);
}

void render(out vec3 outColor, in ivec2 cell, in vec2 st) {
    const float nothingHere = 10000.;
    float dMin = nothingHere;
    vec2 center;

    CellInfo info = checkCell(cell);

    float d = length(st - info.st) - 0.005 * (iShapeSize + 1.);

    float opacity = smoothstep(0.01 * (1. + iShapeSmooth), 0., d);
    if (info.transition > 0.) {
        opacity *= info.transition;
    } else if (info.transition < 0.) {
        opacity *= info.transition + 1.;
    } else if (!info.alive) {
        opacity = 0.;
    }
    opacity = pow(opacity, 1./2.7);
    vec3 color = hsv2rgb(vec3(360. * info.hue, 1., 1.));

    outColor = mix(c.yyy, color, opacity);
}

vec2 barrelDistort(in vec2 st) {
    vec2 p = st * 2. - 1.;
    float r = length(p);
    p *= 1. + iBarrelDistortion * pow(r, iBarrelDistortionExponent);
    return p * 0.5 + 0.5;
}

#define DO_SOME_MIRRORING 0

void postprocess(out vec3 col, in vec2 st) {
    // Idea: some Mirroring?

    #if DO_SOME_MIRRORING
        bvec2 flip = bvec2(st.s > 0.5, st.t > 0.5);
        st *= 2.;
        st = fract(st);
        if (flip.s) {
            st.s = 1. - st.s;
        }
        if (flip.t) {
            st.t = 1. - st.t;
        }
    #endif

    // Idea: Barrel Distortion?
    st = barrelDistort(st);
    vec4 image = texture(texRendered, st);
    col = image.rgb;
    if (min(st.x, st.y) < 0. || max(st.x, st.y) > 1.) {
        col = c.xxx;
    }
}

#define PASS_EVOLVE_GAME 0
#define PASS_RENDER_GAME 1
#define PASS_RENDER_POST 2

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    if (iPassIndex == PASS_RENDER_POST) {
        postprocess(fragColor.rgb, st);
        fragColor.a = 1.;
        return;
    }

    // Gitter gegeben durch Bild, das wir zu Beginn reingeben
    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    gridStep = 1. / gridSize;

    ivec2 mouseCell = ivec2(iMouseHover.xy / iResolution.xy * gridSize);

    if (iPassIndex == PASS_RENDER_GAME) {
        render(fragColor.rgb, cell, st);
        fragColor.a = 1.;

//        float d = abs(length(gl_FragCoord.xy - iMouseHover.xy)) - 5.;
//        fragColor.rgb = mix(fragColor.rgb, c.xyw, step(d, 0.2));
        if (mouseCell == cell) {
            fragColor.rgb = 0.3 + 0.7 * c.ywx;
            if (iMouseDown) {
                fragColor.rgb = c.xyy;
            }
        }
        return;
    }

    if (doInit || iFrame == 0) {
        fragColor = initializeFrame(st);
        return;
    }

    CellInfo previous = checkCell(cell);
    bool alive = previous.alive;

    if (doEvolve) {
        // normales B3/S23
        if (previous.alive) {
            alive = previous.neighbors == 2
                 || previous.neighbors == 3;
        } else {
            alive = previous.neighbors == 3;
        }

        // "High Life" B36/S23 je nach Wahrscheinlichkeit erlauben
        float rnd = abs(hash(83. * iTime));
        bool useHighLife = rnd < iHighLifeProbability;
        if (useHighLife) {
            if (previous.alive) {
                alive = alive || previous.neighbors == 6;
            }
        }
    }

    if (spawnRandomly) {
        float random = perlin2D(vec2(cell), iTime);
        if (abs(random) < 0.1) {
            alive = random > 0.;
        }
    }

    if (drawByMouse && iMouseDown) {
        if (cell == mouseCell) {
            alive = true;
        }
    }

    float transitionDelta = 1. / float(transitionFrames);
    float transition = 0.;
    bool shouldSpawn = alive && !previous.alive && previous.transition == 0.;
    bool shouldDie = !alive && previous.alive && previous.transition == 0.;

    float hue = previous.hue;

    // if in transition, be not bothered.
    if (previous.transition != 0.) {
        if (abs(previous.transition) >= 1.) {
            alive = previous.transition > 0.;
            transition = 0.;
        } else {
            alive = previous.alive;
            transition = previous.transition
                + sign(previous.transition) * transitionDelta;
        }
    }
    else if (shouldSpawn) {
        hue = previous.spawnHue;
        transition = transitionDelta;
    }
    else if (shouldDie) {
        transition = -transitionDelta;
    }

    fragColor.r = float(alive);
    fragColor.g = hue;
    fragColor.b = transition;
}
