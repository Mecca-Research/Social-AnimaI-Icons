/**
 * Ethogram.js — the FACADE. The engine lives in ethogram/core.js and each
 * species in ethogram/<name>.js; importing this file loads all of them and
 * re-exports the same public API the one big file always had, so no
 * importer changed. Species imports are registration side-effects.
 */
export * from "./ethogram/core.js";
import "./ethogram/bear.js";
import "./ethogram/squirrel.js";
import "./ethogram/raccoon.js";
import "./ethogram/deer.js";
import "./ethogram/skunk.js";
import "./ethogram/cougar.js";
import "./ethogram/wolf.js";
import "./ethogram/fox.js";
import "./ethogram/frog.js";
import "./ethogram/turtle.js";
import "./ethogram/goose.js";
import "./ethogram/beaver.js";
import "./ethogram/hedgehog.js";
import "./ethogram/owl.js";
export { hogCurl } from "./ethogram/hedgehog.js";
export { squirrelBolt } from "./ethogram/squirrel.js";
