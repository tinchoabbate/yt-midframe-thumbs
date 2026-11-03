// Runs in the page's own JavaScript context (manifest "world": "MAIN"), because
// YouTube's router can't read event data created by the extension's isolated
// content scripts. shorts.js asks for a navigation by sending a video id.
document.addEventListener("ytmid-navigate", (e) => {
  const id = e.detail;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
  const url = `/watch?v=${id}`;
  document.querySelector("ytd-app")?.dispatchEvent(
    new CustomEvent("yt-navigate", {
      bubbles: true,
      composed: true,
      detail: {
        endpoint: {
          commandMetadata: {
            webCommandMetadata: { url, webPageType: "WEB_PAGE_TYPE_WATCH", rootVe: 3832 },
          },
          watchEndpoint: { videoId: id },
        },
      },
    })
  );
});
