#version 300 es
precision mediump float;
out vec4 fragColor;
in vec2 uv;
in vec2 st;
in vec2 stL;
in vec2 stR;
in vec2 stU;
in vec2 stD;
in vec2 texSt;
in float aspRatio;
in vec2 texelSize;
in mat2 uv2texSt;

// SHARED
uniform vec2 iResolution;
uniform vec4 iMouseDrag;
uniform float iTime;
uniform int iFrame;
uniform int passIndex;
uniform int debugOption;
// now all the fun
uniform sampler2D texAccumulusClouds;
uniform sampler2D texNoiseBase;
uniform sampler2D texText0;
uniform sampler2D texText1;
uniform mediump sampler2DArray texTexts;
uniform sampler2D texMonaSchnoergel;
uniform sampler2D texMonaCity;
uniform sampler2D texMonaRainbow;
uniform sampler2D texMonaStars;
// FLUID SIMULATION --> also, stimulation
uniform float deltaTime;
uniform sampler2D texColor;
uniform sampler2D texVelocity;
uniform sampler2D texCurl;
uniform sampler2D texPressure;
uniform sampler2D texDivergence;
uniform sampler2D texPostSunrays;
uniform sampler2D texPostBloom;
uniform sampler2D texPostDither;
uniform float iColorDissipation;
uniform float iVelocityDissipation;
uniform float iMaxInitialVelocity;
uniform float iCurlStrength;
uniform float iPressure;
uniform int pressureIterations;
// for post processing
uniform float iBloomIntensity;
uniform float iBloomThreshold;
uniform float iBloomSoftKnee;
uniform float iBloomPreGain;
uniform float iBloomDithering;
uniform float iSunraysWeight;
uniform float iSunraysIterations;
uniform float iSunraysDensity;
uniform float iSunraysDecay;
uniform float iSunraysExposure;
uniform float iGamma;
uniform float iVignetteInner;
uniform float iVignetteOuter;
uniform float iVignetteScale;
// TODO: Random Spawn -- should go!
uniform float iSpawnSeed;
uniform float iSpawnAge;
uniform vec3 iSpawnColorHSV;
uniform float iSpawnHueGradient;
uniform float iSpawnRandomizeHue;
// <--- FLUID

// --> GLYPHS
uniform sampler2D glyphTex;
const int N_GLYPHS = 97;
const int START_ASCII = 33; // 33 if charset begins with "!"

struct GlyphDef {
    vec2 center;
    vec2 halfSize;
    vec2 offset;
    float advance;
    float relAdvance;
};
layout(std140) uniform Glyphs {
    GlyphDef glyphDef[97];
};

struct GlyphInstance {
    float ascii;
    float scale;
    vec2 pos;
    vec4 color;
    vec4 effect;
};
layout(std140) uniform GlyphInstances {
    GlyphInstance letterInstance[32];
    int lettersUsed;
};

// --> CLOUDS
uniform float iCloudYDisplacement;
uniform float iCloudLayerDistance;
uniform float iLightLayerDistance;
uniform float iCloudSeed;
uniform float iSkyQuetschung;
uniform float iSampleCount;
uniform int iCloudLayerCount;
uniform int iLightLayerCount;
uniform float iCloudTransmittanceThreshold;
uniform float iCloudAbsorptionCoeff;
uniform float iCloudBaseLuminance;
uniform float iCloudAnisoScattering;
uniform int iCloudNoiseCount;
uniform int iLightNoiseCount;
uniform vec3 iNoiseScale;
uniform vec3 vecSunPosition;
uniform vec3 vecSunColorYCH;
uniform float iSunExponent;
uniform float iCloudFieldOfView;
uniform vec3 vecTone1;
uniform vec3 vecTone2;
uniform bool doAccumulate;
uniform float iAccumulateMix;
uniform bool useModdedFBM;
uniform float iVariateCloudMarchSize;
uniform float iVariateCloudMarchOffset;
uniform float iVariateCloudMarchFree;
// und allgemein Noise (vllt duplicates)
uniform float iNoiseFreq;
uniform float iNoiseLevel;
uniform float iNoiseOffset;
uniform float iCloudMorph;
// und für die extra noise base
uniform float iNoiseLevelA;
uniform float iNoiseLevelC;
uniform float iNoiseLevelAC;
uniform float iNoiseScaleA;
uniform float iNoiseScaleXT;
uniform float iNoiseScaleC;
uniform vec2 iOverallNoiseShift;
uniform float iOverallScale;
uniform float iOverallHashOffset;
uniform float iNoiseMorphingA;
uniform float iNoiseMorphingB;
uniform float iNoiseMorphingC;
uniform int iFractionalOctaves;
uniform float iFractionalScale;
uniform float iFractionalDecay;
uniform float iTurbulenceNormFactor;
uniform float iTurbulenceMeanOffset;
uniform vec2 iMarbleSqueeze;
uniform float iMarbleGranularity;
uniform float iMarbleGradingExponent;
uniform float iMarbleRange;
uniform float iColorStrength;
uniform vec3 iColorCosineFreq;
uniform vec3 iColorCosinePhase;

uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform float iFree5;
uniform float iFree6;
uniform float iFree7;
uniform float iFree8;
uniform float iFree9;
uniform vec4 colFree0;
uniform vec4 colFree1;
uniform vec4 colFree2;
uniform vec4 colFree3;

struct Event {
    // all floats because it makes WebGL state consistency... handlebar.
    float type;
    float subtype;
    vec4 coords;
    vec4 args;
};
layout(std140) uniform Events {
    Event genericEvent;
    Event fluidColorEvent;
    Event fluidVelocityEvent;
    Event textEvent;
};

const vec4 c = vec4(1, 0, -1, 0.5);
const float pi = 3.141593;
const float twoPi = 2. * pi;
const float epsilon = 1.e-4;

const float BPM = 105.;
const float BEAT_SEC = 240. / BPM;

vec3 cmap_dream210(float t) {
    return vec3(0.19, 0.24, 0.40)
    +t*(vec3(3.42, -1.41, 4.13)
    +t*(vec3(-21.95, 22.09, -7.62)
    +t*(vec3(66.28, -51.41, -6.87)
    +t*(vec3(-80.01, 41.55, 23.40)
    +t*(vec3(33.21, -11.33, -11.18)
    +t*(vec3(-0.94, 0.52, -1.86)
    ))))));
}

