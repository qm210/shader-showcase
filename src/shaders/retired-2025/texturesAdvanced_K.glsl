#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;

uniform vec3 cursorWalk;
uniform float iFieldOfView;
uniform float iCameraTilt;

uniform sampler2D iTexture0;
uniform sampler2D iTexture1;
uniform sampler2D iTexture2;

const int MATERIAL_CONST = 0;
const int MATERIAL_BOX = 1;
const int MATERIAL_FLOOR = 2;
const int MATERIAL_SPHERE = 3;

const float pi = 3.141593;

const int MAX_MARCHING_STEPS = 125;
const float MIN_DIST = 0.0;
const float MAX_DIST = 100.0;
const float PRECISION = 0.001;

// Rotation matrix around the X axis.
// Winkel in Einheit Radians, d.h. theta = pi entspricht 180°
mat3 rotateX(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(1, 0, 0),
        vec3(0, c, -s),
        vec3(0, s, c)
    );
}

// Rotation matrix around the Y axis.
mat3 rotateY(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s, 0, c)
    );
}

// Rotation matrix around the Z axis.
mat3 rotateZ(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, -s, 0),
        vec3(s, c, 0),
        vec3(0, 0, 1)
    );
}


mat3 diagonalMatrix(float x, float y, float z) {
    return mat3(
        vec3(x, 0, 0),
        vec3(0, y, 0),
        vec3(0, 0, z)
    );
}

mat3 identity() {
    return diagonalMatrix(1., 1., 1.);
}

struct MarchResult {
    float sd; // Abstand des Rays vom Objekt
    vec3 col; // <-- die Objekte hatten bisher nur eine intrinsische Farbe
    int material; // wir verlagern die Zuweisung der Farben auf nach dem Ray Marching...
    vec2 uv; // wir müssen die Oberflächenkoodinaten kennen für Texturen
};

void wobbleDistort(inout MarchResult surface, vec3 p, float amp, vec3 scale) {
    surface.sd += amp * sin(scale.x*p.x) * sin(scale.y*p.y) * sin(scale.z*p.z);
}

float checkerboard(vec2 p, float scale) {
    vec2 ip = floor(p * scale);
    return mod(ip.x + ip.y, 2.0);
}

float surfaceCheckerPattern(vec3 p, float checkerSize) {
    vec2 surface = vec2(
        atan(p.z, p.x) / (2. * pi) + 0.5,
        p.y / 2. + 0.5
    );
    return checkerboard(surface, checkerSize);
}

MarchResult sdPatternSphere( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform, vec3 checkerCol, float nSegments) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(p / b) - 1.;
    col = mix(col, checkerCol, surfaceCheckerPattern(p, nSegments));
    vec2 surface = vec2(
        atan(p.z, p.x) / (2. * pi) + 0.5,
        p.y / 2. + 0.5
    );
    return MarchResult(d, col, MATERIAL_SPHERE, surface);
}

MarchResult sdSphere( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(p / b) - 1.;
    return MarchResult(d, col, 0, vec2(0));
}

MarchResult sdBox( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
    return MarchResult(d, col, 0, vec2(0));
}

MarchResult sdTexturedBox( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = p - offset * transform;
    vec3 q = abs(p) - b;
    float d = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);

    // Koordinatentransformation:
    // Um Textur zuzuordnen, müssen wir uns in den Würfel hineinversetzen.
    // - In seinem eigenen Koordinatensystem rotiert er nicht,
    // - die Mitte ist nicht bei p (Weltkoordinaten), sondern bei vec3(0)
    // - und auch die Skalierung (b) für seine prinzipielle Würfelhaftigkeit egal.
    vec3 a = 0.5 * p / b;
    // damit geht der Würfel in jeder Dimension von einer Wand bei -0.5 zu einer bei +0.5

    // Gradient um oben/unten auseinander halten zu können.
    col = vec3(
        0.5 + a.z,
        0.5 + a.x,
        0.5 - a.z // aber zu Farbmischungen kommen wir noch.
    );

    int material = MATERIAL_BOX;

    vec2 uv;
    // Um Zuordnung zu verstehen:
    // mal auskommentieren oder sign()-Abhängigkeit entfernen,
    // oder mit uv = vec2(0); die Textur auf der Seite deaktiveren.
    if (abs(a.z) > 0.5) {
        uv = vec2(0.5 + a.x * sign(a.z), 0.5 - a.y);
    } else if (abs(a.y) > 0.5) {
        uv = vec2(0.5 + a.x, 0.5 + a.z * sign(a.y));
    } else if (abs(a.x) > 0.5) {
        uv = vec2(0.5 - a.z * sign(a.x), 0.5 - a.y);
    }
    // Reminder: if() generell überdenken, aber das reicht auch,
    // wenn irgendwo konkret ein Performanceproblem vorliegt.

    // oder wäre das hier viel lehrreicher?
