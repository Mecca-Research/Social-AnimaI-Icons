/**
 * ONE PLACE THAT LAUNCHES THE BROWSER — and the flags that make the sim
 * run at its own speed instead of the compositor's.
 *
 * Every suite here drives a REAL page and most of them wait on the world's
 * own animation frames, so the frame rate is not a detail: it is the clock
 * the checks are measured against. Headless Chromium, left alone, ran this
 * page at 8.4 frames a second — it throttles a window nobody is looking at
 * and paces rAF to a vsync that does not exist. Measured on this machine,
 * same page, same build:
 *
 *     baseline      8.4 fps
 *     unthrottled  81.4 fps      (the flags below)
 *
 * Nearly ten times the sim per second of wall clock, which is most of a
 * seventeen-minute CI run. The flags change no behaviour the checks look
 * at: they lift a frame-rate cap and stop the backgrounding heuristics
 * from throttling timers, and every number in these suites is either a
 * count of frames or a distance in pixels — never a wall-clock reading of
 * how fast the machine happened to be.
 *
 * A suite that installs its own virtual clock (world.mjs pumps rAF by hand)
 * is unaffected by any of this, and passing the flags costs it nothing.
 */
export const SPEED_FLAGS = [
  "--disable-frame-rate-limit",          // no 60fps ceiling on the compositor
  "--disable-gpu-vsync",                 // ...and no wait for a display that is not there
  "--run-all-compositor-stages-before-draw",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

/**
 * The launch every suite shares. `fast` is OPT-IN, per suite, and measured:
 * a suite that waits on the world's own frames wants the flags, and a suite
 * that drives its OWN clock must not have them.
 *
 * world.mjs is the second kind. It overrides requestAnimationFrame and pumps
 * frames by hand, so unthrottling buys it nothing — and it does not install
 * that clock on every one of its pages, so the first page's real frames ran
 * ten times faster and four checks changed their answers. Speed that moves
 * a result is not speed, so world and the soak keep the plain launch.
 */
export async function launchBrowser({ fast = false, ...extra } = {}) {
  const { chromium } = await import(process.env.SAI_PLAYWRIGHT || "playwright");
  return chromium.launch({
    executablePath: process.env.SAI_CHROMIUM || undefined,
    ...(fast ? { args: SPEED_FLAGS } : null),
    ...extra,
  });
}

/**
 * TIME, DILATED — the other half of the speed, and the bigger half.
 *
 * The flags above lifted the frame RATE; they did not make the world older
 * per second. This sim takes its dt from elapsed real time and clamps it at
 * 50ms a frame, so at the throttled 8.4fps it aged 0.4 seconds per second of
 * CI, and unthrottled it ages 1.0. The checks that wait on a bout therefore
 * waited out the bout in real time either way.
 *
 * So the page's clock is scaled. performance.now, Date.now and the timestamp
 * handed to requestAnimationFrame all advance K times faster, together, from
 * the same instant — the world reads one of them and the fixtures read
 * another, and a fixture whose budget did not scale with the sim would be
 * measuring a different world than the one it is timing.
 *
 * K = 4 IS THE CEILING, not a taste: at 81fps a dilated frame is 12.3ms of
 * real time, so K=4 puts dt at 49ms — just under the sim's own 50ms clamp.
 * Past that the clamp bites, the world ages slower than the clock measuring
 * it, and every budget in every fixture quietly means something else.
 */
export async function fastClock(page, k = 4) {
  await page.addInitScript((K) => {
    const P = performance, pt0 = P.now(), pnow = P.now.bind(P);
    P.now = () => pt0 + (pnow() - pt0) * K;
    const dt0 = Date.now(), dnow = Date.now.bind(Date);
    Date.now = () => dt0 + (dnow() - dt0) * K;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => raf(() => cb(P.now()));
  }, k);
}
