// File: packages/core/src/starter-classes.mjs
// Curated class list for the lightweight CDN bundle dist/omnia.starter.min.css.
// The build (scripts/build-packages.mjs) feeds this list through the on-demand engine (engine.mjs),
// so the CSS is generated from the full build, never written by hand.
// Edit the groups below to grow or shrink the bundle; names that do not exist are reported by the build.
// Author: Serge Cools | Framework: OmniaCSS

const list = (s) => s.trim().split(/\s+/);
const cross = (prefixes, values) => prefixes.flatMap((p) => values.map((v) => `${p}${v}`));

// --- Color: Omnia palette only -------------------------------------------------------------------
// Tokens (--color-{name}-{step}) are pruned automatically to the ones used below.
export const COLOR_NAMES = list(`red orange yellow lime green teal cyan blue indigo violet purple pink magenta brown gray black white`);
export const COLOR_STEPS = ["", "-10", "-20", "-30", "-40", "-50", "-60", "-70", "-80", "-90"]; // "" = the base tone (step 100)
export const NEUTRAL_STEPS = ["", "-2", "-10", "-20", "-30", "-40", "-50", "-60", "-70", "-80", "-90", "-95"]; // gray: full range for surfaces and text

const colorBase = COLOR_NAMES.flatMap((n) => (n === "gray" ? NEUTRAL_STEPS : n === "black" || n === "white" ? [""] : COLOR_STEPS).map((s) => n + s));
const colors = [
  ...cross(["text-", "bg-", "hover:text-", "hover:bg-", "focus:text-", "focus:bg-"], colorBase),
  // border colors always carry an explicit step (border-red-100 = base tone); there is no bare border-red.
  ...cross(["border-"], colorBase.map((c) => (/-\d+$/.test(c) ? c : c + "-100"))),
  ...list("border-transparent border-current"),
];

// --- Spacing: padding / margin / gap -------------------------------------------------------------
export const SPACE = list(`0 px 0.5 1 1.5 2 2.5 3 4 5 6 7 8 9 10`);
const spacing = [
  ...cross(["p-", "pt-", "pr-", "pb-", "pl-", "ph-", "pv-", "m-", "mt-", "mr-", "mb-", "ml-", "mh-", "mv-"], SPACE),
  ...cross(["m-", "mt-", "mr-", "mb-", "ml-", "mh-", "mv-"], ["auto"]),
  ...cross(["gap-", "gap-x-", "gap-y-"], SPACE),
];

// --- Sizing --------------------------------------------------------------------------------------
const SIZE = list(`0 px 1 2 3 4 5 6 8 10 12 16 20 24 auto full screen min max fit perc-1/2 perc-1/3 perc-2/3 perc-1/4 perc-3/4`);
const sizing = [
  ...cross(["w-", "h-"], SIZE),
  ...cross(["min-w-", "min-h-"], list(`0 full screen min max fit`)),
  ...cross(["max-w-"], list(`none full screen min max fit xs sm md lg xl 2xl 3xl 4xl 5xl 6xl 7xl prose`)),
  ...cross(["max-h-"], list(`none full screen`)),
  "container",
];

