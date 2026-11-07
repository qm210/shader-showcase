#version 300 es
precision highp float;

// =====================================================================
//  HAUSFASSADE  —  stylized house front with morphing wall structures
//
//  Built on the dream210 toolkit: hash22 / modulatedPerlin2D / noiseStack
//  (morphing fBm), the marble "noiseAbsoluteStackWithFurtherProcessing",
//  cmap_dream210, colorPalette, sdRect, hsv helpers.
//
//  Layout (all in window widths W, window height H = 2 W because the
//  2x4 pane grid consists of squares):
//    - 8 windows per row, horizontal gap between windows = W
//    - 3 rows: gap bottom->middle = H/2, gap middle->top = H/3
//    - each window: 2 x 4 square panes with mullions, frame and sill
//
//  The morphing structures (fBm + marble stripes) live only on the wall.
//  They are kept out of the windows by (a) a hard SDF mask and (b) a
//  smooth domain warp that pushes the noise away from each window, while
//  the marble stripes follow a stream function whose streamlines wrap
//  around the openings (and around the flying event shapes, if wanted).
//
//  EVENTS: four simple geometries (circle, square, triangle, hexagon)
//  fly across the facade at configurable times; after iGlowStart they
//  turn into cyber / neon / radioactive glowing objects.
//
//  Inputs: iResolution, iTime + the uniform blocks below. Default values
//  are given in the comments and in hausfassade.uniforms.json. uv is
//  derived from gl_FragCoord so the shader also runs outside the dream210
//  multi-pass framework; inside it, use the framework's centred uv
//  (y in [-1,1]) instead of the gl_FragCoord line in main().
//
//  Debugging: compile with  #define DEBUG_VIEW n  (1 = fBm only,
//  2 = marble stripes only, 3 = warp field, 4 = window SDF contours,
//  5 = event layer only).
// =====================================================================

out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;

// ------------------------------------------------ PATTERN UNIFORMS ----
// fBm ("clouds") part                                    — cf. noiseStack()
uniform float iNoiseScaleA;            // 1.0    base frequency of the fBm
uniform float iNoiseMorphingA;         // 0.35   gradient rotation speed = morphing
uniform int   iFractionalOctaves;      // 5      1..8
uniform float iFractionalScale;        // 2.1    lacunarity
uniform float iFractionalDecay;        // 0.55   gain
// marble part                 — cf. noiseAbsoluteStackWithFurtherProcessing()
uniform float iNoiseScaleC;            // 0.7
uniform float iNoiseMorphingC;         // 0.22
uniform float iMarbleGranularity;      // 5.0    how much the perlin wobbles the stripes
uniform vec2  iMarbleSqueeze;          // (6.5, 4.5)  stripe direction & density
uniform float iMarbleGradingExponent;  // 1.6    stripe sharpness
uniform float iMarbleRange;            // 0.9    stripe contrast
uniform float iMarbleDrift;            // 0.25   stripes travel speed
// mixing / colour                                        — cf. noiseBase()
uniform float iOverallScale;           // 2.2    zoom of the whole structure
uniform vec2  iOverallNoiseShift;      // (3.1, 7.4)
uniform vec2  iWallDrift;              // (0.0, 0.0)  slow scroll of the structure (uv/s)
uniform float iNoiseLevelA;            // 1.0    weight fBm
uniform float iNoiseLevelC;            // 0.15   weight marble
uniform float iNoiseLevelAC;           // 0.30   weight fBm*marble
uniform float iColorStrength;          // 1.0    0 = greyscale, 1 = full palette
uniform float iColorContrast;          // 1.6    spread of the noise over the palette
uniform float iColorOffset;            // 0.0    shifts the palette lookup
uniform float iColorCycle;             // 0.0    palette lookup drifts with time (1/s)
uniform float iPaletteMix;             // 0.0    0 = cmap_dream210, 1 = cosine palette
uniform vec3  iColorCosineFreq;        // (1, 1, 1) * 2*pi  cosine palette frequency
uniform vec3  iColorCosinePhase;       // (0, 0.33, 0.67) * 2*pi
uniform float iStructureOpacity;       // 1.0    0 = plain plaster wall
// flow around the openings
uniform float iFlowPush;               // 0.15   domain warp strength (in W); keep < 0.5*iFlowRadius
uniform float iFlowRadius;             // 0.8    reach of the warp (in window half sizes)
uniform float iWrapRadius;             // 0.6    reach of the stripe bending (in W)
uniform float iWallAO;                 // 0.35   darkening next to the openings
uniform float iWallAORadius;           // 0.18   (in W)
// windows
uniform float iLitFraction;            // 0.35   share of warmly lit windows
uniform float iLightSwitchRate;        // 0.08   light state changes per second
uniform float iLightSpill;             // 0.22   glow of lit windows onto the wall
uniform float iGlassReflect;           // 0.10   moving reflection streak on the glass
// post
uniform float iVignetteStrength;       // 0.25
uniform float iGamma;                  // 1.0

