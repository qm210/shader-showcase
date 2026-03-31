#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 texelSize;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
uniform int iPass;
uniform sampler2D texFloofy;
uniform sampler2D texInput;
uniform bool alternativeImage;
uniform sampler2D texPrevious;
uniform sampler2D texBloom;
uniform bool compareOriginal;

uniform int iBlurSamples;
uniform float iBlurPixels;
uniform float iBlurGaussWidth;
uniform bool enableBlurDithering;
uniform float iBlurDithering;
uniform bool showOnlyDithered;
uniform bool useBloomFilterInsteadOfBlur;
uniform bool showOnlyBloom;
uniform float iBloomIntensity;
uniform float iBloomThreshold;

uniform bool useReinhardMapping;
uniform bool useACESMapping;
uniform bool useHableMapping;
uniform float iToneMapExposure;
uniform float iGamma;

uniform float iHueShift;
uniform float iSaturationGrading;
uniform float iCutValueMin;
uniform float iCutValueMax;
uniform float iChrAberrStrength;
uniform float iChrAberrRadialShape;
uniform float iNoise;
uniform float iNoiseScale;
uniform bool animateNoise;
uniform float iScanLineScale;
uniform float iScanLineGrading;
uniform float iPhosphorGlowing;
uniform bool showBarrelDistortion;
uniform float iBarrelDistortion;
uniform float iBarrelDistortionExponent;
uniform bool showVignette;
uniform float iVignetteOuter;
uniform float iVignetteInner;
uniform float iEdgeMaskMix;
uniform float iEdgeMaskMin;
uniform float iEdgeMaskMax;
uniform float iToonLevels;
uniform float iToonEffect;
uniform float iToonEdges;

uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform float iFree5;
uniform float iFree6;
uniform float iFree7;
uniform float iFree8;
uniform vec3 vecFree0;
uniform vec3 vecFree1;
uniform vec3 vecFree2;

const float pi = 3.1415923;
const float twoPi = 2. * pi;

const vec4 c = vec4(1., 0., -1., .5);

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
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
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

const vec3 lumaBT601 = vec3(0.299, 0.587, 0.114);
const vec3 lumaBT709 = vec3(0.2126, 0.7152, 0.0722);

vec4 drawWithChromaticAberration(sampler2D sampler, in vec2 st) {
    vec2 stCentered = st - 0.5;
    float r = length(stCentered);
    float amount = iChrAberrStrength * pow(r, iChrAberrRadialShape);
    vec2 shift = amount * stCentered;

    vec4 col = c.yyyx;
    col.r = texture(sampler, st + shift).r;
    col.g = texture(sampler, st).g;
    col.b = texture(sampler, st - shift).b;
    return col;
}

void applyPhosphorGlow(inout vec3 col) {
    const vec3 phosphorGreen = vec3(0.1, 0.4, 0.1);
    float luminosity = dot(col, lumaBT601);
    luminosity *= iPhosphorGlowing;
    col *= (1. + phosphorGreen * luminosity);
}

vec3 filmic(vec3 col, float a, float b, float c, float d, float e) {
    return (col * (a * col + b))
        / (col * (c * col + d) + e);
}

void applyToneMapping_FilmicACES(inout vec3 col) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    col *= iToneMapExposure;
    col = filmic(col, a, b, c, d, e);
}

vec3 hable(vec3 col) {
    const float a = 0.15;
    const float b = 0.50;
    const float c = 0.10;
    const float d = 0.20;
    const float e = 0.02;
    const float f = 0.30;
    return (
        (col * (a * col + c * b) + d * e)
        / (col * (a * col + b) + d * f)
    ) - e / f;
}

void applyToneMapping_HableUncharted2(inout vec3 col) {
    col *= iToneMapExposure;
    col = hable(col);
    vec3 white = hable(vec3(11.2));
    col /= white;
}

