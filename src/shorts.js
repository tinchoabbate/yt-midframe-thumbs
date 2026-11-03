// Hides YouTube Shorts from the UI and opens Shorts in the regular player.
//
// Elements that can be recognised by their own tag/attributes are hidden by
// plain CSS. Elements that are only Shorts because of something inside them
// (a feed item linking to /shorts/...) are found by script and marked with
// data-ytmid-short, instead of using CSS :has(), which makes Firefox re-check
// every feed item whenever anything inside it changes.
//
// Everything is scoped under html[data-ytmid-hide-shorts], so turning the
// feature off is just removing that attribute.

(() => {
  "use strict";

  const api = globalThis.browser ?? chrome; // Firefox ?? Chrome

  // Subframes (live chat, embedded players) have no Shorts UI; skip their busy DOMs.
  if (window.top !== window) return;

  const STORAGE_KEY = "hideShorts";
  const ATTR = "data-ytmid-hide-shorts";
  const MARK = "data-ytmid-short";
  const S = `html[${ATTR}]`;

  const SHORT_LINK = 'a[href^="/shorts/"], a[href*="youtube.com/shorts/"]';
  const ITEM_CONTAINERS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "yt-lockup-view-model",
    "ytd-notification-renderer",
    "ytm-video-with-context-renderer",
  ].join(", ");

  // [what to look for, which enclosing element to hide]
  const RULES = [
    [SHORT_LINK, ITEM_CONTAINERS],
    ["ytd-rich-shelf-renderer[is-shorts]", "ytd-rich-section-renderer"],
    [
      "ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2",
      "ytd-rich-section-renderer, grid-shelf-view-model",
    ],
    // shortcut: matches the English "Shorts" label (here and in CSS); add translations if your UI language differs.
    ['a[title="Shorts"]', "ytd-guide-entry-renderer"],
    ['a[href$="/shorts"]', "tp-yt-paper-tab"],
    [".pivot-shorts", "ytm-pivot-bar-item-renderer"],
  ];
  const ANY_MARKER = RULES.map(([marker]) => marker).join(", ");

  const CSS = [
    `${S} [${MARK}]`,
    `${S} ytd-reel-shelf-renderer`,
    `${S} ytd-rich-shelf-renderer[is-shorts]`,
    `${S} ytm-shorts-lockup-view-model`,
    `${S} ytm-shorts-lockup-view-model-v2`,
    `${S} ytd-mini-guide-entry-renderer[aria-label="Shorts"]`,
    `${S} yt-tab-shape[tab-title="Shorts"]`,
    `${S} ytm-reel-shelf-renderer`,
  ].join(",\n") + " { display: none !important; }";

  let enabled = true;

  // ---- marking ------------------------------------------------------------

  // Outermost enclosing match, so nested wrappers don't leave an empty slot.
  function outermost(el, selector) {
    let found = el.parentElement && el.parentElement.closest(selector);
    while (found) {
      const up = found.parentElement && found.parentElement.closest(selector);
      if (!up) break;
      found = up;
    }
    return found;
  }

  function markFrom(el) {
    for (const [marker, container] of RULES) {
      if (!el.matches(marker)) continue;
      const target = outermost(el, container);
      if (target) target.setAttribute(MARK, "");
    }
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    markFrom(root);
    if (!root.firstElementChild) return;
    for (const el of root.querySelectorAll(ANY_MARKER)) markFrom(el);
  }

  function itemOf(el) {
    const inner = el.closest(ITEM_CONTAINERS);
    return inner && (outermost(inner, ITEM_CONTAINERS) || inner);
  }

  // YouTube reuses feed items for different videos, either by changing their
  // links or by replacing their contents, so re-check items when that happens.
  function recheck(item) {
    item.toggleAttribute(MARK, !!item.querySelector(SHORT_LINK));
  }

  const observer = new MutationObserver((mutations) => {
    const toRecheck = new Set();
    for (const m of mutations) {
      if (m.type === "childList") {
        for (const n of m.addedNodes) scan(n);
        if (m.removedNodes.length && m.target.nodeType === 1) {
          const item = itemOf(m.target);
          if (item && item.hasAttribute(MARK)) toRecheck.add(item);
        }
      } else if (m.attributeName === "href") {
        const item = itemOf(m.target);
        if (item) toRecheck.add(item);
        else markFrom(m.target);
      } else {
        markFrom(m.target); // is-shorts set after the shelf was inserted
      }
    }
    toRecheck.forEach(recheck);
  });

  // ---- opening Shorts in the normal player -------------------------------

  function shortId(url) {
    const m = /^\/shorts\/([A-Za-z0-9_-]{11})/.exec(url.pathname);
    return m && m[1];
  }

  // Ask YouTube's own router to open the watch page (see nav.js), so there's
  // no full page reload. If it doesn't react, load normally.
  function navigateToWatch(id) {
    const url = `/watch?v=${id}`;
    if (!document.querySelector("ytd-app")) return location.assign(url);

    let started = false;
    const onStart = () => { started = true; };
    document.addEventListener("yt-navigate-start", onStart, { once: true });
    document.dispatchEvent(new CustomEvent("ytmid-navigate", { detail: id }));

    setTimeout(() => {
      document.removeEventListener("yt-navigate-start", onStart);
      if (!started) location.assign(url);
    }, 400);
  }

  function onClick(e) {
    if (!enabled || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest("a[href]");
    if (!a) return;
    const id = shortId(new URL(a.href, location.href));
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    navigateToWatch(id);
  }

  // Direct visits, new tabs, and anything the click handler missed.
  function redirectIfShort() {
    if (!enabled) return;
    const id = shortId(location);
    if (id) location.replace(`/watch?v=${id}`);
  }

  // ---- setup --------------------------------------------------------------

  function apply() {
    document.documentElement.toggleAttribute(ATTR, enabled);
    redirectIfShort();
  }

  // At document_start <head> doesn't exist yet; a <style> under <html> works the same.
  const style = document.createElement("style");
  style.textContent = CSS;
  document.documentElement.appendChild(style);
  document.documentElement.setAttribute(ATTR, ""); // assume on until storage answers

  scan(document.documentElement);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "is-shorts"],
  });

  api.storage.local.get({ [STORAGE_KEY]: true }).then((res) => {
    enabled = res[STORAGE_KEY] !== false;
    apply();
  });

  api.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !(STORAGE_KEY in changes)) return;
    enabled = changes[STORAGE_KEY].newValue !== false;
    apply();
  });

  document.addEventListener("click", onClick, true);
  document.addEventListener("yt-navigate-finish", redirectIfShort);
  window.addEventListener("popstate", redirectIfShort);
})();
