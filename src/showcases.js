import showcase1 from "./showcases/1_PlainBasics.js";
import showcase2 from "./showcases/2_GeometryPlayground.js";
import showcase2b from "./showcases/2_GeometryPlayground_sdBox.js";
import showcase2c from "./showcases/2_GeometryPlayground_grid.js";
import showcase3 from "./showcases/3_Textures.js";
import showcase3a from "./showcases/3a_Textures.js";
import showcase3b from "./showcases/3b_Textures.js";
import showcase3c from "./showcases/3c_Textures.js";
import showcase3d from "./showcases/3d_Textures.js";
import showcase3x from "./showcases/3x_TextureProcessing.js";
import showcase4 from "./showcases/4_ColorPlayground.js";
import showcase5 from "./showcases/5a_Noise.js";
import showcase5b from "./showcases/5b_NoiseExtended.js";
import showcase6 from "./showcases/6_RayMarching.js";
import showcaseIQ from "./showcases/6b_RayMarchingPrimitives.js";
import showcase7 from "./showcases/7_VariousConceptsFor3D.js";
import showcase8 from "./showcases/8_RayTracingFirstSteps.js"
import showcase8b from "./showcases/8b_RayTracingPlusVolumetric.js"
import showcase9 from "./showcases/9_FramebufferPingPong.js";
import showcase9bUnfinished from "./showcases/9b_MultiPassAndExtraData.js";
import showcase10 from "./showcases/10_RayTracingWithMultipass.js"
import showcase11Unfinished from "./showcases/11_FluidSimulation.js";

const defaultShowcase = showcase1;

const MAP_PATH = {
    // Zum Anfang ein sehr, sehr langweiliger Anfang.
    "1": showcase1,
    // SDF in 2D, mit "2b" Vertiefung auf die Quadrat-SDF, "2c" zum Kontext der Gitter-Diskussion
    "2": showcase2,
    "2b": showcase2b,
    "2c": showcase2c,
    // Texturen Basics (ist derselbe Shader, nur nach den verschiedenen #define-Optionen aufgeschlüsselt:
    "3": showcase3,
    "3a": showcase3a,
    "3b": showcase3b,
    "3c": showcase3c,
    "3d": showcase3d,
    "3x": showcase3x,
    // Farbräume
    "4": showcase4,
    // Prozedurales Rauschen (Perlin Noise, FBM) -- nachgereicht, weil wir Ähnliches besprochen haben (z.B. Voronoi)
    "5": showcase5,
    "5a": showcase5,
    "5b": showcase5b,
    // Ray Marching mit SDF in 3D;
    "6": showcase6,
    "6a": showcase6,
    "6b": showcaseIQ, // s.u., ist zur Referenz der übersetzte Shadertoy-Shader von IQ
    // Aufbauend auf "6" mit _etlichen_ gängigen 3D-Konzepten (Kamerapfade, Texturen, Beleuchtung, Amb. Occlusion)
    "7": showcase7,
    // Ray Tracing ("8b" mit Volumetric Ray Marching am Rand, der wurde im Nachhinein ergänzt)
    "8": showcase8,
    "8b": showcase8b,
    // Einführung von Framebuffern, wobei "8" keine Zeit mehr fand. "9" ist ein einfacher Framebuffer-Showcase.
    "9": showcase9,
    "9b": showcase9bUnfinished, // Der wurde nicht fertig. Könnt ihr anschauen, ist aber wenig tiefgängig.
    // Multi-Pass-Anwendung: "Tiefenunschärfe" auf Showcase8 aufbauend
    "10": showcase10,
    // Demonstration eines sehr ausgiebigen Multi Pass / Framebuffer-Setups
    // aber UNVOLLSTÄNDIG -- den müsst ihr also nicht vertiefen.
    "11": showcase11Unfinished,
};

export function selectShowcase() {
    let path = window.location.pathname.slice(1);
    if (!path) {
        path = Object.keys(MAP_PATH).find(
            p => MAP_PATH[p] === defaultShowcase
        );
        window.location.pathname = "/" + path;
    }
    const showcase = MAP_PATH[path];
    if (showcase) {
        showcase.path = path;
        return showcase;
    }
    if (path) {
        window.alert(`Kein Showcase \"${path}\" definiert ='(`);
    }
    return defaultShowcase;
}
