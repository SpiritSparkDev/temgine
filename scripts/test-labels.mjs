import pkg from '../lib/templateParser.js';
const { extractSnippetLabels, extractTemplateVariables } = pkg;

const templateCode = `<section class="page">
  <header>
    <h2>{{snippet:title[Titel]}}</h2>
  </header>
  {{snippet:text[Inhalt]}}
  <footer>Footer</footer>
</section>`;

console.log('🔍 Template Code:');
console.log(templateCode);
console.log('\n📋 Variables:');
const vars = extractTemplateVariables(templateCode);
console.log(vars);
console.log('\n🏷️ Labels:');
const labels = extractSnippetLabels(templateCode);
console.log(labels);
