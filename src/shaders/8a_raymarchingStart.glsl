#version 300 es

// based on: https://www.shadertoy.com/view/Xds3zN
// very much simplified for our lecture.

precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse;
uniform sampler2D iTexture0;
uniform float iFocalLength;
uniform vec3 iCameraOffset;
uniform vec3 iCameraAngle;
uniform vec3 vecDirectionalLight;
uniform float iDiffuseAmount;
uniform float iSpecularAmount;
uniform float iSpecularExponent;
uniform float iFloorSpecularCoefficient;
uniform float iShadowHardness;
uniform int iShadowMarchingSteps;
uniform float iMarchingPrecision;
uniform int iMarchingSteps;
uniform float iMarchingMin;
uniform float iMarchingMax;
uniform float iSphereSize;
uniform bool makeSphereTextured;
uniform bool makeSphereColorful;
uniform bool useBlinnPhongSpecular;

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

float sdPlane( vec3 p )
{
    return p.y;
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

float sdBoxFrame( vec3 p, vec3 b, float e )
{
    p = abs(p  )-b;
    vec3 q = abs(p+e)-e;

    return min(min(
    length(max(vec3(p.x,q.y,q.z),0.0))+min(max(p.x,max(q.y,q.z)),0.0),
    length(max(vec3(q.x,p.y,q.z),0.0))+min(max(q.x,max(p.y,q.z)),0.0)),
    length(max(vec3(q.x,q.y,p.z),0.0))+min(max(q.x,max(q.y,p.z)),0.0));
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
    return sqrt( (d2+q.z*q.z)/m2 ) * sign(max(q.z,-p.y));;
}

float opSmoothUnion( float d1, float d2, float k )
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
#define ARROW_MATERIAL_X 100
#define ARROW_MATERIAL_Y 101
#define ARROW_MATERIAL_Z 102

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

void addCoordinateAxes(inout Hit hit, vec3 pos) {
    // Koordinatenachsen als 3D-Pfeile rendern
    const vec3 axesOrigin = vec3(-2., 0.01, 2.);
    const vec3 axisX = c.xyy;
    const vec3 axisY = c.yxy;
    const vec3 axisZ = c.yyx;
    const float axesSize = 1.;
    float d = sdVectorArrow(pos, axesOrigin, axisX, 1., axesSize);
    if (d < hit.distance) {
        hit = Hit(d, ARROW_MATERIAL_X);
    }
    d = sdVectorArrow(pos, axesOrigin, axisY, 1., axesSize);
    if (d < hit.distance) {
        hit = Hit(d, ARROW_MATERIAL_Y);
    }
    d = sdVectorArrow(pos, axesOrigin, axisZ, 1., axesSize);
    if (d < hit.distance) {
        hit = Hit(d, ARROW_MATERIAL_Z);
    }
}

Hit scene(in vec3 pos)
{
    Hit hit = Hit(pos.y, NOTHING_HIT);
    addCoordinateAxes(hit, pos);

    /* Remember: Die 2D-Szene bestand immer aus den Schritten
       - minimale SDF ausrechnen (nach Koordinatentransformation)
       - mix(farbe1, farbe2, ...irgendwie vom Abstand...)
       in 3D, mit Beleuchtung, Verdeckung, ... sparen wir Aufwand:
       - minimale SDF ausrechnen (nach Koordinatentransformation)
       - dabei erstmal nur merken, was getroffen wurde ("material")
       - Shading (Farbfindung) passiert im Nachgang ("deferred")
    */

    float d = sdSphere(pos - sphereCenter, iSphereSize);
    if (d < hit.distance) {
        hit = Hit(d, SPHERE_MATERIAL);
    }

    /// ... hier könnten weitere Objekte auftauchen... :)

    return hit;
}

Hit raymarch(Ray ray)
{
    float tmin = iMarchingMin;
    float tmax = iMarchingMax;

    Hit hit = Hit(-1.0, NOTHING_HIT);

    /// Was analytisch berechnet werden kann, sollte auch.
    /// -> Boden ist in XZ-Ebene -> Dreisatz reicht :)
    const float floorY = 0.;
    float floorDistance = (floorY - ray.origin.y) / ray.dir.y;
    if (floorDistance > 0.)
    {
        tmax = min(tmax, floorDistance);
        hit = Hit(floorDistance, FLOOR_MATERIAL);
    }
    Hit beforeMarching = hit;

    float t = tmin;
    for (int i=0; i < iMarchingSteps && t < tmax; i++)
    {
        vec3 pos = ray.origin + ray.dir * t;
        Hit h = scene(pos);

        float marchingPrecision = iMarchingPrecision * 0.1 * t;
        if (abs(h.distance) < marchingPrecision)
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
        float h = scene( ro + rd*t ).distance;
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

vec3 render(in Ray ray)
{
    vec3 col = c.yyy;

    Hit hit = raymarch(ray);

    if (hit.material == NOTHING_HIT) {
        return col;
    }

    vec3 rayPos = ray.origin + hit.distance * ray.dir;
    vec3 normal = calcNormal(rayPos);

    float specularCoeff = 0.4;

    if (hit.material == FLOOR_MATERIAL)
    {
        // Floor kann nicht per calcNormal() berechnet werden:
        // ist nicht Teil der scene(), da analytisch bestimmt.
        normal = vec3(0.0, 1.0, 0.0);

        float f = 1. - abs(step(0.5, fract(1.5*rayPos.x)) - step(0.5, fract(1.5*rayPos.z)));
        col = 0.15 + f * vec3(0.05);
        specularCoeff = iFloorSpecularCoefficient;

    } else if (hit.material == SPHERE_MATERIAL) {
        /// Beispiel für irgendeine Farbberechnung für ein bestimmtes Material...
        col = 0.2 + 0.2 * sin(2. * (c.ywx + 1.6 + 0.2 * iTime));

        /// ...oder Textur mappen. Obacht: selten trivial!
        if (makeSphereTextured) {
            vec2 texCoord = sphereSurface(rayPos);
            col = texture(iTexture0, texCoord).rgb;
        }

    } else if (hit.material == ARROW_MATERIAL_X) {
        col = c.xyy;
    } else if (hit.material == ARROW_MATERIAL_Y) {
        col = c.yxy;
    } else if (hit.material == ARROW_MATERIAL_Z) {
        col = c.yyx;
    } else {
        col = c.xwx;
    }

    /// Beleuchtungsterme aufsummieren...
    vec3 shade = vec3(0.0);

    // Licht: reines Richtungslicht (passt zu einer Sonne, die weit weg ist, im Gegensatz zu Punktlicht)
    {
        // Vorsicht, Vorzeichenkonvention ist gerne Fehlerquelle.
        // lightDirection geht ZUR Lichtquelle.
        vec3  lightDirection = normalize(vecDirectionalLight);
        float diffuse = clamp(dot(normal, lightDirection), 0.0, 1.0);// dot(normal, lightSource) <-- diffus (warum?)
        diffuse *= calcSoftshadow(rayPos, lightDirection, 0.02, 2.5);// warum hier *= ...?

        float specular, shininess;
        if (useBlinnPhongSpecular) {
            vec3 halfway = normalize(lightDirection - ray.dir);// was ist das, geometrisch?
            specular = dot(normal, halfway);
            shininess = iSpecularExponent * 3.;
        } else {
            vec3 reflected = reflect(lightDirection, normal);
            specular = dot(ray.dir, reflected);
            shininess = iSpecularExponent;
        }
        // warum wird der Exponent hier wohl auch gerne als "Shininess" bezeichnet?
        specular = pow(clamp(specular, 0.0, 1.0), shininess);

        const vec3 sourceCol = vec3(1.30, 1.00, 0.70);
        shade += col * iDiffuseAmount * sourceCol * diffuse;
        shade +=       iSpecularAmount * sourceCol * specular * specularCoeff;
    }

    col = shade;

    // "Distanznebel", inwiefern macht dieser Begriff Sinn?
    const vec3 colFog = vec3(0.0, 0.0, 0.0);
    float fogOpacity = 1.0 - exp(-0.0001 * pow(hit.distance, 3.0));
    col = mix(col, colFog, fogOpacity);

    return col;
}

void main()
{
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    Ray ray;
    ray.origin = iCameraOffset;
    ray.dir = normalize(vec3(uv, iFocalLength));

    ray.dir *= rotZ(iCameraAngle.z);
    ray.dir *= rotY(iCameraAngle.y);
    ray.dir *= rotX(iCameraAngle.x);

    vec3 col = render(ray);

    // Nachbearbeitung gefällig?
    // z.B. Gamma Grading
    const float gamma = 2.2;
    col = clamp(col, 0.0, 1.0);
    col = pow( col, vec3(1./gamma) );

    fragColor = vec4(col, 1.0);
}
