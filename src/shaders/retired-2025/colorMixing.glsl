#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 iResolution;
uniform float iTime;

const float pi = 3.141593;

vec3 c = vec3(1,0,-1);

vec3 hsl2rgb( in vec3 c )
{
    vec3 rgb = clamp( abs(mod(c.x*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0, 0.0, 1.0 );

    return c.z + c.y * (rgb-0.5)*(1.0-abs(2.0*c.z-1.0));
}

vec3 HueShift (in vec3 Color, in float Shift)
{
    vec3 P = vec3(0.55735)*dot(vec3(0.55735),Color);

    vec3 U = Color-P;

    vec3 V = cross(vec3(0.55735),U);

    Color = U*cos(Shift*6.2832) + V*sin(Shift*6.2832) + P;

    return vec3(Color);
}

vec3 rgb2hsl( in vec3 c ){
    float h = 0.0;
    float s = 0.0;
    float l = 0.0;
    float r = c.r;
    float g = c.g;
    float b = c.b;
    float cMin = min( r, min( g, b ) );
    float cMax = max( r, max( g, b ) );

    l = ( cMax + cMin ) / 2.0;
    if ( cMax > cMin ) {
        float cDelta = cMax - cMin;

        //s = l < .05 ? cDelta / ( cMax + cMin ) : cDelta / ( 2.0 - ( cMax + cMin ) ); Original
        s = l < .0 ? cDelta / ( cMax + cMin ) : cDelta / ( 2.0 - ( cMax + cMin ) );

        if ( r == cMax ) {
            h = ( g - b ) / cDelta;
        } else if ( g == cMax ) {
            h = 2.0 + ( b - r ) / cDelta;
        } else {
            h = 4.0 + ( r - g ) / cDelta;
        }

        if ( h < 0.0) {
            h += 6.0;
        }
        h = h / 6.0;
    }
    return vec3( h, s, l );
}

vec3 rgb2hsv(vec3 c)
{
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));

    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

const mat3 Msrgb = mat3(
    0.4124564, 0.2126729, 0.0193339,
    0.3575761, 0.7151522, 0.1191920,
    0.1804375, 0.0721750, 0.9503041
), M1 = mat3(
    0.8189330101, 0.0329845436, 0.0482003018,
    0.3618667424, 0.9293118715, 0.2643662691,
    -0.1288597137, 0.0361456387, 0.6338517070
), M2 = mat3(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660
);

// Convert rgb to xyz (sRGB) - compare http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
vec3 rgb2xyz_srgb(vec3 rgb) {
    return Msrgb * rgb;
}

// Convert xyz to rgb (sRGB) - compare http://www.brucelindbloom.com/index.html?Eqn_RGB_XYZ_Matrix.html
vec3 xyz2rgb_srgb(vec3 xyz) {
    return inverse(Msrgb) * xyz;
}

// Convert xyz to oklab - compare https://bottosson.github.io/posts/oklab/
vec3 xyz2oklab(vec3 xyz) {
    return M2 * pow(M1 * xyz, c.xxx/3.);
}

// Convert oklab to xyz - compare https://bottosson.github.io/posts/oklab/
vec3 oklab2xyz(vec3 lab) {
    return inverse(M1) * pow(inverse(M2) * lab, 3.*c.xxx);
}

// Convert oklab to oklch - compare https://bottosson.github.io/posts/oklab/
vec3 oklab2oklch(vec3 lab) {
    return vec3(lab.x, length(lab.yz), atan(lab.z, lab.y));
}

// Convert oklch to oklab - compare https://bottosson.github.io/posts/oklab/
vec3 oklch2oklab(vec3 lch) {
    return vec3(lch.x, lch.y * vec2(cos(lch.z), sin(lch.z)));
}

// Abkürzungen
vec3 rgb2oklab(vec3 rgb) {
    return xyz2oklab(rgb2xyz_srgb(rgb));
}
vec3 oklab2rgb(vec3 oklab) {
    return xyz2rgb_srgb(oklab2xyz(oklab));
}

vec3 rgb2oklch(vec3 rgb) {
    return oklab2oklch(xyz2oklab(rgb2xyz_srgb(rgb)));
}
vec3 oklch2rgb(vec3 lch) {
    return xyz2rgb_srgb(oklab2xyz(oklch2oklab(lch)));
}

const int COLOR_COUNT = 9;
vec3 gradientColors[] = vec3[](
    vec3(0.78,0.35,0.38),
    vec3(0.81,0.29,0.35),
    vec3(0.97,0.40,0.38),
    vec3(1.00,0.61,0.48),
    vec3(1.00,0.80,0.69),
    vec3(0.74,0.73,0.73),
    vec3(0.45,0.48,0.55),
    vec3(0.21,0.24,0.31),
    vec3(0.11,0.15,0.19)
);

vec3 weightedOklabLinearGradientOklab(float amount) {
    amount = fract(amount);
    // First rescale amount to match the distance in the color space.
    float colorspaceDistances[COLOR_COUNT],
    steps[COLOR_COUNT];
    float totalColorspaceDistance = 0.;
    for (int i=0; i<COLOR_COUNT; ++i) {
        vec3 c1 = (xyz2oklab(rgb2xyz_srgb(gradientColors[(i+1) % COLOR_COUNT]))),
        c2 = (xyz2oklab(rgb2xyz_srgb(gradientColors[i])));
        //colorspaceDistances[i] = abs(c1.x-c2.x) + length(c1.yz-c2.yz);
        colorspaceDistances[i] = length(c1 - c2);
        totalColorspaceDistance += colorspaceDistances[i];
    }

    // Normalize weights
    float currentStep = 0.;
    for (int i=0; i<COLOR_COUNT; ++i) {
        colorspaceDistances[i] /= totalColorspaceDistance;
        steps[i] = currentStep;
        currentStep += colorspaceDistances[i];
    }

    // Determine color mixing
    for (int i=0; i<COLOR_COUNT; ++i) {
        if (amount < steps[(i + 1) % COLOR_COUNT]) {
            return xyz2rgb_srgb(oklab2xyz((
                mix(
                    (xyz2oklab(rgb2xyz_srgb(gradientColors[i % COLOR_COUNT]))),
                    (xyz2oklab(rgb2xyz_srgb(gradientColors[(i+1) % COLOR_COUNT]))),
                    (amount-steps[i % COLOR_COUNT])/(steps[(i+1) % COLOR_COUNT] - steps[i % COLOR_COUNT])
                )
            )));
        }
    }

    return xyz2rgb_srgb(oklab2xyz((
        mix(
        (xyz2oklab(rgb2xyz_srgb(gradientColors[COLOR_COUNT - 1]))),
        (xyz2oklab(rgb2xyz_srgb(gradientColors[0]))),
        abs(amount-steps[COLOR_COUNT - 1])/abs(1.-steps[COLOR_COUNT - 1])
        )
    )));
}

#define FROM_RGB(x) x
#define TO_RGB(x) x

//#define FROM_RGB rgb2hsv
//#define TO_RGB hsv2rgb

//#define FROM_RGB rgb2hsl
//#define TO_RGB hsl2rgb

//#define FROM_RGB rgb2oklab
//#define TO_RGB oklab2rgb

//#define FROM_RGB rgb2oklch
//#define TO_RGB oklch2rgb

void main() {
    vec2 uv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;

    float insideSquare = float(abs(uv.x) <= 1.);
//    if (insideSquare < 1.) {
//        discard;
//    }

    uv = 0.5 * uv + 0.5;

    vec3 col00 = vec3(0,0,0);
    vec3 col01 = vec3(1,1,1);
    vec3 col10 = vec3(0,0,1);
    vec3 col11 = vec3(1,1,0);

    col00 = FROM_RGB(col00);
    col01 = FROM_RGB(col01);
    col10 = FROM_RGB(col10);
    col11 = FROM_RGB(col11);

    vec3 gradient = mix(
        mix(col00, col10, uv.x),
        mix(col01, col11, uv.x),
        uv.y
    );

    gradient = TO_RGB(gradient);

    gradient *= insideSquare;

    fragColor = vec4(gradient, 1.);
}
