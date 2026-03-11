#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float iGamma;
uniform float iContrast;
uniform float iGray;
uniform vec3 iFactor;
uniform vec2 iSqueezeLeft;
uniform vec2 iSqueezeRight;
uniform bool blendMixHalf;
uniform bool blendMixByLumi;
uniform bool blendMultiply;
uniform bool blendMinimum;
uniform bool blendMaximum;
uniform bool blendScreen;
uniform bool blendOverlay;
uniform bool blendAdditive;
uniform bool blendSoftLight;
uniform bool useColorfulRight;
uniform bool drawSwirlRight;
uniform bool decodeSRGB;
uniform bool compareDecodeSRGB;

uniform float iLightnessFactor;
uniform float iLightnessShift;
uniform float iChromaFactor;
uniform float iChromaShift;
uniform float iHueFactor;
uniform float iHueShift;
uniform bool transformHSV;
uniform bool transformHSL;
uniform bool transformYCh;
uniform bool transformOKLCh;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform sampler2D iTexture0;
uniform sampler2D iTexture1;

const vec4 c = vec4(1., 0., -1., .5);

const float pi = 3.14159237;
const float twoPi = 2. * pi;
const float piHalf = 0.5 * pi;
const float eps = 1.e-8;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

float luminosity(vec3 col) {
    // Gewichtet nach menschlichem Empfinden (Zapfen im Auge)
    return dot(col, vec3(0.299, 0.587, 0.114));
}

float mixHueNormalized(float hue1, float hue2, float ratio) {
    // gedacht wie mix(a, b, x) aber in die richtige Richtung beim Farbton
    // hier normiert auf [0, 1]-Farbkreis
    float delta = fract(hue2 - hue1 + 0.5) - 0.5;
    return fract(hue1 + delta * ratio);
}

float mixHue360(float hue1, float hue2, float ratio) {
    return 360. * mixHueNormalized(hue1 / 360., hue2 / 360., ratio);
}

float mixHueTwoPi(float hue1, float hue2, float ratio) {
    return twoPi * mixHueNormalized(hue1 / twoPi, hue2 / twoPi, ratio);
}

//// HSV

vec3 rgb2hsv(vec3 col)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(col.bg, K.wz), vec4(col.gb, K.xy), step(col.b, col.g));
    vec4 q = mix(vec4(p.xyw, col.r), vec4(col.r, p.yzx), step(p.x, col.r));
    float d = q.x - min(q.w, q.y);
    float H = abs(q.z + (q.w - q.y) / (6.0 * d + eps)) * 360.;
    return vec3(H, d / (q.x + eps), q.x);
}

vec3 hsv2rgb(vec3 colHSV) {
    colHSV.x /= 360.;
    const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(colHSV.xxx + K.xyz) * 6.0 - K.www);
    return colHSV.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), colHSV.y);
}

//// HSL