// ------------------------------------------------ EVENT UNIFORMS ------
// four flyers: .x = circle, .y = square, .z = triangle, .w = hexagon
uniform vec4  iEventStart;             // (4, 12, 20, 28)   start time of each flight (s); < 0 disables
uniform vec4  iEventPathY;             // (0.55, -0.1, 0.3, -0.6)  flight height (uv, -1..1)
uniform vec4  iEventDirection;         // (1, -1, 1, -1)    +1 = left->right, -1 = right->left
uniform float iEventDuration;          // 8.0    seconds for one crossing
uniform float iEventRepeat;            // 40.0   period of the whole show (0 = play once)
uniform float iEventSize;              // 0.9    shape radius in W
uniform vec2  iEventWobble;            // (0.15, 0.25)  vertical wobble amplitude (uv) and frequency (Hz)
uniform float iEventSpin;              // 0.6    rotation speed (rad/s)
uniform vec3  iEventColor;             // (0.08, 0.07, 0.10)  body colour before the glow
uniform float iEventOpacity;           // 1.0
uniform float iEventOutline;           // 0.0    0 = filled, > 0 = ring thickness in W
uniform float iEventWarp;              // 1.0    shapes act as obstacles for the wall structure
uniform float iEventOverWindows;       // 1.0    1 = fly in front of the windows, 0 = behind
uniform float iGlowStart;              // 24.0   time at which the glow begins (s)
uniform float iGlowRamp;               // 6.0    seconds to fade the glow in
uniform vec3  iGlowColor;              // (0.2, 1.0, 0.3)  neon / radioactive colour
uniform float iGlowIntensity;          // 1.1
uniform float iGlowRadius;             // 0.6    halo reach in W
uniform float iGlowFlicker;            // 0.5    radioactive crackle 0..1
uniform float iGlowHueCycle;           // 0.08   hue rotation of the glow (cycles/s)

const vec4  c      = vec4(1, 0, -1, 0.5);
const float pi     = 3.141593;
const float twoPi  = 2. * pi;

// ------------------------------------------------ fixed layout --------
const float N_COLS        = 8.;
const float N_ROWS        = 3.;
const float PANES_X       = 2.;
const float PANES_Y       = 4.;
const float GAP_BOTTOM_MID = 0.5;      // in window heights
const float GAP_MID_TOP    = 1. / 3.;  // in window heights
const float MARGIN_X      = 1.0;       // wall left/right of the block, in W
const float MARGIN_Y      = 0.75;      // wall above/below the block, in W
const float BLOCK_SHIFT_Y = 0.12;      // shift the window block up, in W
const float FRAME_W       = 0.07;      // window frame width, in W
const float MULLION_W     = 0.035;     // pane grid bar width, in W
const float SILL_H        = 0.09;      // window sill height, in W
const float SILL_OVERHANG = 0.10;      // sill overhang per side, in W
const float PLINTH_H      = 0.55;      // plinth band height, in W
const float CORNICE_H     = 0.35;      // cornice band height, in W
const float WRAP_SMOOTH   = 0.25;      // smooth-min blending of the window SDFs (in W)

