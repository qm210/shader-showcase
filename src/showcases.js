import showcase1 from "./showcases/1_PlainBasics.js";
import showcase2a from "./showcases/2a_GeometryPlayground_Starter.js";
import showcase2b from "./showcases/2b_GeometryPlayground_Crowded.js";
import showcase2c from "./showcases/specific/2c_Geometry_InvestigateSDBox.js";
import showcase3a from "./showcases/3a_TexturesAndColor.js";
import showcase3b from "./showcases/3b_TexturesAndColorModels.js";
import showcase4 from "./showcases/4_TextureBlending.js";
import showcase5a from "./showcases/5a_MultipassProcessing_Starter.js";
import showcase5b from "./showcases/5b_MultipassProcessing.js";
import showcase5c from "./showcases/5c_FramebufferFeedback.js";
import previousShowcase5 from "./showcases/6a_Noise.js";
import previousShowcase5b from "./showcases/6b_NoiseExtended.js";
import previousShowcase6 from "./showcases/7_RayMarching.js";
import showcaseIQ from "./showcases/7b_RayMarchingPrimitives.js";
import previousShowcase7 from "./showcases/8_VariousConceptsFor3D.js";
import previousShowcase8 from "./showcases/9_RayTracingFirstSteps.js"
import previousShowcase8b from "./showcases/9b_RayTracingPlusVolumetric.js"
import showcase10 from "./showcases/10_RayTracingWithMultipass.js"
import showcase11Unfinished from "./showcases/11_FluidSimulation.js";

const defaultShowcase = showcase5a;

const MAP_PATH = {
    // Zum Anfang mal... ein Anfang.
    "1": showcase1,
    // SDF in 2D, mit "2b" Vertiefung auf die Quadrat-SDF, "2c" zum Kontext der Gitter-Diskussion
    "2": showcase2a,
    "2a": showcase2a,
    "2b": showcase2b,
    "2c": showcase2c,
    // Basics Texturen & Farbräume
    "3": showcase3a,
    "3a": showcase3a,
    "3b": showcase3b,
    // Farbmischungen
    "4": showcase4,
    // Einführung von Framebuffern
    "5": showcase5a,
    "5a": showcase5a,
    "5b": showcase5b,
    "5c": showcase5c,
    // Prozedurales Rauschen (Perlin Noise, FBM) -- nachgereicht, weil wir Ähnliches besprochen haben (z.B. Voronoi)
    "6": previousShowcase5,
    "6a": previousShowcase5,
    "6b": previousShowcase5b,
    // Ray Marching mit SDF in 3D;
    "7": previousShowcase6,
    "7a": previousShowcase6,
    "7b": showcaseIQ, // s.u., ist zur Referenz der übersetzte Shadertoy-Shader von IQ
    // Aufbauend auf "6" mit _etlichen_ gängigen 3D-Konzepten (Kamerapfade, Texturen, Beleuchtung, Amb. Occlusion)
    "8": previousShowcase7,
    // Ray Tracing ("8b" mit Volumetric Ray Marching am Rand, der wurde im Nachhinein ergänzt)
    "9": previousShowcase8,
    "9b": previousShowcase8b,
    // Multi-Pass-Anwendung: "Tiefenunschärfe" auf Showcase8 aufbauend
    "10": showcase10,
    // UNVOLLSTÄNDIG: Demonstration eines sehr ausgiebigen Multi Pass / Framebuffer-Setups
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
