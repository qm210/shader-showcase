#version 300 es

// based on: https://www.shadertoy.com/view/Xds3zN
// simplified for our lecture.

// List of other 3D SDFs:
//    https://www.shadertoy.com/playlist/43cXRl
// and
//    https://iquilezles.org/articles/distfunctions

precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform vec4 iMouse;
uniform float iFocalLength;
uniform vec3 iCameraTargetOffset;
uniform float iCameraCenterDistance;
uniform float iCameraHeight;
uniform float iCameraRotationAngle;
uniform float iCameraRotationFrequency;
uniform vec3 vecDirectionalLight;
uniform float iDiffuseAmount;
uniform float iSpecularAmount;
uniform float iSpecularExponent;
uniform float iFloorSpecularCoefficient;
uniform float iShadowHardness;
uniform int iShadowMarchingSteps;
uniform float iMarchingPrecision;
uniform int iMarchingSteps;
uniform float iSphereSize;
// ein paar bools als "Toggles" zum Direkt-Vergleich (besser als #define -> müsste neukompilieren).
uniform bool useAdaptiveMarchingPrecision;
uniform bool showJustASphere;
uniform bool makeSphereColorful;
uniform bool useBlinnPhongSpecular;
// PS: hier liest sich die Konvention mit i<Verb><...> m.M.n. so dämlich, dass ich sie da nicht nutze.
// Es gibt aber sowieso keinen offiziellen GLSL-Styleguide, ihr könnt eigene Ideen ausprobieren,
// müsst dann aber selbst bewerten, ob ihr auf Dauer eure Shader noch versteht / angstfrei ändern könnt.

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

float sdCappedTorus(in vec3 p, in vec2 sc, in float ra, in float rb)
{
    p.x = abs(p.x);
    float k = (sc.y*p.x>sc.x*p.y) ? dot(p.xy,sc) : length(p.xy);
    return sqrt( dot(p,p) + ra*ra - 2.0*ra*k ) - rb;
}

