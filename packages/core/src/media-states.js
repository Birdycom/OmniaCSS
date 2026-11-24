// File: packages/core/src/media-states.js
// Optional fallback for the media-state variants (paused:, playing:, muted:, seeking:, buffering:, stalled:).
// Browsers with :paused/:playing … (Safari 15.4+, Firefox 150+, Chrome/Edge 158+) need nothing. Elsewhere this script mirrors the
// state of every <audio>/<video> to attributes: data-oc-media (marker), data-paused, data-playing, data-muted,
// data-seeking, data-buffering, data-stalled. The variants write a rule for both, so the same classes work.
// Load: <script src="media-states.js" defer></script>, or `import "@birdycom/omniacss/media-states"`.
// Manual: <script src="media-states.js" data-manual> and call OmniaMediaStates.watch(root) yourself.
// Map: feature test -> state of one element -> sync attributes -> watch (capturing listeners + new elements)
// Author: Serge Cools | Framework: OmniaCSS

(function (global) {
  "use strict";

  /** Media events that change one of the states (they do not bubble, the listeners capture them on the root). */
  var EVENTS = ["play", "playing", "pause", "ended", "seeking", "seeked", "waiting", "stalled", "progress", "canplay",
    "canplaythrough", "loadstart", "loadeddata", "emptied", "volumechange", "suspend", "abort", "error"];
  var STATES = ["playing", "paused", "seeking", "buffering", "stalled", "muted"];
  var stalledFlag = typeof WeakMap === "function" ? new WeakMap() : null;

  /** True when the browser knows the media pseudo-classes itself. */
  function nativeSupport() {
    try {
      return !!(global.CSS && global.CSS.supports && global.CSS.supports("selector(:paused)") && global.CSS.supports("selector(:playing)"));
    } catch (e) {
      return false;
    }
  }

  /**
   * The states of one media element, as the selectors spec defines them.
   * :buffering = playing, still loading and not enough data; :stalled = buffering after a "stalled" event.
   * :volume-locked has no script API, so it stays native only.
   */
  function stateOf(el) {
    var paused = !!el.paused;
    var buffering = !paused && el.networkState === 2 && el.readyState <= 2; // NETWORK_LOADING, HAVE_CURRENT_DATA
    var stalled = buffering && !!(stalledFlag && stalledFlag.get(el));
    return { playing: !paused, paused: paused, seeking: !!el.seeking, buffering: buffering, stalled: stalled, muted: !!el.muted };
  }

  function setFlag(el, name, on) {
    if (on) { if (!el.hasAttribute(name)) el.setAttribute(name, ""); } else if (el.hasAttribute(name)) el.removeAttribute(name);
  }

  /** Write the attributes of one element. */
  function sync(el) {
    if (!el || !el.setAttribute) return el;
    var s = stateOf(el);
    setFlag(el, "data-oc-media", true);
    for (var i = 0; i < STATES.length; i++) setFlag(el, "data-" + STATES[i], s[STATES[i]]);
    return el;
  }

  function isMedia(node) {
    return !!node && node.nodeType === 1 && /^(AUDIO|VIDEO)$/.test(node.nodeName);
  }

  function onEvent(event) {
    var el = event.target;
    if (!isMedia(el)) return;
    if (stalledFlag) {
      if (event.type === "stalled") stalledFlag.set(el, true);
      else if (event.type === "progress" || event.type === "playing" || event.type === "emptied" || event.type === "canplay") stalledFlag.delete(el);
    }
    sync(el);
  }

  /**
   * Watch every <audio>/<video> inside root (default: document), including elements added later.
   * @param {Document|Element} [root]
   * @param {{ force?: boolean }} [options] force: also run when the browser supports :paused natively
   * @returns {() => void} stop watching
   */
  function watch(root, options) {
    root = root || global.document;
    if (!root || (!(options && options.force) && nativeSupport())) return function () {};
    for (var i = 0; i < EVENTS.length; i++) root.addEventListener(EVENTS[i], onEvent, true);
    var found = root.querySelectorAll ? root.querySelectorAll("audio, video") : [];
    for (var j = 0; j < found.length; j++) sync(found[j]);
    var observer = null;
    if (typeof global.MutationObserver === "function") {
      observer = new global.MutationObserver(function (records) {
        records.forEach(function (r) {
          r.addedNodes.forEach(function (n) {
            if (isMedia(n)) sync(n);
            else if (n.querySelectorAll) n.querySelectorAll("audio, video").forEach(sync);
          });
        });
      });
      observer.observe(root.documentElement || root, { childList: true, subtree: true });
    }
    return function stop() {
      for (var k = 0; k < EVENTS.length; k++) root.removeEventListener(EVENTS[k], onEvent, true);
      if (observer) observer.disconnect();
    };
  }

  var api = { watch: watch, sync: sync, stateOf: stateOf, nativeSupport: nativeSupport };
  global.OmniaMediaStates = api;

  // Start on its own, unless the script tag says data-manual.
  var doc = global.document;
  var script = doc && doc.currentScript;
  if (doc && !(script && script.hasAttribute("data-manual"))) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", function () { watch(doc); });
    else watch(doc);
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