//    uv = mix(
//        mix(
//            vec2(0.5 + a.x * sign(a.z), 0.5 - a.y),
//            vec2(0.5 + a.x * sign(a.y), 0.5 + a.z),
//            step(0.5, abs(a.y))
//        ),
//        vec2(0.5 - a.z * sign(a.x), 0.5 - a.y),
//        step(0.5, abs(a.x))
//    );

    return MarchResult(d, col, material, uv);
}

MarchResult sdTetraeder( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = (p - offset) * transform;
    vec3 q = p / b;
    float d = sqrt(1./3.) * (
        max(
            abs(q.x+q.y)-q.z,
            abs(q.x-q.y)+q.z
        )-1.);
    vec2 uv = q.xy;
    return MarchResult(d, col, MATERIAL_BOX, uv);
}

float dot2( in vec3 v ) { return dot(v,v); }

float udTriangle( vec3 p, vec3 a, vec3 b, vec3 c )
{
    vec3 ba = b - a; vec3 pa = p - a;
    vec3 cb = c - b; vec3 pb = p - b;
    vec3 ac = a - c; vec3 pc = p - c;
    vec3 nor = cross( ba, ac );

    return sqrt(
        (sign(dot(cross(ba,nor),pa)) +
        sign(dot(cross(cb,nor),pb)) +
        sign(dot(cross(ac,nor),pc))<2.0)
    ?
    min( min(
        dot2(ba*clamp(dot(ba,pa)/dot(ba,ba),0.0,1.0)-pa),
        dot2(cb*clamp(dot(cb,pb)/dot(cb,cb),0.0,1.0)-pb) ),
        dot2(ac*clamp(dot(ac,pc)/dot(ac,ac),0.0,1.0)-pc) )
    :
    dot(nor,pa)*dot(nor,pa)/dot2(nor) );
}

#define SIMPLE_TRIANGLE 0

MarchResult sdTriangle( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    vec3 v1 = vec3(b.x, 0., 0.);
    vec3 v2 = vec3(0., b.y, 0.);
    vec3 v3 = vec3(0., 0., b.z);

    #if SIMPLE_TRIANGLE == 1
        v1 = vec3(0., 0.,  0.);
        v2 = vec3(-1., 0., 0.);
        v3 = vec3(0., -1., 0.);
    #else
        p = (p - offset) * transform; // was passiert hiermit also bildlich?
    #endif


    float d = udTriangle(p, v1, v2, v3);

    vec3 vx = v2 - v1; // Vektor von v1 nach v2
    vec3 vy = v3 - v1; // Vektor von v1 nach v3
    vec3 vp = p - v1; // Vektor von v1 nach p

    float lx2 = dot(vx, vx);
    float ly2 = dot(vy, vy);
    float dxy = dot(vx, vy);
    float lxy = lx2 * ly2 - dxy * dxy;
    float px = dot(vp, vx);
    float py = dot(vp, vy);

    float u = (ly2 * px - dxy * py) / lxy;
    float v = (lx2 * py - dxy * px) / lxy;

    vec2 uv = vec2(u, 1. - v);

    return MarchResult(d, col, MATERIAL_BOX, uv);
}