vec3 colorPalette(float t) {
    // noch eine flexible zur cmap_dream210() dazu
    return vec3(0.5) + 0.5 * cos(iColorCosineFreq * t + iColorCosinePhase);
}

float max3(vec3 vec) {
    return max(vec.x, max(vec.y, vec.z));
}

vec4 debugRedChannel(sampler2D tex, float scaling) {
    float red = texture(tex, st).r * scaling;
    return vec4(
        max(0., red),
        -min(0., red),
        abs(red) > 1.,
        1.
    );
}

/////////////////////////

float hash12(vec2 p)
{
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p)
{
    p = p*mat2(127.1,311.7,269.5,183.3);
    return -1.0 + 2.0 * fract(sin(p + .01 * iOverallHashOffset)*43758.5453123);
}

vec2 modulatedHash22(vec2 p, float phase) {
    return sin(twoPi * hash22(p) + phase);
}

float modulatedPerlin2D(vec2 p, float phase) {
    // Modifikation, um Phasenverschiebung in die Hashfunktion zu bekommen.
    // Das ist nicht äußerst performant, aber reicht hier, und zeigt eine Bandbreite
    // komplexer Effekte, die durch solche Pseudorandom-Noise-Überlagerungen kommen können.
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = pf * pf * (3.-2.*pf);

    float f00 = dot(modulatedHash22(pi+vec2(.0,.0), phase),pf-vec2(.0,.0));
    float f01 = dot(modulatedHash22(pi+vec2(.0,1.), phase),pf-vec2(.0,1.));
    float f10 = dot(modulatedHash22(pi+vec2(1.0,0.), phase),pf-vec2(1.0,0.));
    float f11 = dot(modulatedHash22(pi+vec2(1.0,1.), phase),pf-vec2(1.0,1.));

    float xm1 = mix(f00,f10,w.x);
    float xm2 = mix(f01,f11,w.x);
    float ym = mix(xm1,xm2,w.y);
    return ym;
}

float noiseAbsoluteStackWithFurtherProcessing(vec2 p){
    // übersetzt aus https://www.shadertoy.com/view/Md3SzB
    // nur ein Beispiel für eine Anwendung nach weiteren Berechnungen
    p *= iNoiseScaleC;
    float s = modulatedPerlin2D(p, iNoiseMorphingC * iTime);
    s = sin(s * iMarbleGranularity + p.x * iMarbleSqueeze.x + p.y * iMarbleSqueeze.y);
    s = pow(0.5 + 0.5 * s, iMarbleGradingExponent);
    return 1. + iMarbleRange * (s - 1.24);
}

float noiseStack(vec2 p){
    float a = 1., s = 0., noise;
    float sum = 0.;
    for (int i=0; i < iFractionalOctaves; i++) {
        noise = modulatedPerlin2D(iNoiseScaleA * p, iNoiseMorphingA * iTime);
        sum += a * noise;

        s += a;
        p *= iFractionalScale;
        a *= iFractionalDecay;
    }
    // Skalierung empirisch
    return 0.5 + 0.5 * (sum / s * 1.5);
}

void noiseBase(in vec2 uv, inout vec3 col) {
    uv *= iOverallScale;
    uv += iOverallNoiseShift;
    float noiseClouds = noiseStack(uv);
    float noiseMarble = noiseAbsoluteStackWithFurtherProcessing(uv);
    float totalNoise = (
        iNoiseLevelA * noiseClouds +
        iNoiseLevelAC * (noiseClouds * noiseMarble) +
        iNoiseLevelC * noiseMarble
    );
    // totalNoise = clamp(totalNoise, 0., 1.);
    col = mix(
        vec3(totalNoise),
        cmap_dream210(totalNoise * iColorStrength),
        iColorStrength
    );
}

// CLOUDS:

vec3 hash31(float p)
{
    vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xxy+p3.yzz)*p3.zyx);
}

const mat3 rot1 = mat3(-0.37, 0.36, 0.85,-0.14,-0.93, 0.34,0.92, 0.01,0.4);
const mat3 rot2 = mat3(-0.55,-0.39, 0.74, 0.33,-0.91,-0.24,0.77, 0.12,0.63);
const mat3 rot3 = mat3(-0.71, 0.52,-0.47,-0.08,-0.72,-0.68,-0.7,-0.45,0.56);

float xt95noise(vec3 m);
float xt95mfnoise3(vec3 m) {
    // scaled to produce a range like mfnoise3
    return (
    0.5333333 * xt95noise(m * rot1)
    + 0.2666667 * xt95noise(2. * m * rot2)
    + 0.1333333 * xt95noise(4. * m * rot3)
    + 0.0666667 * xt95noise(8. * m)
    ) * 1.62 - 0.005;
}

float hash(float n)
{
    return fract(sin(n)*43758.5453);
}

float xt95noise(in vec3 x)
{
    // match spatial scale of noise(), this seems like a factor of 2.6 .. 3.0:
    x *= iNoiseScaleXT;

    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;

    float res = mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
    mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
    mix(mix( hash(n+113.0), hash(n+114.0),f.x),
    mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);

    // also, match value range of output (I measured these values)
    return 1.24 * res - 0.673;
}

const mat3 m = mat3(
    0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64
);

float fbmB( vec3 p, int maxOctave)
{
    // fbmB() original: just use xt95noise
    // fbmB() modded: use noise() for the base octave // <--
    // fbmB() modded: use xt95mfnoise3() for the base octave //
    float a = 0.5;
    float b = 2.02;
    float f = useModdedFBM ? xt95mfnoise3(p) : a * xt95noise(p);
    for (int i = 0; i < maxOctave - 1; i++) {
        p = m*p;
        p *= b;
        b += (i == 1 ? -0.02 : 0.01);
        a *= 0.5;
        f += a*xt95noise( p );
    }
    return 0.78 * f + 0.02;
}

