#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;
uniform int iPass;

uniform sampler2D iTexture0;
uniform sampler2D iTexture1;
uniform sampler2D iTexture2;

#define MATERIAL_CONST 0
#define MATERIAL_BOX 1
#define MATERIAL_FLOOR 2

const float pi = 3.141593;

const int MAX_MARCHING_STEPS = 255;
const float MIN_DIST = 0.0;
const float MAX_DIST = 100.0;
const float PRECISION = 0.001;

// Rotation matrix around the X axis.
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

struct Surface {
    float sd;
    vec3 col;
    int material;
    vec2 uv;
};

void wobbleDistort(inout Surface surface, vec3 p, float amp, vec3 scale) {
    surface.sd += amp * sin(scale.x*p.x) * sin(scale.y*p.y) * sin(scale.z*p.z);
}

float checkerboard(vec2 p, float scale) {
    vec2 ip = floor(p * scale);
    return mod(ip.x + ip.y, 2.0);
}

float surfaceCheckerPattern(vec3 p, float checkerSize) {
    vec2 surface = vec2(
        atan(p.z, p.x) / (2. * 3.14159) + 0.5,
        p.y / 2. + 0.5
    );
    return checkerboard(surface, checkerSize);
}

Surface sdPatternSphere( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform, vec3 checkerCol, float nSegments) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(p / b) - 1.;
    col = mix(col, checkerCol, surfaceCheckerPattern(p, nSegments));
    return Surface(d, col, 0, vec2(0.));
}

Surface sdSphere( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(p / b) - 1.;
    return Surface(d, col, 0, vec2(0));
}

Surface sdBox( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);
    return Surface(d, col, 0, vec2(0));
}

Surface sdTexturedBox( vec3 p, vec3 b, vec3 offset, vec3 col, mat3 transform) {
    p = (p - offset) * transform;
    vec3 q = abs(p) - b;
    float d = length(max(q,0.0)) + min(max(q.x,max(q.y,q.z)),0.0);

    vec3 a = 0.5 * p / b;

    col = vec3(
        0.5 + a.z,
        0.5 + a.x,
        0.5 - a.z // B mirrors R because we want bright colors for clarity
    );
    // col = mix(vec3(1,0,0), vec3(1,1,0), 0.5 * (1. + p.x / b.x));

    vec2 uv;
    if (abs(a.z) > 0.5) {
        uv = vec2(0.5 + a.x * sign(a.z), 0.5 - a.y);
        // col.b = sign(a.z);
    } else if (abs(a.y) > 0.5) {
        // oben
        // uv = 0.5 + a.xz;
        uv = vec2(0.5 + a.x * sign(a.y), 0.5 + a.z);
    } else if (abs(a.x) > 0.5) {
        uv = vec2(0.5 - a.z * sign(a.x), 0.5 - a.y);
    }

//
//    uv = mix(
//        mix(
//            vec2(0.5 + a.x * sign(a.z), 0.5 - a.y),
//            vec2(0.5 + a.x * sign(a.y), 0.5 + a.z),
//            step(0.5, abs(a.y))
//        ),
//        vec2(0.5 - a.z * sign(a.x), 0.5 - a.y),
//        step(0.5, abs(a.x))
//    );

    // check execution time (query?)
    // check memory usage - texture and uniforms

    return Surface(d, col, MATERIAL_BOX, uv);
}

float floorLevel = -3.;

Surface sdFloor(vec3 p) {
    float d = p.y - floorLevel;
    vec3 floorColor = (0.5 + 0.15 * mod(floor(p.x) + floor(p.z), 4.0)) * vec3(0.9, 1., .95);
    vec2 floorUv = fract(0.25 * p.xz);
    // floorColor = texture(iTexture2, floorUv).rgb;
    return Surface(d, floorColor, MATERIAL_FLOOR, floorUv);
}

Surface takeCloser(Surface obj1, Surface obj2) {
    if (obj2.sd < obj1.sd) {
        return obj2;
    }
    return obj1;
}

Surface sdScene(vec3 p) {
    Surface obj;
    Surface co = sdFloor(p);

    obj = sdTexturedBox(p, vec3(0.9), vec3(1.5, floorLevel + 1.2, -1.5), vec3(0.3, 0.65, 0.9), rotateX(-0.2 * pi + iTime));
    co = takeCloser(co, obj);

    // 0.5 pi = 90°
    obj = sdTexturedBox(p, vec3(0.9), vec3(-1.5, floorLevel + 1.2, -1.5), vec3(0.3, 0.65, 0.9), rotateY(+0.3 * pi + iTime));
    co = takeCloser(co, obj);

    obj = sdPatternSphere(p, vec3(1.), vec3(-2., floorLevel + 1., -2.), vec3(1, 0.1, 0.8), identity(), vec3(0.5, 0.2, 0.8), 8.);

    mat3 ballTransform = rotateY(0.5 * iTime);
    obj = sdSphere(p, vec3(1.), vec3(-2., floorLevel + 1., -2.), vec3(1, 0.6, 0.8), ballTransform);
    co = takeCloser(co, obj);

    if (co.material == MATERIAL_BOX) {
        co.col *= texture(iTexture0, co.uv).rgb;
    }
    else if (co.material == MATERIAL_FLOOR) {
        co.col *= texture(iTexture2, co.uv).rgb;
    }

    return co;
}

