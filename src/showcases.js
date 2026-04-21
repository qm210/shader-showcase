import showcase1 from "./showcases/1_PlainBasics.js";
import showcase2a from "./showcases/2a_GeometryPlayground_Start.js";
import showcase2b from "./showcases/2b_GeometryPlayground_Advanced.js";
import showcase2c from "./showcases/specific/2c_Geometry_InvestigateSDBox.js";
import showcase3a from "./showcases/3a_TexturesAndColor.js";
import showcase3b from "./showcases/3b_TexturesAndColorModels.js";
import showcase4 from "./showcases/4_TextureBlending.js";
import showcase5a from "./showcases/5a_MultipassProcessing_Start.js";
import showcase5b from "./showcases/5b_MultipassProcessing.js";
import showcase5c from "./showcases/5c_MultipassProcessing_Blur1D.js";
import showcase6 from "./showcases/6_FramebufferFeedback.js";
import golStage0 from "./showcases/GOL__Stage0.js";
import golStage1 from "./showcases/GOL__Stage1.js";
import golStage2 from "./showcases/GOL__Stage2.js";
import golStage3 from "./showcases/GOL__Stage3.js";
import golBasic from "./showcases/GOL_Basic.js";
import golBasicSinglepass from "./showcases/GOL_BasicSinglepass.js";
import golExtended from "./showcases/GOL_Extended.js";
import golExtended2 from "./showcases/GOL_Extended2.js";
import golPlayground from "./showcases/GOL_Playground.js";
import golTorus3D from "./showcases/GOL_Torus3D.js";
import showcase7a from "./showcases/7a_Noise.js";
import showcase7b from "./showcases/7b_NoiseExtended.js";
import showcase8a from "./showcases/8a_RayMarching_Start.js";
import showcase8b from "./showcases/8b_RayMarching.js";
import showcase8c from "./showcases/8c_VariousConceptsFor3D.js";
import showcaseIQ from "./showcases/specific/iq_RayMarchingPrimitives.js";
import showcase9a from "./showcases/9_RayTracingFirstSteps.js"
import showcase9b from "./showcases/9b_RayTracingPlusVolumetric.js"
import showcase10 from "./showcases/10_RayTracingWithMultipass.js"
import showcase11Unfinished from "./showcases/11_FluidSimulation.js";
import showcase12 from "./showcases/12_Video_TestLab.js"

const defaultShowcase = golBasicSinglepass;

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
    // Framebuffer-Ping-Pong
    "6": showcase6,
    // Prozedurales Rauschen (Perlin Noise, FBM) -- nachgereicht, weil wir Ähnliches besprochen haben (z.B. Voronoi)
    "7": showcase7a,
    "7a": showcase7a,
    "7b": showcase7b,
    // Ray Marching mit SDF in 3D;
    "8": showcase8a,
    "8a": showcase8a,
    "8b": showcase8b,
    "8c": showcase8c,
    "8iq": showcaseIQ,
    // Ray Tracing ("8b" mit Volumetric Ray Marching am Rand, der wurde im Nachhinein ergänzt)
    "9": showcase9a,
    "9a": showcase9a,
    "9b": showcase9b,
    // Multi-Pass-Anwendung: "Tiefenunschärfe" auf Showcase8 aufbauend
    "10": showcase10,
    // UNVOLLSTÄNDIG: Demonstration eines sehr ausgiebigen Multi Pass / Framebuffer-Setups
    "11": showcase11Unfinished,
    // WIP: WebCam stuff
    "_12": showcase12,

    // GOL...
    "gol0": golStage0,
    "gol1": golStage1,
    "gol2": golStage2,
    "gol3": golStage3,
    // ... wohin die Reise gehen könnte:
    "gol": golBasic,
    "golbad": golBasicSinglepass,
    "golX": golExtended,
    "golY": golExtended2,
    "golZ": golPlayground,
    "gol3d": golTorus3D,
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
