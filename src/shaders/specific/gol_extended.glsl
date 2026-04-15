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
uniform float iHashSeed;
uniform float iBoxExtend;
uniform float iBoxEnvelope;

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
    c.x /= 360.;
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
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

vec4 initializeFrame(in vec2 st) {
    // Initialisieren von der statischen Textur
    st.y = 1. - st.y;
    vec4 color = texture(texInit, st);

    // hier wird inzwischen State initialisiert!
    // weiß soll weiterhin tot sein, Rest hat entweder Farbe oder nimm hash
    vec3 hsv = rgb2hsv(color.rgb);
    bool alive = hsv.z < 1.;
    if (hsv.y < 0.1) {
        hsv.x = fract(perlin2D(8. * st, iTime));
    }
    float hue = hsv.x;
    float age = 0.;
    return vec4(float(alive), hue, age, 0.);
}

struct CellInfo {
    vec2 st;
    bool alive;
    int neighbors;
    // extra state!
    float hue;
    float age;
    // for hue mixing
    float neighborHue[3];
};

const float MAX_CELL_AGE = 1000.;


CellInfo checkCell(ivec2 cell) {
    CellInfo info;

    // Obacht: ivec2 coord hat Auflösung des Gitters,
    //         Framebuffer-Textur aber Auflösung des Bilds!
    // -> Berechne Zellmitte als "st" normiert auf [0..1]
    info.st = (vec2(cell) + 0.5) * gridStep;

    vec4 prevState = texture(texPrevious, info.st);
    info.alive = bool(prevState.r);
    info.hue = prevState.g;
    info.age = prevState.b;

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

                switch (info.neighbors) {
                    case 1:
                        info.neighborHue[0] = neighborState.g;
                        break;
                    case 2:
                        info.neighborHue[1] = neighborState.g;
                        break;
                    case 3:
                        info.neighborHue[2] = neighborState.g;
                        break;
                }
            }
        }
    }
    return info;
}

float smoothMinimum(float d1, float d2, float k)
{
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h);
}

void render(out vec3 col, in ivec2 cell, in vec2 st) {
//    col = texture(texPrevious, st).rgb;
//    return;

    const float nothingHere = 10000.;
    float dMin = nothingHere;
    vec2 center;

    CellInfo info = checkCell(cell);

    const int range = 5;
    for (int ix = -range; ix <= range; ix++) {
        for (int iy = -range; iy <= range; iy++) {
            ivec2 iCell = cell + ivec2(ix, iy);
            CellInfo here = checkCell(iCell);
            if (!here.alive) {
                continue;
            }
            // float d = length(st - here.st) - (iBoxExtend + 0.001);
            float d = sdBox(st - here.st, 0.5 * gridStep);
            d -= 0.01 * iBoxExtend;

            /// dMin = min(d, dMin);
            dMin = smoothMinimum(d, dMin, iBoxEnvelope);
        }
    }

    float aliveMix = smoothstep(0.001, 0., dMin);
    // aliveMix *= clamp(1. - 10. * info.age, 0., 1.);
    aliveMix *= exp(-info.age / MAX_CELL_AGE);
    // vec3 aliveCol = c.xxx;
    vec3 aliveCol = hsv2rgb(vec3(360. * info.hue, 1., 1.));

    col = mix(c.yyy, aliveCol, aliveMix);
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
        if (previous.alive) {
            // rules 1-3
            alive = previous.neighbors == 2
                || previous.neighbors == 3;
        } else {
            // rule 4
            alive = previous.neighbors == 3;
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

    float age;
    float hue = 0.;
    if (alive && !previous.alive) {
        age = 0.;
        if (previous.neighbors == 0) {
            hue = 360. * hash12(st, 0., iTime);
        } else {
            // if existing, mix hues from the existing :)
            for (int n = 0; n < previous.neighbors && n < 3; n++) {
                hue += previous.neighborHue[n] / float(previous.neighbors);
            }
        }

    } else {
        // Vorsicht: braucht gl.FLOAT!
        age = previous.age + 1.;
        hue = previous.hue;
        if (age > MAX_CELL_AGE) {
            alive = false;
        }
    }

    fragColor.x = float(alive);
    fragColor.y = hue;
    fragColor.z = age;
}
