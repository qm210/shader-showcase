#version 300 es

precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse;
uniform int iPassIndex;
uniform vec3 iMouseHover;
uniform bool iMouseDown;
uniform sampler2D texInit;
uniform sampler2D texPrevious;
uniform bool doInit;
uniform bool doEvolve;
uniform bool spawnRandomly;
uniform bool drawByMouse;
uniform bool debugFlag;
uniform vec2 iTorusRadii;
uniform float iTorusRotate;
uniform vec2 iTorusSpin;
uniform vec2 iTorusRepeat;

uniform sampler2D texFloof;
uniform sampler2D texSpace;
uniform float iFocalLength;
uniform vec3 iCameraOffset;
uniform vec3 vecDirectionalLight;
uniform float iDiffuseAmount;
uniform float iSpecularAmount;
uniform float iSpecularShininess;
uniform float iAmbientAmount;
uniform float iShadowHardness;
uniform int iShadowMarchingSteps;
uniform float iMarchingPrecision;
uniform int iMarchingSteps;
uniform float iMarchingMin;
uniform float iMarchingMax;
uniform float iSphereSize;
uniform bool makeSphereTextured;
uniform bool makeSphereColorful;
// eingebaut während/nach VL:
uniform float iPyramidDisturbAmount;
uniform float iPyramidDisturbScale;
uniform float iDistanceFogDensity;
uniform bool useBackgroundTexture;
uniform float iPostGamma;

// Die iFree* sind wieder definiert, für euch, schnell mal einen Effekt per Slider live zu regeln.
// -> So lassen sich recht schnell einfache Vermutungen bestätigen / überprüfen.
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

const float pi = 3.141593;
const float twoPi = 2. * pi;
const vec4 c = vec4(1., 0. , -1., .5);

vec2 gridStep;

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

mat3 rodrigues(vec3 axis, float angle) {
    // huh?
    vec3 v = normalize(axis);
    mat3 skewSymmetricCrossProduct = mat3(
        0, v.z, -v.y,
        -v.z, 0, v.x,
        v.y, -v.x, 0
    );
    float c = cos(angle * twoPi);
    float s = sin(angle * twoPi);
    return mat3(c) + (1. - c) * outerProduct(v, v) + s * skewSymmetricCrossProduct;
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
    float c = cos(angle);
    float s = sin(angle);
    return mat3(1.) + s * skewSym + (1. - c) * skewSym * skewSym;
}

mat3 rotTowards(vec3 original, vec3 target) {
    // Für eine Matrix, die den Vektor original -> target dreht:
    float cosine = dot(original, target);
    vec3 axis = cross(original, target);
    if (axis == c.yyy) {
        return mat3(cosine);
        // (Kreuzprodukt 0 bei parallelen Vektoren)
    }
    float theta = acos(cosine);
    return rotAround(axis, -theta);
}

//------------------------------------------------------------------
float dot2( in vec2 v ) { return dot(v,v); }
float dot2( in vec3 v ) { return dot(v,v); }
float ndot( in vec2 a, in vec2 b ) { return a.x*b.x - a.y*b.y; }

float sdSphere( vec3 p, float s )
{
    return length(p)-s;
}

float sdBox( vec3 p, vec3 b )
{
    vec3 d = abs(p) - b;
    return min(max(d.x,max(d.y,d.z)),0.0) + length(max(d,0.0));
}

float sdTorus( vec3 p, vec2 t )
{
    return length( vec2(length(p.xz)-t.x,p.y) )-t.y;
}

