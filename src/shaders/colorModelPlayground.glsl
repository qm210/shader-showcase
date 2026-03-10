#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float iGamma;
uniform float iContrast;
uniform float iGray;
uniform vec3 iFactor;
uniform vec2 iSqueeze;
uniform float iCutOut;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform sampler2D iTexture0;

vec4 c = vec4(1., 0., -1., .5);

const float pi = 3.14159237;
const float twoPi = 2. * pi;
const float piHalf = 0.5 * pi;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

vec3 grayscale(vec3 col) {
    // Gewichtet nach menschlichem Empfinden (Zapfen im Auge)
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    return vec3(gray);
}

vec3 rgb2hsv(vec3 col)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(col.bg, K.wz), vec4(col.gb, K.xy), step(col.b, col.g));
    vec4 q = mix(vec4(p.xyw, col.r), vec4(col.r, p.yzx), step(p.x, col.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 colHSV) {
    colHSV.x /= 360.;
    const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(colHSV.xxx + K.xyz) * 6.0 - K.www);
    return colHSV.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), colHSV.y);
}

const mat3 rgb2yiq = mat3(
0.299,  0.5959,  0.2215,
0.587, -0.2746, -0.5227,
0.114, -0.3213,  0.3112
);
vec3 rgbToYCh(vec3 rgb) {
    vec3 yiq = rgb2yiq * rgb;
    float C = length(yiq.yz);
    float h = atan(yiq.z, yiq.y);
    return vec3(yiq.x, C, h);
}
vec3 ychToRgb(float Y, float C, float h) {
    float I = C * cos(h);
    float Q = C * sin(h);
    float R = Y + 0.9469 * I + 0.6236 * Q;
    float G = Y - 0.2748 * I - 0.6357 * Q;
    float B = Y - 1.1000 * I + 1.7000 * Q;
    return clamp(vec3(R, G, B), 0.0, 1.0);
}

void applyColorEffects(inout vec3 col, in vec2 uv) {
    col *= iFactor;

    col = pow(col, vec3(iGamma));

    vec3 gray = grayscale(col);
    float radius = length(uv);
    col = mix(col, gray, iGray);
    // ÜBUNG
    // col = mix(gray, col, smoothstep(1., 0., radius));

    col = (col - 0.5) * iContrast + 0.5;

    col = clamp(col, vec3(iSqueeze.x), vec3(iSqueeze.y));
    // ... beschneidet auf [iClamp.x; iClamp.y]
    // dann neu skalieren auf [0; 1]
    col = (col - iSqueeze.x) / (iSqueeze.y - iSqueeze.x);

    // ÜBUNG
    // col = mix(col, c.yyy, step(1. - iCutOut, radius * 0.5));
}

struct polarVec2 {
    float r;   /// Radius (= Abstand vom Ursprung)
    float phi; /// Polarwinkel,
};

polarVec2 toPolar(vec2 cartesian) {
    polarVec2 p;
    p.r = length(cartesian);
    p.phi = atan(cartesian.y, cartesian.x);
    /// atan(y, x) ergibt Polarwinkel in [-pi, pi]
    return p;
}

float gauss(float x, float peak, float width) {
    x = (x - peak) / width;
    return exp(-x*x);
}

float circularGauss(float x, float peak, float width) {
    x = mod(x - peak, twoPi);
//    x = x > pi ? (x - twoPi) : x;
     x = abs(x - pi);
    x /= width;
    return exp(-x*x);
}

void drawOnTop(inout vec3 col, in vec2 uv) {
    /*
    /// wie bisher auch: Koordinatentransformation kommt zuerst
    uv.y -= 0.25;
    uv.x += 0.25 * sin(piHalf * iTime);
    uv *= 1.5;
    */
    polarVec2 polar = toPolar(uv);
    float peakAngle = mod(4. * iTime, twoPi) - piHalf;
    float widthAngle = piHalf;
    float alpha = circularGauss(polar.phi, peakAngle, widthAngle);
    float hue = fract(polar.phi / twoPi) * 360.;
    float sat = 1.; // 0.5 + 0.5 * sin(2. * iTime);
    float val = 1.;
    vec3 hsv = vec3(hue, sat, val);
    vec3 rgb = hsv2rgb(hsv);
    alpha *= gauss(polar.r, 0.7, 0.2);
    vec3 rainbow = mix(c.yyy, rgb, alpha);
    col = mix(col, rainbow, alpha);
    col = rainbow;
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    float pixelSize = 2. / iResolution.y;

    fragColor = c.yyyx;
    vec3 col, bg, col0, col1, col2;

    vec2 st = gl_FragCoord.xy / iResolution.y;
    ivec2 texSize = textureSize(iTexture0, 0);
    float texAspectRatio = float(texSize.x) / float(texSize.y);
    st.x /= texAspectRatio;
    st.y = 1. - st.y;
    col0 = texture(iTexture0, st).rgb;

    if (abs(uv.x) < pixelSize) {
        discard;
    }
    else if (uv.x < 0.) {
        fragColor.rgb = col0.rgb;
    }
    else {
        st.x -= 1.;
        col0 = texture(iTexture0, st).rgb;
        fragColor.rgb = col0.rgb;

        uv.x -= 0.5 * iResolution.x / iResolution.y;
        applyColorEffects(fragColor.rgb, uv);
        drawOnTop(fragColor.rgb, uv);
    }
}
