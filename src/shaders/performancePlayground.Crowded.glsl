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

const vec3 pVec = vec3(.1031, .1030, .0973);
vec3 hash33(vec3 p3) {
    p3 = fract(p3 * pVec);
    p3 += dot(p3, p3.yxz+33.33);
    return fract((p3.xxy + p3.yxx)*p3.zyx);
}
//
//vec3 hash33(vec3 p3) {
//    // Simple hash using sine and fract - faster approximation
//    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
//    p3 += sin(dot(p3, p3.yzx + 19.19)) * 0.1; // fewer/arithmetic ops
//    return fract(vec3(
//        dot(p3, vec3(0.3183099, 0.3678794, 0.6180339)),
//        dot(p3, vec3(0.7071067, 0.1715729, 0.4142136)),
//        dot(p3, vec3(0.5773503, 0.7071067, 0.7071067))
//    ));
//}
vec3 hash33_pcg(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.zyx + 33.33);
    return fract((p.xxy + p.yzz) * p.zyx);  // Slightly cheaper swizzles, maybe?
}

//const float F3 =  0.3333333;
//const float G3 =  0.1666667;
const vec3 F3 =  vec3(0.3333333);
const vec3 G3 =  vec3(0.1666667);

float lfnoise3(vec3 p) {
    /* 1. find current tetrahedron T and it's four vertices */
    /* s, s+i1, s+i2, s+1.0 - absolute skewed (integer) coordinates of T vertices */
    /* x, x1, x2, x3 - unskewed coordinates of p relative to each of T vertices*/

    /* calculate s and x */
//    vec3 s = floor(p + dot(p, vec3(F3)));
//    vec3 x = p - s + dot(s, vec3(G3));
    vec3 s = floor(p + dot(p, F3));
    vec3 x = p - s + dot(s, G3);

    /* calculate i1 and i2 */
    vec3 e = step(vec3(0), x - x.yzx);
    vec3 i1 = e*(1.0 - e.zxy);
    vec3 i2 = 1.0 - e.zxy * (1. - e);

    /* x1, x2, x3 */
    vec3 x1 = x - i1 + G3;
    vec3 x2 = x - i2 + 2. * G3;
    vec3 x3 = x - 1. + 3. * G3;

    /* 2. find four surflets and store them in d */
    vec4 w, d;

    /* calculate surflet weights */
    w.x = dot(x, x);
    w.y = dot(x1, x1);
    w.z = dot(x2, x2);
    w.w = dot(x3, x3);

    /* w fades from 0.6 at the center of the surflet to 0.0 at the margin */
    w = max(0.6 - w, 0.);

    // vec3 h = hash33(s) - 0.5;
    /* calculate surflet components */
    d.x = dot(hash33(s) - .5, x);
    d.y = dot(hash33(s + i1) - .5, x1);
    d.z = dot(hash33(s + i2) - .5, x2);
    d.w = dot(hash33(s + 1.) - .5, x3);

    // Note: in Theory, we could try to Unroll + Reuse Registers
    // Or to use a PCG Style Hash?
    // -> TODO unfinished

    /* multiply d by w^4 */
    w *= w;
    w *= w;
    d *= w;

    /* 3. return the sum of the four surflets */
    return dot(d, vec4(52.));
}

/* const matrices for 3d rotation */
const mat3 rot1 = mat3(-0.37, 0.36, 0.85,-0.14,-0.93, 0.34,0.92, 0.01,0.4);
const mat3 rot2 = mat3(-0.55,-0.39, 0.74, 0.33,-0.91,-0.24,0.77, 0.12,0.63);
const mat3 rot3 = mat3(-0.71, 0.52,-0.47,-0.08,-0.72,-0.68,-0.7,-0.45,0.56);

float mfnoise3(vec3 m) {
    return   0.5333333 * lfnoise3(m * rot1)
    + 0.2666667 * lfnoise3(2. * m * rot2)
    + 0.1333333 * lfnoise3(4. * m * rot3)
    + 0.0666667 * lfnoise3(8. * m);
}

float xt95noise(vec3 m);

float xt95mfnoise3(vec3 m) {
    return (
        0.5333333 * xt95noise(m * rot1)
        + 0.2666667 * xt95noise(2. * m * rot2)
        + 0.1333333 * xt95noise(4. * m * rot3)
        + 0.0666667 * xt95noise(8. * m)
    ) * 1.5 - 0.75;
}