// https://www.shadertoy.com/view/llGcDm
int hilbert( ivec2 p, int level )
{
    int d = 0;
    for( int k=0; k<level; k++ )
    {
        int n = level-k-1;
        ivec2 r = (p>>n)&1;
        d += ((3*r.x)^r.y) << (2*n);
        if (r.y == 0) { if (r.x == 1) { p = (1<<n)-1-p; } p = p.yx; }
    }
    return d;
}

// https://www.shadertoy.com/view/llGcDm
ivec2 ihilbert( int i, int level )
{
    ivec2 p = ivec2(0,0);
    for( int k=0; k<level; k++ )
    {
        ivec2 r = ivec2( i>>1, i^(i>>1) ) & 1;
        if (r.y==0) { if(r.x==1) { p = (1<<k) - 1 - p; } p = p.yx; }
        p += r<<k;
        i >>= 2;
    }
    return p;
}

// knuth's multiplicative hash function (fixed point R1)
uint kmhf(uint x) {
    return 0x80000000u + 2654435789u * x;
}

uint kmhf_inv(uint x) {
    return (x - 0x80000000u) * 827988741u;
}

// mapping each pixel to a hilbert curve index, then taking a value from the Roberts R1 quasirandom sequence for it
uint hilbert_r1_blue_noise(uvec2 p) {
    #if 1
    uint x = uint(hilbert( ivec2(p), 17 )) % (1u << 17u);
    #else
    //p = p ^ (p >> 1);
    uint x = pack_morton2x16( p ) % (1u << 17u);
    //x = x ^ (x >> 1);
    x = inverse_gray32(x);
    #endif
    x = kmhf(x);
    return x;

    // based on http://extremelearning.com.au/unreasonable-effectiveness-of-quasirandom-sequences/
    /*
    const float phi = 2.0/(sqrt(5.0)+1.0);
    return fract(0.5+phi*float(x));
    */
}

// mapping each pixel to a hilbert curve index, then taking a value from the Roberts R1 quasirandom sequence for it
float hilbert_r1_blue_noisef(uvec2 p) {
    uint x = hilbert_r1_blue_noise(p);
    #if 0
    return float(x >> 24) / 256.0;
    #else
    return float(x) / 4294967296.0;
    #endif
}

// inverse
uvec2 hilbert_r1_blue_noise_inv(uint x) {
    x = kmhf_inv(x);
    return uvec2(ihilbert(int(x), 17));
}

vec3 cmap_pastel(float t) {
    return vec3(0.92, 0.82, 0.68)
    +t*(vec3(2.25, 0.95, -0.50)
    +t*(vec3(-24.81, -10.77, -16.68)
    +t*(vec3(123.32, 35.33, 88.11)
    +t*(vec3(-289.81, -73.14, -176.72)
    +t*(vec3(301.16, 79.71, 159.25)
    +t*(vec3(-112.18, -32.13, -53.50)
    ))))));
}

vec3 hsv2rgb(vec3 hsvColor) {
    hsvColor.x /= 360.;
    const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(hsvColor.xxx + K.xyz) * 6.0 - K.www);
    return hsvColor.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsvColor.y);
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

float fbm(vec3 p, bool forLight) {
    p += 1.e4*hash31(iCloudSeed);// + iTime * 0.5 * vec3(1.0, -0.2, -1.0);
    p *= iNoiseScale;
    int maxOctave = forLight ? iLightNoiseCount : iCloudNoiseCount;
    return fbmB(p, maxOctave);
}

float sdSphere(vec3 p, float radius) {
    return length(p) - radius;
}

float scene(vec3 p, bool forLight) {
    float y = p.y - 0.01 * iCloudYDisplacement + (0.08 * sin(iTime));
    p.x += 0.1 * iTime;
    p.y += 0.02 * iTime;
    float f = fbm(p, forLight);
    return f - y;
}

float BeersLaw(float dist, float absorption) {
    return exp(-dist * absorption);
}

float lightmarch(vec3 position, vec3 rayDirection) {
    vec3 lightDirection = normalize(vecSunPosition);
    float totalDensity = 0.0;
    // float marchSize = 0.03;
    float marchSize = 0.01 * iLightLayerDistance;

    for (int step = 0; step < iLightLayerCount; step++) {
        position += lightDirection * marchSize * float(step);

        float lightSample = scene(position, true);
        totalDensity += lightSample;
    }

    float transmittance = BeersLaw(totalDensity, iCloudAbsorptionCoeff);
    return transmittance;
}

float HenyeyGreenstein(float g, float mu) {
    float gg = g * g;
    return (1.0 / (4.0 * pi))  * ((1.0 - gg) / pow(1.0 + gg - 2.0 * g * mu, 1.5));
}

//float udQuad( vec3 p, vec3 a, vec3 b, vec3 c, vec3 d )
//{
//    vec3 ba = b - a; vec3 pa = p - a;
//    vec3 cb = c - b; vec3 pb = p - b;
//    vec3 dc = d - c; vec3 pc = p - c;
//    vec3 ad = a - d; vec3 pd = p - d;
//    vec3 nor = cross( ba, ad );
//
//    return sqrt(
//    (sign(dot(cross(ba,nor),pa)) +
//    sign(dot(cross(cb,nor),pb)) +
//    sign(dot(cross(dc,nor),pc)) +
//    sign(dot(cross(ad,nor),pd))<3.0)
//    ?
//    min( min( min(
//    dot2(ba*clamp(dot(ba,pa)/dot2(ba),0.0,1.0)-pa),
//    dot2(cb*clamp(dot(cb,pb)/dot2(cb),0.0,1.0)-pb) ),
//    dot2(dc*clamp(dot(dc,pc)/dot2(dc),0.0,1.0)-pc) ),
//    dot2(ad*clamp(dot(ad,pd)/dot2(ad),0.0,1.0)-pd) )
//    :
//    dot(nor,pa)*dot(nor,pa)/dot2(nor) );
//}

float opExtrusion( in vec3 p, in float sdf, in float h )
{
    vec2 w = vec2( sdf, abs(p.z) - h );
    return min(max(w.x,w.y),0.0) + length(max(w,0.0));
}

float sdPlane( vec3 p, vec3 n, float h )
{
    // n must be normalized
    return dot(p,n) + h;
}
vec4 textureCenteredAt(sampler2D sampler, vec2 coord);

