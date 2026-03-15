#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 iResolution;
uniform float iTime;
uniform float iGamma;
uniform float iContrast;
uniform float iGray;
uniform vec3 iFactor;
uniform vec2 iSqueeze;
uniform float iCutOut;
uniform float iFree1;
uniform float iFree2;
uniform float iFree3;
uniform float iFree4;
uniform sampler2D iTexture0;

vec4 c = vec4(1., 0., -1., .5);

const float twoPi = 6.28319;

float sdCircle( in vec2 p, in float r )
{
    return length(p)-r;
}

vec3 grayscale(vec3 col) {
    // Gewichtet nach menschlichem Empfinden (Zapfen im Auge)
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    return vec3(gray);
}

mat2 rotate(float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return mat2(c, -s, s,  c);
}

float sdPentagram(in vec2 p, in float r )
{
    const float k1x = 0.809016994; // cos(π/ 5) = ¼(√5+1)
    const float k2x = 0.309016994; // sin(π/10) = ¼(√5-1)
    const float k1y = 0.587785252; // sin(π/ 5) = ¼√(10-2√5)
    const float k2y = 0.951056516; // cos(π/10) = ¼√(10+2√5)
    const float k1z = 0.726542528; // tan(π/ 5) = √(5-2√5)
    const vec2  v1  = vec2( k1x,-k1y);
    const vec2  v2  = vec2(-k1x,-k1y);
    const vec2  v3  = vec2( k2x,-k2y);

    p.x = abs(p.x);
    p -= 2.0*max(dot(v1,p),0.0)*v1;
    p -= 2.0*max(dot(v2,p),0.0)*v2;
    p.x = abs(p.x);
    p.y -= r;
    return length(p-v3*clamp(dot(p,v3),0.0,k1z*r))
    * sign(p.y*v3.x-p.x*v3.y);
}

void applyBasicColorEffects(inout vec3 col, in vec2 uv) {
    col *= iFactor;

    col = pow(col, vec3(iGamma));

    vec3 gray = grayscale(col);
    col = mix(col, gray, iGray);

    col = (col - 0.5) * iContrast + 0.5;

    col = clamp(col, vec3(iSqueeze.x), vec3(iSqueeze.y));
    col = (col - iSqueeze.x) / (iSqueeze.y - iSqueeze.x);

    /// ÜBUNG:
    // float radius = length(uv);
    // col = mix(col, c.yyy, step(1. - radius * 0.5, iCutOut));
    /// - wie würde man dem Cutout eine andere Form geben?
    /// - wie wird der Übergang fließend statt hart?
    /// Vorgehen immer ähnlich:
    /// 1. Koordinaten transformieren
    uv -= vec2(0.1);
    uv *= .85;
    float angle = twoPi * sin(0.4 * iTime);
    uv *= rotate(angle);
    /// 2. eine SDF parat haben, der man traut und die Parameter versteht
    float d = sdPentagram(uv, 0.7 + 0.1 * sin(iTime));
    /// 3. d anpassen für abgeleitete SDFs wie Rand (abs(d) - b) oder eben Abrunden:
    d -= 0.012;
    /// 4. Ein Übergang nahe des Rands (d==0) muss dann entscheiden,
    ///    ob die zugrundeliegende Farbe ersetzt wird oder nicht.
    ///    Das Intervall [0..0.1] ist das Ansteigen von Alpha,
    ///    -> kleiner wählen ergibt härtere Kanten.
    float alpha = smoothstep(0., 0.1, d);
    ///    -> Verschieben/Skalieren bringt etwas Transparenz zurück
    alpha *= 0.8;
    col = mix(col, c.yyy, alpha);
}

void main() {
    vec2 uv = (2. * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    float pixelSize = 2. / iResolution.y;

    fragColor = c.yyyx;

    /* Beispielhafter Texturzugriffcode */
    vec2 st = gl_FragCoord.xy / iResolution.y;
    ivec2 texSize = textureSize(iTexture0, 0);
    float texAspectRatio = float(texSize.x) / float(texSize.y);
    st.x /= texAspectRatio;
    st.y = 1. - st.y;
    fragColor.rgb = texture(iTexture0, st).rgb;

    /* Layout: Textur links unverändert, rechts rechnen wir drauf herum */
    if (abs(uv.x) < pixelSize) {
        discard;
    }
    if (uv.x > 0.) {
        st.x -= 1.;
        fragColor.rgb = texture(iTexture0, st).rgb;
        // <-- was passiert hier?

        uv.x -= 0.5 * iResolution.x / iResolution.y;
        applyBasicColorEffects(fragColor.rgb, uv);
    }
}