float noise( in vec3 x ) {
    // Ratio of fbmB2A to fbmB2 with 4 iterations drops to 30x with lfnoise3(x), is 70x with mfnoise3(x)
    // (but this difference for 2 iterations is negligible!)
    // QM MOD II
//    return lfnoise3(x);
     return mfnoise3(x);
}

vec3 hash31(float p)
{
    vec3 p3 = fract(vec3(p) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yzx+33.33);
    return fract((p3.xxy+p3.yzz)*p3.zyx);
}

float fbmA(vec3 p, int maxOctave) {
    const float iCloudSeed = 11.07;
    vec3 q = p + 1.e4 * hash31(iCloudSeed);// + iTime * 0.5 * vec3(1.0, -0.2, -1.0);
    // float g = noise(q);

    float f = 0.0;
    float scale = 0.5;
    float factor = 2.02;

//    if(lowRes) {
//        maxOctave = 3;
//    }

    for (int i = 0; i < maxOctave; i++) {
        f += scale * noise(q);
        q *= factor;
        factor += 0.21;
        scale *= 0.5;
    }

    // somewhat match the value range of fbmB()
    return 1.25 * (f + 0.4);
}


float fbmA2B3(vec3 p, int maxOctave) {
    const float iCloudSeed = 11.07;
    vec3 q = p + 1.e4*hash31(iCloudSeed);
    float f = 0.0;
    float scale = 0.5;
    float factor = 2.02;
    for (int i = 0; i < maxOctave; i++) {
        f += scale * xt95mfnoise3(q);
        q *= factor;
        factor += 0.21;
        scale *= 0.5;
    }
    return f;
}

float fbmA(vec3 p) {
    return fbmA(p, 6);
}

float hash( float n )
{
    return fract(sin(n)*43758.5453);
}

float xt95noise( in vec3 x )
{
    x *= iNoiseScale;
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;

    float res = mix(mix(mix( hash(n+  0.0), hash(n+  1.0),f.x),
    mix( hash(n+ 57.0), hash(n+ 58.0),f.x),f.y),
    mix(mix( hash(n+113.0), hash(n+114.0),f.x),
    mix( hash(n+170.0), hash(n+171.0),f.x),f.y),f.z);
    return res;
}

mat3 m = mat3(
    0.00,  0.80,  0.60,
    -0.80,  0.36, -0.48,
    -0.60, -0.48,  0.64
);

float fbmB( vec3 p )
{
    float f;
    p *= iScale;
    // somewhat match the spatial scaling of fbmA():
    p *= 2.5;

    f  = 0.5000*xt95noise( p ); p = m*p*2.02;
    f += 0.2500*xt95noise( p ); p = m*p*2.03;
    f += 0.1250*xt95noise( p ); p = m*p*2.01;
    f += 0.0625*xt95noise( p );
    return f;
}

float fbmB1(vec3 p, int maxOctave)
{
    // somewhat match the spatial scaling of fbmA():
    p *= 2.5;
    p *= iScale;
    float f = 0.;
    float a = 0.5;
    float b = 2.02;
    for (int i = 0; i < maxOctave; i++) {
        f += a*xt95noise( p );
        p = m*p;
        p *= b;
        b += (i == 1 ? -0.02 : 0.01);
        a *= 0.5;
    }
    return f;
}

const float xt95scale = 2.8;

float fbmB2(vec3 p, int maxOctave)
{
    // somewhat match the spatial scaling of fbmA():
    p *= xt95scale;
    float f = 0.;
    float a = 0.5;
    float b = 2.02;
    f = a*xt95noise( p );
    for (int i = 0; i < maxOctave - 1; i++) {
        p = m*p;
        p *= b;
        b += (i == 1 ? -0.02 : 0.01);
        a *= 0.5;
        f += a*xt95noise( p );
    }
    // somewhatly match the output values
    return 0.8 * f - 0.16;
}

float fbmB2A(vec3 p, int maxOctave)
{
    // fbmB2 (B with more octaves) but with noise() from fbmA
    float f = 0.;
    float a = 0.5;
    float b = 2.02;
    f = a*noise( p );
    for (int i = 0; i < maxOctave - 1; i++) {
        p = m*p;
        p *= b;
        b += (i == 1 ? -0.02 : 0.01);
        a *= 0.5;
        f += a*noise( p );
    }
    return f;
}


