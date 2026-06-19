const enabled = document.getElementById("enabled");
const persona = document.getElementById("persona");

chrome.storage.sync.get({ rd_enabled: true, rd_persona: true }, (cfg) => {
  enabled.checked = cfg.rd_enabled;
  persona.checked = cfg.rd_persona;
});

enabled.addEventListener("change", () =>
  chrome.storage.sync.set({ rd_enabled: enabled.checked })
);
persona.addEventListener("change", () =>
  chrome.storage.sync.set({ rd_persona: persona.checked })
);
