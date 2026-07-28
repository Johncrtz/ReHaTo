// Info view — about, data & privacy, and the Impressum placeholder.
import { CONFIG } from './config.js';
import { t } from './i18n.js';

let container;

export function init(el) { container = el; }

export async function render() {
  container.innerHTML = `
    <div class="card">
      <h3 class="card-title">🌱 ${t('info.aboutTitle')}</h3>
      <p class="info-p">${t('info.aboutBody')}</p>
      <p class="hint small">ReHaTo v${CONFIG.version} ·
        <a href="https://github.com/Johncrtz/ReHaTo" target="_blank" rel="noopener">GitHub</a></p>
    </div>
    <div class="card">
      <h3 class="card-title">🔒 ${t('info.dataTitle')}</h3>
      <p class="info-p">${t('info.dataBody1')}</p>
      <p class="info-p">${t('info.dataBody2')}</p>
    </div>
    <div class="card">
      <h3 class="card-title">§ ${t('info.legalTitle')}</h3>
      <p class="hint small">${t('info.legalNote')}</p>
      <address class="legal-block">
        [Vor- und Nachname]<br>
        [Straße Hausnummer]<br>
        [PLZ Ort]<br>
        E-Mail: [kontakt@example.de]
      </address>
    </div>`;
}
