#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2 iResolution;
uniform vec2 texelSize;
uniform float iTime;
uniform float iDeltaTime;
uniform int iFrame;
uniform int iPassIndex;
uniform vec4 iMouse;
uniform bool iMouseDown;
uniform vec3 iMouseHover;
uniform float iHashSeed;
uniform bool showGrid;
uniform sampler2D texInit;
uniform sampler2D texPrevious;
uniform bool doInit;
uniform bool doEvolve;
uniform bool spawnRandomly;
uniform bool drawByMouse;

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

void addGrid(inout vec3 col, vec2 st) {
    const vec3 gridColor = c.yyy;
    vec2 d = mod(st, gridStep);
    d = min(d, gridStep - d);
    d *= iResolution;
    float dRect = min(d.x, d.y);
    float opacity = 1.0 - step(0.5, dRect);
    opacity *= 0.25;
    col.rgb = mix(col.rgb, gridColor, opacity);
}

void addMouseCursor(inout vec3 col, bool hovered) {
    if (!hovered) {
        return;
    }
    float opacity = iMouseDown ? 0.7 : 0.5;
    const vec3 mouseColor = 0.3 + 0.7 * c.ywx;
    col = mix(col, mouseColor, opacity);
}

vec4 initialImage(in vec2 st) {
    st.y = 1. - st.y;
    return texture(texInit, st);
}

bool isAlive(vec2 st) {
    // Textur (RGBA-vec4) irgendwie auf bool reduzieren:
    return texture(texPrevious, st).r < 1.;
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

#define PASS_EVOLVE_GAME 0
#define PASS_RENDER_SCREEN 1

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    // Gitter gegeben durch initiale Bildtextur
    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    gridStep = 1. / gridSize;

    // Maus -- immer gut zu haben.
    ivec2 mouseCell = ivec2(iMouseHover.xy / iResolution.xy * gridSize);
    bool hovered = mouseCell == cell;
    bool clicked = hovered && iMouseDown;

    if (iPassIndex == PASS_RENDER_SCREEN) {
        fragColor = isAlive(st) ? c.yyyx : c.xxxx;

        if (showGrid) {
            addGrid(fragColor.rgb, st);
        }
        addMouseCursor(fragColor.rgb, hovered);
        return;
    }

    if (doInit) {
        fragColor = initialImage(st);
        return;
    }

    CellInfo previous = checkCell(cell);
    bool alive = previous.alive;

    /// https://de.wikipedia.org/wiki/Conways_Spiel_des_Lebens#Die_Spielregeln
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
        alive = alive || abs(random) < 0.1;
    }

    if (clicked && drawByMouse) {
        alive = true;
    }

    fragColor = alive ? c.yyyx : c.xxxx;
}