float sdHexPrism( vec3 p, vec2 h )
{
    vec3 q = abs(p);

    const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
    p = abs(p);
    p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy;
    vec2 d = vec2(
    length(p.xy - vec2(clamp(p.x, -k.z*h.x, k.z*h.x), h.x))*sign(p.y - h.x),
    p.z-h.y );
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdOctogonPrism( in vec3 p, in float r, float h )
{
    const vec3 k = vec3(-0.9238795325,   // sqrt(2+sqrt(2))/2
    0.3826834323,   // sqrt(2-sqrt(2))/2
    0.4142135623 ); // sqrt(2)-1
    // reflections
    p = abs(p);
    p.xy -= 2.0*min(dot(vec2( k.x,k.y),p.xy),0.0)*vec2( k.x,k.y);
    p.xy -= 2.0*min(dot(vec2(-k.x,k.y),p.xy),0.0)*vec2(-k.x,k.y);
    // polygon side
    p.xy -= vec2(clamp(p.x, -k.z*r, k.z*r), r);
    vec2 d = vec2( length(p.xy)*sign(p.y), p.z-h );
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdCapsule( vec3 p, vec3 a, vec3 b, float r )
{
    vec3 pa = p-a, ba = b-a;
    float h = clamp( dot(pa,ba)/dot(ba,ba), 0.0, 1.0 );
    return length( pa - ba*h ) - r;
}

float sdRoundCone( in vec3 p, in float r1, float r2, float h )
{
    vec2 q = vec2( length(p.xz), p.y );

    float b = (r1-r2)/h;
    float a = sqrt(1.0-b*b);
    float k = dot(q,vec2(-b,a));

    if( k < 0.0 ) return length(q) - r1;
    if( k > a*h ) return length(q-vec2(0.0,h)) - r2;

    return dot(q, vec2(a,b) ) - r1;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2)
{
    // sampling independent computations (only depend on shape)
    vec3  ba = b - a;
    float l2 = dot(ba,ba);
    float rr = r1 - r2;
    float a2 = l2 - rr*rr;
    float il2 = 1.0/l2;

    // sampling dependant computations
    vec3 pa = p - a;
    float y = dot(pa,ba);
    float z = y - l2;
    float x2 = dot2( pa*l2 - ba*y );
    float y2 = y*y*l2;
    float z2 = z*z*l2;

    // single square root!
    float k = sign(rr)*rr*rr*x2;
    if( sign(z)*a2*z2 > k ) return  sqrt(x2 + z2)        *il2 - r2;
    if( sign(y)*a2*y2 < k ) return  sqrt(x2 + y2)        *il2 - r1;
    return (sqrt(x2*a2*il2)+y*rr)*il2 - r1;
}

float sdTriPrism( vec3 p, vec2 h )
{
    const float k = sqrt(3.0);
    h.x *= 0.5*k;
    p.xy /= h.x;
    p.x = abs(p.x) - 1.0;
    p.y = p.y + 1.0/k;
    if( p.x+k*p.y>0.0 ) p.xy=vec2(p.x-k*p.y,-k*p.x-p.y)/2.0;
    p.x -= clamp( p.x, -2.0, 0.0 );
    float d1 = length(p.xy)*sign(-p.y)*h.x;
    float d2 = abs(p.z)-h.y;
    return length(max(vec2(d1,d2),0.0)) + min(max(d1,d2), 0.);
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

// vertical
float sdCone( in vec3 p, in vec2 c, float h )
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

float sdCappedCone( in vec3 p, in float h, in float r1, in float r2 )
{
    vec2 q = vec2( length(p.xz), p.y );

    vec2 k1 = vec2(r2,h);
    vec2 k2 = vec2(r2-r1,2.0*h);
    vec2 ca = vec2(q.x-min(q.x,(q.y < 0.0)?r1:r2), abs(q.y)-h);
    vec2 cb = q - k1 + k2*clamp( dot(k1-q,k2)/dot2(k2), 0.0, 1.0 );
    float s = (cb.x < 0.0 && ca.y < 0.0) ? -1.0 : 1.0;
    return s*sqrt( min(dot2(ca),dot2(cb)) );
}

float sdCappedCone(vec3 p, vec3 a, vec3 b, float ra, float rb)
{
    float rba  = rb-ra;
    float baba = dot(b-a,b-a);
    float papa = dot(p-a,p-a);
    float paba = dot(p-a,b-a)/baba;

    float x = sqrt( papa - paba*paba*baba );

    float cax = max(0.0,x-((paba<0.5)?ra:rb));
    float cay = abs(paba-0.5)-0.5;

    float k = rba*rba + baba;
    float f = clamp( (rba*(x-ra)+paba*baba)/k, 0.0, 1.0 );

    float cbx = x-ra - f*rba;
    float cby = paba - f;

    float s = (cbx < 0.0 && cay < 0.0) ? -1.0 : 1.0;

    return s*sqrt( min(cax*cax + cay*cay*baba,
    cbx*cbx + cby*cby*baba) );
}

// c is the sin/cos of the desired cone angle
float sdSolidAngle(vec3 pos, vec2 c, float ra)
{
    vec2 p = vec2( length(pos.xz), pos.y );
    float l = length(p) - ra;
    float m = length(p - c*clamp(dot(p,c),0.0,ra) );
    return max(l,m*sign(c.y*p.x-c.x*p.y));
}

float sdOctahedron(vec3 p, float s)
{
    p = abs(p);
    float m = p.x + p.y + p.z - s;

    // exact distance
    #if 0
    vec3 o = min(3.0*p - m, 0.0);
    o = max(6.0*p - m*2.0 - o*3.0 + (o.x+o.y+o.z), 0.0);
    return length(p - s*o/(o.x+o.y+o.z));
    #endif

    // exact distance
    #if 1
    vec3 q;
    if( 3.0*p.x < m ) q = p.xyz;
    else if( 3.0*p.y < m ) q = p.yzx;
    else if( 3.0*p.z < m ) q = p.zxy;
    else return m*0.57735027;
    float k = clamp(0.5*(q.z-q.y+s),0.0,s);
    return length(vec3(q.x,q.y-s+k,q.z-k));
    #endif

    // bound, not exact
    #if 0
    return m*0.57735027;
    #endif
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

// la,lb=semi axis, h=height, ra=corner
float sdRhombus(vec3 p, float la, float lb, float h, float ra)
{
    p = abs(p);
    vec2 b = vec2(la,lb);
    float f = clamp( (ndot(b,b-2.0*p.xz))/dot(b,b), -1.0, 1.0 );
    vec2 q = vec2(length(p.xz-0.5*b*vec2(1.0-f,1.0+f))*sign(p.x*b.y+p.z*b.x-b.x*b.y)-ra, p.y-h);
    return min(max(q.x,q.y),0.0) + length(max(q,0.0));
}

float sdHorseshoe( in vec3 p, in vec2 c, in float r, in float le, vec2 w )
{
    p.x = abs(p.x);
    float l = length(p.xy);
    p.xy = mat2(-c.x, c.y,
    c.y, c.x)*p.xy;
    p.xy = vec2((p.y>0.0 || p.x>0.0)?p.x:l*sign(-c.x),
    (p.x>0.0)?p.y:l );
    p.xy = vec2(p.x,abs(p.y-r))-vec2(le,0.0);

    vec2 q = vec2(length(max(p.xy,0.0)) + min(0.0,max(p.x,p.y)),p.z);
    vec2 d = abs(q) - w;
    return min(max(d.x,d.y),0.0) + length(max(d,0.0));
}

float sdU( in vec3 p, in float r, in float le, vec2 w )
{
    p.x = (p.y>0.0) ? abs(p.x) : length(p.xy);
    p.x = abs(p.x-r);
    p.y = p.y - le;
    float k = max(p.x,p.y);
    vec2 q = vec2( (k<0.0) ? -k : length(max(p.xy,0.0)), abs(p.z) ) - w;
    return length(max(q,0.0)) + min(max(q.x,q.y),0.0);
}

//------------------------------------------------------------------

// wie vec2, aber erklärt uns mehr über die Bedeutung :)
struct Marched {
    float distance; // <-- das heißt wirklich oft einfach nur "t". Wir machen es _hier_mal_explizit_.
    float material;
};

vec2 opUnion( vec2 d1, vec2 d2 )
{
    return (d1.x<d2.x) ? d1 : d2;
}

// Wir überladen opUnion (geht in GLSL wie z.B. in C/C++), weil wir Lesbarkeit vorziehen
// und statt des "vec2" unser "struct Marched" eingeführt haben. Es drückt dasselbe aus.
// Das Überladen hilft uns, dass wir nicht alles direkt übersetzen müssen, sondern
// beide Beschreibungen als gewissermaßen kompatibel behandeln können.
Marched opUnion( Marched d1, vec2 d2 )
{
    if (d1.distance < d2.x)
        return d1;
    return Marched(d2.x, d2.y);
}

Marched opUnion( Marched d1, Marched d2 )
{
    // Randnotiz: bei eigenen structs unterstützt GLSL den
    //            den ternären Operator (... ? ... : ...) nicht.
    if (d1.distance < d2.distance)
        return d1;
    return d2;
}

Marched map( in vec3 pos )
{
    Marched res = Marched(pos.y, 0.0);

    if (showJustASphere) {
        float material = 1.0;

        // ist ein händisches "opUnion" (== "Ist dieser Signed-Distance geringer, d.h. Objekt näher"?)
        float sphereDistance = sdSphere(pos-vec3( 1.0,0.2,-1.0), iSphereSize );
        if (sphereDistance < res.distance) {
            res.distance = sphereDistance;
            res.material = 1.6;
        }
        return res;
    }

    // Anmerkung: Größere Szenen können mithilfe solcher Bounding Boxes unterteilt werden:
//    if( sdBox( pos-vec3(-2.0,0.3,0.25),vec3(0.3,0.3,1.0) )<res.x )
//    {
//        res = opUnion(... sdf(...) ...);
//    }
    // --> brauchen wir hier nicht (außer eurer Rechner versagt bereits die FPS),
    // aber das ist dennoch häufig nützlich (und im Verstehen fremder Shader eine Hilfe)

    res = opUnion( res, vec2( sdHexPrism(    pos-vec3(-2.0,0.25, 0.0), vec2(0.2,0.05) ), 18.4 ) );
    res = opUnion( res, vec2( sdRhombus(  (pos-vec3(-2.0,0.25, 1.0)).xzy, 0.15, 0.25, 0.04, 0.08 ),17.0 ) );
    res = opUnion( res, vec2( sdCappedTorus((pos-vec3( 0.0,0.30, 1.0))*vec3(1,-1,1), vec2(0.866025,-0.5), 0.25, 0.05), 25.0) );
    res = opUnion( res, vec2( sdBoxFrame(    pos-vec3( 0.0,0.25, 0.0), vec3(0.3,0.25,0.2), 0.025 ), 16.9 ) );
    res = opUnion( res, vec2( sdCone(        pos-vec3( 0.0,0.45,-1.0), vec2(0.6,0.8),0.45 ), 55.0 ) );
    res = opUnion( res, vec2( sdCappedCone(  pos-vec3( 0.0,0.25,-2.0), 0.25, 0.25, 0.1 ), 13.67 ) );
    res = opUnion( res, vec2( sdSolidAngle(  pos-vec3( 0.0,0.00,-3.0), vec2(3,4)/5.0, 0.4 ), 49.13 ) );
    res = opUnion( res, vec2( sdTorus(      (pos-vec3( 1.0,0.30, 1.0)).xzy, vec2(0.25,0.05) ), 7.1 ) );
    res = opUnion( res, vec2( sdBox(         pos-vec3( 1.0,0.25, 0.0), vec3(0.3,0.25,0.1) ), 3.0 ) );
    res = opUnion( res, vec2( sdSphere(      pos-vec3( 1.0,0.2,-1.0), 0.2 + 0.2 * iSphereSize ), 1.6 ) );
    res = opUnion( res, vec2( sdCylinder(    rotZ(0.8*iTime)* (pos-vec3( 1.0,0.25,-2.0)), vec2(0.15,0.25) ), 8.0 ) );
    res = opUnion( res, vec2( sdCapsule(     pos-vec3( 1.0,0.00,-3.0),vec3(-0.1,0.1,-0.1), vec3(0.2,0.4,0.2), 0.1  ), 31.9 ) );
    res = opUnion( res, vec2( sdPyramid(    pos-vec3(-1.0,-0.6,-3.0), 1.0 ), 13.56 ) );
    res = opUnion( res, vec2( sdOctahedron( pos-vec3(-1.0,0.15,-2.0) - rotY(iTime * 1.3)*vec3(-2.0,0.,0.), 0.35 ), 23.56 ) );
    res = opUnion( res, vec2( sdTriPrism(   pos-vec3(-1.0,0.15,-1.0), vec2(0.3,0.05) ),43.5 ) );
    res = opUnion( res, vec2( sdEllipsoid(  pos-vec3(-1.0,0.25, 0.0), vec3(0.2, 0.25, 0.05) ), 43.17 ) );
    float jumpY = max(0.25, 0.25 + 0.25 * cos(twoPi * 2. * iTime));
    res = opUnion( res, vec2( sdHorseshoe(  pos-vec3(-1.0, jumpY, 1.0), vec2(cos(1.3),sin(1.3)), 0.2, 0.3, vec2(0.03,0.08) ), 11.5 ) );
    res = opUnion( res, vec2( sdOctogonPrism(pos-vec3( 2.0,0.2,-3.0), 0.2, 0.05), 51.8 ) );
    res = opUnion( res, vec2( sdCylinder(    pos-vec3( 2.0,0.14,-2.0), vec3(0.1,-0.1,0.0), vec3(-0.2,0.35,0.1), 0.08), 31.2 ) );
    res = opUnion( res, vec2( sdCappedCone(  pos-vec3( 2.0,0.09,-1.0), vec3(0.1,0.0,0.0), vec3(-0.2,0.40,0.1), 0.15, 0.05), 46.1 ) );
    res = opUnion( res, vec2( sdRoundCone(   pos-vec3( 2.0,0.15, 0.0), vec3(0.1,0.0,0.0), vec3(-0.1,0.35,0.1), 0.15, 0.05), 51.7 ) );
    res = opUnion( res, vec2( sdRoundCone(   pos-vec3( 2.0,0.20, 1.0), 0.2, 0.1, 0.3 ), 37.0 ) );
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

Marched raymarch( in vec3 ro, in vec3 rd )
{
    Marched res = Marched(-1.0,-1.0);

    float tmin = 1.0;
    float tmax = 20.0;

    // raytrace floor plane
    float tp1 = (0.0-ro.y)/rd.y;
    if( tp1>0.0 )
    {
        tmax = min( tmax, tp1 );
        res = Marched( tp1, 1.0 );
    }

    // raymarch primitives
    vec2 tb = iBox( ro-vec3(0.0,0.4,-0.5), rd, vec3(2.5,0.41,3.0) );
    if( tb.x<tb.y && tb.y>0.0 && tb.x<tmax)
    {
        tmin = max(tb.x,tmin);
        tmax = min(tb.y,tmax);

        float t = tmin;
        for( int i=0; i<iMarchingSteps && t<tmax; i++ )
        {
            vec3 pos = ro + rd * t;
            Marched h = map(pos);

            // hier eine leichte Variation "< epsilon * t", das nennt sich "adaptiv" - nach der Idee:
            // bei größeren Marching-Strecken darf auch das Objekt ungenauer getroffen werden, weil
            // - in der Ferne die Präzision mutmaßlich verschwendet ist
            // - sich numerische Float-Rundungsfehler auch aufsummieren
            // Gerade der erste Punkt solle im konkreten Fall aber auch mal gegengecheckt werden.
            //
            // ~ iMarchingPrecision bei 0.001 bis 0.01 ist oft fürs Ergebnis gut,
            //   die Frage ist immer, in wie vielen Schleifen man erheblich Rechenzeit sparen könnte.
            // ~ gilt auch für iMarchingSteps (war 70) oben -- wo kann man sparen?
            float marchingPrecision = (
                useAdaptiveMarchingPrecision
                    ? iMarchingPrecision * 0.1 * t
                    : iMarchingPrecision
            );
            if(abs(h.distance) < marchingPrecision)
            {
                res = Marched(t, h.material);
                break;
            }
            t += h.distance;
        }
    }
    return res;
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
        float h = map( ro + rd*t ).distance;
        float s = clamp(iShadowHardness * h/t, 0.0, 1.0);
        res = min( res, s );
        t += clamp( h, 0.01, 0.2 );
        if( res<0.004 || t>tmax ) break;
    }
    res = clamp( res, 0.0, 1.0 );
    return res*res*(3.0-2.0*res);
}

// https://iquilezles.org/articles/nvscene2008/rwwtt.pdf
float calcAO( in vec3 pos, in vec3 nor )
{
    float occ = 0.0;
    float sca = 1.0;
    for( int i=0; i<5; i++ )
    {
        // Das ist eine Modifikation des
        float h = 0.01 + 0.12*float(i)/4.0;
        float d = map( pos + h*nor ).distance;
        occ += (h-d)*sca;
        sca *= 0.95;
        if( occ>0.35 ) break;
    }
    return clamp( 1.0 - 3.0*occ, 0.0, 1.0 ) * (0.5+0.5*nor.y);
}

// https://iquilezles.org/articles/normalsSDF
vec3 calcNormal( in vec3 pos )
{
    vec2 e = vec2(1.0,-1.0)*0.5773*0.0005;
    return normalize( e.xyy*map( pos + e.xyy ).distance +
    e.yyx*map( pos + e.yyx ).distance +
    e.yxy*map( pos + e.yxy ).distance +
    e.xxx*map( pos + e.xxx ).distance );
}

vec3 render(in vec3 rayOrigin, in vec3 rayDir)
{
    // background
    vec3 col = vec3(0.0, 0., 0.0) - max(rayDir.y,0.0)*0.3;

    // raymarch scene
    Marched res = raymarch(rayOrigin,rayDir);
    if( res.material > -0.5 )
    {
        bool isFloor = res.material < 1.5;

        vec3 rayPos = rayOrigin + res.distance * rayDir;
        vec3 normal = isFloor ? vec3(0.0,1.0,0.0) : calcNormal(rayPos);

        bool isSphere = res.material == 1.6;
        if (makeSphereColorful && isSphere) {
            // Beispiel für individuelle Farbgebung für ein einzelnes Objekt.
            // Das steht jetzt hier, weil es hier den Effekt erfüllt.
            // Wir haben aber so verschiedene im Shader verstreute Stellen,
            // die irgendwie die Grundfarbe eines Materials (vor dem Beleuchtungsmodell)
            // entscheiden -- das ist nur begrenzt zukunftsfähig, kann oder muss
            // muss man aber manchmal hinter anderen Anforderungen zurückstecken
            // -> pro Einzelfall evaluieren.
            res.material += 0.2 * iTime;
            res.material += pow(1.93 * rayPos.y, -1.01);
        }

        col = 0.2 + 0.2*sin( res.material*2.0 + vec3(0.0,1.0,2.0) );
        float specularCoeff = 0.4 + 0.5 *exp(0.03 * res.material);

        if (isFloor)
        {
            float f = 1. - abs(step(0.5, fract(1.5*rayPos.x)) - step(0.5, fract(1.5*rayPos.z)));
            col = 0.15 + f*vec3(0.05);
            specularCoeff = iFloorSpecularCoefficient;
        }

        if (makeSphereColorful && isSphere) {
            // Siehe Kommentar zu makeSphereColorful oben.
            col.r = 0.4 + col.g * 0.3 * sin(29.2 * rayPos.x);
        }

        vec3 shade = vec3(0.0);

        // Licht: reines Richtungslicht (passt zu einer Sonne, die weit weg ist, im Gegensatz zu Punktlicht)
        {
            // Vorsicht, Vorzeichenkonvention ist gerne Fehlerquelle.
            // lightDirection geht ZUR Lichtquelle.
            vec3  lightDirection = normalize( vecDirectionalLight );
            float diffuse = clamp( dot(normal, lightDirection), 0.0, 1.0); // dot(normal, lightSource) <-- diffus (warum?)
            diffuse *= calcSoftshadow(rayPos, lightDirection, 0.02, 2.5); // warum hier *= ...?

            float specular, shininess;
            if (useBlinnPhongSpecular) {
                vec3 halfway = normalize(lightDirection - rayDir); // was ist das, geometrisch?
                specular = dot(normal, halfway);
                shininess = iSpecularExponent * 3.;
            } else {
                vec3 reflected = reflect(lightDirection, normal);
                specular = dot(rayDir, reflected);
                shininess = iSpecularExponent;
            }
            // warum wird der Exponent hier wohl auch gerne als "Shininess" bezeichnet?
            specular = pow( clamp( specular, 0.0, 1.0), shininess);

            const vec3 sourceCol = vec3(1.30,1.00,0.70);
            shade += col * iDiffuseAmount * sourceCol * diffuse;
            shade +=       iSpecularAmount * sourceCol * specular * specularCoeff;
        }

        col = shade;

        // "Distanznebel", inwiefern macht dieser Begriff Sinn?
        const vec3 colFog = vec3(0.0, 0.0, 0.0);
        float fogOpacity = 1.0 - exp( -0.0001 * pow(res.distance, 3.0));
        col = mix(col, colFog, fogOpacity);
    }

    return clamp(col, 0.0, 1.0);
}

mat3 setCamera( in vec3 origin, in vec3 target, float rollAngle )
{
    vec3 cameraForward = normalize(target - origin);
    vec3 cp = vec3(sin(rollAngle), cos(rollAngle), 0.0);
    vec3 cameraRight = normalize( cross(cameraForward, cp) );
    vec3 cameraUp = cross(cameraRight, cameraForward); // already normalized
    return mat3(cameraRight, cameraUp, cameraForward);
}

void main()
{
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    // camera
    vec3 cameraTarget = vec3(0.25, -0.25, -0.75) + iCameraTargetOffset;
    float rot = iCameraRotationFrequency * iTime + iCameraRotationAngle;
    vec3 rayOrigin = cameraTarget + vec3(
        iCameraCenterDistance * cos(twoPi * rot),
        iCameraHeight,
        iCameraCenterDistance * sin(-twoPi * rot)
    );
    // camera-to-world transformation
    mat3 ca = setCamera( rayOrigin, cameraTarget, 0.0 );
    // ray direction
    vec3 rayDirection = ca * normalize( vec3(uv, iFocalLength) );

    // render
    vec3 col = render( rayOrigin, rayDirection);

    // gain ("HDR compression", Konstanten so gewählt dass [0,1] erhalten bleibt)
    // col = col * 2.5/(1.5 + col);
    // col = col * 3.0/(2.5 + col)
    // <-- quasi Alternativen zur pow()-Gammakorrektur, man wähle was einem gefällt. Siehe auch:
    // https://graphtoy.com/?f1(x,t)=pow(x,1./2.2)&v1=true&f2(x,t)=x*3./(2.5+x)&v2=true&f3(x,t)=x*2.5/(1.5+x)&v3=true&f4(x,t)=&v4=false&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=0.744623141762885,0.5386673261892163,1.2183071759372475

    // gamma
    const float gamma = 2.2;
    col = pow( col, vec3(1./gamma) );

    fragColor = vec4(col, 1.0);
}