const vec3 COL_PLASTER  = vec3(0.86, 0.80, 0.70);
const vec3 COL_FRAME    = vec3(0.93, 0.91, 0.86);
const vec3 COL_MULLION  = vec3(0.90, 0.88, 0.84);
const vec3 COL_SILL     = vec3(0.78, 0.74, 0.68);
const vec3 COL_PLINTH   = vec3(0.30, 0.30, 0.34);
const vec3 COL_CORNICE  = vec3(0.26, 0.24, 0.26);
const vec3 COL_GLASS_LO = vec3(0.06, 0.09, 0.17);
const vec3 COL_GLASS_HI = vec3(0.22, 0.34, 0.48);
const vec3 COL_LIT_LO   = vec3(0.95, 0.55, 0.20);
const vec3 COL_LIT_HI   = vec3(1.00, 0.85, 0.50);

// ------------------------------------------------ dream210 toolkit ----

vec3 cmap_dream210(float t) {
    return vec3(0.19, 0.24, 0.40)
    +t*(vec3(3.42, -1.41, 4.13)
    +t*(vec3(-21.95, 22.09, -7.62)
    +t*(vec3(66.28, -51.41, -6.87)
    +t*(vec3(-80.01, 41.55, 23.40)
    +t*(vec3(33.21, -11.33, -11.18)
    +t*(vec3(-0.94, 0.52, -1.86)
    ))))));
}

vec3 colorPalette(float t) {
    return vec3(0.5) + 0.5 * cos(iColorCosineFreq * t + iColorCosinePhase);
}

vec3 hsv2rgb(vec3 hsvColor) {
    hsvColor.x /= 360.;
    const vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(hsvColor.xxx + K.xyz) * 6.0 - K.www);
    return hsvColor.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), hsvColor.y);
}
vec3 rgb2hsv(vec3 col) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(col.bg, K.wz), vec4(col.gb, K.xy), step(col.b, col.g));
    vec4 q = mix(vec4(p.xyw, col.r), vec4(col.r, p.yzx), step(p.x, col.r));
    float d = q.x - min(q.w, q.y);
    float e = 1e-10;
    return vec3(abs(q.z + (q.w - q.y)/(6.0*d + e)) * 360., d/(q.x + e), q.x);
}

float hash12(vec2 p) {
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
    p = p*mat2(127.1,311.7,269.5,183.3);
    return -1.0 + 2.0 * fract(sin(p)*43758.5453123);
}

vec2 modulatedHash22(vec2 p, float phase) {
    return sin(twoPi * hash22(p) + phase);
}

// Perlin noise whose gradient vectors rotate with "phase" -> morphing structures
float modulatedPerlin2D(vec2 p, float phase) {
    vec2 pi_ = floor(p);
    vec2 pf = p - pi_;
    vec2 w = pf * pf * (3.-2.*pf);

    float f00 = dot(modulatedHash22(pi_+vec2(.0,.0), phase),pf-vec2(.0,.0));
    float f01 = dot(modulatedHash22(pi_+vec2(.0,1.), phase),pf-vec2(.0,1.));
    float f10 = dot(modulatedHash22(pi_+vec2(1.0,0.), phase),pf-vec2(1.0,0.));
    float f11 = dot(modulatedHash22(pi_+vec2(1.0,1.), phase),pf-vec2(1.0,1.));

    float xm1 = mix(f00,f10,w.x);
    float xm2 = mix(f01,f11,w.x);
    return mix(xm1,xm2,w.y);
}

// == noiseStack() from dream210
float noiseStack(vec2 p) {
    float a = 1., s = 0., noise;
    float sum = 0.;
    for (int i = 0; i < iFractionalOctaves; i++) {
        noise = modulatedPerlin2D(iNoiseScaleA * p, iNoiseMorphingA * iTime);
        sum += a * noise;
        s += a;
        p *= iFractionalScale;
        a *= iFractionalDecay;
    }
    return 0.5 + 0.5 * (sum / max(s, 1e-4) * 1.5);
}

