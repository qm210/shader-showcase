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
uniform vec3 iTorusCenter;
uniform vec2 iTorusRadii;
uniform float iTorusRotate;
uniform vec2 iTorusSpin;
uniform vec2 iTorusRepeat;
uniform float iMoonAngularPos;

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

/// ------------------- TRANSFORMATIONS ---------------------------

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

/// ------------------- PSEUDORANDOM ---------------------------

float hash12(vec2 p, float seed) {
    p = vec2(dot(p, vec2(127.1, 311.7)) + seed * 17.3, seed * 23.7);
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
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

vec2 hash22(vec2 p) {
    float n = sin(dot(p, vec2(127.1, 311.7))) * 43758.5453;
    return fract(vec2(n, n * 1.2154));
}

float voronoiPattern(vec2 uv) {
    const float scale = 10.;
    uv *= scale;
    vec2 uvInt = floor(uv);
    vec2 uvFrac = fract(uv);
    float dMin = 1.0;
    float dSecondMin = 1.0;
    for (float y = -1.; y < 1.01; y += 1.) {
        for (float x = -1.; x < 1.01; x += 1.) {
            vec2 b = vec2(x, y);
            vec2 r = b + hash22(uvInt + b) - uvFrac;
            float d = length(r);
            if (d < dMin) {
                dSecondMin = dMin;
                dMin = d;
            } else if (d < dSecondMin) {
                dSecondMin = d;
            }
        }
    }
    return dSecondMin - dMin;
}
/// ------------------- SDF ---------------------------

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

//------------------------------------------------------------------

// Eigene structs -- für lesbarere Shader :)
struct Hit {
    float distance;
    int material;
};

#define NOTHING_HIT -1
#define FLOOR_MATERIAL 1
#define SPHERE_MATERIAL 2
#define TORUS_MATERIAL 3

vec3 sphereCenter = vec3(0., 0.8, 3.);
float sphereSize = 1.5;
const float textureRotation = 0.2;
const float textureFunnyBounce = 0.07;
mat3 torusRotate;

const vec3 dirLightColor = vec3(1.30, 1.00, 0.80);
const vec3 pointLightColor = vec3(1., 0.3, .7);
vec3 pointLightCenter;

vec2 sphereSurface(vec3 pos) {
    // "interne (kugel-eigene) Koordinaten" [-1; 1]
    vec3 p = (pos - sphereCenter) / sphereSize;
    // y-flip weil will OpenGL so
    p.y *= -1.;

    // hint: https://de.wikipedia.org/wiki/Kugelkoordinaten
    float polarAngle = atan(p.z, p.x) / twoPi + 0.5;
    float normY = 0.5 * p.y + 0.5;
    /// Verzerrt zwar etwas, aber good enough, erstmal.
    vec2 surfaceST = vec2(polarAngle, normY);
    return surfaceST;
}

Hit scene(in vec3 pos)
{
    // Hint: wenn Anfangsabstand zu klein, könnte die Szene abgeschnitten werden.
    Hit hit = Hit(1.e3, NOTHING_HIT);

    // float angle = .2 * iTime - pi;
    float angle = iMoonAngularPos;
    // ... Bewegung ist cool, aber zum Entwickeln auch manchmal nachteilig ...
    sphereCenter = rotY(angle) * vec3(0., 1.5, 12.);
    float d = sdSphere(pos - sphereCenter, sphereSize);
    if (d < hit.distance) {
        hit = Hit(d, SPHERE_MATERIAL);
    }

    float yAngle = radians(iTorusSpin.x) * iTime;
    float yTilt = radians(iTorusSpin.y) * iTime;
    torusRotate = rotY(yAngle) * rotX(radians(iTorusRotate)) * rotY(yTilt);
    vec3 posTorus = torusRotate * (pos - iTorusCenter);
    d = sdTorus(posTorus, iTorusRadii);
    if (d < hit.distance) {
        hit = Hit(d, TORUS_MATERIAL);
    }

    /// (neben der Farbe), wenn wir lightDirection von jedem Oberflächenpunktaber
    /// aber entsprechend zum alten Fall _in_Richtung_ der Lichtquelle wählen,
    /// ist jeder weiteren Folgerechnung egal, woher das Licht nun stammt.
    vec3 distanceToSphereCenter = vec3(1.5 * sphereSize, 0., 0.);
    vec3 rotatedDistance = rotX(1.2 * iTime) * rotZ(iTime) * distanceToSphereCenter;
    pointLightCenter = sphereCenter + rotatedDistance;

    return hit;
}

Hit raymarch(vec3 rayOrigin, vec3 rayDir)
{
    float tmin = iMarchingMin;
    float tmax = iMarchingMax;

    Hit hit = Hit(-1.0, NOTHING_HIT);
    Hit beforeMarching = hit;

    float t = tmin;
    for (int i=0; i < iMarchingSteps && t < tmax; i++)
    {
        vec3 pos = rayOrigin + rayDir * t;
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

vec3 somePalette(float t) {
    const vec3 a = vec3(0.45, 0.10, 0.30);
    const vec3 b = vec3(0.35, 0.35, 0.35);
    const vec3 c = vec3(1.0, 1.0, 1.0);
    const vec3 d = vec3(0.00, 0.33, 0.67);
    return a + b * cos(twoPi * (c * t + d));
}

vec3 background(in vec3 rayDir) {
    vec3 col = c.yyy;
    col = texture(texSpace, rayDir.xy).rgb;
    col = pow(col, vec3(3.24 / 1.));
    return col;
}

bool isAlive(vec2 st);

void doTheRayMarching(in vec3 rayOrigin, in vec3 rayDir, out vec3 rayPos, out vec3 col, out bool isBackground) {
    Hit hit = raymarch(rayOrigin, rayDir);

    if (hit.material == NOTHING_HIT) {
        isBackground = true;
        return;
    }

    rayPos = rayOrigin + hit.distance * rayDir;
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
            vec2 texCoord = sphereSurface(rayPos);
            texCoord.s += 0.35;
            col = texture(texFloof, texCoord).rgb;
            break;
        }
        case TORUS_MATERIAL: {
            // Vorgehen ähnlich wie bei sdf-Minimum auswerten selbst:
            // 1. Welt-Koordinaten in die transformieren, in der der Torus zentral liegt
            vec3 posTorus = torusRotate * (rayPos - iTorusCenter);
            // 2. Form auswerten, dieses Mal also die ST-Koordinaten an der Oberfläche
            vec2 texCoord = texCoordTorus(posTorus, iTorusRadii);
            // ... wiederholen -- nur für die Veranschaulichung.
            //     Hängt von Texturparametern WRAP_S & WRAP_T ab! (-> REPEAT/MIRRORED_REPEAT)
            texCoord *= iTorusRepeat;

            /// Hier das Game-Of-Life...
            if (isAlive(texCoord)) {
                col = vec3(2., 4., 9.);
            } else {
                col = vec3(0., 0., 0.2);
            }

            // Oder halt was ganz anderes
//            const vec3 torusDark = vec3(0., 0., 0.2);
//            float pattern = voronoiPattern(texCoord);
//            pattern = pow(3. * pattern, 4.4);
//            vec3 bright = somePalette(texCoord.s);
//            col = mix(torusDark, bright, pattern);
//            col = pow(col, vec3(-0.6));

            break;
        }
    }

    /* == Übung ==
     * Lichtquelle 1 war ein reines Richtungslicht (wie Sonne -- Quelle weit weg)
     * Lichtquelle 2 soll nun ein Punktlicht sein, der um den "Mond" kreist. Wie?
     * (und Bonusfrage: Wie macht man diese Lichtquelle selbst sichtbar?)
    */
    vec3 totalShade = c.yyy;

    // Extrabeitrag: "Ambient" Light, ganz unabhängig von allen Lichtquellen
    totalShade += iAmbientAmount * col;

    // Vorzeichenkonvention: lightDirection geht konventuell ZUR Lichtquelle
    vec3 lightDirection, lightColor;
    // Die Farbe der Einzelnen Lichter wird nach Belieben gewählt, aufpassen muss man
    // meist erst am Ende, dass alle Effekte in 8bit RGBA passen (-> Tone Mapping)

    for (int light = 0; light < 2; light++)
    {
        vec3 shade = c.yyy;

        switch (light) {
            case 0:
                /// Unidirektionales Richtungslicht; parallele Lichtstrahlen.
                /// hier ist diese Richtungsvektor komplett freier Parameter.
                lightDirection = normalize(vecDirectionalLight);
                lightColor = dirLightColor;
                break;
            case 1:
                /// Zusätzliches Punktlicht -> dessen Position ist hier global und vorsichtshalber
                /// schon in der scene() ausgerechnet, es zwangsläufig auch passiert.
                /// Unterschied jetzt: der Auftrittspunkt "rayPos" geht in lightDirection ein!
                /// -> ab dann hat aber jeder Punkt wieder ein eindeutiges, festes lightDirection,
                ///    d.h. die Beleuchtungsmodelle funktionieren äquivalent dazu.
                lightDirection = normalize(pointLightCenter - rayPos);
                /// -> Farbe können wir natürlich auch frei wählen.
                ///    Stärke beliebig, HDR -> LDR (Tone Mapping) bedenken!
                lightColor = pointLightColor;
                // PS: Klugscheißerkommentar: Das Licht strahlt nicht realistisch.
                //     Sich radial ausbreitendes Licht müsste mit r^2 abnehmen.
                //     Können wir evt. live vor Ort mal einbauen.
                break;
        }

        /// "Diffuse" Lichtstreuung, unabhängig _Blickrichtung_
        /// -> Das Skalarprodukt sagt uns hier einfach, wie viel Licht anteilig:
        //     auf die Oberfläche trifft. Weitere Richtungsvektoren gehen nicht ein.
        float diffuse = dot(normal, lightDirection);
        // diffuse = clamp(diffuse, 0.0, 1.0);
        diffuse = max(dot(normal, lightDirection), 0.0);
        diffuse *= diffuseCoeff * iDiffuseAmount;
        shade += diffuse * col * lightColor;
        // ... was sagt uns multiplikative Verknüpfung des Lichts?

        // "Specular" Lichtstreuung, abhängig von Reflektionswinkel
        vec3 reflected = reflect(lightDirection, normal);
        // reflect(I, N) == I - 2.0 * dot(N, I) * N
        // I: Incident / Einfallswinkel _von_ Oberfläche _zur_ Kamera
        // N: Normalenvektor auf Oberfläche zeigt senkrecht nach _außen_.
        float specular = dot(rayDir, reflected);
        specular = pow(clamp(specular, 0.0, 1.0), specularExponent);
        specular *= specularCoeff;
        shade += iSpecularAmount * lightColor * specular;

        // Shadow Cast: Reduziert das Ganze wieder um Faktor [0..1]
        shade *= calcSoftshadow(rayPos, lightDirection, 0.02, 2.5);

        totalShade += shade;
    }

    col = totalShade;

    // Distanznebel mit "Hintergrund, wenn zu dicht" (wegen Übergang)
    float fog = 1.0 - exp(-iDistanceFogDensity * pow(hit.distance, 3.0));
    isBackground = fog > 0.99;
    if (isBackground) {
        return;
    }
    col = mix(col, c.yyy, fog);
}

vec3 renderPass(vec2 uv) {
    vec3 rayOrigin = iCameraOffset;
    vec3 rayDir = normalize(vec3(uv, iFocalLength));
    vec3 rayPos;
    vec3 col;
    bool isBackground;
    doTheRayMarching(rayOrigin, rayDir, rayPos, col, isBackground);

    if (isBackground) {
        col = background(rayDir);

        /// Sonne hinzufügen
        vec3 sunDir = vecDirectionalLight;
        /// dot() sagt auch hier schlicht: wie sehr parallel zum Licht schauen wir?
        float sunOverlap = max(dot(rayDir, sunDir), 0.);
        float sunCore = pow(sunOverlap, 1800.);
        float sunAura = pow(sunOverlap, 20.);
        vec3 colSun = dirLightColor * (sunCore + 0.05 * sunAura);
        col += colSun;
    }
    const bool showPointLightSource = true;
    if (showPointLightSource) {
        /// Lichtpunkt hinzufügen (Man beachte, pointLightCenter ist global)
        vec3 cameraToLightPoint = pointLightCenter - rayOrigin;
        vec3 directionToLightPoint = normalize(cameraToLightPoint);

        // Wie kommen wir jetzt von der Richtung auf die Farbgebung?
        float intensity = 0.;

        float overlap = dot(directionToLightPoint, rayDir);
        float intensity = clamp(overlap, 0., 1.);
        intensity = pow(intensity, 800.);
        // F
        float shadowed = calcSoftshadow(rayPos, directionToLightPoint, 0.02, 2.5);
        intensity *= shadowed;
        /* die Physik (das Abstandsgesetzt) korrigieren könnte man hier durchaus: */
///        float pointDistance = length(cameraToLightPoint);
///        intensity *= 1. / (1. + 0.05 * pointDistance * pointDistance);
        col += 0.4 * intensity * pointLightColor;

        col += step(0.99999, overlap) * intensity * pointLightColor;
        // <-- ist, nur ohne Branching:
        // if (overlap > 0.99999) {
        //     col += c.xyx;
        // }
    }

    /// !! Hier ist Tone Mapping angebracht !!
    /// Wir haben einfach irgendwelche Werte auf col addiert und liegt ziemlich sicher
    /// irgendwo in RGB > 1. -- das Gamma-pow() unten könnte uns alles weiter übersteuern.
    /// Reinhard:
    /// col = col / (col + 1.);
    /// Oder Tanh(x):
    col = tanh(col);
    /// --> die genaue Funktion ist nicht so wichtig, sie muss nur die Werte nach [0; 1] bringen
    /// cf. https://graphtoy.com/?f1(x,t)=x/(1+x)&v1=true&f2(x,t)=tanh(x)&v2=true&f3(x,t)=&v3=true&f4(x,t)=&v4=true&f5(x,t)=&v5=false&f6(x,t)=&v6=false&grid=1&coords=1.807181496351828,0.979521495144816,2.611549629481785

    /// Gamma Grading:
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
            /* !! FAST ALLES AN DIESER main() ist fürs GOL.
             *    --> für den Raymarcher wird nur hier abgebogen.
             */
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