vec3 raymarch(vec3 rayOrigin, vec3 rayDirection, float offset) {
    float depth = 0.0;
    float marchSize = .01 * iCloudLayerDistance; // * (-rayDirection.z);
    depth += marchSize + 0.01 * iVariateCloudMarchOffset * offset;
    vec3 p, pd;
    vec3 sunDirection = normalize(vecSunPosition);
    float phase = HenyeyGreenstein(iCloudAnisoScattering, dot(rayDirection, sunDirection));

    float transmittance = 1.;
    vec3 lightEnergy = c.yyy;

    for (int i = 0; i < iCloudLayerCount && transmittance > iCloudTransmittanceThreshold; i++) {
        p = rayOrigin + depth * rayDirection;
        float density = scene(p, false);

        ///////
        pd = p - rayOrigin;
        float d = length(pd - vec3(2.5 * (fract(0.33 * iTime) - 0.5), 0, -3.)) - 2.;
        float sphereDensity = max(-d * 0.1, 0.);

        d = sdPlane(pd, c.yyx, iFree1);
        float logoDensity = smoothstep(0.1 * iFree2, 0., d) * (colFree0.a - 1.);
        vec4 tex = c.yyyy;
        if (logoDensity > 0.) {
            tex = textureCenteredAt(texMonaSchnoergel, uv * 1.3 + vec2(iVariateCloudMarchFree * 0.1 * offset, 0.4));
            logoDensity *= tex.a;
            // sphereDensity *= (1. - 0.9 * logoDensity);
            density = max(density, logoDensity);
        }

        //////

        // We only draw the density if it's greater than 0
        if (density > 0.0) {
            float lightTransmittance = lightmarch(p, rayDirection);
            float luminance = iCloudBaseLuminance + density * phase;

            // vec3 color = mix(c.xyx, colFree0.rgb, planeDensity / (planeDensity + sphereDensity + 0.01));
            vec3 color = c.xxx; // colFree0.rgb;
            // color = mix(c.xxx, color, (sphereDensity) / density);

            transmittance *= lightTransmittance;
            lightEnergy += transmittance * luminance * color;
        }

        depth += marchSize;
        marchSize += 0.01 * iVariateCloudMarchSize * offset;
    }

    return lightEnergy;
}

void cloudImage(out vec4 color, vec2 uvShift, int sampleIndex) {
    vec3 ro = vec3(0.0, 0.0, 5.0);
    vec3 rd = normalize(vec3(uv - uvShift, -iCloudFieldOfView));

    // Sun and Sky
    vec3 sunColor = ychToRgb(vecSunColorYCH.x, vecSunColorYCH.y, vecSunColorYCH.z);
    vec3 sunDirection = normalize(vecSunPosition);
    float sun = clamp(dot(sunDirection, rd), 0.0, 1.0);
    color.rgb = cmap_pastel(fract(1. - .9 * pow(st.y, iSkyQuetschung)));
    color.rgb += 0.5 * sunColor * pow(sun, iSunExponent);

    float blueNoise = hilbert_r1_blue_noisef(uvec2(uvShift.xy));
    //texture2D(uBlueNoise, fragCoord.xy / 1024.0).r;
     float offset = blueNoise + float(sampleIndex % 32) / sqrt(0.5);
//    float offset = hash12(uvShift) + float(sampleIndex%32) / sqrt(0.5);
    //    float offset = 0.;
    // bring to [-0.5, 0.5]
    offset = fract(offset + 0.5) - 0.5;

    // Cloud
    vec3 res = raymarch(ro, rd, offset);
    color.rgb = color.rgb + sunColor * res;
}

void mainCloudImage(out vec4 fragColor) {
    vec4 col = c.yyyy;
    const float gold = 2.4;
    for (float i = .75; i < iSampleCount; i += 1.) {
        float x = i / iSampleCount;
        float p = gold * i;
        vec2 z =
            // Pixel size.
            .5 * texelSize.y
            // Vogel order.
            * sqrt(x) * vec2(cos(p), sin(p))
            // Adjust width for DOF effect.
            * 1.
            ;
        x *= pi * pi;
        int sampleIndex = int(i);
        if (doAccumulate) {
            sampleIndex += iFrame;
        }
        vec4 c1;
        cloudImage(c1, z, sampleIndex);
        col += c1;
    }
    fragColor = col / iSampleCount;
    /*
    // Grain.
    vec2 uvn = fragCoord.xy/iResolution.xy;
    fragColor += .01*iGrain * (2. * hash12(1.e4 * uvn) - 1.);

    // Vignette.
    uvn *=  1. - uvn.yx;
    fragColor *= pow(uvn.x*uvn.y * 15., iVignette);
    fragColor = clamp(fragColor, 0., 1.);*/
}

// GLYPHS:

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

float sdGlyph(in vec2 uv, int ascii, out vec2 size) {
    int index = ascii - START_ASCII;
    if (index < 0 || index >= N_GLYPHS) {
        return 0.;
    }

    GlyphDef g = glyphDef[index];
    vec2 bottomLeft = uv
        - 2. * g.halfSize * vec2(aspRatio, 1)
        - g.offset;
    vec2 texCoord = g.center
        + clamp(uv2texSt * bottomLeft, -g.halfSize, g.halfSize);
    vec3 msd = texture(glyphTex, texCoord).rgb;

    // TODO: try respecting 0.02 * iResolution.y * g.emAdvance in size.x .. ?;
    size = 4. * vec2(aspRatio, 1) * g.halfSize;
    // TODO: replace out vec2 size -> out float advance; and here use g.advance instead of g.halfSize.

    // unsure whether this really is the same understanding of SDF
    // as we know it from everywhere. Tried to get as good as it got.
    float sdf = 0.5 - median(msd.r, msd.g, msd.b);
    return sdf;
}

float glyph(in vec2 uv, int ascii, out vec2 step) {
    float sdf = sdGlyph(uv, ascii, step);
    // return clamp(-sdf/fwidth(sdf) + 0.5, 0., 1.0);
    return clamp(-sdf/fwidth(sdf) + 0.5, 0., 1.0);
}

