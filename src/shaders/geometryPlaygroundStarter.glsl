#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse; /// huh?

uniform float iCircleRadius;
uniform vec2 iBoxOffset;
uniform vec2 iBoxHalfSize;
uniform float iBoxExtend;
uniform vec2 iBezierPoint1;
uniform vec2 iBezierPoint2;
uniform vec2 iBezierPoint3;
uniform float iBezierThickness;
uniform bool point2byMouse;
uniform float iSmoothing;

// macht was ihr wollt :P
uniform float free0;
uniform float free1;
uniform float free2;
uniform vec2 vecFree0;
uniform vec2 vecFree1;
uniform vec2 vecFree2;

vec4 c = vec4(1., 0., -1., .5);
float pixelSize;

float sdCircle( in vec2 p, in float r )
{
    return length(p) - r;
}

float sdBox( in vec2 p, in vec2 b )
{
    vec2 d = abs(p) - b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

float dot2(vec2);

// cf. https://iquilezles.org/articles/distfunctions2d/
float sdBezier( in vec2 pos, in vec2 A, in vec2 B, in vec2 C )
{
    vec2 a = B - A;
    vec2 b = A - 2.0*B + C;
    vec2 c = a * 2.0;
    vec2 d = A - pos;
    float kk = 1.0/dot(b,b);
    float kx = kk * dot(a,b);
    float ky = kk * (2.0*dot(a,a)+dot(d,b)) / 3.0;
    float kz = kk * dot(d,a);
    float res = 0.0;
    float p = ky - kx*kx;
    float p3 = p*p*p;
    float q = kx*(2.0*kx*kx-3.0*ky) + kz;
    float h = q*q + 4.0*p3;
    if( h >= 0.0)
    {
        h = sqrt(h);
        vec2 x = (vec2(h,-h)-q)/2.0;
        vec2 uv = sign(x)*pow(abs(x), vec2(1.0/3.0));
        float t = clamp( uv.x+uv.y-kx, 0.0, 1.0 );
        res = dot2(d + (c + b*t)*t);
    }
    else
    {
        float z = sqrt(-p);
        float v = acos( q/(p*z*2.0) ) / 3.0;
        float m = cos(v);
        float n = sin(v)*1.732050808;
        vec3  t = clamp(vec3(m+m,-n-m,n-m)*z-kx,0.0,1.0);
        res = min( dot2(d+(c+b*t.x)*t.x),
        dot2(d+(c+b*t.y)*t.y) );
        // the third root cannot be the closest
        // res = min(res,dot2(d+(c+b*t.z)*t.z));
    }
    return sqrt( res );
}

float dot2(vec2 v) {
    return dot(v, v);
}

// cf. https://iquilezles.org/articles/distfunctions/
float opSmoothUnion( float a, float b, float k )
{
    k *= 4.0;
    float h = max(k-abs(a-b),0.0);
    return min(a, b) - h*h*0.25/k;
}

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s,  c);
}

void drawTheScene(inout vec3 col, vec2 uv) {
    // ÜBUNG
    float dBox = sdBox(uv - iBoxOffset, iBoxHalfSize);
    dBox -= iBoxExtend;
    col = mix(col, c.yww, smoothstep(0.01, 0., dBox));

    vec2 bezier1 = iBezierPoint1;
    vec2 bezier2 = iBezierPoint2;
    vec2 bezier3 = iBezierPoint3;
    if (point2byMouse) {
        vec2 clicked = (2. * iMouse.zw - iResolution) / iResolution.y;
        bezier2 = clicked;
    }

    // ÜBUNG... Bezier drehen?
    float d = sdBezier(uv, bezier1, bezier2, bezier3);
    col = mix(col, c.wyw, step(d, iBezierThickness));

    // ... Kombinationen
    float d2 = d - iBezierThickness;
    d2 = opSmoothUnion(d2, dBox, iSmoothing);
    d2 = abs(d2) - 0.005;

    col = mix(col, c.xwy, 0.5 * smoothstep(0.001, 0., d2));

    // ÜBUNG: Bezier Point2 zeichnen
    d = sdCircle(uv - bezier2, 0.03);
    col = mix(col, c.xyx, step(d, 0.));

}

void drawOrigin(inout vec3 col, vec2 uv) {
    // (*) just for orientation, a small circle
    float d = sdCircle(uv, iCircleRadius);
    d = abs(d) - pixelSize;
    col = mix(c.yyy, col, smoothstep(0., 0.01, d));
}

void applyGrid(inout vec3 col, in vec2 uv, in vec3 gridColor) {
    const float gridSize = 0.5;
    const float thickness = 0.005;
    uv = mod(uv, gridSize);
    float dMin = min(uv.x, uv.y);
    float dMax = max(uv.x, uv.y);
    float frame = step(thickness, dMin) * step(dMax, gridSize - thickness);
    col = mix(gridColor, col, frame);
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    pixelSize = 1. / iResolution.y;

    vec3 col = c.xxx;

    applyGrid(col, uv, vec3(0.75));
    drawOrigin(col, uv);

    drawTheScene(col, uv);

    fragColor = vec4(col, 1.0);
}
