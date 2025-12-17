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
    st = aPosition.xy * 0.5 + 0.5;
    stL = st - vec2(texelSize.x, 0.);
    stR = st + vec2(texelSize.x, 0.);
    stU = st + vec2(0., texelSize.y);
    stD = st - vec2(0., texelSize.y);
}
