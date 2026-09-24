const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(process.cwd(), 'data', 'cookie-config.json');
const BANNER_DIR = path.join(process.cwd(), 'public', 'assets', 'template', 'cookie-consent');

const DEFAULT_BANNER_HTML = `<div id="temgine-cookie-banner" class="tcb-banner" hidden>
  <div class="tcb-box">
    <p class="tcb-text">
      Wir verwenden Cookies, um unsere Website und unseren Service zu optimieren.
      <a href="/datenschutz" class="tcb-link">Datenschutzerklärung</a>
    </p>
    <div class="tcb-actions">
      <button type="button" class="tcb-btn tcb-btn-ghost" data-tcb-settings>Einstellungen</button>
      <button type="button" class="tcb-btn tcb-btn-outline" data-tcb-reject>Nur notwendige</button>
      <button type="button" class="tcb-btn tcb-btn-primary" data-tcb-accept>Alle akzeptieren</button>
    </div>
  </div>
  <div class="tcb-panel" data-tcb-panel hidden>
    <h3>Cookie-Einstellungen</h3>
    <label class="tcb-row"><input type="checkbox" checked disabled> Notwendig <span>Immer aktiv – für den Betrieb der Website erforderlich</span></label>
    <label class="tcb-row"><input type="checkbox" data-tcb-cat="functional"> Funktional <span>Erweiterte Funktionen und Komfort</span></label>
    <label class="tcb-row"><input type="checkbox" data-tcb-cat="statistics"> Statistik <span>Hilft uns, die Nutzung der Website zu verstehen</span></label>
    <label class="tcb-row"><input type="checkbox" data-tcb-cat="marketing"> Marketing <span>Personalisierte Inhalte und Werbung</span></label>
    <div class="tcb-panel-actions">
      <button type="button" class="tcb-btn tcb-btn-outline" data-tcb-save>Auswahl speichern</button>
    </div>
  </div>
</div>
<button type="button" id="temgine-cookie-reopen" class="tcb-reopen" hidden aria-label="Cookie-Einstellungen öffnen">🍪</button>
`;

const DEFAULT_BANNER_CSS = `.tcb-banner { position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 9999; max-width: 640px; margin: 0 auto; font-family: system-ui, sans-serif; }
.tcb-box { background: #fff; color: #1a1a1a; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); padding: 18px 20px; }
.tcb-text { margin: 0 0 14px; font-size: 14px; line-height: 1.5; }
.tcb-link { color: inherit; text-decoration: underline; }
.tcb-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
.tcb-btn { border: none; border-radius: 6px; padding: 9px 16px; font-size: 13px; cursor: pointer; }
.tcb-btn-primary { background: #1a1a1a; color: #fff; }
.tcb-btn-outline { background: transparent; color: #1a1a1a; border: 1px solid #ccc; }
.tcb-btn-ghost { background: transparent; color: #555; }
.tcb-panel { background: #fff; color: #1a1a1a; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); padding: 18px 20px; margin-top: 8px; }
.tcb-panel h3 { margin: 0 0 12px; font-size: 15px; }
.tcb-row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 8px; }
.tcb-row span { color: #666; font-weight: normal; }
.tcb-panel-actions { display: flex; justify-content: flex-end; margin-top: 8px; }
.tcb-reopen { position: fixed; left: 16px; bottom: 16px; z-index: 9999; width: 44px; height: 44px; border-radius: 50%; border: none; background: #1a1a1a; font-size: 20px; cursor: pointer; }
`;

const DEFAULT_BANNER_JS = `(function () {
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var banner = document.getElementById('temgine-cookie-banner');
  var reopenBtn = document.getElementById('temgine-cookie-reopen');
  if (!banner || !reopenBtn || !window.temgineConsent) return;

  var panel = qs('[data-tcb-panel]', banner);

  function syncCheckboxes() {
    var consent = window.temgineConsent.get() || {};
    qsa('[data-tcb-cat]', panel).forEach(function (input) {
      input.checked = !!consent[input.getAttribute('data-tcb-cat')];
    });
  }

  function show() {
    banner.hidden = false;
    reopenBtn.hidden = true;
    syncCheckboxes();
  }

  function hide() {
    banner.hidden = true;
    panel.hidden = true;
    reopenBtn.hidden = false;
  }

  if (!window.temgineConsent.get()) { show(); } else { hide(); }

  qs('[data-tcb-accept]', banner).addEventListener('click', function () {
    window.temgineConsent.acceptAll();
    hide();
  });

  qs('[data-tcb-reject]', banner).addEventListener('click', function () {
    window.temgineConsent.rejectAll();
    hide();
  });

  qs('[data-tcb-settings]', banner).addEventListener('click', function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) syncCheckboxes();
  });

  qs('[data-tcb-save]', banner).addEventListener('click', function () {
    var categories = {};
    qsa('[data-tcb-cat]', panel).forEach(function (input) {
      categories[input.getAttribute('data-tcb-cat')] = input.checked;
    });
    window.temgineConsent.set(categories);
    hide();
  });

  reopenBtn.addEventListener('click', show);
})();
`;

function readFileOrNull(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch (_e) {
    return null;
  }
}

function getServices() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return Array.isArray(data.services) ? data.services : [];
    }
  } catch (_e) {}
  return [];
}

function saveServices(services) {
  const dir = path.dirname(CONFIG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ services }, null, 2), 'utf-8');
}

function getBannerContent() {
  return {
    html: readFileOrNull(path.join(BANNER_DIR, 'banner.html')) ?? DEFAULT_BANNER_HTML,
    css: readFileOrNull(path.join(BANNER_DIR, 'banner.css')) ?? DEFAULT_BANNER_CSS,
    js: readFileOrNull(path.join(BANNER_DIR, 'banner.js')) ?? DEFAULT_BANNER_JS,
  };
}

function saveBannerField(field, value) {
  if (!['html', 'css', 'js'].includes(field)) return false;
  if (!fs.existsSync(BANNER_DIR)) fs.mkdirSync(BANNER_DIR, { recursive: true });
  fs.writeFileSync(path.join(BANNER_DIR, `banner.${field}`), String(value ?? ''), 'utf-8');
  return true;
}

module.exports = {
  getServices,
  saveServices,
  getBannerContent,
  saveBannerField,
  DEFAULT_BANNER_HTML,
  DEFAULT_BANNER_CSS,
  DEFAULT_BANNER_JS,
};
