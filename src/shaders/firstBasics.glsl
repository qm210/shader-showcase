#version 300 es

precision highp float;

out vec4 outColor;

void main() {
    if (gl_FragCoord.x < 200.) {
        outColor = vec4(1, 0, 0, 1);
        return;
    }

    if (gl_FragCoord.x < 400.) {
        outColor = vec4(0, 1, 0, 1);
        return;
    }

    if (gl_FragCoord.x < 600.) {
        outColor = vec4(0, 0, 1, 1);
        return;
    }

    if (gl_FragCoord.x < 800.) {
        outColor = vec4(1, 1, 1, 1);
        return;
    }

    outColor = vec4(0, 0, 0, 1);

    if (gl_FragCoord.y < 300.) {
        outColor.a = 0.;
    }
    return;
}