float sdRect(in vec2 uv, in vec2 size)
{
    vec2 q = abs(uv)-size;
    return length(max(q,0.0)) + min(max(q.x,q.y),0.0);
}

void printQmSaysHi(in vec2 uv, inout vec4 col) {
    vec2 dims;
    vec4 textColor = vec4(1, 0.3, 0.5, 1.);
    vec2 cursor = uv - vec2(-1.44, -0.7);
    cursor *= 0.8;
    float d = 100., dR = 100.;
    const float qmVibe = 0.08;
    vec2 pos = cursor + c.yx * qmVibe * sin(iTime * 1.4);
    d = min(d, sdGlyph(pos, 81, dims));
    dR = min(dR, sdRect(pos, 0.5 * dims));
    cursor.x -= dims.x;

    pos = cursor - c.yx * qmVibe * cos(iTime);
    d = min(d, sdGlyph(pos, 77, dims));
    dR = min(dR, sdRect(pos, 0.5 * dims));
    cursor.x -= dims.x;

    //#define JUST_QUICK_OUTPUT
    //    #ifdef JUST_QUICK_OUTPUT
    //        col = vec3(0.5 + 0.1 * d * iFree3);
    //        return;
    //    #endif

    float glowInner = exp(-50. * (1. + iFree0) * d * d) * 0.6;
    float glowOuter = exp(-8. * (1. + iFree1) * d) * 0.4 * smoothstep(-0.04, 0., d);
    vec4 glow = glowInner * c.xxyx + glowOuter * textColor;
    glow *= iFree3;

    float gradient = fwidth(d);
    float mask = smoothstep(0., 0.33, gradient);
    glow *= mask * smoothstep(iFree5, iFree4, abs(d));
    glow.rgb = pow(glow.rgb, vec3(1. + iFree2));

    float shape = smoothstep(0.01, 0., d);
    col = mix(col, c.yyyx, 0.4 * shape);

    // understanding the "size / dims / step" out in its scaling: rect around the M
    float dRectMBorder = abs(dR) - 0.001;
    // float dRectMHard = smoothstep(0.01, 0., dRectM);
    // float dRectMSmooth = smoothstep(0.1, 0., dRectM);
    dR = smoothstep(0.001, 0., dR);
    // col = mix(col, c.yyy, dRectM);

    col += dR * glow;

    // <-- UP TO HERE: QM WITH GLOW

    cursor *= 1.25;
    cursor.x -= 0.1;
    d = glyph(cursor, 115, dims);
    col = mix(col, textColor, d);
    cursor.x -= dims.x;
    d = glyph(cursor, 97, dims);
    col = mix(col, textColor, d);
    cursor.x -= dims.x;
    d = glyph(cursor, 121, dims);
    col = mix(col, textColor, d);
    cursor.x -= dims.x;
    cursor.x += 0.04;
    d = glyph(cursor, 115, dims);
    col = mix(col, textColor, d);
    cursor.x -= dims.x;
    cursor.x -= 0.2;
    d = glyph(cursor, 72, dims);
    col = mix(col, textColor, d);
    cursor.x -= dims.x;
    cursor.x += 0.04;
    d = glyph(cursor, 105, dims);
    col = mix(col, textColor, d);
    cursor.x -= dims.x;
    cursor.x -= 0.2;
    /*
    const vec4 textColor2 = vec4(0.8, 1., 0.5, 1.);
    cursor *= 0.5;
    d = glyph(cursor, 92, dims);
    col = mix(col, textColor2, d);
    cursor.x -= dims.x;
    d = glyph(cursor, 111, dims);
    col = mix(col, textColor2, d);
    cursor.x -= dims.x - 0.04;
    d = glyph(cursor, 47, dims);
    col = mix(col, textColor2, d);
    cursor.x -= dims.x;
    */
}

void printYay(in vec2 uv, inout vec4 col) {
    vec2 dims;
    float d = 100., dR = 100.;
    const vec4 textColor2 = vec4(0.8, 1., 0.5, 1.);
    vec2 cursor = uv - vec2(-1.22, 0.);
    cursor *= 0.15;
    d = glyph(cursor, 92, dims);
    col = mix(col, textColor2, d);
    cursor.x -= dims.x;
    d = glyph(cursor, 111, dims);
    col = mix(col, textColor2, d);
    cursor.x -= dims.x - 0.04;
    d = glyph(cursor, 47, dims);
    col = mix(col, textColor2, d);
    cursor.x -= dims.x;
}

void printGlyphInstances(in vec2 uv, inout vec4 col, in vec4 overwriteColor) {
    vec2 pos, _unused;
    float d;
    for (int t = 0; t < lettersUsed; t++) {
        GlyphInstance letter = letterInstance[t];
        pos = letter.scale * (uv - letter.pos);
        d = glyph(pos, int(letter.ascii), _unused);
        d *= d * letter.color.a;
        col.rgb = mix(col.rgb, overwriteColor.xyz, d);

        // visualize bottom points
//        d = length(vec2(pos.x, pos.y)) - 0.01;
//        d = smoothstep(0.01, 0., d);
//        col.rgb = mix(col.rgb, c.yxy, d);
    }
}

void printGlyphInstances(in vec2 uv, inout vec4 col) {
    vec2 pos, _unused;
    float d;
    for (int t = 0; t < lettersUsed; t++) {
        GlyphInstance letter = letterInstance[t];
        pos = letter.scale * (uv - letter.pos);
        d = glyph(pos, int(letter.ascii), _unused);
        d *= d * letter.color.a;
        col.rgb = mix(col.rgb, letter.color.xyz, d);

        // visualize bottom points
//        d = length(vec2(pos.x, pos.y)) - 0.01;
//        d = smoothstep(0.01, 0., d);
//        col.rgb = mix(col.rgb, c.yxy, d);
    }
}

/////

vec4 fluidColor;
vec2 fluidVelocity;

vec4 simulateAdvection(sampler2D fieldTexture, float dissipationFactor) {
    vec2 hasMovedTo = st - deltaTime * fluidVelocity * texelSize;
    vec4 advectedValue = texture(fieldTexture, hasMovedTo);
    float decay = 1.0 + dissipationFactor * deltaTime;
    return advectedValue / decay;
}

