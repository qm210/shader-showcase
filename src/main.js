import {setupWebGl} from "./webgl/setup.js";
import {prepareShowcase} from "./app/showcase.js";
import generatePage from "./app/layout/generate.js";
import initLayout from "./app/layout/page.js";
import {createControls} from "./app/controls.js";
import {selectShowcase} from "./showcases.js";
import "./app/dom/webComponents.js";
import "./app/style/index.css";

const showcase = selectShowcase();
const elements = initLayout("app");
const glContext = setupWebGl(elements.canvas, {aspectRatio: 16 / 9});
const state = await prepareShowcase(showcase, glContext);

console.info("Shader compiled in", state.compiledMillis, "ms.", state, glContext);

const controls = createControls(showcase, glContext, state, elements);
generatePage(glContext, elements, state, controls);

controls.onRender();