vec3 hsl2rgb(in vec3 col) {
    vec3 rgb = clamp( abs(mod(col.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );
    return col.z + col.y * (rgb-0.5)*(1.0-abs(2.0*col.z-1.0));
}

vec3 hueShift(in vec3 col, in float shift) {
    vec3 P = vec3(0.55735)*dot(vec3(0.55735),col);
    vec3 U = col-P;
    vec3 V = cross(vec3(0.55735),U);
    col = U*cos(shift*6.2832) + V*sin(shift*6.2832) + P;
    return vec3(col);
}

vec3 rgb2hsl(in vec3 col) {
    float minc = min( col.r, min(col.g, col.b) );
    float maxc = max( col.r, max(col.g, col.b) );
    vec3  mask = step(col.grr,col.rgb) * step(col.bbg,col.rgb);
    vec3 h = mask * (vec3(0.0,2.0,4.0) + (col.gbr-col.brg)/(maxc-minc + eps)) / 6.0;
    return vec3(fract( 1.0 + h.x + h.y + h.z ),              // H
    (maxc-minc)/(1.0-abs(minc+maxc-1.0) + eps),  // S
    (minc+maxc)*0.5 );                           // L
}

struct LCh {
    float luma;   // Wahrgenommene Helligkeit (unabhängig des Farbtons)
    float chroma; // Dichte an Farbpigmente (ähnlich Sättigung, aber luma-unabhängig)
    float hue;    // Farbton ähnlich Hue bei HSV/HSL, aber nichtlinear skaliert
};

LCh mixLCh(LCh lch1, LCh lch2, float t) {
    return LCh(
        mix(lch1.luma, lch2.luma, t),
        mix(lch1.chroma, lch2.chroma, t),
        mixHueTwoPi(lch1.hue, lch2.hue, t)
    );
}

//// YIQ

const mat3 rgb2yiq = mat3(
    0.299,  0.5959,  0.2215,
    0.587, -0.2746, -0.5227,
    0.114, -0.3213,  0.3112
);

LCh rgbToYCh(vec3 rgb) {
    vec3 yiq = rgb2yiq * rgb;
    float C = length(yiq.yz);
    float h = atan(yiq.z, yiq.y);
    return LCh(yiq.x, C, h);
}

vec3 ychToRgb(LCh ych) {
    float Y = ych.luma;
    float I = ych.chroma * cos(ych.hue);
    float Q = ych.chroma * sin(ych.hue);
    float R = Y + 0.9469 * I + 0.6236 * Q;
    float G = Y - 0.2748 * I - 0.6357 * Q;
    float B = Y - 1.1000 * I + 1.7000 * Q;
    return clamp(vec3(R, G, B), 0.0, 1.0);
}

// Linear RGB <-> sRGB

vec3 srgb2linear(vec3 col) {
    return mix(
        col / 12.92,
        pow((col + 0.055) / 1.055, vec3(2.4)),
        step(0.04045, col)
    );
}

vec3 linear2srgb(vec3 col) {
    return mix(
        col * 12.92,
        1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055,
        step(0.0031308, col)
    );
}

// Tiefergreifende Farbmodelle -- siehe auch:
// - http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
// - OKLab: https://bottosson.github.io/posts/oklab/

const mat3 Msrgb = mat3(
        0.4124564, 0.2126729, 0.0193339,
        0.3575761, 0.7151522, 0.1191920,
        0.1804375, 0.0721750, 0.9503041
    ), M1 = mat3(
        0.8189330101, 0.0329845436, 0.0482003018,
        0.3618667424, 0.9293118715, 0.2643662691,
        -0.1288597137, 0.0361456387, 0.6338517070
    ), M2 = mat3(
        0.2104542553, 1.9779984951, 0.0259040371,
        0.7936177850, -2.4285922050, 0.7827717662,
        -0.0040720468, 0.4505937099, -0.8086757660
    );

vec3 rgb2xyz_srgb(vec3 rgb) {
    return Msrgb * rgb;
}

vec3 xyz2rgb_srgb(vec3 xyz) {
    return inverse(Msrgb) * xyz;
}

vec3 xyz2oklab(vec3 xyz) {
    return M2 * pow(M1 * xyz, c.xxx/3.);
}

vec3 oklab2xyz(vec3 lab) {
    return inverse(M1) * pow(inverse(M2) * lab, 3.*c.xxx);
}

LCh oklab2oklch(vec3 lab) {
    return LCh(lab.x, length(lab.yz), atan(lab.z, lab.y));
}

vec3 oklch2oklab(LCh lch) {
    return vec3(lch.luma, lch.chroma * vec2(cos(lch.hue), sin(lch.hue)));
}

vec3 rgb2oklab(vec3 rgb) {
    return xyz2oklab(rgb2xyz_srgb(rgb));
}

vec3 oklab2rgb(vec3 oklab) {
    return xyz2rgb_srgb(oklab2xyz(oklab));
}

LCh rgb2oklch(vec3 rgb) {
    return oklab2oklch(xyz2oklab(rgb2xyz_srgb(rgb)));
}
vec3 oklch2rgb(LCh lch) {
    return xyz2rgb_srgb(oklab2xyz(oklch2oklab(lch)));
}

void applyRgbColorEffects(inout vec3 col, in vec2 uv) {
    col *= iFactor;

    col = pow(col, vec3(iGamma));

    vec3 gray = vec3(luminosity(col));

    float radius = length(uv);
    col = mix(col, gray, iGray);
    // ÜBUNG
    // col = mix(gray, col, smoothstep(1., 0., radius));

    col = (col - 0.5) * iContrast + 0.5;

    col = clamp(col, vec3(iSqueezeRight.x), vec3(iSqueezeRight.y));
    // ... beschneidet auf [iSqueeze.x; iSqueeze.y]
    // dann neu skalieren auf [0; 1]
    col = (col - iSqueezeRight.x) / (iSqueezeRight.y - iSqueezeRight.x);
}

void transformInOtherColorModels(inout vec3 col, in vec2 uv) {
    if (transformHSV) {
        vec3 hsv = rgb2hsv(col);
        hsv.z = iLightnessFactor * hsv.z + iLightnessShift;
        hsv.y = iChromaFactor * hsv.y + iChromaShift;
        hsv.x = fract(iHueFactor * hsv.x / 360. + iHueShift) * 360.;
        col = hsv2rgb(hsv);
    }
    else if (transformHSL) {
        vec3 hsl = rgb2hsl(col);
        hsl.z = iLightnessFactor * hsl.z + iLightnessShift;
        hsl.y = iChromaFactor * hsl.y + iChromaShift;
        hsl.x = fract(iHueFactor * hsl.x / 360. + iHueShift) * 360.;
        col = hsl2rgb(hsl);
    }
    else if (transformYCh) {
        LCh ych = rgbToYCh(col);
        ych.luma = iLightnessFactor * ych.luma + iLightnessShift;
        ych.chroma = iChromaFactor * ych.chroma + iChromaShift;
        ych.hue = fract(iHueFactor * ych.hue / twoPi + iHueShift) * twoPi;
        col = ychToRgb(ych);
    }
    else if (transformOKLCh) {
        LCh oklch = rgb2oklch(col);
        oklch.hue = fract(iHueFactor * oklch.hue / twoPi + iHueShift) * twoPi;
        oklch.chroma = iChromaFactor * oklch.chroma + iChromaShift;
        oklch.luma = iLightnessFactor * oklch.luma + iLightnessShift;
        col = oklch2rgb(oklch);
    }
}

struct polarCoord {
    float r;   /// Radius (= Abstand vom Ursprung)
    float phi; /// Polarwinkel,
};

polarCoord toPolar(vec2 cartesian) {
    polarCoord p;
    p.r = length(cartesian);
    p.phi = atan(cartesian.y, cartesian.x);
    /// atan(y, x) ergibt Polarwinkel in [-pi, pi]
    return p;
}

float gauss(float x, float peak, float width) {
    x = (x - peak) / width;
    return exp(-x*x);
}

float polarWrapped(float x) {
    x = mod(x, twoPi);
    return x > pi ? (x - twoPi) : x;
    // ginge auch:
    return abs(x - pi);
}

float periodicGauss(float x, float peak, float width) {
    x = polarWrapped(x - peak);
    return gauss(x, 0., width);
}

vec3 drawSwirl(in vec2 uv, bool colorful) {
    polarCoord polar = toPolar(uv);
    float peakAngle = mod(4. * iTime, twoPi) - piHalf;
    float widthAngle = piHalf;

    const float spiraling = 4.;
    polar.phi += spiraling * polar.r;

    float value = periodicGauss(polar.phi, peakAngle, widthAngle);
    vec3 hsv = vec3(0., 0., value);
    // alpha = gauss(polar.r, 0.7, 0.4);
    if (colorful) {
        hsv.y = 0.5 - 0.5 * cos(1.5 * iTime);
        hsv.x = 180. - 180. * cos(polar.r - 2. * iTime);
    }
    return vec3(hsv2rgb(hsv));
}

void applyTextureBlending(out vec3 col, in vec3 col0, in vec3 col1, bool asSRGB) {
    if (asSRGB) {
        col0 = srgb2linear(col0);
        col1 = srgb2linear(col1);
    }
    col = col0;

    if (blendMixHalf) {
        // Mix Half -- Distance Fog
        col = mix(col0, col1, 0.5);
    }
    else if (blendMixByLumi) {
        // Luminosity-Based Mix
        float lum1 = luminosity(col1);
        col = mix(col0, col1, lum1);
    }
    else if (blendMultiply) {
        // Multiply -- Shading
        col = col0 * col1;
    }
    else if (blendMinimum) {
        // Minimum
        col = min(col0, col1);
    }
    else if (blendMaximum) {
        // Maximum
        col = max(col0, col1);
    }
    else if (blendScreen) {
        // Screen
        col = (1. - (1. - col0) * (1. - col1));
    }
    else if (blendOverlay) {
        // Overlay
        col = length(col0) < 0.5
            ? 2. * col0 * col1
            : 1. - 2. * (1. - col0) * (1. - col1);
    }
    else if (blendAdditive) {
        // Linear Dodge (Additive) -- e.g. Glow
        col = min(col0 + col1, 1.);
    }
    else if (blendSoftLight) {
        // Soft Light
        col = col0 - col1 + 2. * col0 * col1;
    }
    /// ... invent your own?

    if (asSRGB) {
        col = linear2srgb(col);
    }
}

void applyEffects(inout vec3 col, vec2 uv, bool decodeSRGB) {
    if (decodeSRGB) {
        col = srgb2linear(col);
    }

    applyRgbColorEffects(col, uv);
    transformInOtherColorModels(col, uv);

    if (decodeSRGB) {
        col = linear2srgb(col);
    }
}

vec3 squeezeRange(vec3 col, float lower, float upper) {
    col = clamp(col, vec3(lower), vec3(upper));
    col = (col - lower) / (upper - lower);
    return col;
}

vec3 imageLeft(in vec2 st) {
    vec3 col = texture(iTexture0, st).rgb;
    col = squeezeRange(col, iSqueezeLeft.x, iSqueezeLeft.y);
    return col;
}

vec3 imageRight(in vec2 st) {
    vec3 col = texture(iTexture1, st).rgb;
    if (drawSwirlRight) {
        col = drawSwirl(2. * st - 1., useColorfulRight);
    } else if (!useColorfulRight) {
        col = vec3(luminosity(col));
    }
    col = squeezeRange(col, iSqueezeRight.x, iSqueezeRight.y);
    return col;
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    float pixelSize = 2. / iResolution.y;

    fragColor = c.yyyx;
    vec3 col, bg;

    vec2 st = gl_FragCoord.xy / iResolution.y;
    ivec2 texSize = textureSize(iTexture0, 0);
    float texAspectRatio = float(texSize.x) / float(texSize.y);
    st.x /= texAspectRatio;
    st.y = 1. - st.y;

    if (abs(uv.x) < 0.6) {
        st.x -= 0.5;
        vec3 col0 = imageLeft(st);
        vec3 col1 = imageRight(st);

        bool asSRGB = decodeSRGB;
        if (compareDecodeSRGB) {
            asSRGB = uv.x > 0.;
        }

        applyTextureBlending(fragColor.rgb, col0, col1, asSRGB);
    }
    else if (uv.x < -.6 - pixelSize) {
        st.x += 0.18;
        fragColor.rgb = imageLeft(st);
    }
    else if (uv.x > 0.6 + pixelSize) {
        st.x -= 1.15;
        fragColor.rgb = imageRight(st);
    }
    else {
        discard;
    }
}
