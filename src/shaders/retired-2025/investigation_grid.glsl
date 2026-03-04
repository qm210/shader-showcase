#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;

vec4 c = vec4(1., 0., -1., .5);

const float twoPi = 6.28319;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

void applyGrid(inout vec3 col, in vec2 uv, bool right) {
    const float gridSize = 0.5;
    float thick = 0.02;
    uv = mod(uv, gridSize);
    // <-- verallgemeinert fract(x) == mod(x, 1.)
    float dMin = min(uv.x, uv.y);
    if (right) {
        // wie letzte Woche spontan zusammengereimt:
        col *= 1. - 0.5 * (step(dMin, thick));
        return;
    }
    // (*) Diese Lösung ist unsymmetrisch, d.h. die Punkte dMin=0 sind nicht mittig in der Linie.
    //     Deswegen ist auch ganz unten eine Kante, ganz oben sieht man keine.
    //     Wie kann man die Symmetrie herstellen, d.h. die Linie mittig um die Gitterwerte legen?
    // Hilft vielleicht: Verhalten von step(...,x) bzw. step(x,...) direkt anschauen:
    // https://graphtoy.com/?f1(x,t)=1-0.5*(step(x,0.1))&v1=true&f2(x,t)=step(0.,x)&v2=true&f3(x,t)=&v3=false&f4(x,t)=&v4=false&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=0.055959188393239614,-0.021704530457179908,1.6215668511724766

    float dMax = max(uv.x, uv.y);
    thick /= 2.;
    float frame = step(thick, dMin) * step(dMax, gridSize - thick);
    // note: in 1D this is the same, but in 2D these differ - get why?
    // frame = step(thick, dMin) - step(gridStep - thick, dMax);
    col *= 0.5 + 0.5 * frame;

}

void drawOrigin(inout vec3 col, vec2 uv) {
    // (*) just for orientation, a small circle
    float d = sdCircle(uv, 0.02);
    // Compare: a) draw pure d
    // col = mix(col, c.xxx, d); // or even just: d * c.xxx;
    // With: b) common shape drawing via smoothstep() and mix():
    col = mix(c.yyy, col, smoothstep(0., 0.001, d));
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    float aspectRatio = iResolution.x / iResolution.y;

    vec3 col = 0.9 * c.xxx;

    if (uv.x < -0.01) {
        uv.x += .5 * aspectRatio;
        applyGrid(col, uv, false);
        drawOrigin(col, uv);

    } else if (uv.x > 0.01) {
        uv.x -= .5 * aspectRatio;
        applyGrid(col, uv, true);
        drawOrigin(col, uv);

    } else {
        discard;
    }

    fragColor = vec4(col, 1.0);
}