// == noiseAbsoluteStackWithFurtherProcessing() from dream210, but the
//    linear stripe term (p.x*squeeze.x + p.y*squeeze.y) is passed in from
//    outside so that it can be bent around the openings.
float marbleNoise(vec2 p, float stripePhase) {
    p *= iNoiseScaleC;
    float s = modulatedPerlin2D(p, iNoiseMorphingC * iTime);
    s = sin(s * iMarbleGranularity + stripePhase);
    s = pow(0.5 + 0.5 * s, iMarbleGradingExponent);
    return 1. + iMarbleRange * (s - 1.24);
}

// ------------------------------------------------ SDFs ----------------

float sdRect(in vec2 p, in vec2 size) {
    vec2 q = abs(p)-size;
    return length(max(q,0.0)) + min(max(q.x,q.y),0.0);
}

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdEquilateralTriangle(vec2 p, float r) {
    const float k = sqrt(3.0);
    p.x = abs(p.x) - r;
    p.y = p.y + r / k;
    if (p.x + k*p.y > 0.0) p = vec2(p.x - k*p.y, -k*p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0*r, 0.0);
    return -length(p) * sign(p.y);
}

float sdHexagon(vec2 p, float r) {
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z*r, k.z*r), r);
    return length(p) * sign(p.y);
}

// polynomial smooth min (iq)
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5*(b-a)/k, 0., 1.);
    return mix(b, a, h) - k*h*(1.-h);
}

mat2 rot(float a) {
    float s = sin(a), co = cos(a);
    return mat2(co, s, -s, co);
}

// ------------------------------------------------ facade geometry -----

struct Facade {
    float W, H;          // window width / height (uv units)
    vec2  halfSize;      // (W/2, H/2)
    float rowY[3];       // row centre y
    float blockBottom, blockTop;
};

Facade makeFacade(float asp) {
    Facade f;
    float hInW = PANES_Y / PANES_X;                              // H = 2 W
    float blockWInW = 2. * N_COLS - 1. + 2. * MARGIN_X;          // 17 W
    float blockHInW = hInW * (N_ROWS + GAP_BOTTOM_MID + GAP_MID_TOP) + 2. * MARGIN_Y;
    f.W = min(2. * asp / blockWInW, 2. / blockHInW);
    f.H = hInW * f.W;
    f.halfSize = 0.5 * vec2(f.W, f.H);
    float blockH = f.H * (N_ROWS + GAP_BOTTOM_MID + GAP_MID_TOP);
    f.blockBottom = -0.5 * blockH + BLOCK_SHIFT_Y * f.W;
    f.rowY[0] = f.blockBottom + 0.5 * f.H;
    f.rowY[1] = f.rowY[0] + f.H * (1. + GAP_BOTTOM_MID);
    f.rowY[2] = f.rowY[1] + f.H * (1. + GAP_MID_TOP);
    f.blockTop = f.rowY[2] + 0.5 * f.H;
    return f;
}

float colCenterX(Facade f, float j) {
    return (2. * j - (N_COLS - 1.)) * f.W;
}

// nearest window: exact SDF (positive outside), local coords and (col,row) index
float sdNearestWindow(Facade f, vec2 p, out vec2 local, out vec2 idx) {
    float j = clamp(floor(p.x / (2. * f.W) + 0.5 * N_COLS), 0., N_COLS - 1.);
    float dx = p.x - colCenterX(f, j);
    float dy = p.y - f.rowY[0];
    float row = 0.;
    for (int r = 1; r < 3; r++) {
        float dyr = p.y - f.rowY[r];
        if (abs(dyr) < abs(dy)) { dy = dyr; row = float(r); }
    }
    local = vec2(dx, dy);
    idx = vec2(j, row);
    return sdRect(local, f.halfSize);
}

// ------------------------------------------------ events (flyers) -----

