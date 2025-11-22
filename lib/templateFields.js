function getFieldsForTemplate(templateName) {
  // Keep mapping centralized here so tests can validate it
  if (templateName === 'StandardTemplate') {
    return ['title', 'text', 'images'];
  }
  if (templateName === 'MinimalTemplate') {
    return ['title'];
  }
  if (templateName === 'EinfacheSeite') {
    return ['title'];
  }
  return ['title', 'text', 'images']; // Default
}
// Export for CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getFieldsForTemplate };
}
// Also export as ES named export for bundlers that support it
try {
  // eslint-disable-next-line no-undef
  exports.getFieldsForTemplate = getFieldsForTemplate;
} catch (e) {}