vec2 texCoordTorus(vec3 p, vec2 t)
{
    // Texturkoordinaten vec2(s, t) müssen sdTorus(p,t) == 0. beschreiben.
    // Mögliche Parametrisierung analog Polarkoordinaten:
    // phi   = Polarwinkel um die y-Achse, d.h. des Ring selbst
    // theta = Polarwinkel des Ringquerschnitts (senkrecht zu Phi)
    // p.x = (t.y * cos(theta) + t.x) * cos(phi)
    // p.y = t.y * sin(theta)
    // p.z = (t.y * cos(theta) + t.x) * sin(phi)
    float phi = atan(p.z, p.x);
    vec2 q = vec2(length(p.xz) - t.x, p.y);
    float theta = atan(q.y, q.x);
    // atan()/2pi + 0.5 -> [-pi, pi]/2pi + 0.5 -> [0, 1] für st
    vec2 st = vec2(phi, theta) / twoPi + 0.5;
    return st;
}

// vertical
float sdCylinder( vec3 p, vec2 h )
{
    vec2 d = abs(vec2(length(p.xz),p.y)) - h;
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

// arbitrary orientation
float sdCylinder(vec3 p, vec3 a, vec3 b, float r)
{
    vec3 pa = p - a;
    vec3 ba = b - a;
    float baba = dot(ba,ba);
    float paba = dot(pa,ba);

    float x = length(pa*baba-ba*paba) - r*baba;
    float y = abs(paba-baba*0.5)-baba*0.5;
    float x2 = x*x;
    float y2 = y*y*baba;
    float d = (max(x,y)<0.0)?-min(x2,y2):(((x>0.0)?x2:0.0)+((y>0.0)?y2:0.0));
    return sign(d)*sqrt(abs(d))/baba;
}

// Vertikaler Kegel
float sdCone(in vec3 p, in vec2 c, float h)
{
    vec2 q = h*vec2(c.x,-c.y)/c.y;
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

float sdVectorArrow(vec3 p, vec3 target, vec3 vec, float offset, float scale) {
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
    return min(dLine, dHead);
}

float opSmoothUnion(float d1, float d2, float k)
{
    float h = clamp( 0.5 + 0.5*(d2-d1)/k, 0.0, 1.0 );
    return mix( d2, d1, h ) - k*h*(1.0-h);
}

//------------------------------------------------------------------
// Eigene structs -- beste Idee ever für cleane Shader

struct Ray {
    vec3 origin;
    vec3 dir;
};

struct Hit {
    float distance; // <-- heißt oft nur "t". Wir machen es _hier_mal_explizit_.
    int material;
};

#define NOTHING_HIT -1
#define FLOOR_MATERIAL 1
#define SPHERE_MATERIAL 2
#define GOL_MATERIAL 9

Hit sphere(vec3 pos, float radius) {
    // SDF von Kugel == Kreis in 3D
    float sd = sdSphere(pos, iSphereSize);
    return Hit(sd, SPHERE_MATERIAL);
}

const vec3 sphereCenter = vec3(0., 0.8, 3.);
const float textureRotation = 0.2;
const float textureFunnyBounce = 0.07;

vec2 sphereSurface(vec3 pos) {
    // "interne (kugel-eigene) Koordinaten" [-1; 1]
    vec3 p = (pos - sphereCenter) / iSphereSize;
    // y-flip weil brauchen wir halt, danke, OpenGL.
    p.y *= -1.;

    // hint: https://de.wikipedia.org/wiki/Kugelkoordinaten
    float polarAngle = atan(p.z, p.x) / twoPi + 0.5;
    float normY = 0.5 * p.y + 0.5;
    /// Verzerrt zwar etwas, aber good enough, erstmal.
    vec2 surfaceST = vec2(polarAngle, normY);

    /// Variation per iTime, weil a) macht Spaß und b) kann Fehler aufzeigen
    surfaceST.s -= textureRotation * iTime;
    surfaceST.t += textureFunnyBounce * sin(8. * iTime);

    return surfaceST;
}

float hash11(float n) {
    return fract(sin(n) * 43758.5453123);
}

vec2 hash22(vec2 p, float seed)
{
    p = p*mat2(127.1,311.7,269.5,183.3);
    p = -1.0 + 2.0 * fract(sin(p + seed)*43758.5453123);
    return sin(p*6.283);
}

float hash12(vec2 p, float seed) {
    p = vec2(dot(p, vec2(127.1, 311.7)) + seed * 17.3, seed * 23.7);
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
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

const vec3 torusCenter = vec3(0., 1., 1.);
mat3 torusRotate;

Hit scene(in vec3 pos)
{
    Hit hit = Hit(pos.y, NOTHING_HIT);

    float yAngle = radians(iTorusSpin.x) * iTime;
    float yTilt = radians(iTorusSpin.y) * iTime;
    torusRotate = rotY(yAngle) * rotX(radians(iTorusRotate)) * rotY(yTilt);
    vec3 posTorus = torusRotate * (pos - torusCenter);
    float d = sdTorus(posTorus, iTorusRadii);
    if (d < hit.distance) {
        hit = Hit(d, GOL_MATERIAL);
    }

    return hit;
}

Hit raymarch(Ray ray)
{
    float tmin = iMarchingMin;
    float tmax = iMarchingMax;

    Hit hit = Hit(-1.0, NOTHING_HIT);
    Hit beforeMarching = hit;

    float t = tmin;
    for (int i=0; i < iMarchingSteps && t < tmax; i++)
    {
        vec3 pos = ray.origin + ray.dir * t;
        Hit h = scene(pos);

        if (abs(h.distance) < iMarchingPrecision)
        {
            hit = Hit(t, h.material);
            break;
        }
        t += h.distance;
    }

    if (hit.material == NOTHING_HIT) {
        hit.material = beforeMarching.material;
    }
    return hit;
}

// https://iquilezles.org/articles/rmshadows
float calcSoftshadow( in vec3 ro, in vec3 rd, in float mint, in float tmax )
{
    // bounding volume
    float tp = (0.8-ro.y)/rd.y;
    if( tp>0.0 ) tmax = min( tmax, tp );

    float res = 1.0;
    float t = mint;
    for( int i=0; i<iShadowMarchingSteps; i++ )
    {
        float h = scene(ro + rd*t).distance;
        float s = clamp(iShadowHardness * h/t, 0.0, 1.0);
        res = min( res, s );
        t += clamp( h, 0.01, 0.2 );
        if( res<0.004 || t>tmax ) break;
    }
    res = clamp( res, 0.0, 1.0 );
    return res*res*(3.0-2.0*res);
}

// https://iquilezles.org/articles/normalsSDF
vec3 calcNormal( in vec3 pos )
{
    vec2 e = vec2(1.0,-1.0)*0.5773*0.0005;
    return normalize(
        e.xyy * scene(pos + e.xyy).distance +
        e.yyx * scene(pos + e.yyx).distance +
        e.yxy * scene(pos + e.yxy).distance +
        e.xxx * scene(pos + e.xxx).distance
    );
}

const vec3 lightColor = vec3(1.30, 1.00, 0.80);

vec3 background(in Ray ray) {
    vec3 col = c.yyy;
    col = texture(texSpace, ray.dir.xy).rgb;
    col = pow(col, vec3(3.24 / 1.));
    return col;
}

bool isAlive(vec2 st);

void doTheRayMarching(in Ray ray, out vec3 col, out bool isBackground) {
    Hit hit = raymarch(ray);

    if (hit.material == NOTHING_HIT) {
        isBackground = true;
        return;
    }

    vec3 rayPos = ray.origin + hit.distance * ray.dir;
    vec3 normal = calcNormal(rayPos);

    // Beleuchtungsanteile (s.u.) können vom Material abhängen:
    float diffuseCoeff = 1.;
    float specularCoeff = 0.4;
    float specularExponent = iSpecularShininess;

    switch (hit.material) {
        case FLOOR_MATERIAL: {
            /// Normale kann nicht per calcNormal() berechnet werden:
            /// Boden ist nicht Teil der scene(), da analytisch bestimmt.
            /// Zum Glück haben wir ihn uns sehr einfach gelegt:
            normal = vec3(0.0, 1.0, 0.0);

            // Schachbrettmuster
            float f = mod(floor(2. * rayPos.x) + floor(2. * rayPos.z), 2.);
            col = 0.15 + f * vec3(0.05);
            break;
        }
        case SPHERE_MATERIAL: {
            /// Beispiel für irgendeine Farbberechnung für ein bestimmtes Material...
            col = 0.2 + 0.2 * sin(2. * (c.ywx + 1.6 + 0.2 * iTime));

            /// ...oder Textur mappen (selten trivial!)
            if (makeSphereTextured) {
                vec2 texCoord = sphereSurface(rayPos);
                col = texture(texFloof, texCoord).rgb;
            }
            break;
        }
        case GOL_MATERIAL: {
            // Vorgehen ähnlich wie bei sdf-Minimum auswerten selbst:
            // 1. Welt-Koordinaten in die transformieren, in der der Torus zentral liegt
            vec3 posTorus = torusRotate * (rayPos - torusCenter);
            // 2. Form auswerten, dieses Mal also die ST-Koordinaten an der Oberfläche
            vec2 texCoord = texCoordTorus(posTorus, iTorusRadii);
            // ... wiederholen -- nur für die Veranschaulichung.
            //     Hängt von Texturparametern WRAP_S & WRAP_T ab! (-> REPEAT/MIRRORED_REPEAT)
            texCoord *= iTorusRepeat;

            if (isAlive(texCoord)) {
                col = vec3(2., 4., 9.);
            } else {
                col = vec3(0., 0., 0.2);
            }
            break;
        }
    }

    /// Beleuchtungsterme aufsummieren
    vec3 shade = vec3(0.0);

    // Licht: reines Richtungslicht (z.B. Sonne, die weit weg ist, im Gegensatz zu Punktlicht)
    //        ... TODO Bonusfrage: Wie macht man diese Lichtquelle selbst sichtbar?
    {
        // Vorzeichenkonvention: lightDirection geht ZUR Lichtquelle.
        vec3 lightDirection = normalize(vecDirectionalLight);

        // Beitrag 1: "Diffuse" Lichtstreuung, unabhängig _Blickrichtung_
        float diffuse = dot(normal, lightDirection);
        diffuse = clamp(diffuse, 0.0, 1.0);
        diffuse *= diffuseCoeff;
        shade += iDiffuseAmount * col * lightColor * diffuse;

        // Beitrag 2: "Specular" Lichtstreuung, abhängig von Reflektionswinkel
        vec3 reflected = reflect(lightDirection, normal);
        float specular = dot(ray.dir, reflected);
        specular = pow(clamp(specular, 0.0, 1.0), specularExponent);
        specular *= specularCoeff;
        shade += iSpecularAmount * lightColor * specular;

        // Shadow Cast: Reduziert das Ganze wieder um Faktor [0..1]
        shade *= calcSoftshadow(rayPos, lightDirection, 0.02, 2.5);

        // Beitrag 3: "Ambient" Light, ganz unabhängig von dieser einen Lichtquelle
        shade += iAmbientAmount * col;
    }

    col = shade;

    // Distanznebel mit "Hintergrund, wenn zu dicht" (wegen Übergang)
    float fog = 1.0 - exp(-iDistanceFogDensity * pow(hit.distance, 3.0));
    isBackground = fog > 0.99;
    if (isBackground) {
        return;
    }
    col = mix(col, c.yyy, fog);
}

vec3 renderPass(vec2 uv) {
    Ray ray;
    ray.origin = iCameraOffset;
    ray.dir = normalize(vec3(uv, iFocalLength));

    vec3 col;
    bool isBackground;
    doTheRayMarching(ray, col, isBackground);

    if (isBackground) {
        col = background(ray);

        // Sonne hinzufügen
        vec3 sunDir = vecDirectionalLight;
        float sunOverlap = max(dot(ray.dir, sunDir), 0.);
        float sunCore = pow(sunOverlap, 1800.);
        float sunAura = pow(sunOverlap, 20.);
        vec3 colSun = lightColor * (sunCore + 0.05 * sunAura);
        col += colSun;
    }

    // Gamma Grading:
    col = clamp(col, 0.0, 1.0);
    col = pow( col, vec3(1./iPostGamma) );

    return col;
}

vec4 initialImage(in vec2 st) {
    st.y = 1. - st.y;
    return texture(texInit, st);
}

bool isAlive(vec2 st) {
    // -> Textur (RGBA-vec4) irgendwie auf bool reduzieren.
    // Obacht: hier wird kein Check für den Rand gemacht,
    //         d.h. wie st außerhalb 0..1 liegen, liegt an WRAP_S / WRAP_T!
    return texture(texPrevious, st).r < 1.;
}

struct CellInfo {
    bool alive;
    int neighbors;
};

CellInfo checkCell(ivec2 cell) {
    // Obacht: ivec2 coord hat Auflösung des Gitters,
    //         Framebuffer-Textur aber Auflösung des Bilds!
    // -> Berechne Zellmitte als "st" normiert auf [0..1]
    vec2 stCell = (vec2(cell) + 0.5) * gridStep;

    CellInfo info;
    info.alive = isAlive(stCell);
    info.neighbors = 0;
    for (int ix = -1; ix < 2; ix++) {
        for (int iy = -1; iy < 2; iy++) {
            if (ix == 0 && iy == 0) {
                continue;
            }
            vec2 stNeighbor = stCell + gridStep * vec2(ix, iy);
            if (isAlive(stNeighbor)) {
                info.neighbors++;
            }
        }
    }
    return info;
}

#define PASS_EVOLVE_GAME 0
#define PASS_RENDER_SCREEN 1

void main()
{
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 st = gl_FragCoord.xy / iResolution.xy;

    // Gitter gegeben durch initiale Bildtextur
    vec2 gridSize = vec2(textureSize(texInit, 0));
    ivec2 cell = ivec2(st * gridSize);
    gridStep = 1. / gridSize;
    vec2 stCell = (vec2(cell) + 0.5) * gridStep;

    // Maus -- immer gut zu haben.
    ivec2 mouseCell = ivec2(iMouseHover.xy / iResolution.xy * gridSize);
    bool hovered = mouseCell == cell;
    bool clicked = hovered && iMouseDown;

    if (iPassIndex == PASS_RENDER_SCREEN) {
        // in Ermangelung echter Breakpoints -- uniform-bools helfen uns.
        if (debugFlag || drawByMouse) {
            fragColor.rgb = isAlive(stCell) ? c.yyy : c.xxx;
        } else {
            fragColor.rgb = renderPass(uv);
        }
        fragColor.a = 1.;
        return;
    }

    if (doInit) {
        fragColor = initialImage(st);
        return;
    }

    CellInfo previous = checkCell(cell);
    bool alive = previous.alive;

    bool evolve = doEvolve && !drawByMouse;

    /// https://de.wikipedia.org/wiki/Conways_Spiel_des_Lebens#Die_Spielregeln
    /// Kurznotation: B3/S23
    if (evolve) {
        if (previous.alive) {
            // Survival: S23
            alive = previous.neighbors == 2 || previous.neighbors == 3;
        } else {
            // Birth: B3
            alive = previous.neighbors == 3;
        }
    }

    if (spawnRandomly) {
        float random = perlin2D(vec2(cell), iTime);
        alive = alive || abs(random) < 0.1;
    }

    if (clicked && drawByMouse) {
        alive = true;
    }

    fragColor = alive ? c.yyyx : c.xxxx;
}