vec3 makeSurplusWhite(vec3 color) {
    vec3 surplus = max(c.yyy, color - 1.);
    color = min(color, 1.);
    color.r += surplus.g + surplus.b;
    color.g += surplus.r + surplus.b;
    color.b += surplus.r + surplus.g;
    return clamp(color, 0., 1.);
}

float calcSunrays() {
    vec2 stCursor = st;
    vec2 cursorDir = st - 0.5;
    cursorDir *= 1. / iSunraysIterations * iSunraysDensity;
    float illumination = 1.;
    float value = texture(texPostSunrays, stCursor).a;
    for (float i=0.; i < iSunraysIterations; i+=1.) {
        stCursor -= cursorDir;
        float cursorVal = texture(texPostSunrays, stCursor).a;
        value += cursorVal * illumination * iSunraysWeight;
        illumination *= iSunraysDecay;
    }
    value *= iSunraysExposure;
    return value;
}

// ONLY A RELIC FROM THE FLUID PLAYGROUND!
void postprocessing(inout vec3 col, in vec2 uv) {
    // col = cmap_dream210(clamp(max3(col), 0., 1.));
    col = pow(col, vec3(1./iGamma));

    float vignetteShade = dot(st - 0.5, st - 0.5) * iVignetteScale;
    col *= smoothstep(iVignetteInner, iVignetteOuter, vignetteShade);
}

/////

float mask(vec2 st, vec4 limits) {
    return step(limits.s, st.x) * step(st.x, limits.p)
         * step(limits.t, st.y) * step(st.y, limits.q);
}

vec4 maskedTexture(sampler2D sampler, vec2 stTex, vec4 stLimits) {
    // fix y and then force transparency outside the [stLimits.st, stLimits.pq] range
    stTex.y = 1. - stTex.y;
    vec4 color = texture(sampler, stTex);
    color.a *= mask(stTex, stLimits);
    return color;
}

vec4 textureCenteredAt(sampler2D sampler, vec2 uv) {
    // puts the texture centered at (0,0),
    // transform as usual uv -> rot * (uv - shift) / scale
    vec2 texRes = vec2(textureSize(sampler, 0));
    vec2 aspScale = texRes.y / texRes;
    return maskedTexture(sampler, uv * aspScale + 0.5, c.yyxx);
}

vec4 textureToArea(sampler2D sampler, vec2 uv, vec4 rectBLTR) {
    vec2 stTex = (uv - rectBLTR.st) / (rectBLTR.pq - rectBLTR.st);
    return maskedTexture(sampler, stTex, c.yyxx);
}

vec4 textureToArea(sampler2D sampler, vec2 uv, vec4 uvLBRT, vec4 stLBRT) {
    // to map the part stLBRT in texture coordinates to rectangle uvLBRT on screen
    vec2 stTex = (uv - uvLBRT.st) / (uvLBRT.pq - uvLBRT.st);
    stTex = mix(stLBRT.st, stLBRT.pq, stTex);
    // <-- stTex = stTex * (stLBRT.pq - stLBRT.st) + stLBRT.st;
    return maskedTexture(sampler, stTex, stLBRT);
}

void finalComposition(in vec2 uv) {
    vec4 accumulus = texture(texAccumulusClouds, st);
    vec4 noiseBase = texture(texNoiseBase, st);

    fragColor.rgb = accumulus.rgb * (1. + iNoiseLevel * noiseBase.rgb);
    fragColor.rgb = clamp(fragColor.rgb, 0., 1.);
    // fragColor.rgb = mix(fragColor.rgb, noiseBase.rgb, noiseBase.a + 0.2);

    // \o/
    vec4 tex = texture(texTexts, vec3(st, 1));
    // fragColor.rgb = mix(fragColor.rgb, c.xyw * tex.rgb, tex.a);

    vec3 col = fragColor.rgb;

    vec2 rainbowCenter = 0.15 * vec2(sin(3. * iTime), cos(3. * iTime));
    rainbowCenter = vec2(0., 0.35);
    tex = textureCenteredAt(texMonaRainbow, (uv - rainbowCenter) * 0.35);
    tex.a *= noiseBase.r;
    vec3 rainbowColor = cmap_dream210(-0.14 + 0.5 * (tex.r + tex.g + tex.b));
    fragColor.rgb = mix(fragColor.rgb, rainbowColor, tex.a);
    /*
    float pos210 = floor(mod(2. * iTime, 3.)) * 0.333;
    vec4 tex2 = textureToArea(texMonaSchnoergel, uv, vec4(.7, -.5, 1.7, .5), vec4(pos210, 0., pos210 + 0.333, 1.));
    tex.a *= 1. - tex2.a;
    fragColor.rgb *= 1. - 0.3 * tex2.a;
    fragColor.rgb -= mix(c.yyy, col.brg, tex2.a);
    */

    /*
    // QM SAYS HI
    tex = texture(texTexts, vec3(st, 0));
    fragColor.rgb = mix(fragColor.rgb, tex.rgb, tex.a);
    */

    // fragColor.rgb += tex.a * tex.rgb;

    if (debugOption == 1) {
        printGlyphInstances(uv, fragColor, noiseBase);
    }


    // col = noiseBase.rgb;
    col = fragColor.rgb;
    col = pow(col, vec3(1. / iGamma));

    float vignetteShade = dot(st - 0.5, st - 0.5) * iVignetteScale;
    col *= smoothstep(iVignetteInner, iVignetteOuter, vignetteShade);

    fragColor.rgb = col;
    fragColor.a = 1.;
}