// Hash function for noise generation
float hash(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float hash14(vec4 p)
{
    uvec4 q = uvec4(ivec4(p)) * uvec4(1597334673U, 3812015801U, 2798796415U, 1979697957U);
    uint n = (q.x ^ q.y ^ q.z ^ q.w) * 1597334673U;
    return float(n) * 2.328306437080797e-10;
}

float hash14(vec2 p)
{
    // funny enough, with 0. the glitches stay.
    return hash14(vec4(p, 1., 1.));
}

// um schnell zwischen Hashfunktionen zu wechseln
#define HASH hash14

// "Value Noise" function
float noise(vec2 p){
    vec2 ip = floor(p);
    vec2 fp = fract(p);
    fp = fp * fp * (3.0 - 2.0 * fp); // this equals smoothstep (in the interval [0,1])
    // fp = fp * fp * fp * (fp * (fp * 6. - 15.) + 10.); // "smootherstep"

    return mix(
        mix(
            HASH(ip),
            HASH(ip+vec2(1.0,0.0)),
            fp.x
        ),
        mix(
            HASH(ip+vec2(0.0,1.0)),
            HASH(ip+vec2(1.0,1.0)),
            fp.x
        ),
        fp.y
    );
}

// Fractional Brownian Motion for low-frequency noise
#define FBM_ITERATIONS 14
float fbm(vec2 p) {
    float f = 0.0;
    float amp = 0.5;
    for (int i = 0; i < FBM_ITERATIONS; i++) {
        f += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return f;
}

float floorLevel = -2.;
float noiseHeight = 4.; // was passiert bei zu hohen Werten, v.A. in Verbindung mit hohen FBM_ITERATIONS?
float noiseFreq = 0.4;

MarchResult sdFloor(vec3 p) {
    vec3 floorColor = vec3(1.);
    // bisher: wurde hier definiert -> man verfolge MATERIAL_FLOOR
    // floorColor = (0.5 + 0.15 * mod(floor(p.x) + floor(p.z), 4.0)) * vec3(0.9, 1., .95);
    vec2 floorUv = fract(p.xz); // fract() for texture wrapping, could scale like fract(0.25 * p.xz)
    float d = p.y - floorLevel;
    // flaches Terrain: exit here.
    // return Surface(d, floorColor, MATERIAL_FLOOR, floorUv);

    // wir machen es uns hier leicht -- was ist mit den Normalenvektoren?
    // -> mal diffuse lighting einschalten
    float someOffset = 5.3; // hashes sehen um 0 oft auffällig auf
    float noise = fbm(noiseFreq * p.xz + someOffset); // mal im Argument sowas wie... 0.03 * iTime ?
    float noisyLevel = floorLevel - noiseHeight * (noise - 0.5);
    d = p.y - noisyLevel;


    // oder aber: Height Map / Bump Map als Textur reingeben.
//    vec2 st = clamp(0.033 * p.xz + vec2(.5,.8), vec2(0), vec2(1));
//    d += 3. * texture(iBumpMap, st).r;

    return MarchResult(d, floorColor, MATERIAL_FLOOR, floorUv);
}

MarchResult takeCloser(MarchResult obj1, MarchResult obj2) {
    if (obj2.sd < obj1.sd) {
        return obj2;
    }
    return obj1;
}

vec3 firstCubePos = vec3(1.5, -0.87, -2.);

MarchResult sdScene(vec3 p) {
    MarchResult obj;
    MarchResult co = sdFloor(p);

    mat3 transform = rotateX(0.3 * iTime);
//    obj = sdTriangle(p, vec3(1.), firstCubePos + vec3(-1.6,1.2 * sin(iTime),-2.6), vec3(0.2, 0.7, 0.9), transform);
//    co = takeCloser(co, obj);

    #if SIMPLE_TRIANGLE == 1
        return co;
    #endif

    obj = sdTexturedBox(p, vec3(0.6), firstCubePos, vec3(0.3, 0.65, 0.9), rotateX(-0.2 * pi + iTime));
    co = takeCloser(co, obj);

    //    vec3 secondCubePos = firstCubePos + vec3(-3.0, 0., 0.);
//    // this is advanced. dithering the time parameter for less glitchs. ist echt so.
//    float phi = 20. * (iTime + 1.e-3 * hash14(p.xz));
//    secondCubePos += 1. * vec3(cos(phi), 0., sin(phi));
//    mat3 transformLeft = rotateY(+0.3 * pi + iTime);
//    //transformLeft = identity();
//    obj = sdTexturedBox(p, vec3(0.6), secondCubePos, vec3(0.3, 0.65, 0.9), transformLeft);
//    co = takeCloser(co, obj);

    obj = sdPatternSphere(p, vec3(1.), vec3(-2., floorLevel + 1., -2.), vec3(1, 0.1, 0.8), identity(), vec3(0.5, 0.2, 0.8), 8.);

    mat3 ballTransform = rotateY(0.5 * iTime);
    // obj = sdSphere(p, vec3(1.), vec3(-2., floorLevel + 1., -2.), vec3(1, 0.6, 0.8), ballTransform);
    co = takeCloser(co, obj);
    return co;
}

void applyMaterial(inout MarchResult s, vec3 ray) {
    if (s.material == MATERIAL_BOX) {
        s.col *= texture(iTexture0, s.uv).rgb;
        // Bock auf Holz?
        float scale = 1.;
        vec3 holz = texture(iTexture2, s.uv / scale).rgb;
        // naive Farbmischung: mal mit Grundrechenarten rumprobieren.
        // s.col = holz;
        // s.col *= holz;
        // s.col = min(s.col, holz);
        // s.col = max(s.col, holz);
        // s.col = pow(s.col + holz, vec3(1.4));  // <-- etc... you know the drill
        // s.col = mix(s.col, holz, 0.5 + 0.5 * sin(iTime));
        // s.col = mix(s.col, holz, 0.5 - 0.5 * cos(iTime));
        // s.col = 1. - (1. - s.col) * (1. - holz); // "Screen"
        // "Overlay":
//        s.col = length(s.col) < 0.5
//            ? 2. * s.col * holz
//            : 1. - 2. * (1. - s.col) * (1. - holz);
         s.col = s.col - holz + 2. * s.col * holz; // "Soft Light"
//         s.col = holz - s.col + 2. * s.col * holz; // "Soft Light", invers
    }
    else if (s.material == MATERIAL_SPHERE) {
        vec3 holz = texture(iTexture0, s.uv * 1.).rgb;
        // holz = pow(holz, vec3(0.5));
        s.col = holz;
    }
    else if (s.material == MATERIAL_FLOOR) {
        s.col *= (0.5 + 0.15 * mod(floor(ray.x) + floor(ray.z), 4.0)) * vec3(0.9, 1., .95);
    }
    s.col = clamp(s.col, vec3(0.), vec3(1.));
}

float rayMarchShadow( in vec3 ro, in vec3 rd)
{
    float tMin = 0.05;
    float tMax = 3.;
    float w = 0.002;

    float d = 1.0;
    float t = tMin;

    for (int i=0; i < MAX_MARCHING_STEPS; i++)
    {
        float h = sdScene( ro + rd*t ).sd;
        d = min( d, h/(w*t) );
        t += h;

        if (d < PRECISION || t > tMax ) {
            break;
        }
    }

    //return res;

    d = clamp( d, 0.0, 1.0 );
    //return res;

    d = smoothstep(0., 1., d);
    return d;
}

vec3 calcNormal(in vec3 p) {
    vec2 epsilon = vec2(1.0, -1.0) * 0.0005;
    return normalize(
        epsilon.xyy * sdScene(p + epsilon.xyy).sd +
        epsilon.yyx * sdScene(p + epsilon.yyx).sd +
        epsilon.yxy * sdScene(p + epsilon.yxy).sd +
        epsilon.xxx * sdScene(p + epsilon.xxx).sd
    );
}

const float PHI = 1.61803398874989484820459;  // Golden Ratio

float gold_noise(in vec2 xy, in float seed) {
    return fract(tan(distance(xy * PHI, xy) * seed) * xy.x);
}

vec3 c = vec3(1,0,-1);

MarchResult rayMarch(vec3 ro, vec3 rd) {
    float rayLength = MIN_DIST;
    MarchResult hit;

    for (int i = 0; i < MAX_MARCHING_STEPS; i++) {
        hit = sdScene(ro + rayLength * rd);
        rayLength += hit.sd;

        if (hit.sd < PRECISION || rayLength > MAX_DIST) {
            break;
        }
    }

    hit.sd = rayLength;
    return hit;
}

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution) / iResolution.y;

    vec4 bgColor = c.xxxx;
    vec4 col = vec4(0.);
    float d;

    vec3 ro = vec3(0., -.5, 1.);
    vec3 rd = normalize(vec3(uv, -1.23));

    MarchResult hit = rayMarch(ro, rd);

    if (hit.sd < MAX_DIST) {
        vec3 p = ro + rd * hit.sd;
        applyMaterial(hit, p);

        vec3 normal = calcNormal(p);

        vec3 lightDirection = normalize(vec3(-1, 1, 1));

        vec3 r = reflect(lightDirection, normal);
        float shadeA = dot(r, normalize(p));
        shadeA = clamp(shadeA, 0., 1.);
        shadeA = pow(shadeA, 0.1);

        float shadeB = dot(normal, lightDirection);
        shadeB = clamp(shadeB, 0., 1.);

        d = mix(shadeB, shadeA, .5);
        col.xyz = pow(d, 0.3) * hit.col;
        col.a = exp(-0.2 * hit.sd);
    }

    fragColor = mix(bgColor, vec4(col.xyz, 1.), col.a);
}
