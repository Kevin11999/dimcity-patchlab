// All tutorial scripts: what is said and what is done in the app while it is said.
//   Series 1 "Build a show"  (scenes-build.mjs)  — one project from the imported patch to the finished P D F, in ten parts
//   Series 2 "Tool guides"   (scenes-tools.mjs)  — one short video per tool
import { OVERLAY } from './scenes-common.mjs';
import { BUILD } from './scenes-build.mjs';
import { TOOLS } from './scenes-tools.mjs';
import { PROMO } from './scenes-promo.mjs';
export { OVERLAY };
export const SERIES = [
  { id: 'promo', title: 'First look', parts: [PROMO] },
  { id: 'build', title: 'Build a show, step by step', parts: BUILD },
  { id: 'tools', title: 'Tool guides', parts: TOOLS }
];
export const PARTS = SERIES.flatMap(s => s.parts);