struct Flyer {
    float isOn;      // 0/1
    vec2  center;    // uv
    float radius;    // uv
    float angle;     // rotation
    float d;         // SDF at the current pixel (set by evalFlyers)
};
Flyer flyers[4];
float gW;   // window width in uv (set in main)

float glowAmount() {
    return smoothstep(iGlowStart, iGlowStart + max(iGlowRamp, 1e-3), iTime);
}

void setupFlyers(Facade f, float asp) {
    for (int i = 0; i < 4; i++) {
        Flyer fl;
        float start = iEventStart[i];
        float tl = iTime - start;
        if (iEventRepeat > 0. && tl > 0.) tl = mod(tl, iEventRepeat);
        fl.isOn = (start >= 0. && tl >= 0. && tl <= iEventDuration) ? 1. : 0.;
        float progress = clamp(tl / max(iEventDuration, 1e-3), 0., 1.);
        fl.radius = iEventSize * f.W;
        float span = asp + 1.5 * fl.radius;
        float dir = iEventDirection[i] < 0. ? -1. : 1.;
        fl.center = vec2(
        dir * mix(-span, span, progress),
        iEventPathY[i] + iEventWobble.x * sin(twoPi * iEventWobble.y * tl + float(i))
        );
        fl.angle = iEventSpin * tl;
        fl.d = 1e3;
        flyers[i] = fl;
    }
}

float sdFlyer(int i, vec2 p) {
    Flyer fl = flyers[i];
    vec2 q = rot(fl.angle) * (p - fl.center);
    float d;
    if (i == 0)      d = sdCircle(q, fl.radius);
    else if (i == 1) d = sdRect(q, vec2(fl.radius * 0.85));
    else if (i == 2) d = sdEquilateralTriangle(q, fl.radius);
    else             d = sdHexagon(q, fl.radius * 0.95);
    if (iEventOutline > 0.) {
        float t = 0.5 * iEventOutline * gW;   // ring: keep the outer edge, hollow out the inside
        d = abs(d + t) - t;
    }
    return d;
}

void evalFlyers(vec2 p) {
    for (int i = 0; i < 4; i++) {
        flyers[i].d = flyers[i].isOn > 0.5 ? sdFlyer(i, p) : 1e3;
    }
}

// ------------------------------------------------ obstacle field ------
// Evaluated over all windows (and active flyers) so that the contributions
// blend smoothly between neighbouring obstacles (no seams):
//   dSmooth : smooth-min union SDF of the obstacles
//   push    : domain-warp vector pushing noise samples away from the
//             obstacles (elliptical kernels -> perfectly smooth)
//   streamK / streamKL : weights for the stream function of the marble
//             stripes; every obstacle boundary becomes a streamline that
//             carries the stripe phase of the obstacle centre
void addObstacle(vec2 q, vec2 halfSize, float d, vec2 centre, float weight,
float kSmooth, float flowR, float wrapR,
inout float dSmooth, inout vec2 push, inout float streamK, inout float streamKL) {
    dSmooth = smin(dSmooth, weight > 0. ? d : 1e3, kSmooth);
    vec2 e = q / halfSize;
    float eLen = max(length(e), 1e-4);
    vec2 g = normalize(q / (halfSize * halfSize) + 1e-6);
    push += weight * g * exp(-max(eLen - 1., 0.) / flowR);
    float k = weight * exp(-max(d, 0.) / wrapR);
    streamK += k;
    streamKL += k * dot(centre * iOverallScale + iOverallNoiseShift, iMarbleSqueeze);
}

