#version 300 es

// based on: https://www.shadertoy.com/view/Xds3zN
// simplified for our lecture (cf. 8b_raymarching.glsl)
// then put some more basic concepts for 3D in here.

precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform int iFrame;
uniform vec4 iMouseDrag;
uniform sampler2D texFrame;
uniform sampler2D texSpace;
uniform sampler2D texRock;
uniform vec3 iCamOffset;
uniform vec3 iCamLookOffset;
uniform float iCamRoll;
uniform float iCamFocalLength;
uniform float iPathSpeed;
uniform float iPathOffset;
uniform float iCylinderRotateYSpeed;
uniform float iCylinderThenRotateZSpeed;
uniform float iCylinderThenRotateNewYSpeed;
uniform vec3 vecDirectionalLight;
uniform float iDirectionalLightStrength;
uniform float iPointLightStrength;
uniform float iLightSourceMix;
uniform float iLightPointPaletteColor;
uniform float iAmbientAmount;
uniform float iDiffuseAmount;
uniform float iSpecularAmount;
uniform float iSpecularExponent;
uniform float iBacklightAmount;
uniform float iSubsurfaceAmount;
uniform float iSubsurfaceExponent;
uniform float iAmbientOcclusionScale;
uniform float iAmbientOcclusionRadius;
uniform float iAmbientOcclusionSamples;
uniform float iDistanceFogExponent;
uniform float iToneMapExposure;
uniform float iToneMapACESMixing;
uniform float iToneMapACESExposure;
uniform float iGammaExponent;
uniform float iNoiseLevel;
uniform float iNoiseFreq;
uniform float iNoiseOffset;
uniform int iFractionalOctaves;
uniform float iFractionalScaling;
uniform float iFractionalDecay;
// toggle options
uniform bool doShowPointLightSource;
uniform bool doUseCameraPath;
uniform bool doUseCameraTargetPath;
uniform bool displayCameraPathPoints;
uniform bool displayCameraRotationAxes;
uniform bool drawGridOnFloor;
uniform bool justTheBoxes;
uniform bool showPyramidTextureGrid;
uniform bool applyPyramidTextureNarrowing;
uniform bool applyPyramidTextureSkewing;
uniform bool applyPyramidTextureTopDown;
uniform bool takeBoxTextureForPyramid;
uniform bool useCentripetalCatmullRomSplines;
uniform bool useLinearSplines;
uniform bool tryLinearSplineSpeedApproximation;
uniform bool useNormalizedFBM;
// and for you to play around with:
uniform float iFree0;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform float iFree5;
uniform vec3 vecFree0;
uniform vec3 vecFree1;
uniform vec3 vecFree2;

const float pi = 3.141593;
const float twoPi = 2. * pi;
const float piHalf = .5 * pi;
const vec4 c = vec4(1., 0. , -1., .5);

const float MISSING_MATERIAL = -0.5;
const float UNKNOWN_MATERIAL = 0.0;
const float MATERIAL_FLOOR = 1.0;
const float MATERIAL_BOX = 3.0;
const float MATERIAL_CYLINDER = 10.83;
const float MATERIAL_PYRAMID = 13.0;
const float MATERIAL_MOUNTAINS = 2.0;
const float MATERIAL_PATH_POINT = 1.4;
const float MATERIAL_PATH_TARGET_POINT = 1.41;
const float MATERIAL_ARROW = 50.;

#define ZERO min(0, iFrame)

/////////////////////////

const int nPath = 7;
vec3 camPosPath[nPath] = vec3[nPath](
    vec3(-0.75, 1.5, 3.),
    vec3(-0., 1.0, 1.8),
    vec3(0.5, 0.25, 1.25),
    vec3(-0.3, 0.7, -3.3),
    vec3(-2.3,0.73, -1.3),
    vec3(1.7, 0.4, -3.0),
    vec3(1.5, 0.8, 2.1)
);
float linearCamPathLength;

vec4 targetPath[nPath] = vec4[nPath](
    vec4(-0.3, 1., 1.7, 0.),
    vec4(-0.3, 0.35, 1.05, 0.),
    vec4(-0.3, 0.65, -3.3, -.2),
    vec4(-2.,0.73, -1.3, 2.),
    vec4(0.6, 0.5, -0.8, 3.1),
    vec4(0.1, 0.0, 0.1, 0.),
    vec4(-0.75, 1.5, 3., -1.)
);

// machen wir hier nur global, um die Richtungen in der Szene anschauen zu können.
struct Camera {
    vec3 origin;
    vec3 forward;
    vec3 right;
    vec3 up;
    mat3 matrix;
    // speziell diese hier haben nur Verwendung zum initialen Ausrechnen von .matrix:
    vec3 target;
    vec3 tForward;
    vec3 tRight;
    vec3 tUp;
};
Camera cam;

/////////////////////////

