import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Plus, Trash2, Layout, Grid, Code2, Save, BookOpen, Sparkles, X, ChevronRight, Copy, RefreshCw, AlertTriangle, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { createButtonHandlers } from '../lib/insertHelper';
import TemplateStructurePreview from './TemplateStructurePreview';

const CodeEditor = dynamic(() => import('./CodeEditor'), { ssr: false });

const PRESET_CATEGORY_LABELS = {
  HERO: 'Hero / Banner',
  TEXT: 'Text-Blöcke',
  CARDS: 'Cards / Grid',
  LIST: 'Listen / Repeater',
};

const TEMPLATE_PRESETS = {
  HERO: [
    {
      label: 'Fullscreen Hero',
      description: 'Vollbild-Hero mit Titel, Untertitel und CTA-Button',
      code: `<section class="hero-fullscreen">
  <div class="hero-fullscreen__inner">
    {{#headline}}<h1 class="hero-fullscreen__title">{{headline}}</h1>{{/headline}}
    {{#subline}}<p class="hero-fullscreen__sub">{{subline}}</p>{{/subline}}
    {{#cta}}<a href="{{ctaUrl:url}}" class="hero-fullscreen__cta">{{cta}}</a>{{/cta}}
  </div>
</section>`,
      css: `.hero-fullscreen {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
  color: #f1f5f9;
  text-align: center;
  padding: 2rem;
}
.hero-fullscreen__inner { max-width: 800px; margin: 0 auto; }
.hero-fullscreen__title { font-size: clamp(2rem, 6vw, 4.5rem); font-weight: 800; margin: 0 0 1rem; line-height: 1.1; }
.hero-fullscreen__sub { font-size: 1.25rem; opacity: .75; margin: 0 0 2rem; }
.hero-fullscreen__cta { display: inline-block; padding: .875rem 2.5rem; background: #6366f1; color: #fff; border-radius: 50px; text-decoration: none; font-weight: 600; transition: background .2s; }
.hero-fullscreen__cta:hover { background: #4f46e5; }`,
    },
    {
      label: 'Split Hero',
      description: 'Text links, Bild rechts – zweispaltig',
      code: `<section class="hero-split">
  <div class="hero-split__text">
    {{#headline}}<h1 class="hero-split__title">{{headline}}</h1>{{/headline}}
    {{#subline}}<p class="hero-split__sub">{{subline}}</p>{{/subline}}
    {{#cta}}<a href="{{ctaUrl:url}}" class="hero-split__cta">{{cta}}</a>{{/cta}}
  </div>
  <div class="hero-split__image">
    {{#image}}<img src="{{image:image}}" alt="{{headline}}" class="hero-split__img">{{/image}}
  </div>
</section>`,
      css: `.hero-split { display: grid; grid-template-columns: 1fr 1fr; gap: 4rem; align-items: center; padding: 5rem 2rem; max-width: 1200px; margin: 0 auto; }
.hero-split__title { font-size: clamp(1.75rem, 4vw, 3rem); font-weight: 800; margin: 0 0 1rem; line-height: 1.15; }
.hero-split__sub { font-size: 1.1rem; color: #6b7280; margin: 0 0 2rem; }
.hero-split__cta { display: inline-block; padding: .75rem 2rem; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; transition: background .2s; }
.hero-split__cta:hover { background: #4f46e5; }
.hero-split__img { width: 100%; border-radius: 12px; object-fit: cover; }
@media (max-width: 768px) { .hero-split { grid-template-columns: 1fr; } }`,
    },
    {
      label: 'Minimal Banner',
      description: 'Schmales zentriertes Banner mit Eyebrow-Label',
      code: `<section class="banner-minimal">
  <div class="banner-minimal__inner">
    {{#eyebrow}}<span class="banner-minimal__eyebrow">{{eyebrow}}</span>{{/eyebrow}}
    {{#headline}}<h2 class="banner-minimal__title">{{headline}}</h2>{{/headline}}
    {{#subline}}<p class="banner-minimal__sub">{{subline}}</p>{{/subline}}
  </div>
</section>`,
      css: `.banner-minimal { padding: 4rem 2rem; text-align: center; border-bottom: 1px solid #e5e7eb; }
.banner-minimal__inner { max-width: 640px; margin: 0 auto; }
.banner-minimal__eyebrow { display: inline-block; font-size: .75rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #6366f1; margin-bottom: .75rem; }
.banner-minimal__title { font-size: clamp(1.5rem, 3.5vw, 2.5rem); font-weight: 800; margin: 0 0 .75rem; }
.banner-minimal__sub { font-size: 1.05rem; color: #6b7280; margin: 0; }`,
    },
  ],
  TEXT: [
    {
      label: 'Text + Bild',
      description: 'Zweispaltiger Block mit Rich-Text und Bild',
      code: `<section class="text-image-block">
  <div class="text-image-block__text">
    {{#headline}}<h2 class="text-image-block__title">{{headline}}</h2>{{/headline}}
    <div class="text-image-block__body">{{{content:textarea}}}</div>
  </div>
  <div class="text-image-block__media">
    {{#image}}<img src="{{image:image}}" alt="{{imageAlt}}" class="text-image-block__img">{{/image}}
  </div>
</section>`,
      css: `.text-image-block { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; align-items: center; padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; }
.text-image-block__title { font-size: 1.75rem; font-weight: 800; margin: 0 0 1rem; }
.text-image-block__body { color: #374151; line-height: 1.7; }
.text-image-block__img { width: 100%; border-radius: 10px; object-fit: cover; }
@media (max-width: 768px) { .text-image-block { grid-template-columns: 1fr; } }`,
    },
    {
      label: 'Zitat / Quote',
      description: 'Hervorgehobenes Blockzitat mit Autorenzeile',
      code: `<section class="quote-block">
  <blockquote class="quote-block__quote">
    {{{quote:textarea}}}
  </blockquote>
  {{#author}}<cite class="quote-block__author">— {{author}}</cite>{{/author}}
</section>`,
      css: `.quote-block { padding: 3rem 2rem; text-align: center; }
.quote-block__quote { font-size: clamp(1.25rem, 2.5vw, 2rem); font-style: italic; color: #374151; max-width: 800px; margin: 0 auto 1.5rem; }
.quote-block__author { font-size: .95rem; font-weight: 600; color: #9ca3af; font-style: normal; }`,
    },
    {
      label: 'Schritte / Steps',
      description: 'Nummerierte Schritt-Anleitung (Repeater)',
      code: `<section class="steps-block">
  {{#headline}}<h2 class="steps-block__title">{{headline}}</h2>{{/headline}}
  <ol class="steps-block__list">
    {{#each:steps}}
    <li class="steps-block__item">
      <div class="steps-block__num">{{number}}</div>
      <div class="steps-block__content">
        <h3 class="steps-block__step-title">{{title}}</h3>
        <p class="steps-block__step-text">{{description}}</p>
      </div>
    </li>
    {{/each:steps}}
  </ol>
</section>`,
      css: `.steps-block { padding: 4rem 2rem; max-width: 800px; margin: 0 auto; }
.steps-block__title { font-size: 2rem; font-weight: 800; margin: 0 0 2.5rem; text-align: center; }
.steps-block__list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2rem; }
.steps-block__item { display: flex; gap: 1.5rem; align-items: flex-start; }
.steps-block__num { width: 3rem; height: 3rem; border-radius: 50%; background: #6366f1; color: #fff; font-weight: 800; font-size: 1.1rem; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.steps-block__step-title { font-size: 1.1rem; font-weight: 700; margin: .25rem 0 .5rem; }
.steps-block__step-text { color: #6b7280; margin: 0; line-height: 1.6; }`,
    },
  ],
  CARDS: [
    {
      label: 'Feature Cards',
      description: '3-spaltiges Feature-Grid mit Icon, Titel, Text (Repeater)',
      code: `<section class="feature-cards">
  {{#headline}}<h2 class="feature-cards__title">{{headline}}</h2>{{/headline}}
  {{#subline}}<p class="feature-cards__sub">{{subline}}</p>{{/subline}}
  <div class="feature-cards__grid">
    {{#each:features}}
    <div class="feature-card">
      {{#icon}}<div class="feature-card__icon">{{icon}}</div>{{/icon}}
      <h3 class="feature-card__title">{{title}}</h3>
      <p class="feature-card__text">{{description}}</p>
    </div>
    {{/each:features}}
  </div>
</section>`,
      css: `.feature-cards { padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; text-align: center; }
.feature-cards__title { font-size: 2rem; font-weight: 800; margin: 0 0 .75rem; }
.feature-cards__sub { color: #6b7280; margin: 0 0 3rem; font-size: 1.05rem; }
.feature-cards__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem; }
.feature-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 2rem; text-align: left; transition: box-shadow .2s; }
.feature-card:hover { box-shadow: 0 8px 24px rgba(0,0,0,.08); }
.feature-card__icon { font-size: 2rem; margin-bottom: 1rem; }
.feature-card__title { font-size: 1.1rem; font-weight: 700; margin: 0 0 .5rem; }
.feature-card__text { color: #6b7280; margin: 0; line-height: 1.6; font-size: .95rem; }`,
    },
    {
      label: 'Preise / Pricing',
      description: 'Preistabelle mit mehreren Plänen (Repeater)',
      code: `<section class="pricing-section">
  {{#headline}}<h2 class="pricing-section__title">{{headline}}</h2>{{/headline}}
  <div class="pricing-grid">
    {{#each:plans}}
    <div class="pricing-card">
      <div class="pricing-card__name">{{name}}</div>
      <div class="pricing-card__price">{{price}}</div>
      <p class="pricing-card__desc">{{description}}</p>
      {{#cta}}<a href="{{ctaUrl:url}}" class="pricing-card__cta">{{cta}}</a>{{/cta}}
    </div>
    {{/each:plans}}
  </div>
</section>`,
      css: `.pricing-section { padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; text-align: center; }
.pricing-section__title { font-size: 2rem; font-weight: 800; margin: 0 0 3rem; }
.pricing-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
.pricing-card { background: #fff; border: 2px solid #e5e7eb; border-radius: 16px; padding: 2.5rem 2rem; display: flex; flex-direction: column; gap: .75rem; }
.pricing-card__name { font-size: .875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6366f1; }
.pricing-card__price { font-size: 2.5rem; font-weight: 900; margin: .25rem 0; }
.pricing-card__desc { color: #6b7280; font-size: .95rem; margin: 0; flex: 1; }
.pricing-card__cta { display: block; padding: .75rem 1.5rem; background: #6366f1; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 1rem; transition: background .2s; }
.pricing-card__cta:hover { background: #4f46e5; }`,
    },
    {
      label: 'Team-Grid',
      description: 'Team-Mitglieder als Karten-Grid (Repeater)',
      code: `<section class="team-grid-section">
  {{#headline}}<h2 class="team-grid-section__title">{{headline}}</h2>{{/headline}}
  <div class="team-grid">
    {{#each:members}}
    <div class="team-card">
      {{#photo}}<img src="{{photo:image}}" alt="{{name}}" class="team-card__photo">{{/photo}}
      <div class="team-card__name">{{name}}</div>
      <div class="team-card__role">{{role}}</div>
    </div>
    {{/each:members}}
  </div>
</section>`,
      css: `.team-grid-section { padding: 4rem 2rem; max-width: 1200px; margin: 0 auto; text-align: center; }
.team-grid-section__title { font-size: 2rem; font-weight: 800; margin: 0 0 3rem; }
.team-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem; }
.team-card { display: flex; flex-direction: column; align-items: center; gap: .75rem; }
.team-card__photo { width: 120px; height: 120px; border-radius: 50%; object-fit: cover; border: 4px solid #e5e7eb; }
.team-card__name { font-weight: 700; font-size: 1rem; }
.team-card__role { font-size: .875rem; color: #9ca3af; }`,
    },
  ],
  LIST: [
    {
      label: 'Icon-Liste',
      description: 'Vertikale Liste mit Icons und Beschreibung (Repeater)',
      code: `<section class="icon-list-section">
  {{#headline}}<h2 class="icon-list-section__title">{{headline}}</h2>{{/headline}}
  <ul class="icon-list">
    {{#each:items}}
    <li class="icon-list__item">
      <span class="icon-list__icon">{{icon}}</span>
      <div class="icon-list__content">
        <strong class="icon-list__title">{{title}}</strong>
        <p class="icon-list__text">{{description}}</p>
      </div>
    </li>
    {{/each:items}}
  </ul>
</section>`,
      css: `.icon-list-section { padding: 4rem 2rem; max-width: 800px; margin: 0 auto; }
.icon-list-section__title { font-size: 2rem; font-weight: 800; margin: 0 0 2rem; }
.icon-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 1.5rem; }
.icon-list__item { display: flex; gap: 1.25rem; align-items: flex-start; }
.icon-list__icon { font-size: 1.75rem; flex-shrink: 0; line-height: 1; }
.icon-list__title { display: block; font-weight: 700; margin-bottom: .25rem; }
.icon-list__text { color: #6b7280; margin: 0; line-height: 1.6; }`,
    },
    {
      label: 'FAQ',
      description: 'Häufige Fragen & Antworten (Repeater)',
      code: `<section class="faq-section">
  {{#headline}}<h2 class="faq-section__title">{{headline}}</h2>{{/headline}}
  <div class="faq-list">
    {{#each:faqs}}
    <div class="faq-item">
      <h3 class="faq-item__question">{{question}}</h3>
      <div class="faq-item__answer">{{{answer:textarea}}}</div>
    </div>
    {{/each:faqs}}
  </div>
</section>`,
      css: `.faq-section { padding: 4rem 2rem; max-width: 800px; margin: 0 auto; }
.faq-section__title { font-size: 2rem; font-weight: 800; margin: 0 0 2.5rem; text-align: center; }
.faq-list { display: flex; flex-direction: column; gap: .75rem; }
.faq-item { border: 1px solid #e5e7eb; border-radius: 10px; padding: 1.5rem; }
.faq-item__question { font-size: 1.05rem; font-weight: 700; margin: 0 0 .75rem; }
.faq-item__answer { color: #374151; line-height: 1.7; }
.faq-item__answer p { margin: 0; }`,
    },
    {
      label: 'Timeline',
      description: 'Vertikale Zeitleiste mit Datum und Ereignis (Repeater)',
      code: `<section class="timeline-section">
  {{#headline}}<h2 class="timeline-section__title">{{headline}}</h2>{{/headline}}
  <div class="timeline">
    {{#each:events}}
    <div class="timeline__item">
      <div class="timeline__marker"></div>
      <div class="timeline__content">
        <span class="timeline__date">{{date}}</span>
        <h3 class="timeline__title">{{title}}</h3>
        <p class="timeline__text">{{description}}</p>
      </div>
    </div>
    {{/each:events}}
  </div>
</section>`,
      css: `.timeline-section { padding: 4rem 2rem; max-width: 700px; margin: 0 auto; }
.timeline-section__title { font-size: 2rem; font-weight: 800; margin: 0 0 3rem; text-align: center; }
.timeline { position: relative; padding-left: 2rem; }
.timeline::before { content: ''; position: absolute; left: .5rem; top: 0; bottom: 0; width: 2px; background: #e5e7eb; }
.timeline__item { position: relative; padding-bottom: 2.5rem; }
.timeline__marker { position: absolute; left: -1.625rem; top: .25rem; width: 1rem; height: 1rem; border-radius: 50%; background: #6366f1; border: 3px solid #fff; box-shadow: 0 0 0 2px #6366f1; }
.timeline__date { font-size: .8rem; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .05em; }
.timeline__title { font-size: 1.05rem; font-weight: 700; margin: .25rem 0 .5rem; }
.timeline__text { color: #6b7280; margin: 0; line-height: 1.6; font-size: .95rem; }`,
    },
  ],
};

