#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 texelSize;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
uniform int iPass;
uniform sampler2D texFloofy;
uniform sampler2D texWindow;
uniform sampler2D texPrevious;

uniform float iNoiseFreq;
uniform float iNoiseLevel;
uniform float iNoiseOffset;
uniform int iFractionalOctaves;
uniform float iFractionalScale;
uniform float iFractionalDecay;
uniform float iCloudMorph;
uniform float iCloudVelX;
uniform float iCloudVelY;
uniform vec3 iFree0;
uniform vec3 iFree1;
uniform vec3 iFree2;

const float pi = 3.1415923;
const float twoPi = 2. * pi;

const vec4 c = vec4(1., 0., -1., .5);

mat2 rot2D(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(
        c, -s,
        s,  c
    );
}

mat3 rotY(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
        c, 0.0,  -s,
        0.0, 1.0, 0.0,
        s, 0.0,   c
    );
}

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

float sdBox( vec3 p, vec3 b )
{
    vec3 d = abs(p) - b;
    return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

vec3 mightBeCloudNoise(vec3 ray, float t) {
    return c.yyy; // just some white, gotta start somewhere :D
}


void applyGrid(inout vec3 col, in vec2 uv, float gridStep) {
    uv = mod(uv, gridStep);
    // <-- verallgemeinert fract(x) == mod(x, 1.)
    float dMin = min(uv.x, uv.y);
    // >> step(edge, x) = "0 if x <= edge else 1"
    // >> step(x, a) = 1. - step(a, x)
    // col *= 1. - 0.1 * (step(dMin, 0.002));
    col *= 1. - 0.05 * (1. - smoothstep(0., 0.01, dMin));
    // >> step(edge, x) vs. smootshstep(0.0025, 0.0015, dMin);
    // col *= 1. - 0.1 * (smoothstep(dMin, 0.002));
}
float hash11(float n) {
    return fract(sin(n) * 43758.5453123);
}

float hash12(vec2 p, float seed) {
    p = vec2(dot(p, vec2(127.1, 311.7)) + seed * 17.3, seed * 23.7);
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

vec2 hash22(vec2 p, float seed)
{
    p = p*mat2(127.1,311.7,269.5,183.3);
    p = -1.0 + 2.0 * fract(sin(p + seed)*43758.5453123);
    return sin(p*6.283);
}

float perlin1D(float x) {
    float i = floor(x);
    float f = fract(x);
    float g0 = hash11(i) * 2.0 - 1.0;
    float g1 = hash11(i + 1.0) * 2.0 - 1.0;
    float d0 = g0 * f;
    float d1 = g1 * (f - 1.0);
    float u = smoothstep(0., 1., f);
    return mix(d0, d1, u);
}

float perlin2D(vec2 p)
{
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = pf * pf * (3. - 2. * pf);

    float f00 = dot(hash22(pi+c.yy, 0.), pf-vec2(.0,.0));
    float f01 = dot(hash22(pi+c.yx, 0.), pf-vec2(.0,1.));
    float f10 = dot(hash22(pi+c.xy, 0.), pf-vec2(1.0,0.));
    float f11 = dot(hash22(pi+c.xx, 0.), pf-vec2(1.0,1.));

    float xm1 = mix(f00,f10,w.x);
    float xm2 = mix(f01,f11,w.x);
    float ym = mix(xm1,xm2,w.y);
    return ym;
}

float perlin2D(vec2 p, float seed) {
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = smoothstep(0., 1., pf);

    float f00 = hash12(pi + c.yy, seed);
    float f01 = hash12(pi + c.yx, seed);
    float f10 = hash12(pi + c.xy, seed);
    float f11 = hash12(pi + c.xx, seed);

    float xm1 = mix(f00, f10, w.x);
    float xm2 = mix(f01, f11, w.x);
    return mix(xm1, xm2, w.y);
}

float fractionalNoiseSum(vec2 p) {
    p *= 4.;
    float a = 1., r = 0., s = 0., noise;
    for (int i=0; i < iFractionalOctaves; i++) {
        noise = perlin2D(p * iNoiseFreq);
        r += a * noise;
        s += a;
        p *= iFractionalScale;
        a *= iFractionalDecay;
    }
    return r/s;
}
// interesting modifications possible,
// e.g. see "marble", ... at https://www.shadertoy.com/view/Md3SzB

vec3 gradientNoise(vec2 p) {
    p *= 2.;
    vec3 col = vec3(fractionalNoiseSum(p));
    // brighten up
    return 0.5 + 0.5 * col;
}

float stackedPerlin2D(vec2 uv, float seed) {
    float n = 0.0;
    float scale = 1.;
    n += perlin2D(uv * scale, seed) * 0.5;
    scale *= 2.;
    n += perlin2D(uv * scale, 2.0 + seed * 1.31) * 0.25;
    scale *= 2.;
    n += perlin2D(uv * scale, 4.0 + seed * 2.18) * 0.125;

    n = 0.5 + 0.5 * n;
    return n;
}

vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz),
    vec4(c.gb, K.xy),
    step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r),
    vec4(c.r, p.yzx),
    step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(
        abs(q.z + (q.w - q.y) / (6.0 * d + e)),
        d / (q.x + e),
        q.x
    );
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 drawImageTexture(sampler2D sampler) {
    vec2 st = gl_FragCoord.xy / iResolution.y;
    vec2 texSize = vec2(textureSize(sampler, 0));
    st.x /= texSize.x / texSize.y;
    st.y = 1. - st.y;
    return texture(sampler, st);
}

vec4 drawTextureBarrelDistorted(sampler2D sampler, in vec2 st) {
    vec2 p = st * 2. - 1.;
    float r2 = dot(p, p);
    float k = 0.2;
    p *= 1. + k * r2;
    st = p * 0.5 + 0.5;
    if (min(st.x, st.y) < 0. || max(st.x, st.y) > 1.) {
        return c.yyyx;
    }
    return texture(sampler, st);
}

void applyPass1(inout vec4 col, in vec2 st) {
    vec3 hsv = rgb2hsv(col.rgb);
    hsv.y = pow(hsv.y, 1.8);
    hsv.z = smoothstep(0., 1., hsv.z);
    col.rgb = hsv2rgb(hsv);
}

void applyPass2(inout vec4 col, in vec2 st, in vec2 uv) {
    const float scale = 64.;
    float noise = 1.;
    float flicker = 0.1 * iTime;
//    noise = hash12(scale * uv, flicker);
//    noise = perlin2D(scale * uv, flicker);
    noise = stackedPerlin2D(scale * uv, flicker);
    col.rgb += noise - 0.5;

    float scanlines = 0.8 + 0.2 * cos(0.5 * iResolution.y * uv.y);
    scanlines = pow(scanlines, 2.4);
    col.rgb *= scanlines;

    col = clamp(col, 0., 1.);
}

void applyFinalPass(inout vec4 col, in vec2 st) {
    float r = length(2. * st - 1.);
    float vignette = smoothstep(1.3, 0.8, r);
    col.rgb *= vignette;
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    switch (iPass) {
        case 0:
            fragColor = drawImageTexture(texFloofy);
            break;
        case 1:
            fragColor = texture(texPrevious, st);
            applyPass1(fragColor, st);
            break;
        case 2:
            fragColor = texture(texPrevious, st);
            applyPass2(fragColor, st, uv);
            break;
        case 3:
            fragColor = drawTextureBarrelDistorted(texPrevious, st);
            applyFinalPass(fragColor, st);
            fragColor.a = 1.;
            break;
        default:
            fragColor = c.xyxx;
            break;
    }
}
