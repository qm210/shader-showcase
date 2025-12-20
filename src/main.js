import {setupWebGl} from "./webgl/setup.js";
import {prepareShowcase} from "./app/showcase.js";
import generatePage from "./app/layout/generate.js";
import initLayout from "./app/layout/page.js";
import {selectShowcase} from "./showcases.js";
import './app/style/index.css';

const showcase = selectShowcase();
const elements = initLayout("app");
const glContext = setupWebGl(elements.canvas, {aspectRatio: 16 / 9});
const state = await prepareShowcase(showcase, glContext);

console.info("Shader compiled in", state.compiledMillis, "ms.", state, glContext);

const controls = showcase.generateControls(glContext, state, elements);
generatePage(glContext, elements, state, controls);

console.info("Page took", elements.measured.pageLoadingMs, "ms to render.");

await controls.onRender();
