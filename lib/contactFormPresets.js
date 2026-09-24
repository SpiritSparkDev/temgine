// Starter templates for contact-form blocks. Shared between the generic
// Template-Presets gallery (components/TemplatesViewModern.js) and the
// dedicated Kontaktformulare admin section (components/ContactFormTemplatesView.js)
// so both stay in sync from a single source.
export const CONTACT_FORM_PRESETS = [
  {
    label: 'Kontakt – Einfach',
    description: 'Name, E-Mail, Nachricht mit ALTCHA Spam-Schutz',
    code: `<section class="kontakt-section">
  <div class="kontakt-container">
    {{#Titel}}<h2 class="kontakt-title">{{Titel:text}}</h2>{{/Titel}}
    {{#Einleitung}}<p class="kontakt-intro">{{{Einleitung:textarea}}}</p>{{/Einleitung}}

    <form class="kontakt-form" data-temgine-form="contact">
      <div class="kontakt-fields">
        <input type="text"  name="name"     placeholder="Name"       required autocomplete="name">
        <input type="email" name="email"    placeholder="E-Mail"     required autocomplete="email">
        <textarea           name="nachricht" placeholder="Ihre Nachricht" rows="5"></textarea>
      </div>

      <altcha-widget challengeurl="/api/contact/challenge" style="--altcha-color-base:transparent;--altcha-border-radius:6px"></altcha-widget>

      <button type="submit" class="kontakt-submit">{{Button-Text:text}}</button>
      <div class="kontakt-feedback" data-temgine-status aria-live="polite"></div>
    </form>
  </div>
</section>`,
    css: `.kontakt-section { padding: 4rem 2rem; max-width: 640px; margin: 0 auto; }
.kontakt-title  { font-size: clamp(1.5rem, 3vw, 2.25rem); font-weight: 800; margin: 0 0 .75rem; }
.kontakt-intro  { color: #6b7280; line-height: 1.6; margin: 0 0 2rem; }
.kontakt-form   { display: flex; flex-direction: column; gap: 1rem; }
.kontakt-fields { display: flex; flex-direction: column; gap: .75rem; }
.kontakt-fields input,
.kontakt-fields textarea { padding: .6rem .85rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: 1rem; width: 100%; box-sizing: border-box; resize: vertical; }
.kontakt-submit { align-self: flex-start; padding: .65rem 2rem; background: #6366f1; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-family: inherit; font-weight: 600; cursor: pointer; transition: background .2s; }
.kontakt-submit:hover { background: #4f46e5; }
.kontakt-submit:disabled { opacity: .6; cursor: not-allowed; }
.kontakt-feedback { font-size: .9rem; min-height: 1.4em; }`,
  },
  {
    label: 'Kontakt – Mit Auswahloptionen',
    description: 'Checkboxen für Prioritäten + Name, E-Mail, Nachricht (wie im Mockup)',
    code: `<section class="kontakt-section kontakt-split">
  <div class="kontakt-container">
    {{#Titel}}<h2 class="kontakt-title">{{Titel:text}}</h2>{{/Titel}}
    {{#Frage}}<h3 class="kontakt-question">{{Frage:text}}</h3>{{/Frage}}

    <form class="kontakt-form" data-temgine-form="contact">
      <fieldset class="kontakt-checkboxes">
        <legend class="sr-only">Ihre Priorität</legend>
        <label class="kontakt-cb-label">
          <input type="checkbox" name="prioritaet" value="{{Option 1:text}}">
          <span class="kontakt-cb-box"></span>{{Option 1:text}}
        </label>
        <label class="kontakt-cb-label">
          <input type="checkbox" name="prioritaet" value="{{Option 2:text}}">
          <span class="kontakt-cb-box"></span>{{Option 2:text}}
        </label>
        <label class="kontakt-cb-label">
          <input type="checkbox" name="prioritaet" value="{{Option 3:text}}">
          <span class="kontakt-cb-box"></span>{{Option 3:text}}
        </label>
        <label class="kontakt-cb-label">
          <input type="checkbox" name="prioritaet" value="{{Option 4:text}}">
          <span class="kontakt-cb-box"></span>{{Option 4:text}}
        </label>
      </fieldset>

      <div class="kontakt-fields">
        <input type="text"  name="name"      placeholder="Name"  required autocomplete="name">
        <input type="email" name="email"     placeholder="E-Mail" required autocomplete="email">
        <textarea           name="nachricht"  placeholder="Ihre Nachricht" rows="4"></textarea>
      </div>

      <altcha-widget challengeurl="/api/contact/challenge" style="--altcha-color-base:transparent;--altcha-border-radius:6px"></altcha-widget>

      <button type="submit" class="kontakt-submit">{{Button-Text:text}}</button>
      <div class="kontakt-feedback" data-temgine-status aria-live="polite"></div>
    </form>
  </div>
</section>`,
    css: `.kontakt-split { max-width: 760px; }
.kontakt-title    { font-size: clamp(1.5rem, 3vw, 2.25rem); font-weight: 800; margin: 0 0 .5rem; }
.kontakt-question { font-size: 1.05rem; font-weight: 600; margin: 0 0 1.25rem; }
.kontakt-form     { display: flex; flex-direction: column; gap: 1.25rem; }
.kontakt-checkboxes { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .65rem; }
.kontakt-cb-label   { display: flex; align-items: flex-start; gap: .75rem; cursor: pointer; font-size: 1rem; line-height: 1.4; }
.kontakt-cb-label input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }
.kontakt-cb-box { flex-shrink: 0; width: 20px; height: 20px; border: 2px solid currentColor; background: transparent; margin-top: .1em; transition: background .15s, border-color .15s; }
.kontakt-cb-label input:checked + .kontakt-cb-box { background: currentColor; }
.kontakt-fields input,
.kontakt-fields textarea { padding: .6rem .85rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: 1rem; width: 100%; box-sizing: border-box; resize: vertical; }
.kontakt-fields { display: flex; flex-direction: column; gap: .75rem; }
.kontakt-submit { align-self: flex-start; padding: .65rem 2rem; background: #6366f1; color: #fff; border: none; border-radius: 6px; font-size: 1rem; font-family: inherit; font-weight: 600; cursor: pointer; transition: background .2s; }
.kontakt-submit:hover { background: #4f46e5; }
.kontakt-submit:disabled { opacity: .6; cursor: not-allowed; }
.kontakt-feedback { font-size: .9rem; min-height: 1.4em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }`,
  },
  {
    label: 'Kontakt – Zweispaltig',
    description: 'Text/Infos links, Formular rechts – mit Checkboxen + ALTCHA',
    code: `<section class="kontakt2-section">
  <div class="kontakt2-left">
    {{#Titel Links}}<h2 class="kontakt2-title">{{Titel Links:text}}</h2>{{/Titel Links}}
    <div class="kontakt2-body">{{{Text Links:textarea}}}</div>
  </div>

  <div class="kontakt2-right">
    {{#Titel Rechts}}<h2 class="kontakt2-form-title">{{Titel Rechts:text}}</h2>{{/Titel Rechts}}
    {{#Frage}}<h3 class="kontakt2-question">{{Frage:text}}</h3>{{/Frage}}

    <form class="kontakt-form" data-temgine-form="contact">
      <fieldset class="kontakt-checkboxes">
        <legend class="sr-only">Priorität</legend>
        <label class="kontakt-cb-label"><input type="checkbox" name="prioritaet" value="Stil"><span class="kontakt-cb-box"></span>Stil</label>
        <label class="kontakt-cb-label"><input type="checkbox" name="prioritaet" value="Expertise"><span class="kontakt-cb-box"></span>Expertise</label>
        <label class="kontakt-cb-label"><input type="checkbox" name="prioritaet" value="Budget"><span class="kontakt-cb-box"></span>Budget</label>
        <label class="kontakt-cb-label"><input type="checkbox" name="prioritaet" value="Beratung"><span class="kontakt-cb-box"></span>Ich bin unsicher und lasse mich beraten</label>
      </fieldset>

      <div class="kontakt-fields">
        <input type="text"  name="name"     placeholder="Name"        required autocomplete="name">
        <input type="email" name="email"    placeholder="E-Mail"      required autocomplete="email">
        <textarea           name="nachricht" placeholder="Ihre Nachricht" rows="4"></textarea>
      </div>

      <altcha-widget challengeurl="/api/contact/challenge" style="--altcha-color-base:transparent;--altcha-border-radius:6px"></altcha-widget>

      <button type="submit" class="kontakt-submit">Absenden</button>
      <div class="kontakt-feedback" data-temgine-status aria-live="polite"></div>
    </form>
  </div>
</section>`,
    css: `.kontakt2-section { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; padding: 4rem 2rem; max-width: 1100px; margin: 0 auto; }
.kontakt2-title     { font-size: clamp(1.5rem, 3vw, 2.25rem); font-weight: 800; margin: 0 0 1rem; }
.kontakt2-body      { color: #6b7280; line-height: 1.7; }
.kontakt2-form-title { font-size: 1.5rem; font-weight: 800; margin: 0 0 .5rem; }
.kontakt2-question  { font-size: 1rem; font-weight: 600; margin: 0 0 1rem; }
.kontakt-form       { display: flex; flex-direction: column; gap: 1rem; }
.kontakt-checkboxes { border: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: .6rem; }
.kontakt-cb-label   { display: flex; align-items: flex-start; gap: .75rem; cursor: pointer; font-size: .95rem; line-height: 1.4; }
.kontakt-cb-label input[type="checkbox"] { position: absolute; opacity: 0; width: 0; height: 0; }
.kontakt-cb-box { flex-shrink: 0; width: 20px; height: 20px; border: 2px solid currentColor; background: transparent; margin-top: .1em; transition: background .15s; }
.kontakt-cb-label input:checked + .kontakt-cb-box { background: currentColor; }
.kontakt-fields { display: flex; flex-direction: column; gap: .65rem; }
.kontakt-fields input,
.kontakt-fields textarea { padding: .55rem .8rem; border: 1px solid #d1d5db; border-radius: 6px; font-family: inherit; font-size: .95rem; width: 100%; box-sizing: border-box; resize: vertical; }
.kontakt-submit { align-self: flex-start; padding: .65rem 2rem; background: #6366f1; color: #fff; border: none; border-radius: 6px; font-weight: 600; font-family: inherit; cursor: pointer; transition: background .2s; }
.kontakt-submit:hover { background: #4f46e5; }
.kontakt-submit:disabled { opacity: .6; cursor: not-allowed; }
.kontakt-feedback { font-size: .875rem; min-height: 1.4em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; }
@media (max-width: 768px) { .kontakt2-section { grid-template-columns: 1fr; gap: 2.5rem; } }`,
  },
];