// --- Layout: display, flex, grid, position, overflow ---------------------------------------------
const layout = list(`
  block inline inline-block inline-flex flex inline-grid grid contents none flow-root table
  flex-row flex-col flex-row-reverse flex-col-reverse flex-wrap flex-nowrap flex-wrap-reverse
  flex-1 flex-auto flex-initial flex-none grow nogrow shrink noshrink
  justify-start justify-end justify-center justify-between justify-around justify-evenly
  justify-items-start justify-items-center justify-items-end justify-self-center justify-self-end
  align-start align-end align-center align-stretch align-baseline
  align-items-start align-items-center align-items-end align-items-stretch align-items-baseline
  align-self-auto align-self-start align-self-center align-self-end align-self-stretch
  place-center order-first order-last
  grid-flow-row grid-flow-col grid-flow-dense
  static relative absolute fixed sticky isolate
  float-left float-right float-none clear-both
  visible invisible sr-only
  box-border box-content
  object-contain object-cover object-fill object-center
  overflow-auto overflow-hidden overflow-clip overflow-visible overflow-scroll
  overflow-x-auto overflow-x-hidden overflow-x-scroll overflow-y-auto overflow-y-hidden overflow-y-scroll
  overscroll-contain overscroll-none
`);
const gridCols = [
  ...cross(["grid-cols-"], list(`1 2 3 4 5 6 7 8 9 10 11 12 none`)),
  ...cross(["grid-rows-"], list(`1 2 3 4 5 6 none`)),
  ...cross(["col-span-"], list(`1 2 3 4 5 6 7 8 9 10 11 12 full`)),
  ...cross(["row-span-"], list(`1 2 3 4 5 6 full`)),
  ...cross(["col-start-", "col-end-"], list(`1 2 3 4 5 6 7 13 auto`)),
];
const positions = [
  ...cross(["top-", "right-", "bottom-", "left-"], list(`0 1 2 4 8 auto full 1/2`)),
  ...cross(["z-"], list(`auto 0 10 20 30 40 50`)),
];
// Responsive variants: container-query based (cq-xs 20rem, cq-sm 24rem, cq-md 28rem, cq-lg 32rem, cq-xl 36rem).
const responsive = cross(
  ["cq-xs:", "cq-sm:", "cq-md:", "cq-lg:", "cq-xl:"],
  list(`block hidden flex grid inline-flex flex-row flex-col grid-cols-1 grid-cols-2 grid-cols-3 grid-cols-4 grid-cols-5 grid-cols-6`),
);
const containers = list(`container-inline-size container-size container-normal`);

// --- Typography ----------------------------------------------------------------------------------
const typography = [
  ...cross(["font-"], list(`0.8 1 1.1 1.2 1.5 1.8 2 2.5 3 4 5 6 sansserif serif monospace`)),
  ...cross(["font-"], list(`thin light normal medium semibold bold extrabold black italic`)),
  ...cross(["lineheight-"], list(`1 1.2 1.5 1.7 2 none tight snug normal relaxed loose`)),
  ...cross(["letterspacing-"], list(`1 2 3 normal`)),
  ...list(`
    text-left text-center text-right text-justify text-start text-end
    uppercase lowercase capitalize normalcase underline overline line-through no-underline
    truncate antialiased
    whitespace-normal whitespace-nowrap whitespace-pre whitespace-prewrap
    break-normal break-word wrap-break-word wrap-anywhere hyphens-auto
    list-none list-disc list-decimal list-inside list-outside
    line-clamp-1 line-clamp-2 line-clamp-3 line-clamp-4
    vertical-baseline vertical-top vertical-middle vertical-bottom
  `),
];

// --- Borders, radius, shadow, effects, motion ----------------------------------------------------
const borders = [
  ...list(`border border-none border-1 border-2 border-4 border-8 border-t border-r border-b border-l`),
  ...cross(["border-t", "border-r", "border-b", "border-l"], list(`1 2 4`)),
  ...list(`round round-none round-full round-t round-r round-b round-l round-tl round-tr round-bl round-br`),
  ...cross(["round-"], list(`1 2 3 4 5 6 8 10 12`)),
  ...list(`shadow-none shadow-sm shadow shadow-md shadow-lg shadow-xl shadow-2xl shadow-inner`),
  ...cross(["opacity-"], list(`0 10 25 50 75 100`)),
  ...list(`divider-h divider-v outline-none`),
];
const motion = [
  ...list(`transition-none transition-all transition-colors transition-opacity transition-shadow transition-transform`),
  ...cross(["duration-"], list(`75 100 150 200 300 500 700 1000`)),
  ...list(`ease-linear ease-in ease-out ease-in-out`),
  ...cross(["cursor-"], list(`auto default pointer wait text move help not-allowed grab grabbing`)),
  ...list(`pointer-events-none pointer-events-auto`),
];

/** Every class name of the starter bundle (unique). */
export const starterClasses = [...new Set([
  ...colors, ...spacing, ...sizing, ...layout, ...gridCols, ...positions, ...responsive, ...containers,
  ...typography, ...borders, ...motion,
])];

export default starterClasses;