float fbmB2A2(vec3 p, int maxOctave)
{
    // fbmB2 (B with more octaves) but noise() from fbmA for the base octave
    float f = 0.;
    float a = 0.5;
    float b = 2.02;
    f = a*noise( p );
    for (int i = 0; i < maxOctave - 1; i++) {
        p = m*p;
        p *= b;
        b += (i == 1 ? -0.02 : 0.01);
        a *= 0.5;
        f += a*xt95noise( xt95scale * p );
    }
    return f;
}

/////////

float sin_approx(float x) {
    x = mod(x + 1., 2.) - 1.;
    return x * (1. - abs(x));
}

mat3 rotAround(vec3 axis, float angle) {
    // Für allgemeine Drehmatrizen:
    // https://en.wikipedia.org/wiki/Rodrigues%27_rotation_formula
    vec3 v = normalize(axis);
    mat3 skewSym = mat3(
    0, v.z, -v.y,
    -v.z, 0, v.x,
    v.y, -v.x, 0
    );
    // Diese Schiefsymmetrische Matrix bewirkt das Kreuzprodukt:
    // skewSym(v1) * v2 == cross(v1, v2)
    float c = cos(angle);
    float s = sin(angle);
    return mat3(1.) + s * skewSym + (1. - c) * skewSym * skewSym;
    // Andere Schreibweise mit GLSL-eingebautem outerProduct:
    // return mat3(c) + s * skewSym + (1. - c) * outerProduct(v, v);
    // -> outerProduct() = 1 + skewSym²
}

float sdSphere( vec3 p, float s )
{
    return length(p)-s;
}

