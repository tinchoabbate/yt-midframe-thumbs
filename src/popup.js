const api = globalThis.browser ?? chrome; // Firefox ?? Chrome
const DEFAULTS = { enabled: true, hideShorts: true };

function render(key, on) {
  document.querySelector(`input[data-key="${key}"]`).checked = on;
  const label = document.querySelector(`small[data-for="${key}"]`);
  label.textContent = on ? label.dataset.on : label.dataset.off;
}

api.storage.local.get(DEFAULTS).then((res) => {
  for (const key of Object.keys(DEFAULTS)) render(key, res[key] !== false);
});

for (const input of document.querySelectorAll("input[data-key]")) {
  input.addEventListener("change", () => {
    render(input.dataset.key, input.checked);
    api.storage.local.set({ [input.dataset.key]: input.checked });
  });
}
