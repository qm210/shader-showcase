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

void addGrid(inout vec3 col, vec2 st, vec2 gridStep) {
    const vec3 gridColor = c.yyy;

    vec2 d = mod(st, gridStep);
    d = min(d, gridStep - d);
    d *= iResolution;
    float dRect = min(d.x, d.y);
    float opacity = 1.0 - step(0.5, dRect);
    opacity *= 0.25;
    col.rgb = mix(col.rgb, gridColor, opacity);
}

vec4 initialImage(in vec2 st) {
    st.y = 1. - st.y;
    return texture(texInit, st);
}

struct CellInfo {
    bool alive;
    int neighbors;
};

#define PASS_EVOLVE_GAME 0
#define PASS_RENDER_SCREEN 1

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    fragColor = initialImage(st);

    const bool showAliveState = true;
    const bool showNeighborCountAsHue = true;

    // pro Zelle ist nur die mittlere Koordinate relevant
    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    vec2 gridStep = 1. / gridSize;
    vec2 stCell = (vec2(cell) + 0.5) * gridStep;

    CellInfo info;
    info.alive = initialImage(stCell).r < 0.1;

    if (showAliveState) {
        const vec3 DEAD = c.yyy;
        const vec3 LIVES = c.yxy;
        fragColor.rgb = info.alive ? LIVES : DEAD;
    }

    info.neighbors = 0;
    for (int ix = -1; ix < 2; ix++) {
        for (int iy = -1; iy < 2; iy++) {
            if (ix == 0 && iy == 0) {
                continue;
            }
            vec2 stNeighbor = stCell + gridStep * vec2(ix, iy);
            if (initialImage(stNeighbor).r < 0.1) {
                info.neighbors++;
            }
        }
    }

    if (showNeighborCountAsHue) {
        float hue;
        if (info.neighbors < 2) {
            hue = 0.;
        } else if (info.neighbors == 2) {
            hue = 60.;
        } else if (info.neighbors == 3) {
            hue = 90.;
        } else if (info.neighbors > 3){
            hue = -60.;
        }
        fragColor.rgb = hsv2rgb(vec3(hue, 1., 1.));
    }

    if (showGrid) {
        addGrid(fragColor.rgb, st, gridStep);
    }
}