// Try Nomenclature:
// (I skipped the PASS_ but chose to keep the _)
// _INIT_ = Write new data from different inputs on a texture
// _PROCESS_ = connected quantities are transformed as a a whole,
//             maybe with the 2nd word === the target of that pass
// _CALC_ = A rather pure calculation from another texture, i.e.
//          where an INIT is from rather few data, and while PROCESS
//          is often a heavier thing, CALC is the straightaway stuff.
// _RENDER_ = Write some image data as a final step in its path
//          (no content transformation of similar fashion follows),
//          expected to be a bit more complex than _INIT_
// _POST_ = a PROCESS that works on RENDER results mostly for aesthetics,
//        or otherwise technologically distinct from the render method.
//
// Also, loose grouped, in sections of 10, but just for the fun of it.
#define _INIT_FLUID_COLOR 1
#define _INIT_VELOCITY 2
#define _INIT_PRESSURE_PASS 3
#define _CALC_CURL_FROM_VELOCITY 4
#define _PROCESS_VELOCITY_BY_CURL 10
#define _CALC_DIVERGENCE_FROM_VELOCITY 11
#define _PROCESS_PRESSURE 12
#define _PROCESS_GRADIENT_SUBTRACTION 13
#define _PROCESS_ADVECTION 14
#define _PROCESS_FLUID_COLOR 19
#define _POST_BLOOM_PREFILTER 20
#define _POST_BLOOM_BLUR 21
#define _POST_SUNRAYS_CALC_MASK 30
#define _POST_SUNRAYS_CALC 31
#define _POST_SUNRAYS_BLUR 32
#define _RENDER_FLUID 40
#define _RENDER_CLOUDS 60
#define _INIT_TEXT0 80
#define _INIT_TEXT1 81
#define _INIT_TEXT2 82
#define _INIT_GLYPH_INSTANCES 88
#define _RENDER_NOISE_BASE 90
#define _RENDER_FINALLY_TO_SCREEN 100

// float-valued for now because consistent UBOs are easier to manage
#define EVENT_CLEAR_FLUID 4.0

