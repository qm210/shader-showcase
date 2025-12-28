#version 300 es
precision mediump float;

in vec4 aPosition;
uniform vec2 iResolution;
out vec2 aspRatio;
out vec2 uv;
out vec2 texelSize;
out vec2 uv2texSt;
out vec2 texSt;

out vec2 st;
out vec2 stL;
out vec2 stR;
out vec2 stU;
out vec2 stD;
out vec2 texelL;
out vec2 texelR;
out vec2 texelU;
out vec2 texelD;

void main() {
    gl_Position = vec4(aPosition.xy, 0., 1.);
    aspRatio = iResolution.xy / iResolution.y;
    // [-1, 1] -> x [-aspRatio, aspRatio]; y [-1, 1]
    uv = iResolution / iResolution.y * aPosition.xy;

    // Unterscheidung: "texSt" ist das "st" mit invertiertem Y
    texSt = 0.5 * vec2(1. + aPosition.x, 1. - aPosition.y);
    uv2texSt = vec2(.5 / aspRatio.x, -.5);
    // <-- texSt = uv2texSt * uv + 0.5;

    // "st" ist dann die nicht-umgedrehte Ausrichtung.
    // mit den Differentialen für die Fluiddynamik
    // (die die y-Konvention nicht so derbe juckt)
    texelSize = 1. / iResolution.xy;
    texelL = -vec2(texelSize.x, 0.);
    texelR = +vec2(texelSize.x, 0.);
    texelU = +vec2(0., texelSize.y);
    texelD = -vec2(0., texelSize.y);
    st = aPosition.xy * 0.5 + 0.5;
    stL = st + texelL;
    stR = st + texelR;
    stU = st + texelU;
    stD = st + texelD;
}
