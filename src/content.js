// Swaps YouTube video thumbnails for the auto-generated midpoint frame.
//
// YouTube auto-generates three frames per video at roughly 25%, 50% and 75%
// of its duration, served as i.ytimg.com/vi/<id>/hq{1,2,3}.jpg (480x360).
// "hq2" is the one from halfway through. The uploader's custom thumbnail
// lives at other names in the same folder (hqdefault, maxresdefault,
// hq720, ... often with signed query strings), so we rewrite any of those.

(() => {
  "use strict";

  const api = globalThis.browser ?? chrome; // Firefox ?? Chrome

  const STORAGE_KEY = "enabled";
  const ORIG_SRC = "ytmidOrigSrc";       // data-ytmid-orig-src
  const ORIG_SRCSET = "ytmidOrigSrcset"; // data-ytmid-orig-srcset
  const ORIG_BG = "ytmidOrigBg";         // data-ytmid-orig-bg

  // Matches thumbnail URLs on i.ytimg.com / i[0-9].ytimg.com, jpg or webp.
  const THUMB_RE =
    /^(?:https?:)?\/\/i\d?\.ytimg\.com\/(?:vi|vi_webp)\/([A-Za-z0-9_-]{11})\/([A-Za-z0-9_]+)\.(?:jpg|webp)(?:\?.*)?$/;
  const BG_URL_RE = /url\(["']?([^"')]+)/;

  // Already an auto-generated frame, a tiny image, or a live stream (which has
  // no midpoint frame) — leave alone.
  const SKIP_NAMES = /^(?:hq|mq|sd|maxres)?[123]$|^(?:default|frame0)$|_live$/;

  let enabled = true;
  // Video IDs whose hq2 frame doesn't exist (e.g. live streams, premieres).
  const failedIds = new Set();

  function midpointUrl(src) {
    const m = THUMB_RE.exec(src);
    if (!m) return null;
    const [, id, name] = m;
    if (SKIP_NAMES.test(name) || failedIds.has(id)) return null;
    return `https://i.ytimg.com/vi/${id}/hq2.jpg`;
  }

  // ---- <img> elements -----------------------------------------------------

  function markFailed(img) {
    const m = THUMB_RE.exec(img.dataset[ORIG_SRC] || "");
    if (m) failedIds.add(m[1]);
    restoreImg(img);
  }

  // A missing hq2 errors or comes back as YouTube's 120x90 grey placeholder.
  function checkLoaded(e) {
    const img = e.currentTarget;
    if (img.dataset[ORIG_SRC] && (e.type === "error" || img.naturalWidth <= 120)) markFailed(img);
  }

  function swapImg(img) {
    if (!enabled) return;
    const src = img.getAttribute("src");
    if (!src) return;
    const mid = midpointUrl(src);
    if (!mid) return;

    img.dataset[ORIG_SRC] = src;
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      img.dataset[ORIG_SRCSET] = srcset;
      img.removeAttribute("srcset");
    }
    img.addEventListener("load", checkLoaded);
    img.addEventListener("error", checkLoaded);
    img.setAttribute("src", mid);
  }

  function restoreImg(img) {
    const orig = img.dataset[ORIG_SRC];
    if (orig === undefined) return;
    img.removeEventListener("load", checkLoaded);
    img.removeEventListener("error", checkLoaded);
    delete img.dataset[ORIG_SRC];
    if (img.dataset[ORIG_SRCSET] !== undefined) {
      img.setAttribute("srcset", img.dataset[ORIG_SRCSET]);
      delete img.dataset[ORIG_SRCSET];
    }
    img.setAttribute("src", orig);
  }

  // ---- background-image (player poster, end-screen wall, etc.) ------------

  function swapBg(el) {
    if (!enabled) return;
    const bg = el.style.backgroundImage;
    const m = BG_URL_RE.exec(bg);
    const mid = m && midpointUrl(m[1]);
    if (!mid) return;
    // A CSS background gives no load/error signal, so check the frame exists first.
    const fail = () => failedIds.add(THUMB_RE.exec(mid)[1]);
    const probe = new Image();
    probe.onerror = fail;
    probe.onload = () => {
      if (probe.naturalWidth <= 120) return fail();
      if (!enabled || el.style.backgroundImage !== bg) return; // page moved on meanwhile
      el.dataset[ORIG_BG] = bg;
      el.style.backgroundImage = `url("${mid}")`;
    };
    probe.src = mid;
  }

  function restoreBg(el) {
    const orig = el.dataset[ORIG_BG];
    if (orig === undefined) return;
    delete el.dataset[ORIG_BG];
    el.style.backgroundImage = orig;
  }

  // Only these player elements use a CSS background for video thumbnails:
  // the poster before playback, the end-of-video grid, and end-screen cards.
  // Watching inline styles across the whole page would mean reacting to the
  // progress bar and other animations many times per second, so we watch
  // style changes on these elements alone.
  const BG_SEL =
    ".ytp-cued-thumbnail-overlay-image, .ytp-videowall-still-image, .ytp-ce-covering-image";
  const watchedBg = new WeakSet();

  const bgObserver = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      const el = m.target;
      const bg = el.style.backgroundImage;
      if (el.dataset[ORIG_BG] !== undefined && !/\/hq2\.jpg/.test(bg || "")) {
        delete el.dataset[ORIG_BG];
      }
      swapBg(el);
    }
  });

  function watchBg(el) {
    if (!watchedBg.has(el)) {
      watchedBg.add(el);
      bgObserver.observe(el, { attributes: true, attributeFilter: ["style"] });
    }
    swapBg(el);
  }

  // ---- scanning -----------------------------------------------------------

  function processNode(node) {
    if (node.nodeType !== 1) return;
    if (node.tagName === "IMG") swapImg(node);
    else if (node.matches(BG_SEL)) watchBg(node);
    if (!node.firstElementChild) return;
    for (const img of node.querySelectorAll('img[src*="ytimg.com/vi"]')) swapImg(img);
    for (const el of node.querySelectorAll(BG_SEL)) watchBg(el);
  }

  function swapAll() {
    processNode(document.documentElement);
  }

  function restoreAll() {
    for (const img of document.querySelectorAll("img[data-ytmid-orig-src]")) restoreImg(img);
    for (const el of document.querySelectorAll("[data-ytmid-orig-bg]")) restoreBg(el);
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const n of m.addedNodes) processNode(n);
      } else {
        const el = m.target;
        if (el.tagName === "IMG") {
          // YouTube recycles <img> elements for different videos; if the page
          // set a new src itself, forget the previous video's original.
          const src = el.getAttribute("src");
          if (el.dataset[ORIG_SRC] !== undefined && !/\/hq2\.jpg$/.test(src || "")) {
            delete el.dataset[ORIG_SRC];
            if (el.dataset[ORIG_SRCSET] !== undefined) {
              el.setAttribute("srcset", el.dataset[ORIG_SRCSET]);
              delete el.dataset[ORIG_SRCSET];
            }
          }
          swapImg(el);
        }
      }
    }
  });


  // ---- settings -----------------------------------------------------------

  api.storage.local.get({ [STORAGE_KEY]: true }).then((res) => {
    enabled = res[STORAGE_KEY] !== false;
    // Swaps may have happened before the setting arrived; undo them if it's off.
    if (enabled) swapAll();
    else restoreAll();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(STORAGE_KEY in changes)) return;
    enabled = changes[STORAGE_KEY].newValue !== false;
    if (enabled) swapAll();
    else restoreAll();
  });

  // Sees every element as the page is built, so no separate on-load pass.
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
})();