void applyToneMappingAndGamma(inout vec3 col) {
    /// Comparison of Tone Mapping Curves (Reinhard, ACES, Hable)
    // https://graphtoy.com/?f1(x,t)=x%20/%20(1%20+%20x)&v1=true&f2(x,t)=(x%20*%20(2.51%20*%20x%20+%200.03))%20/%20(x%20*%20(2.43%20*%20x%20+%200.59)%20+%200.14)&v2=true&f3(x,t)=(x%20*%20(0.15%20*%20x%20+%200.5*0.1)%20+%200.2*0.02)%20/%20(x%20*%20(0.15%20*%20x%20+%200.5)%20+%200.2*0.3)%20-%200.02/0.3&v3=true&f4(x,t)=&v4=true&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=1.807181496351828,0.979521495144816,2.611549629481785
    if (useReinhardMapping) {
        col *= iToneMapExposure;
        col *= 1. / (1. + col);
    } else if (useACESMapping) {
        applyToneMapping_FilmicACES(col.rgb);
    } else if (useHableMapping) {
        applyToneMapping_HableUncharted2(col.rgb);
    }
    // ... oder was ganz eigenes? (z.B. filmic(...) mit eigenen uniforms?)

    col.rgb = pow(col.rgb, vec3(1./iGamma));
}

float lumi(vec3 col) {
    return dot(col, lumaBT709);
}

vec3 bloomColor(vec3 col) {
    float luminosity = lumi(col);
    float weight = smoothstep(iBloomThreshold, 1.0, luminosity);
    return col * weight;
}

vec4 drawWithBlur(sampler2D sampler, in vec2 st, int kernel, float distance, float gaussWidth) {
    if (iBlurSamples < 1) {
        return texture(sampler, st);
    }
    float halfSamples = float(kernel) * 0.5;
    float blurOffset = distance * texelSize.y;
    float gaussExponent = 2. / (blurOffset * blurOffset * gaussWidth * gaussWidth);

    // THINK: Dithering? -> 5b_multipassProcessing.glsl

    float weightSum  = 0.0;
    vec4 colSum = c.yyyy;
    vec4 col;
    for (float dx = -halfSamples; dx <= halfSamples; dx += 1.) {
        for (float dy = -halfSamples; dy <= halfSamples; dy += 1.) {

            vec2 delta = vec2(dx, dy) * blurOffset / halfSamples;

            // THINK: Dithering? -> 5b_multipassProcessing.glsl

            float weight = exp(-gaussExponent * dot(delta, delta));
            weightSum += weight;

            col = texture(sampler, st + delta);
            colSum += col * weight;
        }
    }
    return colSum / weightSum;
}

vec4 drawWithBlur(sampler2D sampler, in vec2 st) {
    return drawWithBlur(sampler, st, iBlurSamples, iBlurPixels, iBlurGaussWidth);
}

vec4 drawBoxBlur(sampler2D sampler, in vec2 st) {
    vec4 col = c.yyyy;
    float weightSum = 0.;
    /// uniform int iBlurSamples;
    /// uniform float iBlurPixels;
    /// iBlurGaussWidth
    for (int s = -iBlurSamples/2; s <= iBlurSamples/2; s++) {
        float delta = float(s) * texelSize.x * iBlurPixels;
        float weight = exp(-delta*delta/iBlurGaussWidth/iBlurGaussWidth);
        col += weight * texture(sampler, st + vec2(delta, 0.));
        weightSum += weight;
    }
    return col / weightSum;
}

bool outsideRange(in vec2 st) {
    return min(st.x, st.y) < 0. || max(st.x, st.y) > 1.;
}

vec4 drawImageTexture(sampler2D sampler, in vec2 st, bool letterboxed) {
    vec2 texSize = vec2(textureSize(sampler, 0));
    float texAspect = texSize.x / texSize.y;
    float screenAspect = iResolution.x / iResolution.y;
    st.x /= texAspect;

    // TROUBLESHOOTING
    st.x *= texAspect / screenAspect;
    letterboxed = false;
    if (letterboxed) {
        if (screenAspect > texAspect) {
            st.x -= 0.25 * texAspect / screenAspect;
        } else if (screenAspect < texAspect) {
            // TODO: don't care right nwo
        }
        if (outsideRange(st)) {
            return c.yyyx;
        }
    }
    return texture(sampler, st);
}

