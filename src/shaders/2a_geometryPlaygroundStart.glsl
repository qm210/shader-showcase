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
uniform float iBoxRotate;
uniform float iShouldBeZero;
uniform vec2 iBezierPoint1;
uniform vec2 iBezierPoint2;
uniform vec2 iBezierPoint3;
uniform float iBezierThickness;
uniform bool drawBezierPoint2;
uniform bool drawPoint2UsingStep;
uniform bool point2byMouse;
uniform float iSmoothing;

// macht damit, was ihr wollt :P
uniform float free0;
uniform float free1;
uniform float free2;
uniform vec2 vecFree0;
uniform vec2 vecFree1;
uniform vec2 vecFree2;

vec4 c = vec4(1., 0., -1., .5);
float pixelSize;

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s,
                s,  c);
    /// <-- ist eine 2x2-Matrix, hervorragend um vec2 zu drehen
    ///     Vorsicht: column-major (-s ist unten links, +s oben rechts)
}

float dot2(vec2); /// <-- forward declaration geht auch

float sdCircle( in vec2 p, in float r )
{
    return length(p) - r;
    /// Kreis sieht noch human aus...
}

float sdBox( in vec2 p, in vec2 b )
{
    vec2 d = abs(p) - b;
    /// <-- d == vec2(0) beschreibt die Ecken
    float dMax = max(d.x, d.y);
    /// 0 < dMax < L beschreibt Quadrat der Seitenlänge L,
    /// anschaulich erklärbar über die Winkelhalbierende (y == x)
    /// - oberhalb derer ist y > x -> max == y
    /// - unterhalb derer ist x > y -> max == x
    /// in den zwei Teildreiecken muss dann nur "max" beschränkt werden,
    /// original passiert das bei min(dMax, 0);

    // die "unexakte" Box: passt in der Nähe von d == 0, weit weg davon nicht mehr
    // return dMax;

    /// max(d, 0) trägt nur bei für d > 0
    /// float dOutside = length(max(d, 0));
    float dOutside = length(max(d, iShouldBeZero));
    /// min(d, 0) trägt nur bei für d < 0
    /// float dInside = min(max(d.x,d.y), 0);
    float dInside = min(max(d.x,d.y), iShouldBeZero);
    return dInside + dOutside;
    /// ... Rechteck ... kann man sich dran gewöhnen ...
}

// cf. https://iquilezles.org/articles/distfunctions2d/
float sdBezier( in vec2 pos, in vec2 A, in vec2 B, in vec2 C )
{
    /// ... hoppla. Hier aber erstmal ein Fall, den wir mal nicht sofort nachrechnen wollen.
    /// Interessanter ist hier erstmal, wie diese SDF aussieht, nicht, wie sie hergeleitet wird.
    /// -> Also lieber im Aufruf mal Parameter ändern, Uniforms einsetzen, oder Teile auskommentieren...
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
    if (h >= 0.0)
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
    }
    return sqrt(res);
}

float dot2(vec2 v) {
    return dot(v, v);
}

// cf. https://iquilezles.org/articles/distfunctions/
// oder auch: https://graphtoy.com/?f1(x,t)=x/4&v1=true&f2(x,t)=4*sin(x)&v2=true&f3(x,t)=min(f1(x),f2(x))&v3=false&f4(x,t)=4*fract(0.5*t)&v4=false&f5(x,t)=max(f4(x,t)-abs(f1(x)-f2(x)),0)&v5=false&f6(x,t)=f3(x)-f5(x,t)*f5(x,t)*0.25/f4(x,t)&v6=true&grid=1&coords=0,0,19.227991480866635
float smoothMinimum( float a, float b, float k )
{
    k *= 4.0;
    float h = max(k-abs(a-b),0.0);
    return min(a, b) - h*h*0.25/k;
}

void drawTheScene(inout vec3 col, vec2 uv) {
    /// Signed Distance Function == Abstand vom Rand der Form
    /// Signed? ins Innere negativ, nach außen positiv steigend
    /// Wegen Distance heißt das gerne "d":
    float d = sdCircle(uv, iCircleRadius);
    d = abs(d) - pixelSize;

    col = mix(col, c.yyy, smoothstep(pixelSize, 0., d));

    /// Wo kämen wir hin, wenn die Szene hier schon aufhört?
    // return;

    float dBox = sdBox((uv - iBoxOffset), iBoxHalfSize);
    dBox -= iBoxExtend;
    col = mix(c.xyy, c.yxx, 0.5 * dBox + 0.5);
    if (abs(dBox) < 0.002) {
        col = c.xxy;
    }
    // col = mix(col, c.yww, smoothstep(0.01, 0., dBox));

    float dBoxCut = sdBox(uv - iBoxOffset, 0.5 * iBoxHalfSize);
    // dBox = max(dBox, -dBoxCut);

    // col = mix(col, c.yww, smoothstep(0.01, 0., dBox));


    vec2 bezier1 = iBezierPoint1;
    vec2 bezier2 = iBezierPoint2;
    vec2 bezier3 = iBezierPoint3;
    if (point2byMouse) {
        vec2 clicked = (2. * iMouse.zw - iResolution) / iResolution.y;
        bezier2 = clicked;
    }
    d = sdBezier(uv, bezier1, bezier2, bezier3);
    d = abs(d - iBezierThickness);
    // d = abs(d - 0.35 * iBezierThickness);
    col = mix(col, c.wyw, step(d, 0.15 * iBezierThickness));

    float dCombined = d - iBezierThickness;
    dCombined = smoothMinimum(dCombined, dBox, iSmoothing);
    dCombined = abs(dCombined) - 0.005;

    col = mix(col, c.xwy, 0.5 * smoothstep(0.001, 0., dCombined));

    if (drawBezierPoint2) {
        d = sdCircle(uv - bezier2, 0.05);
        d = abs(d) - pixelSize;
        float mixing;
        if (drawPoint2UsingStep) {
            mixing = step(d, 0.);
        } else {
            mixing = smoothstep(pixelSize, 0., d);
        }
        col = mix(col, c.xyx, mixing);
    }
}

void drawGrid(inout vec3 col, in vec2 uv, in vec3 gridColor) {
    const float gridSize = 0.5;
    const float thickness = 0.005;
    uv = mod(uv, gridSize);
    float dMin = min(uv.x, uv.y);
    float dMax = max(uv.x, uv.y);
    float frame = step(thickness, dMin) * step(dMax, gridSize - thickness);
    col = mix(gridColor, col, frame);
}

#define WEIRD_WAVES 0

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    pixelSize = 1. / iResolution.y;

    fragColor.a = 1.;

    #if WEIRD_WAVES
    uv.x += 0.02 * sin(4. * iTime - 13. * uv.y);
    #endif

    vec3 col = vec3(1); /* c.xxx; */
    drawGrid(col, uv, vec3(0.75));

    drawTheScene(col, uv);

    fragColor.rgb = col;
}
