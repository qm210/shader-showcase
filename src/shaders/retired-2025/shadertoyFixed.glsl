#version 300 es
precision highp float;

// this is the Hello-World-Shader of shadertoy,
// but translated for our WebGl2 use case.
//
// Note: the pipeline has to be adjusted for this!

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;

void main() {
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = gl_FragCoord.xy/iResolution.y;

    // Time varying pixel color
    vec3 col = 0.5 + 0.5*cos(uv.xyx+vec3(4, 0, 4));

    // Output to screen
    fragColor = vec4(col, 1.0);
}