vec4 drawBaseImage() {
    vec2 st = gl_FragCoord.xy / iResolution.y;
    st.y = 1. - st.y;
    if (alternativeImage) {
        return drawImageTexture(texFloofy, st, false);
    } else {
        return drawImageTexture(texInput, st, true);
    }
}

vec4 drawTextureBarrelDistorted(sampler2D sampler, in vec2 st) {
    vec2 p = st * 2. - 1.;
    float r = length(p);
    p *= 1. + iBarrelDistortion * pow(r, iBarrelDistortionExponent);
    st = p * 0.5 + 0.5;
    if (outsideRange(st)) {
        return c.yyyx;
    }
    return texture(sampler, st);
}

void applySomeHSVTransformations(inout vec4 col, in vec2 st) {
    vec3 hsv = rgb2hsv(col.rgb);
    hsv.x += iHueShift;
    hsv.y = pow(hsv.y, iSaturationGrading);
    hsv.z = smoothstep(iCutValueMin, iCutValueMax, hsv.z);
    col.rgb = hsv2rgb(hsv);
}

void applyRetroNoise(inout vec4 col, in vec2 st, in vec2 uv) {
    float flicker = animateNoise ? iTime : 0.;
    float noise = 1.;
//    noise = hash12(iNoiseScale * uv, flicker);
//    noise = perlin2D(iNoiseScale * uv, flicker);
    noise = stackedPerlin2D(iNoiseScale * uv, flicker);
    col.rgb += iNoise * (noise - 0.5);
    float scanlines = 0.8 + 0.2 * cos(iScanLineScale * iResolution.y * uv.y);
    scanlines = pow(scanlines, iScanLineGrading);
    col.rgb *= scanlines;

    col = clamp(col, 0., 1.);
}

vec2 pxTexPrevious;

vec3 readPrevious(vec2 st, vec2 pxOffset) {
    // ! must be known globally !
    // vec2 pxTexPrevious = 1. / vec2(textureSize(texPrevious, 0));
    st += pxOffset * pxTexPrevious;
    return texture(texPrevious, st).rgb;
}

void applyVideoProcessing(inout vec3 col, in vec2 st, in vec2 uv) {
    // SOBEL EDGE DETECTION
    float lumTL = lumi(readPrevious(st, c.zx));
    float lumTC = lumi(readPrevious(st, c.yx));
    float lumTR = lumi(readPrevious(st, c.xx));
    float lumML = lumi(readPrevious(st, c.zy));
    float lumMR = lumi(readPrevious(st, c.xy));
    float lumBL = lumi(readPrevious(st, c.zz));
    float lumBC = lumi(readPrevious(st, c.yz));
    float lumBR = lumi(readPrevious(st, c.xz));
    float gX = -lumTL - 2. * lumML - lumBL + lumTR + 2. * lumMR + lumBR;
    float gY = -lumBL - 2. * lumBC - lumBR + lumTL + 2. * lumTC + lumTR;
    float gradient = length(vec2(gX, gY));
    float edgeMask = smoothstep(iEdgeMaskMin, iEdgeMaskMax, gradient);
    col = mix(col, c.yyy, iEdgeMaskMix * edgeMask);
    
    // TOON (REDUCING PALETTE)
    float luma = dot(col, lumaBT709);
    float toonQ = floor(luma * iToonLevels) / (iToonLevels - 1.);
    vec3 toon = normalize(col + 1.e-5) * toonQ;
    toon *= 1. - iToonEdges * edgeMask;
    col = mix(col, toon, iToonEffect);
}

void applyVignette(inout vec3 col, in vec2 st) {
    if (!showVignette) {
        return;
    }
    float r = length(2. * st - 1.);
    float vignette = smoothstep(iVignetteOuter, iVignetteInner, r);
    col *= vignette;
}

vec3 filmicToneMap(vec3 col, float a, float b, float c, float d, float e) {
    return (col * (a * col + b))
    / (col * (c * col + d) + e);
}