float sdBox( vec3 p, vec3 b )
{
    vec3 d = abs(p) - b;
    return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

vec2 iBox( in vec3 ro, in vec3 rd, in vec3 rad )
{
    vec3 m = 1.0/rd;
    vec3 n = m*ro;
    vec3 k = abs(m)*rad;
    vec3 t1 = -n - k;
    vec3 t2 = -n + k;
    return vec2( max( max( t1.x, t1.y ), t1.z ),
    min( min( t2.x, t2.y ), t2.z ) );
}

struct Marched {
    float distance; // <-- das heißt wirklich oft einfach nur "t". Wir machen es _hier_mal_explizit_.
    int material;
    float paletteColor;
};

#define OBJECT_MATERIAL 1
#define FLOOR_MATERIAL 0
#define NO_MATERIAL -1

Marched opUnion(Marched res1, float distance2, int material2, float color2)
{
    if (res1.distance < distance2) {
        return res1;
    }
    return Marched(distance2, material2, color2);
}

Marched map( in vec3 pos, bool modified)
{
    float floorY = max(0., iNoiseLevel * fbmA(pos * iNoiseFreq, iNoiseOctaves));
    Marched res = Marched(pos.y - floorY, FLOOR_MATERIAL, 0.);

    float nObjectsX = nObjectsProDim;
    float nObjectsZ = nObjectsProDim;
    float shiftX = -0.5 * nObjectsX;
    float shiftZ = -0.5 * nObjectsZ;
    float spacing = 1.9;

    for (float z = 0.; z < nObjectsZ; z+=1.)
    for (float x = 0.; x < nObjectsX; x+=1.)
    {
        vec3 rand1 = hash31(1. + x/100. + z/10.);
        vec3 center = vec3(
            (x + shiftX)/spacing,
            0.9, // 0.7 + floorY
            (z + shiftZ)/spacing
        );
        // Lässt sich... sin() vereinfachen, wenn er nur aus optischen Gründen
        // gewählt wird? Versuche z.B. sin_approx() von oben
//        if (modified) {
//            center.y -= 0.2 * sin_approx(iTime + rand1.y * 6.28 + 1.57);
//            center.x += 0.03 * sin_approx(rand1.x * iTime);
//            center.z += 0.03 * sin_approx(rand1.z * iTime);
//        } else
        {
            center.y -= 0.2 * cos(iTime + rand1.y * 6.28);
            center.x += 0.03 * sin(rand1.x * iTime);
            center.z += 0.03 * sin(rand1.z * iTime);
        }

        // Interessante Frage (habs nicht ausprobiert):
        // Können hier sinnvolle Bounding Boxes gewählt werden
        // oder laufen wir damit erstmal nur in die Branching-Falle?

        res = opUnion(
            res,
            sdSphere(pos - center, 0.15),
            OBJECT_MATERIAL,
            4. + x + 8. * z
        );
        // Das Folgende Demonstriert Branch-Divergenz ganz gut:
        // für nObjectsProDim = 11 führt allein die Präsenz dieser Abbruchbedingung
        // zu einem Drop von 40 -> 20 FPS (auf meinem Laptop)
        if (res.distance < 0.001) {
            break;
        }
    }
    return res;
}

vec3 calcNormal( in vec3 pos, bool modified)
{
    vec2 e = vec2(1.0,-1.0)*0.5773*0.0005;
    return normalize( e.xyy*map( pos + e.xyy, modified ).distance +
    e.yyx*map( pos + e.yyx, modified).distance +
    e.yxy*map( pos + e.yxy, modified ).distance +
    e.xxx*map( pos + e.xxx, modified ).distance );
}

float calcSoftshadow( in vec3 ro, in vec3 rd, bool modified)
{
    const float mint = 0.2;
    float tmax = 2.5;

    // bounding volume
    float tp = (0.8-ro.y)/rd.y;
    if( tp>0.0 ) tmax = min( tmax, tp );

    float res = 1.0;
    float t = mint;
    /// Beispiel Vergleichs-Modifikation... hier ist vielleicht was zu holen?
    // int nShadowMarchingSteps = modified ? 70 : 70;
    for (int i=0; i < nShadowMarchingSteps; i++)
    {
        float h = map(ro + rd*t, modified).distance;
        float s = clamp(8. * h/t, 0.0, 1.0);
        res = min( res, s );
        t += clamp( h, 0.01, 0.2 );
        if( res<0.004 || t>tmax ) break;
    }
    /// Beispiel Vergleichs-Modifikation (die aber wenig Unterschied macht)
    if (modified) {
        res = clamp( res, 0.0, 1.0 );
        return res*res*(3.0-2.0*res);
    } else {
        return smoothstep(0., 1., res);
    }
}

vec3 renderSampleRaymarching(vec2 uv, bool modified) {
    // Idee: mit if(modified) { ...optimieren versuchen... }
    vec2 pan = iMouseDrag.xy / iResolution.x;

    vec3 rayOrigin = vec3(3.5, 1.7 + 10. * pan.y, -2.6);
    vec3 camTarget = vec3(-1.2, 0.7 - pan.y, 0.55);
    vec3 camForward = normalize(camTarget - rayOrigin);
    vec3 camRight = normalize(cross(camForward, c.yxy));
    vec3 camUp = cross(camRight, camForward);
    mat3 extraYaw = rotAround(camUp, pan.x);
    mat3 camMatrix = extraYaw * mat3(camRight, camUp, camForward);
    vec3 rayDir = camMatrix * normalize(vec3(uv, 2.5));

    // raymarch scene
    Marched res = Marched(-1.0, NO_MATERIAL, -1.0);

    float tmin = 1.0;
    float tmax = 20.0;

    // raytrace floor plane
    float tp1 = (0.0-rayOrigin.y)/rayDir.y;
    if (tp1>0.0)
    {
        tmax = min( tmax, tp1 );
        res = Marched(tp1, FLOOR_MATERIAL, .0);
    }
    vec2 tb = iBox( rayOrigin-vec3(-2.0,0.4,-1.5), rayDir, vec3(4.,2.,3.0) );
    if( tb.x<tb.y && tb.y>0.0 && tb.x<tmax)
    {
        tmin = max(tb.x,tmin);
        tmax = min(tb.y,tmax);

        float t = tmin;
        /// Beispiel Vergleichs-Modifikation: ist 70 einfach unnötig viel?
        // int nMarchingSteps = modified ? 70 : 70;
        for( int i=0; i < nMarchingSteps && t<tmax; i++ )
        {
            vec3 pos = rayOrigin + rayDir * t;
            Marched h = map(pos, modified);

            // Möglicher Vergleich: Verschiedene Maximaldistanzen
            // Oder auch adaptive Abbruchbedingung "< 0.0001 * t"?
            // -> Ergebnis vs. Rechenaufwand vergleichen...
            bool isClose = modified
                ? (abs(h.distance) < 0.0001 * t)
                : (abs(h.distance) < 0.001);
            if (isClose)
            // if (abs(h.distance) < 0.001)
            {
                res = Marched(t, h.material, h.paletteColor);
                break;
            }
            t += h.distance;
        }
    }
    vec3 col;
    if (res.material != NO_MATERIAL) {
        vec3 rayPos = rayOrigin + res.distance * rayDir;
        vec3 normal = res.material == FLOOR_MATERIAL ? vec3(0.0, 1.0, 0.0) : calcNormal(rayPos, modified);

        col = 0.2 + 0.2*sin(res.paletteColor*2.0 + vec3(0.0, 1.0, 2.0));
        float specularCoeff = 0.4 + 0.5 *exp(0.03 * res.paletteColor);

        if (res.material == FLOOR_MATERIAL)
        {
            float f = 1. - abs(step(0.5, fract(1.5*rayPos.x)) - step(0.5, fract(1.5*rayPos.z)));
            col = 0.15 + f*vec3(0.25);
            specularCoeff = 0.1;
        }

        vec3 shade = vec3(0.0);
        bool useBlinnPhongSpecular = false; // <-- Ein Fall für "modified"?
        float specularExponent = 2.4;
        // Licht: reines Richtungslicht (passt zu einer Sonne, die weit weg ist, im Gegensatz zu Punktlicht)
        {
            vec3  lightDirection = normalize(vec3(1., 2., -.1));
            float diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);
            diffuse *= calcSoftshadow(rayPos, lightDirection, modified);

            float specular, shininess;
            if (useBlinnPhongSpecular) {
                vec3 halfway = normalize(lightDirection - rayDir);
                specular = dot(normal, halfway);
                shininess = specularExponent * 3.;
            } else {
                vec3 reflected = reflect(lightDirection, normal);
                specular = dot(rayDir, reflected);
                    shininess = specularExponent;
            }
            specular = pow(clamp(specular, 0.0, 1.0), shininess);

            const vec3 sourceCol = vec3(1.30, 1.00, 0.70);
            shade += col * 0.8 * sourceCol * diffuse;
            shade +=       1.3 * sourceCol * specular * specularCoeff;
        }

        col = shade;
    } else {
        res.distance = 1.e5;
    }

    // "Distanznebel", inwiefern macht dieser Begriff Sinn?
    vec3 colFog = vec3(fbmB(rayDir));
    if (mod(gl_FragCoord.x, 3.) <= 1.) {
        colFog.r = pow(colFog.r, 1./colFog.g);
    } else {
        colFog.g += 0.2 * sin(colFog.b);
    }
    float fogOpacity = 1.0 - exp( -0.0001 * pow(res.distance, 3.0));
    col = mix(col, colFog, fogOpacity);

    col = clamp(col, 0.0, 1.0);
    col = pow(col, vec3(1./1.7));

    return col;
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

        // toFragColor(renderSampleRaymarching(uv, !passA));

        if (passA) {
            toFragColor(doDivision(uv));
        } else {
            toFragColor(doMultiply(uv));
        }

        //        toFragColor(passA ? doDivision(uv) : doMultiply(uv));
//        toFragColor(passA ? inbuiltReflect(uv) : customReflect(uv));
//        toFragColor(passA ? useBranching(uv) : useNoBranching(uv));
//        toFragColor(passA ? inbuiltSmoothstep(uv) : splineSmoothstep(uv));
        /*
        if (passA) {
            toFragColor(calcSomethingViaReturn(uv));
        } else {
            vec3 resultB;
            calcSomethingViaOutVar(resultB, uv);
            toFragColor(resultB);
        }
        */

//        toFragColor(passA ? fbmA(ray, 4) : fbmB(ray));
//        toFragColor(passA ? fbmB1(ray, 4) : fbmB(ray));
//        toFragColor(passA ? noise(ray) : xt95noise(ray));

        // Sehr sehr interessant. fbmB-mit-Noise-von-A dauert ~ 70x so lang wie fbm
//          toFragColor(passA ? fbmB2A(ray, 4) : fbmB2(ray, 4));
        // aber die beiden noises im Direktvergleich dauert nur ~ 2-3% länger :O
//               toFragColor(passA ? noise(ray) : xt95noise(ray));
        // aber ab 3 levels passiert das:
        //        toFragColor(passA ? fbmB2A(ray, 2) : fbmB2(ray, 2));
//        toFragColor(passA ? fbmB2A(ray, 3) : fbmB2(ray, 3));
//        toFragColor(passA ? fbmB2A(ray, 6) : fbmA(ray, 6));
//        toFragColor(passA ? fbmB2(ray, 4) : fbmB(ray));
//         toFragColor(passA ? fbmB2A(ray, 6) : fbmB2(ray, 6));
//        toFragColor(passA ? fbmB2A2(ray, 10) : fbmB2(ray, 10));
//        toFragColor(passA ? fbmA2B3(ray, 6) : fbmA(ray, 6));
//
        // toFragColor(passA ? mfnoise3(ray) : xt95mfnoise3(ray));

        // More Stuff to investigate:
        // - using c.xyz instead of vec3(...) calls

    }
}