void obstacleField(Facade f, vec2 p, out float dSmooth, out vec2 push, out float streamK, out float streamKL) {
    dSmooth = 1e3;
    push = vec2(0.);
    streamK = 0.;
    streamKL = 0.;
    float kSmooth = WRAP_SMOOTH * f.W;
    float flowR = max(iFlowRadius, 1e-3);
    float wrapR = max(iWrapRadius, 1e-3) * f.W;
    for (int r = 0; r < 3; r++) {
        for (int jj = 0; jj < int(N_COLS); jj++) {
            vec2 centre = vec2(colCenterX(f, float(jj)), f.rowY[r]);
            vec2 q = p - centre;
            addObstacle(q, f.halfSize, sdRect(q, f.halfSize), centre, 1.,
            kSmooth, flowR, wrapR, dSmooth, push, streamK, streamKL);
        }
    }
    if (iEventWarp > 0.) {
        for (int i = 0; i < 4; i++) {
            if (flyers[i].isOn < 0.5) continue;
            vec2 q = p - flyers[i].center;
            addObstacle(q, vec2(flyers[i].radius), flyers[i].d, flyers[i].center, iEventWarp,
            kSmooth, flowR, wrapR, dSmooth, push, streamK, streamKL);
        }
    }
    push *= iFlowPush * f.W;
}

// ------------------------------------------------ wall ----------------

vec3 palette(float t) {
    return mix(cmap_dream210(t), colorPalette(t), iPaletteMix);
}

vec3 wallColor(Facade f, vec2 uv, float dSmooth, vec2 push, float streamK, float streamKL) {
    // domain warp: sample the structure from positions pushed away from
    // the obstacles -> features are compressed around the openings
    vec2 p = (uv + push + iWallDrift * iTime) * iOverallScale + iOverallNoiseShift;

    // marble stripes follow a stream function: linear far away from the
    // obstacles, constant along each obstacle boundary (= a streamline)
    float stripeLinear = dot(p, iMarbleSqueeze);
    float stripe = (stripeLinear + streamKL) / (1. + streamK) - iMarbleDrift * iTime;

    float noiseClouds = noiseStack(p);
    float noiseMarble = marbleNoise(p, stripe);
    float total = iNoiseLevelA * noiseClouds
    + iNoiseLevelAC * (noiseClouds * noiseMarble)
    + iNoiseLevelC * noiseMarble;
    float t = 0.5 + iColorContrast * (total - 0.5) + iColorOffset + iColorCycle * iTime;
    t = iColorCycle != 0. ? fract(t) : clamp(t, 0., 1.);
    vec3 structure = mix(vec3(t), palette(t * iColorStrength), iColorStrength);

    vec3 col = mix(COL_PLASTER * (0.8 + 0.4 * total), structure, iStructureOpacity);
    // darkening next to the openings
    col *= 1. - iWallAO * exp(-max(dSmooth, 0.) / (max(iWallAORadius, 1e-3) * f.W));
    return col;
}

// ------------------------------------------------ windows -------------

float litState(vec2 idx, float t) {
    // slowly switching lights, quickly faded between states
    float seed = hash12(idx * 7.13 + 0.37);
    float tt = t * iLightSwitchRate + seed * 10.;
    float k = floor(tt);
    float s0 = step(1. - iLitFraction, hash12(idx + k * vec2(13.1, 7.7)));
    float s1 = step(1. - iLitFraction, hash12(idx + (k + 1.) * vec2(13.1, 7.7)));
    return mix(s0, s1, smoothstep(0.94, 1.0, fract(tt)));
}

vec3 glassColor(Facade f, vec2 local, vec2 idx, vec2 pane) {
    vec2 n = local / f.halfSize;  // -1..1 inside the window
    vec3 dark = mix(COL_GLASS_LO, COL_GLASS_HI, smoothstep(-1., 1., n.y * 0.8 + 0.3 * n.x));
    // soft moving reflection streak
    float refl = 0.6 * n.x - 0.8 * n.y + 0.25 * sin(0.3 * iTime + idx.x * 1.7 + idx.y * 2.3);
    dark += iGlassReflect * exp(-6. * refl * refl);
    // slight per-pane variation (old glass)
    dark *= 0.9 + 0.2 * hash12(idx * 3.1 + pane * 0.71 + 0.11);

    vec3 lit = mix(COL_LIT_LO, COL_LIT_HI, smoothstep(-1.2, 1.0, n.y + 0.4 * sin(1.3 * n.x)));
    lit *= 0.9 + 0.1 * sin(2.0 * iTime + idx.x * 2.1 + idx.y * 0.9); // faint flicker
    return mix(dark, lit, litState(idx, iTime));
}