const SYSTEM_PLACEHOLDERS = [
  { label: 'Titel', snippet: '{{title}}' },
  { label: 'Slug', snippet: '{{slug}}' },
  { label: 'Autor', snippet: '{{data.author}}' },
  { label: 'Seitenkopf', snippet: '{{data.pageHeader}}' },
  { label: 'Kindseite', snippet: '{{isChild}}' },
  { label: 'Blöcke', snippet: '{{{blocks}}}' },
];

function extractVars(code) {
  const vars = new Set();
  const re = /\{\{\{?\s*([^#/>!{}\s][^{}]*?)\s*\}?\}\}/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const v = m[1].trim();
    if (v && !v.includes(' ') && !v.startsWith('!') && !v.startsWith('>')) vars.add(v);
  }
  return [...vars];
}

export default function TemplatesViewModern({ showToast, onSaved }) {
  const showDevHints = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devTitle = (text) => (showDevHints ? text : undefined);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateCode, setTemplateCode] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [rightTab, setRightTab] = useState('variables');
  const [isSaving, setIsSaving] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [presetCategory, setPresetCategory] = useState('HERO');
  const [pendingPresetCss, setPendingPresetCss] = useState(null);
  const [pendingPresetLabel, setPendingPresetLabel] = useState('');
  const [showCssDialog, setShowCssDialog] = useState(false);
  const [classRegistry, setClassRegistry] = useState(null);
  const [classRegistryLoading, setClassRegistryLoading] = useState(false);
  const [classSearch, setClassSearch] = useState('');
  const [copiedClass, setCopiedClass] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  function loadTemplates() {
    Promise.all([
      fetch('/api/templates').then(r => r.json()),
      fetch('/api/templates/order').then(r => r.json()).catch(() => ({ order: [] })),
    ]).then(([data, orderData]) => {
      let list = Array.isArray(data) ? data : [];
      if (list.length > 0 && typeof list[0] === 'string') {
        list = list.map(n => ({ name: n, type: 'BLOCK' }));
      }
      const order = Array.isArray(orderData.order) ? orderData.order : [];
      if (order.length > 0) {
        const ordered = [];
        order.forEach(name => {
          const t = list.find(x => x.name === name);
          if (t) ordered.push(t);
        });
        list.forEach(t => { if (!ordered.find(x => x.name === t.name)) ordered.push(t); });
        list = ordered;
      }
      setTemplates(list);
    }).catch(() => setTemplates([]));
  }

  function saveOrder(list) {
    fetch('/api/templates/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: list.map(t => t.name) }),
    }).catch(() => {});
  }

  function moveTemplate(fromIdx, toIdx) {
    if (fromIdx === toIdx || toIdx < 0 || toIdx >= templates.length) return;
    const next = [...templates];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setTemplates(next);
    if (selectedTemplate === fromIdx) setSelectedTemplate(toIdx);
    else if (selectedTemplate === toIdx) setSelectedTemplate(fromIdx);
    saveOrder(next);
    onSaved?.();
  }

  function handleNew() {
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateCode('<section class="my-section">\n  <div class="container">\n    <h1>{{title}}</h1>\n    <p>{{text}}</p>\n  </div>\n</section>');
    setIsEditing(true);
  }

  function handleEdit(name, index) {
    fetch(`/api/templates?name=${encodeURIComponent(name)}`)
      .then(r => r.json())
      .then(data => {
        setSelectedTemplate(index);
        setTemplateName(data.name);
        setTemplateCode(data.code);
        setIsEditing(true);
      })
      .catch(err => showToast('Fehler beim Laden: ' + err.message, 'error'));
  }

  function handleSave() {
    if (!templateName.trim()) {
      showToast('Bitte Template-Namen eingeben', 'error');
      return;
    }
    setIsSaving(true);
    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: templateName, code: templateCode, type: 'BLOCK' }),
    })
      .then(r => r.json())
      .then(() => {
        showToast('Template gespeichert!', 'success');
        loadTemplates();
        onSaved?.();
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'))
      .finally(() => setIsSaving(false));
  }

  function handleDelete(name, index) {
    fetch('/api/templates', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
      .then(() => {
        showToast('Template gelöscht', 'success');
        loadTemplates();
        onSaved?.();
        if (selectedTemplate === index) {
          setIsEditing(false);
          setSelectedTemplate(null);
        }
      })
      .catch(err => showToast('Fehler: ' + err.message, 'error'));
  }

  function handleCancel() {
    setIsEditing(false);
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateCode('');
  }

  function applyPreset(preset) {
    setTemplateCode(preset.code);
    if (!templateName) setTemplateName(preset.label);
    setIsEditing(true);
    setShowPresets(false);
    if (preset.css) {
      setPendingPresetCss(preset.css);
      setPendingPresetLabel(preset.label);
      setShowCssDialog(true);
    }
  }

  async function handleSaveCss() {
    try {
      let existingContent = '';
      const getRes = await fetch('/api/css?file=generic.css');
      if (getRes.ok) {
        const data = await getRes.json();
        existingContent = data.content || '';
      }
      const separator = existingContent.trim()
        ? `\n\n/* --- Preset: ${pendingPresetLabel} --- */\n`
        : `/* --- Preset: ${pendingPresetLabel} --- */\n`;
      const combined = existingContent.trim()
        ? existingContent + separator + pendingPresetCss
        : separator + pendingPresetCss;
      await fetch('/api/css', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'generic.css', content: combined }),
      });
      showToast('CSS in generic.css gespeichert!', 'success');
    } catch (e) {
      showToast('CSS konnte nicht gespeichert werden: ' + e.message, 'error');
    } finally {
      setShowCssDialog(false);
      setPendingPresetCss(null);
      setPendingPresetLabel('');
    }
  }

  async function loadClassRegistry() {
    setClassRegistryLoading(true);
    try {
      const res = await fetch('/api/css/classes');
      if (res.ok) {
        const data = await res.json();
        setClassRegistry(data);
      } else {
        showToast('CSS-Klassen konnten nicht geladen werden', 'error');
      }
    } catch (e) {
      showToast('Fehler beim Laden der CSS-Klassen: ' + e.message, 'error');
    } finally {
      setClassRegistryLoading(false);
    }
  }

  function handleCopyClass(className) {
    navigator.clipboard.writeText(className).then(() => {
      setCopiedClass(className);
      setTimeout(() => setCopiedClass(null), 1500);
    }).catch(() => {
      showToast('Kopieren nicht möglich', 'error');
    });
  }

  const extractedVars = isEditing ? extractVars(templateCode) : [];
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredTemplates = templates.filter(
    (t) => !normalizedSearch || t.name.toLowerCase().includes(normalizedSearch)
  );

  return (
    <>
    <div className="tce-root">
      {/* TOP TOOLBAR */}
      <div className="tce-toolbar">
        <div className="tce-toolbar-left">
          <Layout size={16} className="tce-toolbar-icon" aria-hidden="true" />
          {isEditing ? (
            <input
              type="text"
              className="tce-name-input"
              placeholder="Template-Name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              aria-label="Template-Name"
              title={devTitle('Feld: Template-Name')}
            />
          ) : (
            <span className="tce-toolbar-title">Block-Templates</span>
          )}
        </div>
        <div className="tce-toolbar-right">
          <button
            className={`tce-btn tce-btn-ghost${showPresets ? ' tce-btn-active' : ''}`}
            onClick={() => setShowPresets(v => !v)}
            title="Preset-Galerie öffnen"
            aria-label="Preset-Galerie öffnen"
          >
            <Sparkles size={13} aria-hidden="true" />
            Presets
          </button>
          <button
            className="tce-btn tce-btn-ghost"
            onClick={handleNew}
            title={devTitle('Neues Template anlegen')}
            aria-label="Neues Template anlegen"
          >
            <Plus size={13} aria-hidden="true" />
            Neu
          </button>
          {isEditing && (
            <>
              <button
                className="tce-btn tce-btn-ghost"
                onClick={handleCancel}
                title={devTitle('Änderungen verwerfen')}
              >
                Abbrechen
              </button>
              <button
                className="tce-btn tce-btn-primary"
                onClick={handleSave}
                disabled={isSaving}
                title={devTitle('Template speichern')}
              >
                <Save size={13} aria-hidden="true" />
                {isSaving ? 'Speichern…' : 'Speichern'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* BODY: 3 columns */}
      <div className="tce-body">
        {/* LEFT: Template list */}
        <div className="tce-list-panel">
          <div className="tce-list-header">
            <input
              className="tce-search-input"
              type="text"
              placeholder="Suchen…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Template suchen"
            />
          </div>
          <div className="tce-list-body">
            {templates.length === 0 ? (
              <div className="tce-list-empty">Keine Templates vorhanden</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="tce-list-empty">Keine Treffer für „{searchTerm}"</div>
            ) : (
              filteredTemplates.map((t) => {
                const index = templates.findIndex((x) => x.name === t.name);
                const canReorder = !normalizedSearch;
                const isDragging = dragIndex === index;
                const isDragOver = canReorder && dragOverIndex === index && dragIndex !== index;
                return (
                  <div
                    key={t.name}
                    className={`tce-list-item${selectedTemplate === index && isEditing ? ' active' : ''}${isDragging ? ' tce-list-item--dragging' : ''}${isDragOver ? ' tce-list-item--drag-over' : ''}`}
                    onClick={() => handleEdit(t.name, index)}
                    role="button"
                    tabIndex={0}
                    aria-label={`Template ${t.name} bearbeiten`}
                    title={devTitle(`Template ${t.name} öffnen`)}
                    draggable={canReorder}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIndex(index); }}
                    onDragOver={(e) => { if (canReorder) { e.preventDefault(); setDragOverIndex(index); } }}
                    onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) moveTemplate(dragIndex, index); setDragIndex(null); setDragOverIndex(null); }}
                    onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleEdit(t.name, index);
                      }
                    }}
                  >
                    {canReorder
                      ? <GripVertical size={12} className="tce-item-grip" aria-hidden="true" />
                      : <Grid size={12} className="tce-item-icon" aria-hidden="true" />
                    }
                    <span className="tce-item-name">{t.name}</span>
                    {canReorder && (
                      <span className="tce-item-order-btns" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="tce-item-order-btn"
                          onClick={() => moveTemplate(index, index - 1)}
                          disabled={index === 0}
                          aria-label="Nach oben"
                          title="Nach oben"
                        >
                          <ChevronUp size={10} />
                        </button>
                        <button
                          className="tce-item-order-btn"
                          onClick={() => moveTemplate(index, index + 1)}
                          disabled={index === templates.length - 1}
                          aria-label="Nach unten"
                          title="Nach unten"
                        >
                          <ChevronDown size={10} />
                        </button>
                      </span>
                    )}
                    <button
                      className="tce-item-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(t.name, index);
                      }}
                      aria-label={`Template ${t.name} löschen`}
                      title="Löschen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* CENTER: Code editor */}
        <div className="tce-code-panel">
          {isEditing ? (
            <>
              <div className="tce-code-tabs">
                <div className="tce-code-tab active">
                  <Code2 size={11} aria-hidden="true" />
                  <span>{templateName || 'unbenannt'}.html</span>
                </div>
              </div>
              <div className="tce-code-body">
                <CodeEditor
                  height="100%"
                  language="html"
                  value={templateCode}
                  onChange={(value) => setTemplateCode(value || '')}
                  options={{}}
                />
              </div>
              <div className="tce-statusbar">
                <span className="tce-status-item">HTML</span>
                <span className="tce-status-sep">·</span>
                <span className="tce-status-item">UTF-8</span>
                <span className="tce-status-sep">·</span>
                <span className="tce-status-type">BLOCK</span>
              </div>
            </>
          ) : (
            <div className="tce-empty-state">
              <Layout size={48} strokeWidth={1} aria-hidden="true" />
              <h3>Wähle ein Template</h3>
              <p>oder erstelle ein neues mit <strong>Neu</strong></p>
            </div>
          )}
        </div>

        {/* RIGHT: Properties panel (only when editing) */}
        {isEditing && (
          <div className="tce-props-panel">
            <div className="tce-props-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={rightTab === 'variables'}
                className={`tce-props-tab${rightTab === 'variables' ? ' active' : ''}`}
                onClick={() => setRightTab('variables')}
              >
                Variablen
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'structure'}
                className={`tce-props-tab${rightTab === 'structure' ? ' active' : ''}`}
                onClick={() => setRightTab('structure')}
              >
                Struktur
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'settings'}
                className={`tce-props-tab${rightTab === 'settings' ? ' active' : ''}`}
                onClick={() => setRightTab('settings')}
              >
                Settings
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'referenz'}
                className={`tce-props-tab${rightTab === 'referenz' ? ' active' : ''}`}
                onClick={() => setRightTab('referenz')}
              >
                <BookOpen size={11} aria-hidden="true" />
                Referenz
              </button>
              <button
                role="tab"
                aria-selected={rightTab === 'klassen'}
                className={`tce-props-tab${rightTab === 'klassen' ? ' active' : ''}`}
                onClick={() => {
                  setRightTab('klassen');
                  if (!classRegistry) loadClassRegistry();
                }}
              >
                <Copy size={11} aria-hidden="true" />
                Klassen
              </button>
            </div>

            <div className="tce-props-body">
              {rightTab === 'variables' && (
                <div className="tce-vars">
                  <div className="tce-vars-section">
                    <div className="tce-vars-title">Systemwerte</div>
                    {SYSTEM_PLACEHOLDERS.map((s) => (
                      <div key={s.label} className="tce-var-row">
                        <span className="tce-var-code">{s.snippet}</span>
                        <button
                          className="tce-var-insert-btn"
                          {...createButtonHandlers(s.snippet, () =>
                            setTemplateCode((c) => c + s.snippet)
                          )}
                          aria-label={`${s.label} einfügen`}
                          title={devTitle(`Systemwert ${s.label} einfügen`)}
                        >
                          {s.label}
                        </button>
                      </div>
                    ))}
                  </div>

                  {extractedVars.length > 0 && (
                    <div className="tce-vars-section">
                      <div className="tce-vars-title">Im Template erkannt</div>
                      {extractedVars.map((v) => (
                        <div key={v} className="tce-var-row tce-var-row--detected">
                          <span className="tce-var-code">{`{{${v}}}`}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {rightTab === 'structure' && (
                <div className="tce-structure-tab">
                  <TemplateStructurePreview code={templateCode} />
                </div>
              )}

              {rightTab === 'referenz' && (
                <div className="tce-ref-tab">

                  <div className="tce-ref-group">
                    <div className="tce-ref-heading">Typen-Annotationen</div>
                    <table className="tce-ref-table">
                      <tbody>
                        <tr><td><code>:text</code></td><td>Einzeiliges Textfeld</td></tr>
                        <tr><td><code>:textarea</code></td><td>Richtext-Editor</td></tr>
                        <tr><td><code>:number</code></td><td>Zahlenfeld</td></tr>
                        <tr><td><code>:url</code></td><td>URL + Datei-Picker</td></tr>
                        <tr><td><code>:image</code></td><td>Bildpfad-Picker</td></tr>
                        <tr><td><code>:date</code></td><td>Datumsfeld</td></tr>
                        <tr><td><code>:color</code></td><td>Farbauswahl</td></tr>
                        <tr><td><code>:array</code></td><td>Liste (zeilenweise)</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="tce-ref-group">
                    <div className="tce-ref-heading">Systemvariablen</div>
                    <table className="tce-ref-table">
                      <tbody>
                        <tr><td><code>{'{{page.title}}'}</code></td><td>Seitentitel</td></tr>
                        <tr><td><code>{'{{page.slug}}'}</code></td><td>Seiten-Slug</td></tr>
                        <tr><td><code>{'{{inner}}'}</code></td><td>HTML der Kindblöcke</td></tr>
                        <tr><td><code>{'{{{nav:main}}}'}</code></td><td>Hauptnavigation (HTML)</td></tr>
                        <tr><td><code>{'{{{nav:page}}}'}</code></td><td>Seitennavigation (HTML)</td></tr>
                        <tr><td><code>{'{{{nav:mobile}}}'}</code></td><td>Mobile-Navigation (HTML)</td></tr>
                        <tr><td><code>{'{{{nav:auto}}}'}</code></td><td>Auto-Nav aus Seitenbaum</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="tce-ref-group">
                    <div className="tce-ref-heading">Mustache-Syntax</div>
                    <table className="tce-ref-table">
                      <tbody>
                        <tr><td><code>{'{{var}}'}</code></td><td>Variable (escaped)</td></tr>
                        <tr><td><code>{'{{{'}<span>{'var}'}</span>{'}'}</code></td><td>Variable (HTML roh)</td></tr>
                        <tr><td><code>{'{{#s}}…{{/s}}'}</code></td><td>Abschnitt / Schleife</td></tr>
                        <tr><td><code>{'{{^s}}…{{/s}}'}</code></td><td>Invertierter Abschnitt</td></tr>
                        <tr><td><code>{'{{#hasChildren}}'}</code></td><td>Wenn Unterseiten existieren</td></tr>
                        <tr><td><code>{'{{#children}}'}</code></td><td>Unterseiten iterieren</td></tr>
                        <tr><td><code>{'{{#pages}}'}</code></td><td>Nav-Seiten iterieren</td></tr>
                      </tbody>
                    </table>
                  </div>

                </div>
              )}

              {rightTab === 'settings' && (
                <div className="tce-settings-tab">
                  <div className="tce-setting-group">
                    <label className="tce-setting-label" htmlFor="tce-settings-name">
                      Name
                    </label>
                    <input
                      id="tce-settings-name"
                      type="text"
                      className="tce-setting-input"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                    />
                  </div>
                  <div className="tce-setting-group">
                    <span className="tce-setting-label">Typ</span>
                    <div className="tce-type-badge">BLOCK</div>
                  </div>
                </div>
              )}

              {rightTab === 'klassen' && (
                <div className="tce-class-registry">
                  <div className="tce-class-registry-toolbar">
                    <input
                      type="text"
                      className="tce-class-search"
                      placeholder="Klasse suchen…"
                      value={classSearch}
                      onChange={(e) => setClassSearch(e.target.value)}
                      aria-label="CSS-Klasse suchen"
                    />
                    <button
                      className="tce-class-refresh-btn"
                      onClick={loadClassRegistry}
                      disabled={classRegistryLoading}
                      aria-label="Klassen neu laden"
                      title="Aktualisieren"
                    >
                      <RefreshCw size={13} className={classRegistryLoading ? 'tce-spin' : ''} />
                    </button>
                  </div>

                  {classRegistryLoading && (
                    <div className="tce-class-loading">Lade CSS-Klassen…</div>
                  )}

                  {!classRegistryLoading && classRegistry && (() => {
                    const q = classSearch.trim().toLowerCase();
                    const duplicateSet = new Set(
                      (classRegistry.duplicates || []).map((d) => d.className)
                    );
                    const duplicateFiles = Object.fromEntries(
                      (classRegistry.duplicates || []).map((d) => [d.className, d.files])
                    );

                    const filteredFiles = classRegistry.files
                      .map((f) => ({
                        ...f,
                        classes: f.classes.filter(
                          ({ className }) => !q || className.toLowerCase().includes(q)
                        ),
                      }))
                      .filter((f) => f.classes.length > 0);

                    if (filteredFiles.length === 0) {
                      return (
                        <div className="tce-class-empty">
                          {q ? `Keine Klassen für „${classSearch}"` : 'Keine CSS-Klassen gefunden'}
                        </div>
                      );
                    }

                    return filteredFiles.map((file) => {
                      // Group by section (Preset comments)
                      const bySection = {};
                      for (const item of file.classes) {
                        const sec = item.section || '__root__';
                        if (!bySection[sec]) bySection[sec] = [];
                        bySection[sec].push(item.className);
                      }

                      return (
                        <div key={file.name} className="tce-class-file-section">
                          <div className="tce-class-file-heading">
                            <span className="tce-class-file-name">{file.name}</span>
                            <span className="tce-class-count">{file.classes.length}</span>
                          </div>
                          {Object.entries(bySection).map(([section, classes]) => (
                            <div key={section} className="tce-class-subsection">
                              {section !== '__root__' && (
                                <div className="tce-class-section-label">{section}</div>
                              )}
                              <div className="tce-class-chips">
                                {classes.map((cls) => {
                                  const isDup = duplicateSet.has(cls);
                                  const isCopied = copiedClass === cls;
                                  return (
                                    <button
                                      key={cls}
                                      className={`tce-class-chip${isDup ? ' tce-class-chip--duplicate' : ''}${isCopied ? ' tce-class-chip--copied' : ''}`}
                                      onClick={() => handleCopyClass(cls)}
                                      title={isDup ? `Auch in: ${duplicateFiles[cls].filter((f) => f !== file.name).join(', ')}` : 'Klick zum Kopieren'}
                                    >
                                      {isCopied ? '✓' : isDup ? <AlertTriangle size={9} aria-hidden="true" /> : null}
                                      {isCopied ? 'Kopiert!' : cls}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      );
                    });
                  })()}

                  {!classRegistryLoading && !classRegistry && (
                    <div className="tce-class-empty">Klassen werden beim ersten Öffnen geladen.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>

      {/* Preset Gallery Overlay */}
      {showPresets && (
        <div className="tce-preset-overlay" role="dialog" aria-modal="true" aria-label="Template-Presets">
          <div className="tce-preset-panel">
            <div className="tce-preset-header">
              <div className="tce-preset-title">
                <Sparkles size={15} aria-hidden="true" />
                Template-Presets
              </div>
              <div className="tce-preset-cats">
                {Object.entries(PRESET_CATEGORY_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    className={`tce-preset-cat${presetCategory === key ? ' active' : ''}`}
                    onClick={() => setPresetCategory(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                className="tce-preset-close"
                onClick={() => setShowPresets(false)}
                aria-label="Presets schließen"
              >
                <X size={16} />
              </button>
            </div>
            <div className="tce-preset-grid">
              {(TEMPLATE_PRESETS[presetCategory] || []).map((preset, i) => (
                <button
                  key={i}
                  className="tce-preset-card"
                  onClick={() => applyPreset(preset)}
                  title={`Preset "${preset.label}" anwenden`}
                >
                  <div className="tce-preset-card__label">{preset.label}</div>
                  <div className="tce-preset-card__desc">{preset.description}</div>
                  {preset.css && <span className="tce-preset-card__css-badge">CSS</span>}
                  <ChevronRight size={14} className="tce-preset-card__arrow" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* CSS Confirm Dialog */}
      {showCssDialog && (
        <div className="tce-css-dialog-overlay" role="dialog" aria-modal="true">
          <div className="tce-css-dialog">
            <div className="tce-css-dialog__icon"><Sparkles size={22} /></div>
            <h3 className="tce-css-dialog__title">CSS generieren?</h3>
            <p className="tce-css-dialog__text">
              Soll passendes CSS für <strong>{pendingPresetLabel}</strong> an{' '}
              <code>generic.css</code> angehängt werden?
            </p>
            <div className="tce-css-dialog__actions">
              <button className="tce-btn tce-btn-primary" onClick={handleSaveCss}>
                Ja, generieren
              </button>
              <button
                className="tce-btn tce-btn-ghost"
                onClick={() => { setShowCssDialog(false); setPendingPresetCss(null); setPendingPresetLabel(''); }}
              >
                Nein, danke
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
