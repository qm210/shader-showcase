#version 300 es
precision mediump float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform vec4 iMouseDrag;
uniform float iTime;
uniform int iFrame;
uniform int iPassIndex;
uniform bool onlyPassA;
uniform bool onlyPassB;

uniform int iQueryRepetitions;
uniform float iCutoffMin;
uniform float iCutoffMax;
uniform float iResultMin;
uniform float iResultMax;
uniform float iScale;
uniform int iStepIterations;
uniform float iStepLength;
uniform float iNoiseLevel;
uniform float iNoiseFreq;
uniform float iNoiseScale;
uniform int nShadowMarchingSteps;
uniform int nMarchingSteps;
uniform int iNoiseOctaves;
uniform sampler2D textureA;
uniform sampler2D textureB;

uniform float nObjectsProDim;

uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform float iFree5;
uniform vec3 vecFree0;
uniform vec3 vecFree1;
uniform vec3 vecFree2;

const vec3 c = vec3(1, 0, -1);

float resultScale;

#define ZERO min(0, iFrame)

////////////////////////////////////////////////////////////////////////

#define MAX_STEPS 1000

float doMultiply(in vec2 uv) {
    float result = 1.;
    for (int i = ZERO; i < MAX_STEPS; i++) {
        result *= iStepLength;
    }
    return 0.5;
}

float doDivision(in vec2 uv) {
    float result = 1.;
    for (int i = ZERO; i < MAX_STEPS; i++) {
        result /= iStepLength;
    }
    return 0.5;
}

////////////////////////////////////////////////////////////////////////

const vec3 normal = vec3(1, 0, 0);

vec3 inbuiltReflect(in vec2 uv) {
    vec3 rayDir = normalize(vec3(uv, 1.));
    vec3 target = reflect(rayDir, normal);
    return 0.5 + 0.5 * normalize(target);
}

vec3 customReflect(in vec2 uv) {
    vec3 rayDir = normalize(vec3(uv, 1.));
    vec3 target = rayDir - 2. * dot(rayDir, normal) * normal;
    return 0.5 + 0.5 * normalize(target);
}

////////////////////////////////////////////////////////////////////////

vec3 useBranching(in vec2 uv) {
    float x = uv.x * iResolution.x;
    if (mod(floor(x / 10.0), 2.0) < 1.0) {
        return vec3(sin(x) * 0.5 + 0.5, 0.0, 0.0);
    } else {
        return vec3(0.0, cos(x) * 0.5 + 0.5, 0.0);
    }
}

vec3 useNoBranching(in vec2 uv) {
    float x = uv.x * iResolution.x;
    float cond = step(0.5, mod(floor(x / 10.0), 2.0));
    vec3 a = vec3(sin(x) * 0.5 + 0.5, 0.0, 0.0);
    vec3 b = vec3(0.0, cos(x) * 0.5 + 0.5, 0.0);
    return mix(a, b, cond);
}

////////////////////////////////////////////////////////////////////////

vec3 calcSomethingViaReturn(in vec2 uv) {
    return 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));
}

void calcSomethingViaOutVar(out vec3 result, in vec2 uv) {
    result = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));
}

////////////////////////////////////////////////////////////////////////

float inbuiltSmoothstep(vec2 uv) {
    float x = uv.y - uv.x;
    return smoothstep(0., 1., x);
}

float splineSmoothstep(vec2 uv) {
    float x = uv.y - uv.x;
    x = clamp(x, 0., 1.);
    x = x * x * (3. - 2. * x);
    return x;
}

////////////////////////////////////////////////////////////////////////

float hash_slow(vec2 uv)
{
    return fract(
    sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453
    );
}

float uint_to_unit_float(uint x)
{
    return float(x) * (1.0 / 4294967296.0); // 1 / 2^32
}

uint hash_fast_uint(uint x)
{
    x ^= x >> 16;
    x *= 0x7feb352du;
    x ^= x >> 15;
    x *= 0x846ca68bu;
    x ^= x >> 16;
    return x;
}

float hash_fast(vec2 uv)
{
    uv += c.xx;
    // Scale uv so neighbors map to different integers; tweak as needed
    uvec2 i = uvec2(uv * 4096.0);
    uint  x = i.x * 0x9e3779b9u + i.y;
    return uint_to_unit_float(hash_fast_uint(x));
}

/////////

float sin_approx(float x) {
    x = mod(x + 1., 2.) - 1.;
    return x * (1. - abs(x));
}

////////////////////////////////////////////////////////////////////////

void toFragColor(vec3 result) {
    fragColor.rgb = (result - iResultMin) * resultScale;
}

void toFragColor(float result) {
    if (result < iCutoffMin) {
        fragColor.rgb = c.xyy;
    } else if (result > iCutoffMax) {
        fragColor.rgb = c.xyx;
    } else {
        toFragColor(vec3(result));
    }
}

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    if (iPassIndex == -1) {
        vec2 st = gl_FragCoord.xy / iResolution.xy;
        fragColor.a = 1.;

        if (onlyPassB && !onlyPassA) {
            fragColor.rgb = texture(textureB, st).rgb;
            return;
        }
        if (onlyPassA && !onlyPassB) {
            fragColor.rgb = texture(textureA, st).rgb;
            return;
        }

        // Both Passes Queried? Compare A left and B right
        if (uv.x < -0.01) {
            st.x += 0.25;
            fragColor.rgb = texture(textureA, st).rgb;
        } else if (uv.x > 0.01) {
            st.x -= 0.25;
            fragColor.rgb = texture(textureB, st).rgb;
        } else {
            discard;
        }
        return;
    }

    // common setup stuff that one comparison or the other might use
    bool passA = iPassIndex == 0;
    vec3 ray = normalize(vec3(uv, 2.5));
    resultScale = 1. / (iResultMax - iResultMin);
    uv /= iScale;
    ray /= iScale;

    for (int i = ZERO; i < iQueryRepetitions; i++) {

//        if (passA) {
//            toFragColor(doDivision(uv));
//        } else {
//            toFragColor(doMultiply(uv));
//        }

//        if (passA) {
//            toFragColor(inbuiltSmoothstep(uv));
//        } else {
//            toFragColor(splineSmoothstep(uv));
//        }

        if (passA) {
            toFragColor(hash_slow(uv));
        } else {
            toFragColor(hash_fast(uv));
        }
    }
}
