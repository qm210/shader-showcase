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

void addGrid(inout vec3 col, vec2 st) {
    const vec3 gridColor = c.yyy;

    // Gitter gegeben durch Bild, das wir zu Beginn reingeben
    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    vec2 gridStep = 1. / gridSize;

    // Gitter-SDF bestimmen & zeichnen, ähnlich wie immer
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

    if (showGrid) {
        addGrid(fragColor.rgb, st);
    }
}