void main() {
    // "Hello Shadertoy" as time-variable alarm signal (you shouldn't want this.)
    vec4 debugColor = vec4(0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4)), 1.);

    vec2 spawnRandom = hash22(vec2(1.2, 1.1) * iSpawnSeed);
    vec2 spawnCenter = vec2(spawnRandom.x, spawnRandom.y);
    float spawnSize = clamp(iSpawnAge, 0.18, 1.); // <-- put iSpawnAge in there
    float d, velL, velR, velU, velD, pL, pR, pU, pD, div;

    switch (passIndex) {
        case _RENDER_CLOUDS:
            mainCloudImage(fragColor);
            if (doAccumulate && iFrame > 0) {
                vec4 accumulus = texture(texAccumulusClouds, st);
                fragColor.rgb = mix(fragColor.rgb, accumulus.rgb, iAccumulateMix);
            }
            return;
        case _RENDER_NOISE_BASE:
            noiseBase(uv, fragColor.rgb);
            fragColor.a = max3(fragColor.rgb);
            return;
        case _INIT_TEXT0:
            fragColor = c.yyyy;
            printQmSaysHi(uv, fragColor);
            return;
        case _INIT_TEXT1:
            fragColor = c.yyyy;
            printYay(uv, fragColor);
            return;
        case _INIT_GLYPH_INSTANCES:
            fragColor = c.yyyy;
            printGlyphInstances(uv, fragColor);
            return;

        // all the fluid stuff now
        case _INIT_FLUID_COLOR: {
                if (fluidColorEvent.type == EVENT_CLEAR_FLUID) {
                    fragColor = fluidColorEvent.coords;
                    return;
                }
                fluidColor = texture(texColor, st);
                if (iSpawnSeed < 0.) {
                    fragColor = fluidColor;
                    return;
                }
                vec2 p = uv - spawnCenter;
                d = length(p) - spawnSize;
                float a = smoothstep(0.02, 0., d) * exp(-dot(p, p) / spawnSize);
                vec3 spawnColor = iSpawnColorHSV;
                spawnColor.x += (360. * hash(iSpawnSeed + 0.12) - 180.) * iSpawnRandomizeHue;
                spawnColor.x += pow(-min(0., d), 0.5) * iSpawnHueGradient;
                vec3 spawn = a * hsv2rgb(spawnColor);
                // spawn.r += pow(-min(0., d), 0.5) * 1.6;
                // mix old stuff in:
                fragColor = vec4(fluidColor.rgb + spawn, 1.);
                // just new stuff:
                // fragColor = vec4(spawn.rgb, 1.);
            }
            return;
        case _INIT_VELOCITY: {
             if (fluidVelocityEvent.type == EVENT_CLEAR_FLUID) {
                    fragColor.xy = fluidVelocityEvent.coords.xy;
                    return;
                }
                fluidVelocity = texture(texVelocity, st).xy;
                if (iSpawnSeed < 0.) {
                    fragColor.xy = fluidVelocity;
                    return;
                }
                vec2 randomVelocity = hash22(vec2(iSpawnSeed, iSpawnSeed + 0.1))
                * iMaxInitialVelocity * vec2(aspRatio, 1.);
                // <-- hash22(x) is _pseudo_random_, i.e. same x results in same "random" value
                // we want randomVelocity.x != randomVelocity.y, thus the 0.1 offset
                // but the overall randomVelocity will only differ when sampleSeed differs.
                //vec2 initialVelocity = randomVelocity;
                // <-- would be random, but can also direct towards / away from center
                // vec2 initialVelocity = uv * iMaxInitialVelocity;
                vec2 initialVelocity = randomVelocity + uv * iMaxInitialVelocity;
                vec2 p = uv - spawnCenter;
                d = length(p) - spawnSize;
                d = smoothstep(0.02, 0., d);
                d   = exp(-dot(p, p) / spawnSize);
                vec2 newValue = d * initialVelocity;
                fragColor.xy = fluidVelocity.xy + newValue;
                // can ignore fragColor.zw because these will never be read
            }
            return;
        case _INIT_PRESSURE_PASS:
            fragColor = iPressure * texture(texPressure, st);
            return;
        case _CALC_CURL_FROM_VELOCITY:
            // this just calculates the "curl" (scalar => only red) for the next pass
            // understand the curl as kind of "orthogonal to the gradient": (x, y) -> (-y, x)
            velL = +texture(texVelocity, stL).y;
            velR = +texture(texVelocity, stR).y;
            velU = -texture(texVelocity, stU).x;
            velD = -texture(texVelocity, stD).x;
            fragColor.r = (velR - velL) + (velU - velD);
            return;
        case _PROCESS_VELOCITY_BY_CURL:
            fluidVelocity = texture(texVelocity, st).xy;
            float curl = texture(texCurl, st).x;
            float curlL = texture(texCurl, stL).x;
            float curlR = texture(texCurl, stR).x;
            float curlU = texture(texCurl, stU).x;
            float curlD = texture(texCurl, stD).x;
            vec2 force = vec2(abs(curlU) - abs(curlD), abs(curlR) - abs(curlL));
            force /= length(force) + 0.0001;
            force *= iCurlStrength * curl * c.yz;
            fluidVelocity += force * deltaTime;
            // velocity = clamp(velocity, -1000., 1000.);
            fragColor.xy = fluidVelocity;
            return;
        case _CALC_DIVERGENCE_FROM_VELOCITY:
            fluidVelocity = texture(texVelocity, st).xy;
            // this handles divergence at the borders
            velL = texture(texVelocity, stL).x;
            velR = texture(texVelocity, stR).x;
            velU = texture(texVelocity, stU).y;
            velD = texture(texVelocity, stD).y;
//            if (stL.x < 0.0) { velL = -fluidVelocity.x; }
//            if (stR.x > 1.0) { velR = -fluidVelocity.x; }
//            if (stU.y > 1.0) { velU = -fluidVelocity.y; }
//            if (stD.y < 0.0) { velD = -fluidVelocity.y; }
            velL = mix(velL, -fluidVelocity.x, step(stL.x, 0.0));
            velR = mix(velR, -fluidVelocity.x, step(1.0, stR.x));
            velU = mix(velU, -fluidVelocity.y, step(1.0, stU.y));
            velD = mix(velD, -fluidVelocity.y, step(stD.y, 0.0));
            fragColor.r = 0.5 * (velR - velL + velU - velD);
            return;
        case _PROCESS_PRESSURE:
            pL = texture(texPressure, stL).x;
            pR = texture(texPressure, stR).x;
            pU = texture(texPressure, stU).x;
            pD = texture(texPressure, stD).x;
            div = texture(texDivergence, st).x;
            float pressure = 0.25 * (pL + pR + pU + pD - div);
            fragColor.r = pressure;
            return;
        case _PROCESS_GRADIENT_SUBTRACTION:
            fluidVelocity = texture(texVelocity, st).xy;
            pL = texture(texPressure, stL).x;
            pR = texture(texPressure, stR).x;
            pU = texture(texPressure, stU).x;
            pD = texture(texPressure, stD).x;
            fluidVelocity.xy -= vec2(pR - pL, pU - pD);
            fragColor.rg = fluidVelocity;
            return;
        case _PROCESS_ADVECTION:
            fluidVelocity = texture(texVelocity, st).xy;
            fragColor = simulateAdvection(texVelocity, iVelocityDissipation);
            return;
        case _PROCESS_FLUID_COLOR:
            fluidVelocity = texture(texVelocity, st).xy;
            fragColor = simulateAdvection(texColor, iColorDissipation);
            return;
        case _POST_BLOOM_PREFILTER:
            float knee = iBloomThreshold * iBloomSoftKnee + 1.e-4;
            vec3 curve = vec3(iBloomThreshold - knee, knee * 2., 0.25 / knee);
            vec3 col = texture(texColor, st).rgb;
            float br = iBloomPreGain * max3(col);
            float rq = clamp(br - curve.x, 0., curve.y);
            rq = curve.z * rq * rq;
            col *= max(rq, br - iBloomThreshold) / max(br, 1.e-4);
            fragColor = vec4(col, 0.);
            return;
        case _POST_BLOOM_BLUR:
            fragColor = 0.25 * (
                texture(texPostBloom, stL) +
                texture(texPostBloom, stR) +
                texture(texPostBloom, stU) +
                texture(texPostBloom, stD)
            );
            return;
        case _POST_SUNRAYS_CALC_MASK:
            fluidColor = texture(texColor, st);
            br = max3(fluidColor.rgb);
            fragColor.a = 1.0 - clamp(br * 20., 0., 0.8);
            fragColor.rgb = fluidColor.rgb;
            return;
        case _POST_SUNRAYS_CALC:
            fragColor = vec4(calcSunrays(), 0., 0., 1.);
            return;
        case _POST_SUNRAYS_BLUR:
            const float centerWeight = 0.294117;
            float weight = (1. - centerWeight) * 0.5;
            fragColor = centerWeight * texture(texPostSunrays, st)
                + weight * texture(texPostSunrays, st - 1.333 * texelSize)
                + weight * texture(texPostSunrays, st + 1.333 * texelSize);
            return;
        case _RENDER_FLUID:
            fluidColor = texture(texColor, st);
            if (debugOption == 3) {
                fragColor = debugRedChannel(texCurl, 0.2);
                return;
            } else if (debugOption == 2) {
                fragColor = fluidColor;
                return;
            }
            // debugOption == 1 see below

            const vec3 bg = c.yyy;
            fragColor.rgb = makeSurplusWhite(fluidColor.rgb);
            fragColor.rgb = fluidColor.rgb + (1. - fluidColor.a) * bg;

            float sunrays = texture(texPostSunrays, st).r;
            fragColor.rgb *= sunrays;
            vec3 bloom = texture(texPostBloom, st).rgb;
            bloom *= iBloomIntensity;
            bloom *= sunrays;

            if (iBloomDithering > 0.) {
                const vec2 ditherTexSize = vec2(64.); // textureSize(texPostDither, 0)
                vec2 scale = iResolution / ditherTexSize;
                float dither = texture(texPostDither, st * scale).r;
                dither = dither * 2. - 1.;
                bloom += dither * iBloomDithering / 255.;
            }
            bloom = max(
                1.055 * pow(max(bloom, c.yyy), vec3(0.4167)) - 0.055,
                c.yyy
            );
            fragColor.rgb += bloom;
            fragColor.a = max3(fragColor.rgb);

            if (debugOption == 1) {
                // DEBUGGING: BLEND ON BLACK
                fragColor.rgb = fragColor.rgb + (1. - fragColor.a) * c.yyy;
            } else {
                postprocessing(fragColor.rgb, uv);
            }
            fragColor.a = 1.;
            return;

        case _RENDER_FINALLY_TO_SCREEN:
            finalComposition(uv);
            fragColor.a = 1.;
            return;
    }
}

