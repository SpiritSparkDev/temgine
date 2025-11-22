import React, { useEffect, useRef } from 'react';
import { renderTemplate, getPreviewData } from '../lib/templateEngine';

// Template Preview mit Mustache-Engine
// Unterstützt Mustache-Syntax: {{variable}}, {{#blocks}}...{{/blocks}}, etc.
export default function TemplatePreviewIframe({ code, height = 400 }) {
  const iframeRef = useRef(null);

  const srcLines = [
    '<!doctype html>',
    '<html>',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <meta name="viewport" content="width=device-width,initial-scale=1" />',
    '    <style>html,body,#root{margin:0;padding:0;height:100%} #root{font-family:sans-serif;padding:8px;color:#111}</style>',
    '  </head>',
    '  <body>',
    '    <div id="root">Preview loading...<\/div>',
    '    <script src="https://unpkg.com/react@18/umd/react.development.js"><\/script>',
    '    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"><\/script>',
    '    <script src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>',
    '    <script>',
    '      // Basic sanitizer: remove script tags, event-handler attributes, style attributes and javascript: urls',
    '      function sanitizeHtml(html) {',
    '        try {',
    '          const doc = new DOMParser().parseFromString(html, "text/html");',
    '          const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null, false);',
    '          const toRemove = [];',
    '          while (walker.nextNode()) {',
    '            const el = walker.currentNode;',
    '            const tag = el.tagName && el.tagName.toLowerCase();',
    '            // remove dangerous / active tags entirely',
    '            if (tag === "script" || tag === "iframe" || tag === "object" || tag === "embed" || tag === "link" || tag === "meta" || tag === "base") { toRemove.push(el); continue; }',
    '            // remove inline event handlers and style for safety',
    '            const attrs = Array.from(el.attributes || []);',
    '            attrs.forEach(function(a){',
    '              const name = a.name.toLowerCase();',
    '              const val = String(a.value || "").trim().toLowerCase();',
    '              if (name.startsWith("on")) { el.removeAttribute(a.name); return; }',
    '              if ((name === "href" || name === "src") && val.indexOf("javascript:") === 0) { el.removeAttribute(a.name); return; }',
    '              if (name === "style") { el.removeAttribute(a.name); return; }',
    '            });',
    '          }',
    '          toRemove.forEach(function(n){ n.parentNode && n.parentNode.removeChild(n); });',
    '          return doc.body.innerHTML;',
    '        } catch (e) { return ""; }',
    '      }',

    '      function renderFromCode(code) {',
    '        const root = document.getElementById("root");',
    '        try {',
    '          root.innerHTML = "";',
    '          const isHtml = /<[^>]+>/.test(code || "") && (code || "").indexOf("export default") === -1;',
    '          const dummyBlocks = [',
    '            { type: "hero", props: { title: "Demo Titel", text: "Dies ist ein Beispieltext für die Live-Vorschau.", images: ["https://picsum.photos/seed/1/600/200"] } },',
    '            { type: "text", props: { title: "Abschnitt", text: "Mehr Beispielinhalt, um das Template zu füllen." } },',
    '            { type: "cards", props: { title: "Karten", text: "Drei Karten-Beispiele", images: ["https://picsum.photos/seed/2/200/120","https://picsum.photos/seed/3/200/120","https://picsum.photos/seed/4/200/120"] } }',
    '          ];',

    '          if (isHtml) {',
    '            const blocksHtml = dummyBlocks.map(function(b){',
    '              if (b.type === "hero") return "<section class=\"tpl-hero\"><h1>" + b.props.title + "</h1><p>" + b.props.text + "</p><img src=\"" + b.props.images[0] + "\" alt=\"\" style=\"max-width:100%;height:auto\"/></section>";',
    '              if (b.type === "text") return "<section class=\"tpl-text\"><h3>" + b.props.title + "</h3><p>" + b.props.text + "</p></section>";',
    '              if (b.type === "cards") return "<section class=\"tpl-cards\"><h3>" + b.props.title + "</h3><p>" + b.props.text + "</p><div class=\"cards\">" + ((b.props.images||[]).map(function(src){ return "<img src=\"" + src + "\" style=\"width:120px;height:80px;object-fit:cover;margin-right:8px\"/>"; }).join("")) + "</div></section>";',
    '              return "<div>" + JSON.stringify(b) + "</div>";',
    '            }).join("\n");',

    '            const loopRe = /{{#blocks}}([\s\S]*?){{\/blocks}}/;',
    '            let out;',
    '            const loopMatch = (code || "").match(loopRe);',
    '            if (loopMatch) {',
    '              const inner = loopMatch[1];',
    '              const rendered = dummyBlocks.map(function(b){',
    '                return inner.replace(/{{\s*([^}\s]+)\s*}}/g, function(_, key){',
    '                  function getVal(obj, k) {',
    '                    const parts = k.split(".");',
    '                    let cur = obj;',
    '                    for (let p of parts) {',
    '                      if (cur == null) return "";',
    '                      if (/^\d+$/.test(p)) { cur = cur[parseInt(p,10)]; }',
    '                      else { cur = (cur[p] !== undefined) ? cur[p] : (cur.props && cur.props[p] !== undefined ? cur.props[p] : ""); }',
    '                    }',
    '                    return cur == null ? "" : cur;',
    '                  }',
    '                  return String(getVal(b, key));',
    '                });',
    '              }).join("");',
    '              out = (code || "").replace(loopRe, rendered);',
    '            } else {',
    '              out = (code || "").replace("{{blocks}}", blocksHtml);',
    '            }',

    '            // sanitize before injecting',
    '            const safe = sanitizeHtml(out);',
    '            root.innerHTML = safe;',

    '            // hover handlers (include bounding rect)',
    '            function nodePath(n) { if (!n || n.id === "root") return "root"; let idx = 0; let sib = n; while (sib.previousElementSibling) { sib = sib.previousElementSibling; idx++; } return nodePath(n.parentElement) + ">" + n.tagName.toLowerCase() + "["+idx+"]"; }',
    '            function onMouseOver(ev) { try { const t = ev.target; if (!t || t.id === "root") return; const path = nodePath(t); const rect = t.getBoundingClientRect(); const info = { type: "hover", tag: t.tagName.toLowerCase(), path, text: (t.innerText||"").slice(0,120), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }; window.parent.postMessage(info, "*"); } catch(e){} }',
    '            function onMouseOut() { try { window.parent.postMessage({ type: "hover", path: null }, "*"); } catch(e) {} }',
    '            const rootEl = document.getElementById("root");',
    '            if (rootEl) {',
    '              if (rootEl.__hover_attached) { rootEl.removeEventListener("mouseover", rootEl.__hover_attached); rootEl.removeEventListener("mouseout", rootEl.__hover_out_attached); }',
    '              rootEl.addEventListener("mouseover", onMouseOver);',
    '              rootEl.addEventListener("mouseout", onMouseOut);',
    '              rootEl.__hover_attached = onMouseOver;',
    '              rootEl.__hover_out_attached = onMouseOut;',
    '            }',
    '            return;',
    '          }',

    '          // React fallback',
    '          let Comp = null;',
    '          if ((code || "").indexOf("export default") !== -1) {',
    '            const safe = (code || "").replace("export default", "window.__TemplateDefault =");',
    '            try { window.__TemplateDefault = undefined; } catch (e) {}',
    '            const transformed = Babel.transform(safe, { presets: ["react"] }).code;',
    '            // eslint-disable-next-line no-eval',
    '            eval(transformed);',
    '            Comp = window.__TemplateDefault;',
    '          } else {',
    '            const wrapped = "(function(){\\nreturn (" + (code || "") + ")\\n})()";',
    '            const transformed = Babel.transform(wrapped, { presets: ["react"] }).code;',
    '            // eslint-disable-next-line no-eval',
    '            Comp = eval(transformed);',
    '          }',

    '          if (!Comp) { root.innerText = "No preview produced."; return; }',
    '          const el = (typeof Comp === "function") ? React.createElement(Comp, { blocks: dummyBlocks }) : Comp;',
    '          ReactDOM.createRoot(root).render(el);',

    '          // attach hover handlers after React render',
    '          try {',
    '            function nodePath2(n) { if (!n || n.id === "root") return "root"; let idx = 0; let sib = n; while (sib.previousElementSibling) { sib = sib.previousElementSibling; idx++; } return nodePath2(n.parentElement) + ">" + n.tagName.toLowerCase() + "["+idx+"]"; }',
    '            function onMouseOver2(ev) { try { const t = ev.target; if (!t || t.id === "root") return; const path = nodePath2(t); const rect = t.getBoundingClientRect(); const info = { type: "hover", tag: t.tagName.toLowerCase(), path, text: (t.innerText||"").slice(0,120), rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }; window.parent.postMessage(info, "*"); } catch(e){} }',
    '            function onMouseOut2() { try { window.parent.postMessage({ type: "hover", path: null }, "*"); } catch(e) {} }',
    '            const rootEl2 = document.getElementById("root");',
    '            if (rootEl2) {',
    '              if (rootEl2.__hover_attached) { rootEl2.removeEventListener("mouseover", rootEl2.__hover_attached); rootEl2.removeEventListener("mouseout", rootEl2.__hover_out_attached); }',
    '              rootEl2.addEventListener("mouseover", onMouseOver2);',
    '              rootEl2.addEventListener("mouseout", onMouseOut2);',
    '              rootEl2.__hover_attached = onMouseOver2;',
    '              rootEl2.__hover_out_attached = onMouseOut2;',
    '            }',
    '          } catch (e) { /* ignore */ }',
    '        } catch (err) { root.innerText = "Preview error: " + (err && err.message); console.error(err); }',
    '      }',

    '      window.addEventListener("message", (ev) => {',
    '        try { if (!ev.data) return; if (ev.data.type === "updateCode") { renderFromCode(ev.data.code || ev.data.template || ""); } } catch (e) { console.error(e); }',
    '      }, false);',

    '      window.parent.postMessage({ type: "previewReady" }, "*");',
    '    <\/script>',
    '  </body>',
    '</html>'
  ];

  // Rendere Template mit Mustache-Engine
  const previewData = getPreviewData();
  const renderedHtml = renderTemplate(code || '<div>{{title}}</div>', previewData);

  const simpleSrcDoc = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>
        html, body { margin: 0; padding: 0; font-family: sans-serif; }
        body { padding: 16px; background: #fff; color: #333; }
        img { max-width: 100%; height: auto; }
        .gallery { display: flex; gap: 8px; flex-wrap: wrap; }
        .gallery img { max-width: 200px; }
      </style>
    </head>
    <body>
      ${renderedHtml}
    </body>
    </html>
  `;

  return (
    <div className="template-preview-wrapper">
      <iframe
        ref={iframeRef}
        title="Template Preview"
        sandbox="allow-scripts"
        className="template-preview-iframe"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        srcDoc={simpleSrcDoc}
      />
    </div>
  );
}
