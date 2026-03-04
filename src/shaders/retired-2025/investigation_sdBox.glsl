#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;

const float pi = 3.14159;
const float piHalf = pi * 0.5;
const float twoPi = 2. * pi;

const vec4 c = vec4(1., 0., -1., .5);

#define CORRECT_BOX 0
#define JUST_MAX 1
#define JUST_LENGTH 2

vec3 drawBox(vec2 uv, int mode) {
    vec3 col = c.yyy;
    vec2 size = vec2(0.3, 0.3);

    // analog zu sdBox()
    vec2 p = abs(uv) - size;
    float dMax = max(p.x, p.y);
    float dBox = length(max(p, vec2(0))) + min(dMax, 0.0);
    float d;

    switch (mode) {
        case CORRECT_BOX:
            d = dBox;
            break;
        case JUST_LENGTH:
            d = length(p);
            break;
        case JUST_MAX:
            d = dMax;
            break;
    }

    d *= 2.;
    // rot wächst für immer negativere d,
    col.r = -min(0., d);
    // grün wächst für immer positivere d,
    col.g = max(0., d);
    // betragsmäßig kleine d bleiben schwarz,
    // aber sehr nah an 0 wollen wir weiß sehen.
    col = mix(col, vec3(1), step(abs(d), 0.002));

    return col;
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec3 col;

    if (uv.x < -0.6) {

        uv.x += 1.2;
        col = drawBox(uv, CORRECT_BOX);

    } else if (abs(uv.x) < 0.58) {

        col = drawBox(uv, JUST_LENGTH);

    } else if  (uv.x > .6) {

        uv.x -= 1.2;
        col = drawBox(uv, JUST_MAX);

    } else {
        discard;

    }

    fragColor = vec4(col, 1.);
}
