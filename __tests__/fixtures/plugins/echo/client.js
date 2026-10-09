// Client-Hooks des Test-Plugins (Spezifikation §3.3). Kein SettingsPanel → Auto-Formular.
export default {
  hydrate: (container, { rerender }) => {
    container.querySelectorAll('[data-echo]').forEach((el) => {
      el.textContent = 'echo';
      el.addEventListener('click', () => rerender());
    });
  },
  clientInit: {
    consent: 'statistics',
    run: (settings) => {
      window.__echoInit = (window.__echoInit || 0) + 1;
      window.__echoSettings = settings;
    },
  },
};
