#version 300 es

precision mediump float;

out vec4 outColor;
uniform float iTime;
uniform vec2 iResolution;

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    float y = 1. - gl_FragCoord.y / iResolution.y;

    if (gl_FragCoord.x < 10. && gl_FragCoord.y < 10.) {
        outColor = vec4(1, 1, 0, 0);
        return;
    }

    if (gl_FragCoord.x < 200.) {
        outColor = vec4(1, y, 0, 1);
        return;
    }

    if (gl_FragCoord.x < 400. + 20. * sin(iTime)) {
        outColor = vec4(0, 1, y, 1);
        return;
    }

    if (gl_FragCoord.x < 600.) {
        outColor = vec4(y, 0, 1, 1);
        return;
    }

    if (gl_FragCoord.x < 800.) {
        outColor = vec4(y, y, y, 1);
        return;
    }

    outColor = vec4(0, 0, 0, 1);

    if (gl_FragCoord.y < 300.) {
        outColor.a = 0.;
    }
    return;
}
