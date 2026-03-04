#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;

// "Cube Raytracer" by Assossa: https://www.shadertoy.com/view/ldByDc
// Base raytracer: http://fhtr.blogspot.com/2013/12/opus-2-glsl-ray-tracing-tutorial.html
// Cube intersection function: https://tavianator.com/fast-branchless-raybounding-box-intersections/
// Cube normal function: http://ray-tracing-conept.blogspot.com/2015/01/ray-box-intersection-and-normal.html

float sphere(vec3 ray, vec3 dir, vec3 center, float radius) {
    vec3 rc = ray - center;
    float c = dot(rc, rc) - (radius * radius);
    float b = dot(dir, rc);
    float d = b * b - c;
    float t = -b - sqrt(abs(d));
    float st = step(0.0, min(t, d));
    return mix(-1.0, t, st);
}

float cube(vec3 ray, vec3 dir, vec3 bmin, vec3 bmax) {
    float tx1 = (bmin.x - ray.x) / dir.x;
    float tx2 = (bmax.x - ray.x) / dir.x;

    float tmin = min(tx1, tx2);
    float tmax = max(tx1, tx2);

    float ty1 = (bmin.y - ray.y) / dir.y;
    float ty2 = (bmax.y - ray.y) / dir.y;

    tmin = max(tmin, min(ty1, ty2));
    tmax = min(tmax, max(ty1, ty2));

    float tz1 = (bmin.z - ray.z) / dir.z;
    float tz2 = (bmax.z - ray.z) / dir.z;

    tmin = max(tmin, min(tz1, tz2));
    tmax = min(tmax, max(tz1, tz2));

    return tmax >= tmin ? tmin : -1.0;
}

vec3 cubeNml(vec3 i, vec3 bmin, vec3 bmax) {
    float epsilon = 0.01;

    float cx = abs(i.x - bmin.x);
    float fx = abs(i.x - bmax.x);
    float cy = abs(i.y - bmin.y);
    float fy = abs(i.y - bmax.y);
    float cz = abs(i.z - bmin.z);
    float fz = abs(i.z - bmax.z);

    if(cx < epsilon)
    return vec3(-1.0, 0.0, 0.0);
    else if (fx < epsilon)
    return vec3(1.0, 0.0, 0.0);
    else if (cy < epsilon)
    return vec3(0.0, -1.0, 0.0);
    else if (fy < epsilon)
    return vec3(0.0, 1.0, 0.0);
    else if (cz < epsilon)
    return vec3(0.0, 0.0, -1.0);
    else if (fz < epsilon)
    return vec3(0.0, 0.0, 1.0);

    return vec3(0.0, 0.0, 0.0);
}

vec3 background(float t, vec3 rd, vec3 lightSource) {
    vec3 light = normalize(lightSource);
    float sun = max(0., dot(rd, light));
    float sky = max(0.0, dot(rd, vec3(0.0, 1.0, 0.0)));
    float ground = max(0.0, -dot(rd, vec3(0.0, 1.0, 0.0)));
    return (pow(sun, 256.0) + 0.2 * pow(sun, 2.0)) * vec3(2.0, 1.6, 1.0) +
    pow(ground, 0.5) * vec3(0.4, 0.3, 0.2) +
    pow(sky, 1.0) * vec3(0.5, 0.6, 0.7);
}

void main() {
    float time = iTime;
    time = 0.; // <-- fixate time for now

    vec2 uv = (-1.0 + 2.0 * gl_FragCoord.xy / iResolution.xy) * vec2(iResolution.x / iResolution.y, 1.0);
    // vec3 ro = vec3(0.0, sin(time * 1.6478), -3.0);
    // <-- original, let's first fixate camera:
    vec3 ro = vec3(1.5, 1.25, -3.0);

    vec3 rd = normalize(vec3(uv, 1.0));

    // float change = sin(time * 1.2847) * 2.0;
    // <-- also fixate the box
    float change = 0.;
    vec3 cmin = vec3(-0.5 + change, -0.5, -0.5);
    vec3 cmax = vec3(0.5 + change, 0.5, 0.5);

    float t = cube(ro, rd, cmin, cmax);

    vec3 nml = cubeNml((rd * t) + ro, cmin, cmax);

    vec3 lightDirection = vec3(0.2 * sin(time), 0.4, 2.5 + .3 * cos(time)); // <-- moved light direction here
    vec3 bgCol = background(iTime, rd, lightDirection);
    rd = reflect(rd, nml);

    vec3 col = background(iTime, rd, lightDirection) * vec3(0.9, 0.8, 1.0);
    fragColor = vec4(mix(bgCol, col, step(0., t)), 1.0);
}
