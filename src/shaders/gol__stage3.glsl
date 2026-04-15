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
uniform bool showGrid;

uniform sampler2D texInit;
uniform sampler2D texPrevious;
uniform bool doInit;

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

vec3 hsv2rgb(vec3 c)
{
    c.x /= 360.;
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec2 gridStep;

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

void addMouseCursor(inout vec3 col) {
    const vec3 mouseColor = 0.3 + 0.7 * c.ywx;
    float d = abs(length(gl_FragCoord.xy - iMouseHover.xy)) - 5.;
    float opacity = iMouseDown ? 0.7 : 0.5;
    col = mix(col, mouseColor, opacity * step(d, 0.2));
}

vec4 initialImage(in vec2 st) {
    st.y = 1. - st.y;
    return texture(texInit, st);
}

struct CellInfo {
    bool alive;
    int neighbors;
};

bool isAlive(vec2 st) {
    // Textur (RGBA-vec4) irgendwie auf bool reduzieren:
    return texture(texPrevious, st).r < 1.;
}

CellInfo checkCell(ivec2 cell) {
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

    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    gridStep = 1. / gridSize;

    if (iPassIndex == PASS_RENDER_SCREEN) {
        const vec4 DEAD = c.yyyx;
        const vec4 LIVES = c.yxyx;
        fragColor = isAlive(st) ? LIVES : DEAD;

        // Dinge, die nicht zum Feedback gehören...
        if (showGrid) {
            addGrid(fragColor.rgb, st);
        }
        addMouseCursor(fragColor.rgb);
        return;
    }

    if (doInit) {
        fragColor = initialImage(st);
        return;
    }

    CellInfo previous = checkCell(cell);
    bool alive = previous.alive;

    /// https://de.wikipedia.org/wiki/Conways_Spiel_des_Lebens#Die_Spielregeln
    if (previous.alive) {
        alive = previous.neighbors == 2 || previous.neighbors == 3;
    } else {
        alive = previous.neighbors == 3;
    }

    // muss zur Initial-Textur passen!
    fragColor = alive ? c.yyyx : c.xxxx;
}