mat3 rotX(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    // Obacht: GLSL-Matrizen sind "column-major", d.h. die ersten drei Einträge sind die erste Spalte, etc.
    // Auf die einzelnen Spalten zugreifen lässt sich per: vec3 zweiteSpalte = matrix[1];
    return mat3(
        1.0, 0.0, 0.0,
        0.0,   c,   s,
        0.0,  -s,   c
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

mat3 rotZ(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat3(
          c,   s, 0.0,
         -s,   c, 0.0,
        0.0, 0.0, 1.0
    );
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

mat3 rotTowards(vec3 original, vec3 target) {
    // Vorgehen, um allgemein eine Matrix für die Rotation original -> target zu bekommen:
    float cosine = dot(original, target);
    vec3 axis = cross(original, target);
    if (axis == c.yyy) {
        // Kreuzprodukt 0 bei parallelen Vektoren
        return mat3(cosine);
    }
    float theta = acos(cosine);
    return rotAround(axis, -theta);
}

mat2 rot2D(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(
        c, s,
       -s, c
    );
}

/// Pseudozufall-Generatoren nach Art "Hash" und Angabe der Dimensionalität:
/// hash11 -> float in, float out; hash22 -> vec2 in, vec2 out; etc.
float hash11( float n )
{
    return fract( n*17.0*fract( n*0.3183099 ) );
}

vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453;
    // custom phase shift just to have more variation, is not part of the actual hash
    n += iNoiseOffset;
    return fract(vec2(n, n * 1.2154));
}

float voronoiPattern(vec2 uv, bool returnCellBorders) {
    const float scale = 10.;
    uv *= scale;
    vec2 uvInt = floor(uv);
    vec2 uvFrac = fract(uv);
    float dMin = 1.0;
    float dSecondMin = 1.0;
    for (float y = -1.; y < 1.01; y += 1.) {
        for (float x = -1.; x < 1.01; x += 1.) {
            vec2 b = vec2(x, y);
            vec2 r = b + hash22(uvInt + b + iNoiseOffset) - uvFrac;
            float d = length(r);
            if (d < dMin) {
                dSecondMin = dMin;
                dMin = d;
            } else if (d < dSecondMin) {
                dSecondMin = d;
            }
        }
    }
    // Manchmal will man die Voronoi-Zellen selbst, manchmal ihre Grenzen:
    return (
        returnCellBorders
            ? dSecondMin - dMin
            : dMin
    );
}

float perlin2D(vec2 p)
{
    vec2 pi = floor(p);
    vec2 pf = p - pi;
    vec2 w = pf * pf * (3.-2.*pf);

    float f00 = dot(hash22(pi+vec2(.0,.0)),pf-vec2(.0,.0));
    float f01 = dot(hash22(pi+vec2(.0,1.)),pf-vec2(.0,1.));
    float f10 = dot(hash22(pi+vec2(1.0,0.)),pf-vec2(1.0,0.));
    float f11 = dot(hash22(pi+vec2(1.0,1.)),pf-vec2(1.0,1.));

    float xm1 = mix(f00,f10,w.x);
    float xm2 = mix(f01,f11,w.x);
    float ym = mix(xm1,xm2,w.y);
    return ym;
}

float fractalBrownianMotion(vec2 p) {
    float v = 0.;
    float a = 1.;
    float s = 0.;
    // Gewöhnliche Parameter:
    // iFractionalOctaves ~ 3-6
    // iFractionalScaling = 2;
    // iFractionalDecay = 0.5;
    // Anmerkungen:
    // - iFractionalScaling wird manchmal jede Oktave leicht variiert, um auffällige "Gitter" zu vermeiden
    // - wenn bei sowas irgendwo der Begriff "Lacunarity" auftaucht, meint das das, was hier "Decay" heißt
    //   (der Faktor an die Amplitude pro Iteration, bei anderen Fraktalen ist das wörtlich eine "Löchrigkeit")
    for (int i = ZERO; i < iFractionalOctaves; i++) {
        v += a * perlin2D(p);
        s += a;
        p = p * iFractionalScaling;
        a *= iFractionalDecay;
    }
    return useNormalizedFBM ? (v / s) : v;
}

float gridPattern(vec2 p, float gridStep) {
    p /= gridStep;
    const float lineWidth = 0.02;
    float threshold = 1. - lineWidth / gridStep;
    return 1. - abs(step(threshold, max(fract(p.y), fract(p.x))));
}

float bounceParabola(float h, float g, float T, float t) {
    t = fract(t/T) - 0.5;
    t *= -g*t;
    t += h + 0.25*g;
    return t;
}

void applyToneMapping(inout vec3 col) {
    // "Tone Mapping" ist der allgemeine Begriff des nachträglichen Verschiebens der
    // RGB-Werte (auf alle Farbkanäle gleichermaßen oder auch unterschiedlich).
    // Oft dient das dazu, die Werte erstmal in den Bereich [0..1] zu bekommen;
    // eine Gammakorrektur wird dann danach ausgeführt weil deren Potenzfunktion dann
    // innerhalb dieses Bereichs das Minimum (0) und Maximum (1) unverändert lässt.
    // ... ob man "Gamma" auch als "Tone Mapping" betrachtet oder nicht, ist streitbar.
    // Es hängt m.E. davon ab, ob man es aus künstlerischer Entscheidung macht,
    // oder ob man den Verlauf des darstellenden Bildschirms / Beamers kompensieren will.

    // Beispiel: "ACES Filmic Curve" ist eine Wahl einer allgemeinen Form
    // col = (a * col² + b * col + c) / (d * col² + e * col + f)
    vec3 col1 = iToneMapACESExposure * col;
    vec3 col2 = col1 * col1;
    vec3 acesToneMapped = (2.51*col2 + 0.03*col1) / (2.43*col2 + 0.59*col1 + 0.14);
    col = mix(col, acesToneMapped, iToneMapACESMixing);

    // "Exposure Mapping" wäre auch eine relativ simple Form von Tone Mapping
    // col = c.xxx - exp(-col * iToneMapExposure);

    // Zum Veranschaulichen:
    // https://graphtoy.com/?f1(x,t)=(x*(2.51*x%20+%200.03))%20/%20(x*(2.43*x%20+%200.59)%20+%200.14)&v1=true&f2(x,t)=pow(x,%201/2.2)&v2=true&f3(x,t)=&v3=true&f4(x,t)=&v4=false&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=1.0460698031714766,0.8942233204121067,2.158305478910581

    // Andere Mappings findet man z.B. leicht unter den Namen
    // - Reinhard Tone Mapping
    // - John Hable Uncharted 2 Filmic Mapping
}

void applyGammaCorrection(inout vec3 col) {
    col = pow(col, vec3(1./iGammaExponent));
}

float sdPlane( vec3 p )
{
    return p.y;
}

float sdSphere( vec3 p, float s )
{
    return length(p) - s;
}

float sdBox( vec3 p, vec3 b )
{
    vec3 d = abs(p) - b;
    return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

float sdEllipsoid( in vec3 p, in vec3 r ) // approximated
{
    float k0 = length(p/r);
    float k1 = length(p/(r*r));
    return k0*(k0-1.0)/k1;
}

float sdTorus( vec3 p, vec2 t )
{
    return length( vec2(length(p.xz)-t.x,p.y) )-t.y;
}

float sdPyramid( in vec3 p, in float h )
{
    float m2 = h*h + 0.25;

    // symmetry
    p.xz = abs(p.xz);
    p.xz = (p.z>p.x) ? p.zx : p.xz;
    p.xz -= 0.5;

    // project into face plane (2D)
    vec3 q = vec3( p.z, h*p.y - 0.5*p.x, h*p.x + 0.5*p.y);

    float s = max(-q.x,0.0);
    float t = clamp( (q.y-0.5*p.z)/(m2+0.25), 0.0, 1.0 );

    float a = m2*(q.x+s)*(q.x+s) + q.y*q.y;
    float b = m2*(q.x+0.5*t)*(q.x+0.5*t) + (q.y-m2*t)*(q.y-m2*t);

    float d2 = min(q.y,-q.x*m2-q.y*0.5) > 0.0 ? 0.0 : min(a,b);

    // recover 3D and scale, and add sign
    return sqrt( (d2+q.z*q.z)/m2 ) * sign(max(q.z,-p.y));
}

const vec3 pyramidPos = vec3(-1.0, 0.0, -2.5);
const float pyramidHeight = 1.1;

float sdU( in vec3 p, in float r, in float le, vec2 w )
{
    p.x = (p.y>0.0) ? abs(p.x) : length(p.xy);
    p.x = abs(p.x-r);
    p.y = p.y - le;
    float k = max(p.x,p.y);
    vec2 q = vec2( (k<0.0) ? -k : length(max(p.xy,0.0)), abs(p.z) ) - w;
    return length(max(q,0.0)) + min(max(q.x,q.y),0.0);
}

struct Hit {
    float t;
    float material;
    vec2 texCoord;
    float customArg;
};

Hit texturedSdSphere(vec3 p, float s)
{
    float d = length(p) - s;
    // hint: https://de.wikipedia.org/wiki/Kugelkoordinaten
    vec2 surfaceCoord = vec2(
        atan(p.z, p.x) / twoPi + 0.5,
        p.y / 2. + 0.5
    );
    return Hit(d, UNKNOWN_MATERIAL, surfaceCoord, 0.);
}

Hit texturedSdBox( vec3 p, vec3 b, float rounding) {
    vec3 q = abs(p) - b;
    b.x -= rounding;
    b.y -= rounding;
    b.z -= rounding;
    float d = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
    d -= 2. * rounding;

    // Koordinatentransformation:
    // Um Textur zuzuordnen, müssen wir uns nochmal "in den Würfel hineinversetzen."
    // - In seinem eigenen Koordinatensystem rotiert er nicht,
    // - die Mitte ist nicht bei p (Weltkoordinaten), sondern bei vec3(0)
    // - und auch die Skalierung (b) für seine prinzipielle Würfelhaftigkeit egal.
    vec3 a = 0.5 * p / b;
    // damit geht der Würfel in jeder Dimension von einer Wand bei -0.5 zu einer bei +0.5

    vec2 st;
    // Um Zuordnung zu verstehen, könnt ihr hier mal Teile auskommentieren und vergleichen.
    if (abs(a.z) > 0.5) {
        st = vec2(0.5 + a.x * sign(a.z), 0.5 - a.y);
    } else if (abs(a.y) > 0.5) {
        st = vec2(0.5 + a.x, 0.5 + a.z * sign(a.y));
    } else if (abs(a.x) > 0.5) {
        st = vec2(0.5 - a.z * sign(a.x), 0.5 - a.y);
    }

    // kompaktere, weniger direkt ersichtliche Version:
    //    uv = mix(
    //        mix(
    //            vec2(0.5 + a.x * sign(a.z), 0.5 - a.y),
    //            vec2(0.5 + a.x * sign(a.y), 0.5 + a.z),
    //            step(0.5, abs(a.y))
    //        ),
    //        vec2(0.5 - a.z * sign(a.x), 0.5 - a.y),
    //        step(0.5, abs(a.x))
    //    );

    return Hit(d, MATERIAL_BOX, st, 0.);
}

float sdCylinder(vec3 p, vec2 h)
{
    // vertical ~ along y-axis
    vec2 d = abs(vec2(length(p.xz),p.y)) - h;
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdCone( vec3 p, vec2 c, float h )
{
    vec2 q = h*vec2(c.x/c.y,-1.0);
    vec2 w = vec2( length(p.xz), p.y );
    vec2 a = w - q*clamp( dot(w,q)/dot(q,q), 0.0, 1.0 );
    vec2 b = w - q*vec2( clamp( w.x/q.x, 0.0, 1.0 ), 1.0 );
    float k = sign( q.y );
    float d = min(dot( a, a ),dot(b, b));
    float s = max( k*(w.x*q.y-w.y*q.x),k*(w.y-q.y)  );
    return sqrt(d)*sign(s);
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r)
{
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa,ba) / dot(ba,ba), 0.0, 1.0 );
    return length(pa - ba*h) - r;
}

float opSmoothUnion( float d1, float d2, float k )
{
    k *= 4.0;
    float h = max(k-abs(d1-d2),0.0);
    return min(d1, d2) - h*h*0.25/k;
}

float sdVector(vec3 p, vec3 target, vec3 vec, float offset, float scale) {
    if (vec == c.yyy) {
        return sdSphere(p - target, 0.2 * scale);
    }
    vec *= scale;
    target += offset * vec;
    vec3 start = target - vec;
    float rLine = 0.02 * pow(scale, 0.7);
    float hHead = 6. * rLine;
    const vec2 headShape = vec2(0.06, 0.1);
    // sdCone schaut intrinsisch nach c.yxy (Spitze Richtung +y).
    vec = normalize(vec);
    mat3 rot = rotTowards(c.yxy, vec);
    float dHead = sdCone(rot * (p - target), headShape, hHead);
    float dLine = sdCapsule(p, start, target - hHead * vec, rLine);
    return opSmoothUnion(dLine, dHead, -1.);
    // Anmerkung zur -1:
    // das ist so einfach opUnion(), also min(), aber vielleicht nutze ich das doch noch...
}

Hit texturedSdCylinder(vec3 p, vec2 h) {
    // Analog mit Zylinder -- SDF ist bekannt (s.o.), bzw.
    // ist ein Zylinder ja in einer Ebene wie ein Kreis, in den anderen wie ein Rechteck
    // womit sich diese SDF erklärt:
    float radius = length(p.xz);
    vec2 q = abs(vec2(radius,p.y)) - h;
    float d = min(max(q.x,q.y),0.0) + length(max(q,0.0));
    // nun aber...
    float s = atan(p.z / h.x, p.x / h.x) / twoPi + 0.5;
    float t = 0.5 * p.y / h.y + 0.5;
    return Hit(d, MATERIAL_CYLINDER, vec2(s, t), 0.);
}

float sdNoiseMountains(vec3 p) {
    float height = max(0., length(p.xz) - 3.);
    // <-- -3. damit mittlere Arena ungestört bleibt, außerdem quadratisches Wachstum:
    height *= 0.2 * height;
    height *= iNoiseLevel * (1. + fractalBrownianMotion(iNoiseFreq * p.xz));
    return p.y - height;
}

//------------------------------------------------------------------

// opUnion ist eine der "Primitive combinations" für SDFs
// https://iquilezles.org/articles/distfunctions/
// i.e. einerseits könnt ihr damit aus einfacheren Geometrien komplexere zusammensetzen,
//      aber auch aus separaten Objekten die gesamte Szene zusammensetzen.
// -> Es gibt bei Herrn Quilezles auch opSubtraction, opIntersection, opXor,
//    aber opUnion ist am einfachsten beschrieben:
//    "Auf der Suche nach der geringsten SDF... nehmen wir von zwei SDFs die kleinere von beiden".
// -> Wenn man dann noch im Ergebnis (MarchHit) etwas mitführt, das Aufschluss über den
//    getroffenenen Körper gibt, können wir später Farbe, Textur, Beleuchtung dranmappen.

vec2 opUnion( vec2 d1, vec2 d2 )
{
    return (d1.x<d2.x) ? d1 : d2;
}

// Auf MarchHit erweiterte Versionen von opUnion, bei der Gelegenheit gleich umbenannt:

Hit takeCloser(Hit d1, Hit d2)
{
    if (d1.t < d2.t) {
        return d1;
    }
    return d2;
}

Hit takeCloser( Hit d1, float d2, float material2)
{
    if (d1.t < d2) return d1;
    return Hit(d2, material2, c.yy, 0.);
}

Hit takeCloser( Hit d1, float d2, float material2, float customArg2)
{
    if (d1.t < d2) return d1;
    return Hit(d2, material2, c.yy, customArg2);
    // texCoord hier unbestimmt, weil map() es tatsächlich noch nicht braucht.
    // wäre aber dann auch straightforward nachgezogen.
}

void displayDevelopmentHelpers(inout Hit res, in vec3 pos) {

    if (displayCameraPathPoints) {
        // einfache Visualisierung von Punkten im Raum (z.B: unserer Kamerapfad, falls aktiv)
        // Nutzt hier das sporadisch eingeführte customArg, um die Pfadpunkte durchzunummerieren.
        for (int p = ZERO; p < nPath; p++) {
            float pathRatio = float(p) / float(nPath - 1);
            res = takeCloser(res, Hit(
                sdSphere(pos - camPosPath[p].xyz, 0.015 - 0.005 * cos(12. * iTime)),
                MATERIAL_PATH_POINT, c.yy, pathRatio
            ));
            if (doUseCameraTargetPath) {
                res = takeCloser(res, Hit(
                    sdSphere(pos - targetPath[p].xyz, 0.015 + 0.005 * cos(12. * iTime)),
                    MATERIAL_PATH_TARGET_POINT, c.yy, pathRatio
                ));
            }
        }
    }

    if (!displayCameraRotationAxes) {
        return;
    }

    const float colorArgRight = 20.;
    const float colorArgUp = 19.58;
    const float colorArgForward = 19.19;
    const float worldAxesThickness = 0.002;
    const float axesSize = 0.13;

    vec3 axesOrigin = cam.origin + cam.forward - 0.55 * cam.right - 2. * axesSize * cam.up;
    vec3 axisRight = axesSize * cam.right;
    vec3 axisUp= axesSize * cam.up;
    vec3 axisForward = axesSize * cam.forward;

    res = takeCloser(res, Hit(
        sdCapsule(pos, axesOrigin, axesOrigin + axisRight, worldAxesThickness),
        MATERIAL_ARROW, c.yy, colorArgRight
    ));
    res = takeCloser(res, Hit(
        sdCapsule(pos, axesOrigin, axesOrigin + axisUp, worldAxesThickness),
        MATERIAL_ARROW, c.yy, colorArgUp
    ));
    res = takeCloser(res, Hit(
        sdCapsule(pos, axesOrigin, axesOrigin - axisForward, worldAxesThickness),
        MATERIAL_ARROW, c.yy, colorArgForward
    ));

    axisRight *= cam.matrix / axesSize;
    axisUp *= cam.matrix / axesSize;
    axisForward *= cam.matrix / axesSize;

    res = takeCloser(res, Hit(
        sdVector(pos, axesOrigin, axisRight, 1., axesSize),
        MATERIAL_ARROW, c.yy, colorArgRight
    ));
    res = takeCloser(res, Hit(
        sdVector(pos, axesOrigin, axisUp, 1., axesSize),
        MATERIAL_ARROW, c.yy, colorArgUp
    ));
    res = takeCloser(res, Hit(
        sdVector(pos, axesOrigin, axisForward, 1., axesSize),
        MATERIAL_ARROW, c.yy, colorArgForward
    ));
}

Hit bouncingBall(vec3 pos) {
    // Mal ein Beispiel einer ungewöhnlichen Transformation, die wir aber (behaupte ich)
    // durchaus Stück für Stück verstehen können, da wir die Einzelteile schon alle hatten.
    float sphereRadius = 0.25;
    vec3 spherePos = vec3(2., sphereRadius, 0.4);
    // sich wiederholende Parabel (s. https://de.wikipedia.org/wiki/Wurfparabel):
    // aber alles < 0 wird nicht auf die y-Koordinate berechnet, sondern zum "squeeze".
    float bounceY = bounceParabola(0.9, 3., 2., iTime) - 1.2;
    float squeeze = -min(0., bounceY) + 1.;
    spherePos.y += max(0., bounceY);
    // Mit dem Squeeze-Faktor wollen wir y reduzieren, also den Ball in der Höhe stauchen.
    // Die Stauchung schafft dann wieder eine Lücke zum Boden, die also noch abgezogen wird.
    float squeezedGap = (1. - 1./squeeze) * sphereRadius;
    spherePos.y -= squeezedGap;

    // In die beiden anderen Richtung soll sich die dann so ausdehnen, dass sie aussieht,
    // als wäre die gesamte Masse insgesamt gleich.
    // Als Transformationsmatrix wäre das eine Diagonalmatrix wie
    // mat3 squeezeMatrix = mat3(
    //     extendXZ,       0.,       0.,
    //           0., squeezeY,       0.,
    //           0.,       0., extendXZ
    // );
    // pos = squeezeMatrix * (pos - spherePos);
    // ...
    // aber das geht hier auch direkt auf den Komponenten (Diagonalmatrizen mischen die ja nicht):
    pos -= spherePos;
    pos.y *= squeeze;
    float extend = 1./squeeze;
    // die Auswölbung soll auch gegen unten stärker sein als oben, also irgendwie an pos.y hängen.
    // diese Form hat sich nach etwas Rumprobieren als tauglich erwiesen:
    extend /= (1. - (squeeze - 1.) * 2. * (pos.y - sphereRadius));
    pos.xz *= extend;

    // Außerdem Farbe beim Squeezen ändern.
    float material = 24.9 - 1. * squeeze;
    return Hit(sdSphere(pos, sphereRadius), material, c.yy, 0.);
}

Hit map( in vec3 pos )
{
    // flacher Boden auf y == 0
    Hit res = Hit(pos.y, MATERIAL_FLOOR, c.yy, 0.);

    float floorY = sdNoiseMountains(pos - vec3(0.8,0.0,-1.6));
    res = takeCloser(res,
        Hit(floorY, MATERIAL_MOUNTAINS, fract(pos.xz), 0.)
    );

    displayDevelopmentHelpers(res, pos);

    // texturedSdBox: sdBox erweitert um die Aufprallkoordinate des Strahls,
    // um später die Textur abbilden zu können. Lässt sich beim Quader noch überschauen...
    res = takeCloser(res,
        texturedSdBox(pos-vec3( -.5,0.2, 0.0), vec3(0.5,0.2,0.5), 0.02)
    );
    res = takeCloser(res,
        texturedSdBox(rotY(0.1 * iTime)*(pos-vec3(1.32,0.4,-0.8)), vec3(0.5,0.4,0.3), 0.0)
    );

    if (justTheBoxes) {
        return res;
    }

    // das hier ist im Kern weiterhin die "Kette an opUnion(...)" von letztem Mal,
    // aber weniger Objekte, und umformuliert, weil MarchHit() jetzt mehr ist als "vec2":

    res = takeCloser(res,
        sdTorus((pos-vec3( .5,0.30, 1.0)).xzy, vec2(0.25,0.05)),
        7.1
    );
    res = takeCloser(res,
        sdTorus((pos-vec3(-0.89,0.33, -1.5)).yxz, vec2(0.25,0.05)),
        11.7
    );
    res = takeCloser(res,
        sdTorus((pos-vec3(0.5,0.30,-2.5)).xzy, vec2(0.25,0.05)),
        17.5
    );
    // <-- man beachte die 90°-Drehung über das Vektor-Swizzling (= Richtungen vertauschen)

    res = takeCloser(res,
        sdPyramid(pos - pyramidPos, pyramidHeight),
        MATERIAL_PYRAMID
    );

    res = takeCloser(res, bouncingBall(pos));

    vec3 cylinderPos = pos-vec3( 1.0,0.35,-2.0);
    // Eulerwinkel-Drehung am Beispiel des Zylinders (der bisher nach oben zeigt)
    // (Sieht man gut, wenn man den Pfad mit iPathOffset mal anfährt)
    cylinderPos *= rotY(iCylinderRotateYSpeed*iTime);
    cylinderPos *= rotZ(iCylinderThenRotateZSpeed*iTime);
    cylinderPos *= rotY(iCylinderThenRotateNewYSpeed*iTime);
    res = takeCloser(res,
        texturedSdCylinder(cylinderPos, vec2(0.15,0.25))
    );

    return res;
}

// https://iquilezles.org/articles/boxfunctions
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

Hit raycast( in vec3 ro, in vec3 rd )
{
    Hit res = Hit(-1.0, MISSING_MATERIAL, c.yy, 0.);

    float tmin = 0.1; // war letzte Woche noch 1.0: wird richtig hässlich beim bewegen :)
    float tmax = 15.0;

    // raytrace floor plane (Ebene y==0, also Sichtstrahl = Kante eines einfaches Dreiecks)
    float tp1 = (0.0-ro.y)/rd.y;
    if (tp1>0.0)
    {
        // hier erstmal für den Bereich außerhalb der Bounding Box, wohlgemerkt.
        tmax = min( tmax, tp1 );
        res = Hit(tp1, MATERIAL_FLOOR, c.yy, 0.);
    }

    // raymarch primitives
    // vec2 boundingBox = iBox( ro-vec3(0.0,1.,-0.5), rd, vec3(2.5,1.,3.0) );
    // <-- bounding box = "alles was uns interessiert, findet hier drin statt"
    //     einfach nur, um unnötige Berechnungen zu ersparen.
    //     Ruhig mal ausschalten und vergleichen (FPS und Optik), ob überhaupt nötig.
    // if (boundingBox.x<boundingBox.y && boundingBox.y>0.0 && boundingBox.x<tmax)
    {
//        tmin = max(boundingBox.x,tmin);
//        tmax = min(boundingBox.y,tmax);

        float t = tmin;
        for (int i=ZERO; i<70 && t<tmax; i++)
        {
            Hit h = map(ro + rd * t);
            if (abs(h.t) < (0.0001 * t))
            {
                // getroffen = Länge des Strahls entspricht der SDF
                // (die ja "Abstand der Kamera bis zur Oberfläche" ist)
                res = h;
                res.t = t;
                break;
            }
            t += h.t;
        }
    }
    return res;
}

// https://iquilezles.org/articles/rmshadows
float calcSoftshadow( in vec3 ro, in vec3 rd, in float mint, in float tmax )
{
    // bounding volume
    float tp = (0.8-ro.y)/rd.y;
    if (tp > 0.0) {
        tmax = min( tmax, tp );
    }

    // Schattenbildung ist: Faktor zwischen 0 und 1 an Oberflächenfarbe anheften
    // d.h. in diesem zweiten "Raycasting" (vom Auftrittspunkt z.B. am Boden aus Richtung Licht)
    // geht es darum, die stärkste Abschwächung, d.h. den kleinsten Faktor zu finden
    float res = 1.0;
    float t = mint;
    for (int i = ZERO; i < 80 && t < tmax; i++)
    {
        // Ray Marching von der Aufprallstelle des ersten Marchings (raymarch(...))
        float h = map( ro + rd*t ).t;
        // Aber nicht mit Ziel, den Abstand des nächsten Materials zu finden, sondern
        // den kleinsten Quotienten s zu finden, der uns sagt: Auf dem zweiten Strahl,
        // ist irgendwo ein Objekt viel näher (h) als unser Strahl lang (t)?
        // - h == 0 heißt "anderes Objekt im Weg" (dessen SDF ist an seiner Oberfläche ja 0)
        // - kleines h/t heißt, der Schatten hatte genug Raum, sich auszubreiten.
        // Logik hinter h / t:
        //  - t ist aktuell beschrittene Länge des Strahls von Auftrittspunkt (Boden) Richtung Licht
        //  - h ist ja SDF: Abstand zum nächsten Objekt (h <= 0 wenn Oberfläche getroffen)
        //  - h/t klein heißt: der Schatten, den das Objekt (in Abstand h) wirft, hat relativ viel Raum
        //    (Strahllänge t), um sich auszubreiten.
        //  - Faktor 8 im clamp() macht, dass nur h/t <= 0.125 beiträgt.
        float s = clamp(8.0 * h/t,0.0,1.0);
        // Aber auch hier: die genauen Zahlen sind künstlerisch / empirisch gewählt, nicht physikalisch.
        res = min(res, s);
        // Und: Minimalschrittweite erzwingen, lieber weiter hinten noch einen wichtigeren Schatten finden.
        // In Vorlage von iq steht da clamp(h, 0.01, 0.2); aber ich finde keinen Grund, 0.2 zu deckeln.
        t += max(h, 0.01);
        if (res<0.004)
            break;
    }
    res = clamp( res, 0.0, 1.0 );
    return res*res*(3.0-2.0*res);
    // <-- entspricht smoothstep
}

// https://iquilezles.org/articles/nvscene2008/rwwtt.pdf
float calcAmbientOcclusion(in vec3 pos, in vec3 normal)
{
    // iAmbientOcclusionSamples ~ 5
    // iAmbientOcclusionRadius ~ 0.12
    // iAmbientOcclusionScale ~ 0.95;
    // Idee: wir werten die gesamte Map in verschiedenen Abständen von der Oberfläche aus
    //       (vom Auftrittspunkt also Richtung Normalenvektor) und summieren auf:
    //       (h - d) ~ Wenn d entlang dieser Linie zu klein bleibt, haben wir "Verdeckung", d.h.
    //                 schätzen Schatten / Hohlräume ab, ohne die Rays zum Licht _tracen_ zu müssen
    float res = 0.0;
    float scale = 1.0;
    for (float i=0.; i < iAmbientOcclusionSamples; i += 1.)
    {
        float t = 0.01 + iAmbientOcclusionRadius * i / (iAmbientOcclusionSamples - 1.);
        float h = map(pos + t*normal).t;
        res += (t-h) * scale;
        scale *= iAmbientOcclusionScale;
        if (res > 0.35) {
            break;
        }
    }
    return clamp( 1.0 - 3.0*res, 0.0, 1.0 ) * (0.5+0.5*normal.y);
}

// https://iquilezles.org/articles/normalsSDF
vec3 calcNormal( in vec3 pos )
{
    vec3 n = vec3(0.0);
    for( int i=ZERO; i<4; i++ )
    {
        vec3 e = 0.5773*(2.0*vec3((((i+3)>>1)&1),((i>>1)&1),(i&1))-1.0);
        n += e*map(pos+0.0005*e).t;
    }
    return normalize(n);
/*
    vec2 e = vec2(1.0,-1.0)*0.5773*0.0005;
    return normalize( e.xyy*map( pos + e.xyy ).t +
    e.yyx*map( pos + e.yyx ).t +
    e.yxy*map( pos + e.yxy ).t +
    e.xxx*map( pos + e.xxx ).t );
*/
}

void applyDistanceFog(inout vec3 col, float distance, vec3 fogColor, float density, float growth) {
    float opacity = 1.0 - exp( -density * pow(distance, growth));
    col = mix(col, fogColor, opacity);
    col = clamp(col, 0.0, 1.0);
}

vec3 materialPalette(float parameter) {
    // Das ist wieder eine "Cosinus-Palette" (hier ein sin(), aber selbes Prinzip):
    return 0.2 + 0.2 * sin(parameter * 2.0 + vec3(0.0,1.0,2.0));
    // sin(x) = cos(x - 0.5*pi) = cos(x - 1.571)
    // d.h. um diese Palette in der cos()-Konvention zu sehen, z.B.
    // https://dev.thi.ng/gradients/
    // muss die letzte Spalte ("d") jeder Farbe -> vec3(-1.57, -0.57, 0.43)
}

vec4 render(in vec3 rayOrigin, in vec3 rayDir)
{
    // Diese Funktion folgt der selben Logik wie letzter Woche,
    // ich habe ein bisschen refakturiert und neue Effekte eingebaut,
    // aber prüft mal, ob ihr grundlegende Vorgehen (wieder) erkennen könnt.

    Hit res = raycast(rayOrigin, rayDir);

    // Materialkonstanten mit Namen machen mehr Freude.
    // war: if (res.material < -0.5) { ... }
    if (res.material <= MISSING_MATERIAL) {
        return c.yyyy;
    }

    bool isFloor = res.material <= MATERIAL_FLOOR;

    vec3 col = materialPalette(res.material);

    // Gewichtungsfaktoren für manche der Beleuchtungsbeiträge,
    // um bei Bedarf Materialien unterschiedlich behandeln zu können.
    float specularCoeff = 1.0;
    float subSurfaceCoefficient = 1.0;
    float ambientCoeff = iAmbientAmount;

    // berechneten Strahl rekonstruieren
    vec3 rayPos = rayOrigin + res.t * rayDir;
    // und Normalvektoren, für Beleuchtungseffekte der Oberflächen
    vec3 normal = isFloor ? vec3(0.0,1.0,0.0) : calcNormal(rayPos);

    // Material-Floats auf Gleichheit zu prüfen wirkt gefährlich/fahrlässig, geht hier zwar,
    // aber nur, weil wir exakt wissen, dass wir diesen Wert so gesetzt haben. nicht berechnet.
    if (res.material == MATERIAL_BOX) {
        // hier mal ein Beispiel, dass die Grundfarbe immer noch beliebig angepasst werden kann,
        // auch wenn beide Boxen diese Material-Zahl haben. Ist halt anfällig gegenüber Verschiebung...
        if (rayPos.x > 0.5) {
            col = mix(c.xxx, materialPalette(4.8), 0.9);
        }
        // res.texCoord haben wir uns oben gemerkt, um hier nicht dieselbe Geometrie
        // nochmal in alle Richtungen fallunterscheiden zu müssen. Möglich wäre das aber.
        col *= texture(texFrame, res.texCoord).rgb;
    }
    else if (res.material == MATERIAL_CYLINDER) {
        // Einfach mal die Textur invertieren und auf die Grundfarbe multiplizieren; warum nicht?
        col *= 1. - texture(texFrame, res.texCoord).rgb;
    }
    else if (res.material == MATERIAL_PYRAMID) {
        // hier z.B.: Farbverlauf an y-Achse
        col = materialPalette(13.56 + 1.1 * rayPos.y);
        specularCoeff = 0.6;

        // s.o. die Pyramiden-SDF wurde aufgerufen mit:
        // sdPyramid(pos - pyramidPosAndHeight.xyz, pyramidPosAndHeight.a)
        // -> kann Mapping "einer Textur" (= eines vec2-Felds) auch erst hier machen.
        // Wir müssen uns aber überlegen, wie wir die Aufprallkoordinaten (vec3 pos, wo SDF == 0)
        // in Texturkoordinaten (vec2 st, normiert auf [0, 1]) umrechnen.
        // Wir vereinfachen das, indem wir uns erstmal in den umgebenden Würfel denken:
        vec3 pos = rayPos - pyramidPos;
        // Nach der verwendeten SDF sdPyramid() läuft .y bisher von [0..pyramidHeight]:
        pos.y = pos.y / pyramidHeight - 0.5;
        // und wir spiegeln z, weil das "nach vorne" der Welt / Kamera als "-z" gewählt wurde
        // pos ist jetzt auf [-0.5; 0.5] normiert.
        // Damit können wir anwenden, was wir aus VL2 für 2D (dem Quadrat) kennen.
        // Wir brauchen nur die Seitenwände, also können y ignorieren, und prüfen,
        // wer von +x, -x, +z oder -z jeweils maximal ist. Zusammengefasst:
        vec2 st = abs(pos.z) > abs(pos.x) ? pos.xy : pos.zy;
        // links/rechts und vorne/hinten haben jetzt dieselbe Orientierung,
        // wir spiegeln also jeweils eins davon, damit die Texturen an den
        // Kanten von beiden Seiten denselben Wert haben (d.h. stetig sind).
        if (pos.z < -pos.x) {
            st.x *= -1.;
        }
        // [-0.5; 0.5] war sinnvoll für diese Vergleiche, st braucht aber [0; 1]:
        st += 0.5;
        // Um dann vom Würfel auf die Pyramide zu kommen, also für jede Würfelseite [0; 1]
        // das entsprechende Dreieck aus den Punkten (0,0), (1,0) und (0.5, 1) zu beschreiben
        // haben wir drei einfache Optionen:
        // a) wir lassen st einfach so, schneiden also einfach ab, was nicht aufs Dreieck passt
        // b) wir verschieben st.x nach oben entlang der Kantensteigung, so dass
        //    "ganz links" der Textur immer auf jeder Seite ist,
        //    aber die Teile Richtung "rechts oben" abgeschnitten werden.
        // c) ähnlich b), aber wir verjüngen den Bereich von st.x immer weiter zu einem Punkt,
        //    verzerren also die Textur zur Spitze hin, aber schneiden nichts ab.
        if (applyPyramidTextureSkewing) {
            st.x -= st.y * 0.5;
        }
        if (applyPyramidTextureNarrowing) {
            st.x /= 1. - st.y;
        }
        // Und zum Vergleich gäbe es da dann noch die "stumpfe" Version,
        // einfach die Koordinaten des Bodens zu übernehmen, also des Grundriss.
        if (applyPyramidTextureTopDown) {
            st = pos.xz + 0.5;
        }

        if (takeBoxTextureForPyramid) {
            col = texture(texFrame, st).rgb;
        }
        else {
            float pattern = voronoiPattern(st, true);
            pattern = smoothstep(0.0, 0.5, pattern);
            col = mix(col, pattern * col, 1. - pos.y);
        }
        if (showPyramidTextureGrid) {
            specularCoeff = 0.;
            // Gitter um Schritte von 0.1 in beide Richtungen von st zu sehen
            // (damit das auf jeder Textur sichtbar ist, invertieren wir deren Rotwert)
            col.r = mix(col.r, 1. - col.r, 1. - gridPattern(st, 0.1));
            if (st.y > 0.9) {
                // Rand Oben: Magenta
                col.rgb = c.xyx;
            } else if (st.y < 0.099) {
                // Rand Unten: Grün
                col.rgb = c.yxy;
            }
            if (st.x < 0.1) {
                // Rand Links: cyan
                col = c.yxx;
            } else if (abs(st.x - 0.5) < 0.005) {
                // Mittelsenkrechte: Blau
                col = c.yyx;
            } else if (st.x > 0.9) {
                // Rechter Rand: Orange
                col = c.xwy;
            }
        }
    }
    else if (res.material == MATERIAL_PATH_POINT) {
        col = vec3(0., res.customArg, 1. - res.customArg);
        specularCoeff = 0.1;
    }
    else if (res.material == MATERIAL_PATH_TARGET_POINT) {
        col = vec3(1. - res.customArg, 0.5 * res.customArg, 0.);
        specularCoeff = 0.1;
    }
    else if (isFloor || res.material == MATERIAL_MOUNTAINS)
    {
        // jetzt: Textur.
        // hier kommen wir mit einfacher Geometrie an die richtige Koordinate "st":
        // wir projizieren einfach den Strahl auf die y-Ebene (Boden y == 0); skalieren nach Laune
        res.texCoord = rayPos.xz * 0.3;
        col = texture(texRock, res.texCoord).rgb;
        // Gamma-Korrektur auf Bilddaten kann je nach deren Encoding sinnvoll sein.
        // Es hängt aber davon ab, ob glTexImage2D() als internalFormat "RGBA" oder "GL_SRGB8_ALPHA8"
        // nimmt, weil bei letzterem OpenGL die Korrektur automatisch durchführt.
        // col = pow(col, vec3(2.8));
        specularCoeff = 0.12;
        subSurfaceCoefficient = 0.;

        if (drawGridOnFloor && rayPos.y < 0.1) {
            col *= 0.3 + 0.7 * vec3(gridPattern(rayPos.xz, 0.5));
        }
    } else if (res.material == MATERIAL_ARROW) {
        col = materialPalette(20. + res.customArg);
        specularCoeff = 0.07;
        ambientCoeff += 0.7;
    }

    // Hier auch mit "Ambient"-Amount, das ist ja ein Teil der unabhängig
    // jeglicher Beleuchtung angewandt wird. Das ist gewöhnlich nicht viel, oft einfach weggelassen.
    // Hier aber zum Vergleich mal mit vorgesehen.
    vec3 shade = ambientCoeff * col;

    // Auch neu -- Die "Ambient Occlusion", die in etwa den Grad der Verdeckung / Verwinkelung bezeichnet:
    float occ = calcAmbientOcclusion(rayPos, normal);
    // ist ein Faktor zwischen 0 (absolut verdeckt / in einer Höhle -> schwarz) und 1 (absolut frei).
    shade *= occ;

    // Wir hatten letzte Woche mal eine einzelne (Richtungs)-Lichtquelle, und da die
    // verschiedenen Beiträge für etwa Phong/Blinn-Phong-Shading gesehen.
    // Jegliches "Shading" war: Finde den passenden Faktor zwischen
    // 1 = voll beleuchtet
    // 0 = hier kommt absolut kein Licht hin
    // mit mehreren Lichtquellen kann man das ähnlich machen, muss aber fallbezogen
    // entscheiden, wie man die gegeneinander gewichtet.
    // Wir addieren erstmal einfach.
    // --> Probiert hier einfach mal an allen Konstanten rum.
    //
    // FÜr den Vergleich Richtungslicht vs. Punktlicht bauen wir einfach mal beide zusammen ein,
    // mit iLightSourceMix so, dass
    // ~ 0 -> nur Richtungslicht
    // ~ 0.5 -> beide Quellen
    // ~ 1 -> nur Punktlicht
    vec3 lightDirection;
    vec3 lightSourceColor;
    for (int light = ZERO; light < 2; light++) {

        if (light == 0) {
            // Reines Richtungslicht (ähnlich letztes Mal, nur jetzt als uniform für Flexibilität):
            // aber immer noch aufpassen mit dem Vorzeichen: Richtung ZUM Licht!
            lightDirection = normalize(vecDirectionalLight);
            lightSourceColor = normalize(vec3(1.30, 1.00, 0.70));
            lightSourceColor *= iDirectionalLightStrength;
        }
        else {
            // Auch ein "automatisierter Pfad", aber ohne Interpolation zwischen Punkten.
            // -- geht natürlich auch, kann man aber nur schwer kontrollieren :)
            vec3 lightPointSource = vec3(
                -.8 * cos(0.56 * iTime),
                1.1 + 0.1 * cos(0.4 * iTime + 0.2),
                -1.5 -sin(0.8 * iTime)
            );
            // <-- NOTIZ: Wird gerade bewusst relativ zum Kamera-Ursprung verstanden.
            //     Ist natürlich bei der Pfadbewegung sehr unnatürlich.
            //     Ändern wir später bei Gelegenheit.

            // Punktlicht: Richtung unterschiedlich je nach Strahl, es geht um die Differenz:
            lightDirection = normalize(lightPointSource - rayDir);
            lightSourceColor = mix(c.xxx, 2. * materialPalette(14.5 + iLightPointPaletteColor), 0.7);
            lightSourceColor *= iPointLightStrength;

            // um die Punktquelle SELBST zu sehen, müssen wir sie aber extra zeichnen
            if (doShowPointLightSource) {
                // einfache Logik: wenn unsere Blickrichtung direkt überlappt, färben wir fragColor ein.
                // -> ergibt dann einen improvisierten Kreis. Reicht.
                vec3 rayDirectionIntoTheLight = normalize(lightPointSource - rayOrigin);
                float overlap = dot(rayDir, rayDirectionIntoTheLight);
                if (overlap > 0.99995) {
                    return vec4(lightSourceColor, 1.);
                }
            }
        }

        vec3 halfway = normalize(lightDirection - rayDir);

        // diffuse: ~ dot(normal, lightDirection)
        float diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);
        diffuse *= 2.2 * calcSoftshadow(rayPos, lightDirection, 0.02, 2.5);
        shade += col * iDiffuseAmount * lightSourceColor * diffuse;

        // specular: ~ muss irgendwie Strahlrichtung mit ein-skalarprodukt-en
        //             Gewichtung, Verlauf (pow()), Farbe etc. wählt man nach Eigenempfinden ;)
        float specular = pow(clamp(dot(normal, halfway), 0.0, 1.0), iSpecularExponent);

        // Beispiel eines abschwächenden Effekt (der eine physikalische Approximation ist)
//        float fresnelAttenuation = 0.04 + 0.36*pow(clamp(1.0-dot(halfway,lightDirection), 0.0, 1.0), 5.0);
//        specular *= fresnelAttenuation;
        specular *= 3.00 * specularCoeff;
        shade += specular * lightSourceColor * iSpecularAmount;

        // "Backlight / Ambient Illumination", Idee ist dass in eher verdeckten Bereichen
        // zusätzliche Beiträge durch irgendwelche Spiegelungen am Boden (für unseren festen Fall y == 0)
        // die Schatten leicht aufweichen
        // vec3 lightFloorReflection = normalize(vec3(-lightDirection.x, 0., -lightDirection.z));
        vec3 lightFloorReflection = cross(lightDirection, vec3(0,1,0));
        float backlightIllumination = occ
            * clamp(dot(normal, lightFloorReflection), 0.0, 1.0)
            * clamp(1.0 - rayPos.y, 0.0, 1.0);
        shade += col * iBacklightAmount * backlightIllumination * vec3(0.25, 0.25, 0.25);

        // "Subsurface Scattering" / "Volumenstreuung" - Nahmt Licht nach, das ins Material geht,
        // sich da etwas verteilt und wieder verlässt, was zu einem wachsartig weichen Leuchten
        // führt (man stelle sich seine Finger hinter einer Taschenlampe vor.)
        // Das ist physikalisch ein Diffusionseffekt, wir wollen die Strahlen aber hier
        // nicht aufwändig berechnen, sondern überlegen auch hier empirisch:
        //
        // Das hängt am Ambient-Occlusion-Faktor aufgrund der Annahme, dass die Lichtstrahlen, die
        // in diesen Ecken bzw. Materialien etc. "verdeckt" werden, ja irgendwo hin müssen.
        // Richtungsverhalten ist: Kein Beitrag bei direkt draufschauen (Licht wird ja "weggestreut")
        // wird dann 1 dann Richtung 90° und darüber hinaus ("von hinten auf Oberfläche")
        float subSurfaceScattering = clamp(1.0+dot(normal, rayDir), 0.0, 1.0);
        subSurfaceScattering = occ * pow(subSurfaceScattering, iSubsurfaceExponent);
        subSurfaceScattering *= subSurfaceCoefficient * iSubsurfaceAmount;
        shade += subSurfaceScattering * col;
    }

    if (res.t > 15.) {
        // wir schneiden die Ebene mal ab (um mehr Weltall zu sehen)
        return c.yyyy;
    }

    col = shade;
    applyDistanceFog(col, res.t, vec3(0.001,0.,0.004), 0.003, iDistanceFogExponent);
    return vec4(col, 1.);
}

float calcCentripetalKnotParameter(float t, vec3 p0, vec3 p1) {
    return t + pow(length(p1 - p0), 0.5);
}

vec3 centripetalCatmullRomSpline(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
    float t0 = 0.0;
    float t1 = calcCentripetalKnotParameter(t0, p0, p1);
    float t2 = calcCentripetalKnotParameter(t1, p1, p2);
    float t3 = calcCentripetalKnotParameter(t2, p2, p3);
    t = t1 + t * (t2 - t1);
    vec3 A1 = mix(p0, p1, (t - t0) / (t1 - t0));
    vec3 A2 = mix(p1, p2, (t - t1) / (t2 - t1));
    vec3 A3 = mix(p2, p3, (t - t2) / (t3 - t2));
    vec3 B1 = mix(A1, A2, (t - t0) / (t2 - t0));
    vec3 B2 = mix(A2, A3, (t - t1) / (t3 - t1));
    return mix(B1, B2, (t - t1) / (t2 - t1));
}

vec3 uniformCatmullRomSpline(vec3 p0, vec3 p1, vec3 p2, vec3 p3, float t) {
    // uniform version, cf. https://en.wikipedia.org/wiki/Cubic_Hermite_spline#Catmull%E2%80%93Rom_spline
    return (((-p0 + p1*3. - p2*3. + p3)*t*t*t + (p0*2. - p1*5. + p2*4. - p3)*t*t + (-p0 + p2)*t + p1*2.)*.5);
}

vec4 uniformCatmullRomSpline(vec4 p0, vec4 p1, vec4 p2, vec4 p3, float t) {
    return (((-p0 + p1*3. - p2*3. + p3)*t*t*t + (p0*2. - p1*5. + p2*4. - p3)*t*t + (-p0 + p2)*t + p1*2.)*.5);
}

vec3 chooseInterpolation(vec3 previous, vec3 start, vec3 end, vec3 next, float t) {
    if (useLinearSplines) {
        return mix(start, end, t);
    }
    if (useCentripetalCatmullRomSplines) {
        return centripetalCatmullRomSpline(previous, start, end, next, t);
    }
    return uniformCatmullRomSpline(previous, start, end, next, t);
}

void calcApproxCamPathLength() {
    // Die Länge der Catmull-Rom-Splines zu bestimmen, ist zu aufwändig.
    // Wir bieten zwei Optionen: Entweder die Strecke linear annähern (hier),
    // oder in konstanter Zeit pro Segment durchfahren (ignoriert das hier).
    float sum = 0.;
    for (int seg = ZERO; seg < nPath - 1; seg++) {
        sum += length(camPosPath[seg + 1] - camPosPath[seg]);
    }
    sum += length(camPosPath[0] - camPosPath[nPath - 1]);
    linearCamPathLength = sum;
}

void determinePathInterpolationParameters(inout float progress, out ivec4 segmentIndices) {
    // Diese Funktion ist ausgelagert, weil die beiden Pfade (Kameraposition und ihr Blickpunkt)
    // beide als Array von Vektoren gegeben sind und äquivalente Vorberechnungen brauchen.
    // Wir müssen jeweils wissen:
    // - zwischen welchen beiden Punkten interpoliert wird
    // - an welchen Anteil (float in [0..1]) wird uns befinden
    // - und je nach Spline-Art weitere Kontrollpunkte.
    //   -> In unseren Fällen (Catmull-Rom) also noch die beiden Nachbarpunkte dazu.
    //   -> In linearer Interpolation bräuchte man keine weiteren Punkte -- wirkt aber selten gut.
    //
    // Daher "out ivec4" für die vier Indizes, und besagter float mittels "inout float progress".

    // Wir definieren den Pfad so, dass dieselbe Zeit zwischen allen Punkten vergeht.
    // -> macht die folgende Pfadberechnung einfach(er).
    // Die einfachste Implementierung setzt voraus, dass von einem Punkt zum nächsten
    // immer dieselbe Zeit vergeht, egal wie weit sie entfernt sind:
    int seg = int(progress);

    // Als Alternative versuchen wir, die Geschwindigkeit konstant zu behalten,
    // also irgendwie die Abstände der Pfadpunkte untereinander mitzuberücksichtigen.
    // - Obacht: wir schätzen die Länge zwischen zwei Punkten nur linear ab,
    //   weil wir die Catmull-Rom-Splines dafür zu aufwändig finden. Kann also komisch werden.
    if (tryLinearSplineSpeedApproximation) {
        float progressLength = progress / float(nPath) * linearCamPathLength;
        float lengthAtSegmentStart = 0.;
        for (seg = ZERO; seg < nPath; seg++) {
            int next = (seg + 1 + nPath) % nPath;
            float segmentLength = length(camPosPath[next] - camPosPath[seg]);
            if (lengthAtSegmentStart + segmentLength > progressLength) {
                progress = (progressLength - lengthAtSegmentStart) / segmentLength;
                break;
            }
            lengthAtSegmentStart += segmentLength;
        }
    } else {
        progress = progress - floor(progress);
    }
    segmentIndices = ivec4(seg - 1, seg, seg + 1, seg + 2);
    segmentIndices = (segmentIndices + nPath) % nPath;
}

vec3 getPathPosition(float progress) {
    progress = mod(progress, float(nPath));
    ivec4 seg;
    determinePathInterpolationParameters(progress, seg);
    return chooseInterpolation(
        camPosPath[seg.x], camPosPath[seg.y], camPosPath[seg.z], camPosPath[seg.w],
        progress
    );
}

vec4 getTargetPathAndRoll(float progress) {
    // implementiert nur die uniformen Catmull-Rom-Splines,
    // hier mal einfach dupliziert, weil wir ja die vec4-Variante brauchen.
    progress = mod(progress, float(nPath));
    ivec4 seg;
    determinePathInterpolationParameters(progress, seg);
    return uniformCatmullRomSpline(
        targetPath[seg.x], targetPath[seg.y], targetPath[seg.z], targetPath[seg.w],
        progress
    );
}

void setupCameraMatrix(inout Camera cam, float rollAngle, vec2 pan)
{
    // Baut eine gesamte Rotationsmatrix zusammen, um Vektoren aus
    // den Welt- in die Kamerakoordinaten einheitlich zu transformieren.
    // Das soll kombinieren:
    // - Kameraposition und einen anvisierten Blickpunkt
    //   -> damit endet die Suche oft, der Kernteil (*) bestimmt diese Matrix
    // - dazu aber noch zusätzliche freie Rotation um Yaw-Pitch-Rollwinkel
    //   -> Rollwinkel, der eigentlich immer um die finale Blickrichtung gemeint ist
    //   -> Für eine zusätzliche freie Drehung (z.B. Mausbewegung) von Yaw & Pitch
    //      muss definiert werden, in welchem Koordinatensystem wir sie verstehen wollen.
    //      Wenn sie in den Weltkoordinaten gemeint sind, müssen sie _rechts_ der cam.matrix,
    //      wenn zusätzlich zu den gedrehten Koordinaten (üblicherer Fall), _links_ davon.
    //   -> Die Gesamtdrehung muss exakt die richtige Reihenfolge haben.
    //      Drehung um z.B: Yaw dreht die Drehachse für Pitch weg, jeder Schritt muss passen.
    //      Fehler sind speziell schwer zu verifizieren, weil man sich erstmal visuelle "Testfälle"
    //      aufstellen muss, von denen man wirklich sicher sein kann, wie sie aussehen müssen.

    // (*) Grundlegende Kamerarotation Richtung Target
    const vec3 worldUp = c.yxy;
    cam.forward = normalize(cam.target - cam.origin);
    cam.right = normalize(cross(cam.forward, worldUp));
    cam.up = cross(cam.right, cam.forward);
    cam.matrix = mat3(cam.right, cam.up, cam.forward);

    // Unsere Extra-Rotationen wollen wir auf die rotierten Koordinaten anwenden,
    // der Rollwinkel wird gewöhnlich auch um die finale Blickrichtung verstanden.
    mat3 extraYaw = rotAround(cam.up, pan.x);
    mat3 extraPitch = rotAround(cam.right, -pan.y);
    mat3 roll = rotAround(cam.forward, rollAngle);
    cam.matrix = roll * (extraPitch * extraYaw * cam.matrix);
    // VORSICHT, POTENTIELLER BUG in GLSL / Grafiktreiber:
    // <- Diese Klammer nach roll * (...) spielt eine Rolle. Mathematisch ist das nicht so,
    //    die Matrixmultiplikation ist assoziativ. Sehr mysteriös.
    //    Ohne Klammer führt extraPitch _auf_manchen_Rechnern_ (!) zu einer Roll-Bewegung,
    //    selbst in Fällen, wo extraYaw und roll keinen Effekt haben (identisch zur Einheitsmatrix sind).

    /* Globale "struct Camera": Wir brauchen weiter eigentlich nur "cam.origin" und "cam.matrix".
    Wir speichern die uns nur hier, um sie selbst in der map() veranschaulichen zu können. */
    cam.tForward = cam.forward;
    cam.tRight = cam.right;
    cam.tUp = cam.up;
    cam.right = cam.matrix[0];
    cam.up = cam.matrix[1];
    cam.forward = cam.matrix[2];
}

vec3 background() {
    vec2 st = gl_FragCoord.xy / iResolution.y;
    st -= 0.5 * vec2(iResolution.x/iResolution.y, 1.);
    // st *= 0.8 * rot2D(0.1 * iTime);
    vec4 space = texture(texSpace, st);
    // minimale Verarbeitung reicht uns mal (Gammakorrektur)
    return pow(space.rgb, vec3(1.5));
}

void main()
{
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 pan = iMouseDrag.xy / iResolution.x;

    // Wir machen das hier mal so herum: fragColor = absolut transparent
    // render() gibt uns dann ein Bild mit alpha = 1 oder 0 (nichts getroffen)
    // dann können wir im Nachgang den Hintergrund reinmischen, s.u. (==>)
    fragColor = c.yyyy;

    // Ohne Kamera-Pfad-Optionen: erstmal fester Ursprung und Richtung.
    // -> hier über Uniforms modifizierbar, um Flexibilität zu zeigen.
    cam.origin = vec3(-0.75, 1.5, 3.);
    cam.target = cam.origin - vec3(0.4, -0.33, -1);
    float camRoll = 0.;

    // Demonstration: Automatisierte Pfade per Spline-Interpolation ablaufen
    calcApproxCamPathLength();
    if (doUseCameraPath) {
        vec3 pathPos = getPathPosition(iPathOffset + iPathSpeed * iTime);
        cam.origin = pathPos.xyz;
        // Wohin blicken? Entweder auf einen Punkt etwas weiter im Pfad... (*)
        cam.target = getPathPosition(iPathOffset + iPathSpeed * iTime + 0.5);
    }
    if (doUseCameraTargetPath) {
        // (*) oder einen komplett eigenen Pfad dafür verwenden
        // (hier vec4, um noch zusätzlich als Komponente .w den Rollwinkel zu animieren)
        vec4 pathTarget = getTargetPathAndRoll(iPathOffset + iPathSpeed * iTime);
        cam.target = pathTarget.xyz;
        camRoll = pathTarget.w;
    }

    // iCamLookOffset: bewegt angeblickten _Punkt_ frei, ist deswegen
    // aber etwas anderes Verhalten als "die Blickrichtung frei zu drehen".
    // Letzteres ist nämlich trickreich, und braucht einiges an Vorüberlegung
    // (siehe "Eulerwinkel", "Gimbal Lock", "Quaternionen" etc.).
    cam.target += iCamLookOffset ;
    camRoll += iCamRoll;

    setupCameraMatrix(cam, camRoll, pan);

    vec3 rayDirection = cam.matrix * normalize(vec3(uv, iCamFocalLength));

    // iCamOffset: freie Verschiebung der Kamera, soll aber,
    // bei Verwendung des Pfads, konsistent im Kamera-Koordinatensystem passieren
    // d.h. (0,0,1) soll "1 nach vorne" heißen, nicht "1 in Welt-Z-Koordinate".
    if (doUseCameraPath) {
        cam.origin += cam.matrix * iCamOffset;
    } else {
        cam.origin += iCamOffset;
    }

    fragColor = render(cam.origin, rayDirection);

    // (==>) jetzt haben wir fragColor als "unabhängige Ebene" behandelt und können
    //       den Hintergrund da druntermischen, wo der Ray Marcher noch nicht fragColor.a abdeckt
    fragColor.rgb = mix(background(), fragColor.rgb, fragColor.a);

    applyToneMapping(fragColor.rgb);
    applyGammaCorrection(fragColor.rgb);

    fragColor.a = 1.;
}
