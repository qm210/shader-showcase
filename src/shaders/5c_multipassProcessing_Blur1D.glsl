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
uniform bool alternativeImage;
uniform sampler2D texPrevious;
uniform bool compareOriginal;

uniform int iBlurSamples;
uniform float iBlurPixels;
uniform float iBlurGaussWidth;
uniform bool useTwo1DBlursInsteadOfOne2D;
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

uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
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

vec3 bloomColor(vec3 col) {
    float luminosity = dot(col, lumaBT709);
    float weight = smoothstep(iBloomThreshold, 1.0, luminosity);
    return col * weight;
}

vec4 drawWithBlur2D(sampler2D sampler, in vec2 st) {
    if (iBlurSamples < 1) {
        return texture(sampler, st);
    }
    float halfSamples = float(iBlurSamples) * 0.5;
    float blurOffset = iBlurPixels * texelSize.y;
    float gaussExponent = 2. / (blurOffset * blurOffset * iBlurGaussWidth * iBlurGaussWidth);
    vec2 dithering = iBlurDithering * iBlurPixels * texelSize;

    if (showOnlyDithered) {
        vec2 delta = dithering * hash22(st, 0.);
        return texture(sampler, st + delta);
    }

    float weightSum  = 0.0;
    vec4 colSum = c.yyyy;
    vec3 bloom = c.yyy;
    vec4 col;
    for (float dx = -halfSamples; dx <= halfSamples; dx += 1.) {
        for (float dy = -halfSamples; dy <= halfSamples; dy += 1.) {

            vec2 delta = vec2(dx, dy) * blurOffset / halfSamples;

            if (enableBlurDithering) {
                delta += dithering * hash22(st + delta, 0.);
            }

            float weight = exp(-gaussExponent * dot(delta, delta));
            weightSum += weight;
            col = texture(sampler, st + delta);
            colSum += col * weight;

            bloom += bloomColor(col.rgb) * weight;
        }
    }
    col = colSum / weightSum;

    if (!useBloomFilterInsteadOfBlur)
        return col;

    bloom /= weightSum;

    if (showOnlyBloom)
        return vec4(bloom, 1.);

    col = texture(sampler, st);
    col.rgb += iBloomIntensity * bloom;

    return col;
}


vec4 drawWithBlur1D(sampler2D sampler, in vec2 st, bool vertical) {
    if (iBlurSamples < 1) {
        return texture(sampler, st);
    }
    float halfSamples = float(iBlurSamples) * 0.5;
    float blurOffset = iBlurPixels * texelSize.y;
    vec2 blurStep = blurOffset / halfSamples
        * (vertical ? c.yx : c.xy);

    float gaussExponent = 2. / (blurOffset * blurOffset * iBlurGaussWidth * iBlurGaussWidth);

    vec2 dithering = iBlurDithering * iBlurPixels * texelSize;
    if (showOnlyDithered) {
        vec2 delta = dithering * hash22(st, 0.);
        return texture(sampler, st + delta);
    }

    float weightSum  = 0.0;
    vec4 colSum = c.yyyy;
    vec3 bloom = c.yyy;
    vec4 col;
    for (float s = -halfSamples; s <= halfSamples; s += 1.) {
        vec2 delta = s * blurStep;

        if (enableBlurDithering) {
            delta += dithering * hash22(st + delta, 0.);
        }

        float weight = exp(-gaussExponent * dot(delta, delta));
        weightSum += weight;
        col = texture(sampler, st + delta);
        colSum += col * weight;

        bloom += bloomColor(col.rgb) * weight;
    }
    col = colSum / weightSum;

    if (!useBloomFilterInsteadOfBlur) {
        return col;
    }
    bloom /= weightSum;
    if (showOnlyBloom) {
        return vec4(bloom, 1.);
    }
    col = texture(sampler, st);
    col.rgb += iBloomIntensity * bloom;

    return col;
}

vec4 drawImageTexture(sampler2D sampler) {
    vec2 st = gl_FragCoord.xy / iResolution.y;
    vec2 texSize = vec2(textureSize(sampler, 0));
    st.x /= texSize.x / texSize.y;
    st.y = 1. - st.y;
    return texture(sampler, st);
}

vec4 drawBaseImage() {
    if (alternativeImage) {
        return drawImageTexture(texWindow);
    } else {
        return drawImageTexture(texFloofy);
    }
}

vec4 drawTextureBarrelDistorted(sampler2D sampler, in vec2 st) {
    vec2 p = st * 2. - 1.;
    float r = length(p);
    p *= 1. + iBarrelDistortion * pow(r, iBarrelDistortionExponent);
    st = p * 0.5 + 0.5;
    if (min(st.x, st.y) < 0. || max(st.x, st.y) > 1.) {
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
    // noise = hash12(iNoiseScale * uv, flicker);
    // noise = perlin2D(iNoiseScale * uv, flicker);
    noise = stackedPerlin2D(iNoiseScale * uv, flicker);
    col.rgb += iNoise * (noise - 0.5);

    float scanlines = 0.8 + 0.2 * cos(iScanLineScale * iResolution.y * uv.y);
    scanlines = pow(scanlines, iScanLineGrading);
    col.rgb *= scanlines;

    col = clamp(col, 0., 1.);
}

void applyVignette(inout vec3 col, in vec2 st) {
    if (!showVignette) {
        return;
    }
    float r = length(2. * st - 1.);
    float vignette = smoothstep(iVignetteOuter, iVignetteInner, r);
    col *= vignette;
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

    if (useTwo1DBlursInsteadOfOne2D) {
        // this is a huge advantage gain: O(n^2) -> O(2*n)
        if (iPass == 1) {
            fragColor = drawWithBlur1D(texPrevious, st, false);
            return;
        }
        if (iPass == 2) {
            fragColor = drawWithBlur1D(texPrevious, st, true);
            return;
        }
    } else {
        if (iPass == 1) {
            fragColor = drawWithBlur2D(texPrevious, st);
            return;
        }
        if (iPass == 2) {
            // leerer Pass -- ist natürlich verschwenderisch
            fragColor = texture(texPrevious, st);
            return;
        }
    }

    if (iPass == 3) {
        fragColor = texture(texPrevious, st);
        applyVignette(fragColor.rgb, st);
        return;
    }
}
