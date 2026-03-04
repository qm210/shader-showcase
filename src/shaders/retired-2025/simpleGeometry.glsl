#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;

// nice abbreviation for conciser glslCode (but needs getting used to)
vec4 c = vec4(1., 0., -1., 0.5);

void circle(in vec2 uv, inout vec3 col, inout float d) {
    vec2 pos = vec2(0.6, 0.1);
        // + 0.2 * vec2(sin(2. * iTime), cos(5. * iTime));
        // <-- uncomment to see an example of animation

    // d = clamp(3. * length(uv - pos) - 1., 0., 1.);
    // <-- uncomment to see what d is for.

    // c.... swizzling of this vector is a fast way to get basic colors
    col = c.yxy;

    // circle:
    if (length(uv - pos) < 0.5) {
        col = vec3(1., 0.6, 0.2);
    }
    // square:
    if (max(uv.x - pos.x, uv.y - pos.y) < 0.25) {
        // max() is one way, && is another.
        // (abs(uv.x - pos.x) < 0.3 && abs(uv.y - pos.y) < 0.3) {
        col = c.yyx;
    }
    // hyperbolic shape:
    if (abs(uv.x - pos.x) * abs(uv.y - 1.5* pos.x) < 0.025) {
        col = c.yxx;
    }
    // might move the pos constant, but also the uv coordinate
    // see above: "in vec2 uv" - does not change outside "uv".
    pos.x += 0.7;
    // diamond:
    if (abs(uv.x - pos.x - 0.3) + abs(uv.y - pos.y - 0.3) < 0.5) {
        col = c.xxx;
    }
    pos.y += 0.5;
    // ring:
    if (abs(length(uv - pos) - 0.55) < 0.05) {
        col = c.yyy;
        // example of a gradient
        col = mix(c.yyy, c.ywx, uv.y);
    }
    return;
}
// d = clamp(6. * length(uv - pos) - 1., 0., 1.);
// d = 10. * abs(length(uv - pos) - 0.4);

/*
void basicIdea(in vec2 uv, inout vec3 col, inout float d) {
    col = c.yyx;
    d = 0.;
}
*/

void main() {
    vec2 uv = gl_FragCoord.xy/iResolution.y;
    vec3 col = vec3(0.2, 0.015, 0.1);
    vec3 col2;
    float d = 0.;
    col2 = c.yyx;
    circle(uv, col2, d);
    col = mix(col2, col, d);

    fragColor = vec4(col, 1.0);
}

//uv.x = fract(10. * uv.x) * 0.1; //uv.y = abs(0.5 - uv.y);

// col2 = c.yxy;
// float scale = 0.8 + 0.5 * sin(iTime);
// circle(scale * uv - vec2(0.6, 0.3), col2, d);
// d *= d;
// col = mix(col2, col, d);