void applyACESToneMap(inout vec3 col) {
    float a = 2.51 * (1. + vecFree1.x);
    float b = 0.03 * (1. + vecFree1.y);
    float c = 2.43 * (1. + vecFree1.z);
    float d = 0.59 * (1. + vecFree2.x);
    float e = 0.14 * (1. + vecFree2.y);
    float exposure = (1. + vecFree2.z);
    col *= exposure;
    col = filmicToneMap(col, a, b, c, d, e);
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    if (iPass == 0) {
        fragColor = drawBaseImage();
        return;
    }

    if (compareOriginal) {
        if (abs(uv.x) <= texelSize.x) {
            discard;
        }
        if (uv.x < 0.) {
            fragColor = texture(texPrevious, st);
            return;
        }
    }

    pxTexPrevious = 1. / vec2(textureSize(texPrevious, 0));

    switch (iPass) {
        case 1: {
            fragColor = drawWithBlur(texPrevious, st);
            // applySomeHSVTransformations(fragColor, st);
            return;
        } case 2:
            fragColor = texture(texPrevious, st);
            applyVideoProcessing(fragColor.rgb, st, uv);
            // IDEE: Temporal stabilization -- blur?
            /*
            fragColor.rgb = 0.5 * texture(texPrevious, st).rgb;
            fragColor.rgb += 0.25 * texture(texPrevious, st + shift).rgb;
            fragColor.rgb += 0.25 * texture(texPrevious, st - shift).rgb;
            */
            // fragColor = drawWithRadialBlur(texPrevious, st);
            return;
        case 3: {
            // Unscharf Maskieren
            vec3 orig = readPrevious(st, c.yy);
            vec3 L = readPrevious(st, c.zy);
            vec3 R = readPrevious(st, c.xy);
            vec3 T = readPrevious(st, c.yz);
            vec3 B = readPrevious(st, c.yx);
            vec3 blur = (L + R + T + B - orig) / 5.;
            vec3 col = orig + iFree0 * (orig - blur);

            // sample and crush darks/midtones
            float luma = lumi(col);
            float crush = iFree3; // 0.75 + 0.25 * sin(iTime * 0.1);
            luma = pow(luma, 1.0 / crush);
            luma = smoothstep(0.0, 0.15 + iFree4, luma);
            vec3 crushed = col * luma;
            col = mix(col, crushed, iFree2);

            fragColor.rgb = col;
            return;
        }
        case 4: {
            // Check Reference in 5b_ for Bloom, but this seems slightly different?
            vec3 sum = vec3(0.0);
            float wsum = 0.0;
            float nBloom = 10. * (1. + iFree6);
            // ALSO: might tune bright and weight
            for (float y = -nBloom; y <= nBloom; y += 1.) {
                for (float x = -nBloom; x <= nBloom; x += 1.) {
                    vec2 off = vec2(x, y);
                    vec3 col = readPrevious(st, off);
                    float luma = lumi(col);
                    float bright = smoothstep(0.65 + iFree5, 1.0, luma);
                    float weight = 1.0 / (1.0 + dot(off, off));
                    sum += col * bright * weight;
                    wsum += weight;
                }
            }
            vec3 bloom = sum / max(wsum, 1e-5);
            fragColor = vec4(bloom, 1.);
            return;
        }
        case 5: {
            vec3 prev = readPrevious(st, c.yy);
            vec3 bloom = texture(texBloom, st).rgb;

            vec3 col = prev;
            vec3 dark = col * 0.35;
            dark = pow(dark, vec3(1.2 + iFree8));
            col = dark + bloom * 1.8;
            col *= (c.xxx + 0.5 * vecFree0);
            col = mix(prev, col, iFree7);

            // Tone Mapping & Gamma
            applyACESToneMap(col);
            col = clamp(col, 0., 1.);
            col = pow(col, vec3(1. + iFree1));

            applyVignette(col, st);

            fragColor.rgb = col;
            fragColor.a = 1.;
            return;
        }
    }
}