Surface rayMarch(vec3 ro, vec3 rd, float start, float end) {
    float rayLength = start;
    Surface co;

    for (int i = 0; i < MAX_MARCHING_STEPS; i++) {
        co = sdScene(ro + rayLength * rd);
        rayLength += co.sd;

        if (co.sd < PRECISION || rayLength > end) {
            break;
        }
    }

    co.sd = rayLength;
    return co;
}

float rayMarchShadow( in vec3 ro, in vec3 rd)
{
    float tMin = 0.05;
    float tMax = 2.;
    float w = 0.1;

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

void main() {
    vec2 uv = (-1.0 + 2.0 * gl_FragCoord.xy / iResolution.xy) * vec2(iResolution.x / iResolution.y, 1.0);

    vec2 st = fract(uv);
    vec4 backgroundColor = texture(iTexture1, st);
    vec4 col = vec4(0.);
    float d;

    vec3 ro = vec3(0., 0., 1.);
    vec3 rd = normalize(vec3(uv, -1.));
    rd *= rotateX(-0.2 * pi);
    // rd *= rotateY(0.02 * sin(3. * iTime));

    Surface co = rayMarch(ro, rd, MIN_DIST, MAX_DIST);

    if (co.sd < MAX_DIST) {
        vec3 p = ro + rd * co.sd;
        vec3 normal = calcNormal(p);
        vec3 lightPosition = vec3(4., 7., 2.);
        vec3 lightDirection = normalize(lightPosition - p);

        // Erinnerung: _irgendwie_ muss Abstand "d" zu einer Farbe werden.
        // wie, sind quasi nur noch die Details :)
        // d = co.sd;
        d = clamp(co.sd, 0., 1.);

        // could also have parallel light
        // lightDirection = normalize(vec3(0., 1., 0.));

        // Lambertian reflection:
        // proportional to amount of light hitting the surface
        // i.e. dot(normal, lightDir) ~ large if Angle between normal and light is low
        // Quasi "perfekte" Diffusion, warum?
        float diffuse = dot(normal, lightDirection);
        diffuse = clamp(diffuse, 0., 1.);
        d = mix(d, diffuse, 1.);

        // sekundäres Ray Marching für Schatten
        //        float shadow = rayMarchShadow(p, lightDirection);
        //        d = mix(d, shadow, 0.);

        // Specular reflection:
        // proportional to angle between ray and reflections
        //        vec3 refl = reflect(lightDirection, normal);
        //        float specular = dot(refl, normalize(p));
        //        specular = clamp(specular, 0., 1.);
        //        specular = pow(specular, 3.);
        //        d = mix(d, specular, 0.);

        // verschiedenartiges Color Grading
        col.xyz = pow(co.sd, 0.1) * co.col;

        //        dif = mix(dif, co.sd, 0.03);
        //        dif = mix(dif, dif * co.sd, 0.24);
        //        float clamped_dif = clamp(dif, 0., 1.);
        //        float graded_dif = atan(dif);
        //        dif = mix(clamped_dif, graded_dif, 1.);
        //        dif = pow(dif, 2.);

        // Distance Fog: Abschwächen je nach durchlaufenem Abstand
        float fog = exp(-0.00001 * pow(co.sd, 4.));
        col.xyz *= fog;
        col.a = step(0.1, fog);
        // col.a = exp(-0.0001 * pow(co.sd, 3.));
        // col.a = 1. - clamp(pow(length(col.xyz), 50.), 0., 1.);
    }

    // Beispiel Post-Processing (transformiert nur noch Farbe -> Farbe, nicht mehr Geometrie)
    // col = atan(8. * pow(col, vec3(5.)));

    fragColor = mix(backgroundColor, vec4(col.xyz, 1.), col.a);
    //fragColor = mix(backgroundColor, col, col.a);

    // quick check: so sähe das direkt gemappt aus.
    // Man achte auf die Werte der Koordinaten und die Texturparameter.
    // (v.A. bei einer Textur, die keinen schwarzen Rand hat.)
    // fragColor = texture(iTexture, uv);
}