// ------------------------------------------------ event layer ---------

vec3 glowColorNow() {
    vec3 hsv = rgb2hsv(iGlowColor);
    hsv.x = mod(hsv.x + 360. * iGlowHueCycle * iTime, 360.);
    return hsv2rgb(hsv);
}

// returns body colour + alpha, adds neon halo to glow
vec4 flyerLayer(Facade f, float aa, out vec3 glow) {
    glow = vec3(0.);
    vec4 layer = vec4(0.);
    float g = glowAmount();
    vec3 neon = glowColorNow();
    for (int i = 0; i < 4; i++) {
        if (flyers[i].isOn < 0.5) continue;
        float d = flyers[i].d;
        // radioactive crackle: fast random flicker + slow pulse, per flyer
        float crackle = hash12(vec2(floor(iTime * 24.), float(i) * 3.7));
        float pulse = 0.5 + 0.5 * sin(twoPi * 0.7 * iTime + float(i) * 1.9);
        float flick = 1. + iGlowFlicker * (0.6 * (crackle - 0.5) + 0.4 * (pulse - 0.5)) * 2.;
        float gi = g * iGlowIntensity * flick;

        // body: dark object before the glow, electric interior afterwards
        float inside = 1. - smoothstep(-aa, aa, d);
        float rim = exp(-abs(d) / (0.03 * f.W));
        vec3 body = iEventColor;
        vec3 core = mix(neon * 0.35, neon, 0.5 + 0.5 * sin(8. * d / f.W - 3. * iTime));
        body = mix(body, core, g * 0.75);
        body += neon * rim * gi * 1.5;
        layer.rgb = mix(layer.rgb, body, inside * iEventOpacity);
        layer.a = max(layer.a, inside * iEventOpacity);

        // neon halo outside the shape
        float halo = exp(-max(d, 0.) / (max(iGlowRadius, 1e-3) * f.W));
        glow += neon * gi * (0.6 * halo + 0.4 * halo * halo);
    }
    return layer;
}

// ------------------------------------------------ main ----------------

void main() {
    float asp = iResolution.x / iResolution.y;
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y; // y in [-1,1]
    float aa = 1.5 / iResolution.y;

    Facade f = makeFacade(asp);
    gW = f.W;
    setupFlyers(f, asp);
    evalFlyers(uv);

    vec2 local, idx;
    float d = sdNearestWindow(f, uv, local, idx);
    float dSmooth, streamK, streamKL; vec2 push;
    obstacleField(f, uv, dSmooth, push, streamK, streamKL);

    // --- wall with morphing structure flowing around the obstacles
    vec3 col = wallColor(f, uv, dSmooth, push, streamK, streamKL);

    vec3 glow;
    vec4 flyerCol = flyerLayer(f, aa, glow);

    #ifdef DEBUG_VIEW
    {
        vec2 p = (uv + push + iWallDrift * iTime) * iOverallScale + iOverallNoiseShift;
        float stripe = (dot(p, iMarbleSqueeze) + streamKL) / (1. + streamK) - iMarbleDrift * iTime;
        if (DEBUG_VIEW == 1) col = vec3(noiseStack(p));
        if (DEBUG_VIEW == 2) col = vec3(marbleNoise(p, stripe));
        if (DEBUG_VIEW == 3) col = vec3(length(push) / f.W, 0.5 + 0.5 * push / f.W);
        if (DEBUG_VIEW == 4) col = vec3(fract(dSmooth / f.W * 4.));
        if (DEBUG_VIEW == 5) col = flyerCol.rgb * flyerCol.a + glow;
        fragColor = vec4(col, 1.); return;
    }
    #endif

    // --- plinth and cornice bands
    float plinthTop     = min(-1. + PLINTH_H * f.W,  f.blockBottom - 0.35 * f.W);
    float corniceBottom = max(1. - CORNICE_H * f.W,  f.blockTop + 0.25 * f.W);
    float stone = 0.95 + 0.35 * modulatedPerlin2D(uv * 28., 0.) + 0.15 * modulatedPerlin2D(uv * 90., 0.);
    vec3 plinth = COL_PLINTH * stone * (0.85 + 0.3 * smoothstep(-1., plinthTop, uv.y));
    plinth = mix(plinth, COL_PLINTH * 1.6, 1. - smoothstep(0., 0.012, abs(uv.y - plinthTop + 0.012)));
    col = mix(col, plinth, 1. - smoothstep(plinthTop - aa, plinthTop + aa, uv.y));
    vec3 cornice = COL_CORNICE * stone;
    cornice = mix(cornice, COL_CORNICE * 1.7, 1. - smoothstep(0., 0.012, abs(uv.y - corniceBottom - 0.012)));
    col = mix(col, cornice, smoothstep(corniceBottom - aa, corniceBottom + aa, uv.y));

    // --- flyers behind the windows
    col = mix(col, flyerCol.rgb, flyerCol.a * (1. - iEventOverWindows));

    // --- warm light spill of lit windows onto the wall
    col += iLightSpill * litState(idx, iTime) * COL_LIT_LO * exp(-max(d, 0.) / (0.3 * f.W));

    // --- window sill (ledge below each window)
    vec2 sillCenter = vec2(0., -f.halfSize.y - 0.5 * SILL_H * f.W);
    vec2 sillHalf = vec2(f.halfSize.x + (FRAME_W + SILL_OVERHANG) * f.W, 0.5 * SILL_H * f.W);
    float dSill = sdRect(local - sillCenter, sillHalf);
    vec3 sill = COL_SILL * (1. - 0.35 * smoothstep(0.5, -1., (local.y - sillCenter.y) / sillHalf.y));
    col = mix(col, sill, 1. - smoothstep(-aa, aa, dSill));
    // shadow under the sill
    col *= 1. - 0.25 * (1. - smoothstep(0., 0.04, dSill)) * smoothstep(0., -aa, dSill) * step(local.y, sillCenter.y);

    // --- window frame
    float frameW = FRAME_W * f.W;
    float dFrame = d - frameW;   // < 0 inside frame band or window
    vec3 frame = COL_FRAME * (1. - 0.3 * smoothstep(frameW, 0., d));   // inner bevel shade
    col = mix(col, frame, 1. - smoothstep(-aa, aa, dFrame));

    // --- glass + pane grid (2 x 4 squares)
    vec2 paneSize = vec2(f.W / PANES_X, f.H / PANES_Y);
    vec2 q = (local + f.halfSize) / paneSize;          // 0..PANES
    vec2 pane = floor(clamp(q, vec2(0.), vec2(PANES_X, PANES_Y) - 1.));
    vec2 cf = fract(q);
    vec2 distLine = min(cf, 1. - cf) * paneSize;         // distance to nearest grid line
    float dl = min(distLine.x, distLine.y);
    float mullionW = 0.5 * MULLION_W * f.W;

    vec3 glass = glassColor(f, local, idx, pane);
    // inner shadow of the glass towards the bars
    glass *= 0.75 + 0.25 * smoothstep(mullionW, mullionW + 0.08 * f.W, dl);
    vec3 inside = mix(glass, COL_MULLION, 1. - smoothstep(mullionW - aa, mullionW + aa, dl));
    col = mix(col, inside, 1. - smoothstep(-aa, aa, d));

    // --- flyers in front of the windows + neon halo over everything
    col = mix(col, flyerCol.rgb, flyerCol.a * iEventOverWindows);
    col += glow;

    // --- gentle vignette, gamma
    vec2 v = uv / vec2(asp, 1.);
    col *= 1. - iVignetteStrength * dot(v, v) * dot(v, v);
    col = pow(max(col, 0.), vec3(1. / max(iGamma, 1e-3)));

    fragColor = vec4(col, 1.);
}
