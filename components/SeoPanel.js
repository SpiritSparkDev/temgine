import React, { useState, useEffect } from 'react';

/**
 * SeoPanel - SEO metadata editor for pages
 * Manages meta title, description, OG tags, robots, canonical URL
 */
export default function SeoPanel({
  pageData = {},
  onChange = null,
  slug = '',
}) {
  const [metaTitle, setMetaTitle] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [ogTitle, setOgTitle] = useState('');
  const [ogDescription, setOgDescription] = useState('');
  const [ogImage, setOgImage] = useState('');
  const [canonicalUrl, setCanonicalUrl] = useState('');
  const [robots, setRobots] = useState('index, follow');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Load SEO data from page data
  useEffect(() => {
    if (pageData.seo) {
      setMetaTitle(pageData.seo.metaTitle || '');
      setMetaDescription(pageData.seo.metaDescription || '');
      setOgTitle(pageData.seo.ogTitle || '');
      setOgDescription(pageData.seo.ogDescription || '');
      setOgImage(pageData.seo.ogImage || '');
      setCanonicalUrl(pageData.seo.canonicalUrl || '');
      setRobots(pageData.seo.robots || 'index, follow');
    }
  }, [pageData.seo]);

  const handleChange = (field, value) => {
    const updated = {
      ...pageData,
      seo: {
        ...(pageData.seo || {}),
        [field]: value,
      }
    };
    onChange?.(updated);
  };

  return (
    <div style={{
      backgroundColor: '#fff',
      borderRadius: '8px',
      border: '1px solid #ddd',
      padding: '16px',
      marginBottom: '16px',
    }}>
      <div
        onClick={() => setShowAdvanced(!showAdvanced)}
        style={{
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '1rem',
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        🔍 SEO Einstellungen
        <span style={{ fontSize: '0.85rem', marginLeft: 'auto', color: '#666' }}>
          {showAdvanced ? '▼' : '▶'}
        </span>
      </div>

      {showAdvanced && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Meta Title */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '4px',
            }}>
              Meta Title (50-60 Zeichen)
            </label>
            <input
              type="text"
              value={metaTitle}
              onChange={(e) => handleChange('metaTitle', e.target.value)}
              placeholder="Seitentitel für Suchmaschinen"
              maxLength="60"
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
              {metaTitle.length}/60
            </div>
          </div>

          {/* Meta Description */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '0.85rem',
              fontWeight: 600,
              marginBottom: '4px',
            }}>
              Meta Description (150-160 Zeichen)
            </label>
            <textarea
              value={metaDescription}
              onChange={(e) => handleChange('metaDescription', e.target.value)}
              placeholder="Kurze Beschreibung für Suchmaschinen"
              maxLength="160"
              rows={2}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.9rem',
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
              {metaDescription.length}/160
            </div>
          </div>

          {/* Open Graph Tags */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Open Graph (Social Media)</h5>

            <div style={{ marginBottom: '8px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '4px',
              }}>
                OG Title
              </label>
              <input
                type="text"
                value={ogTitle}
                onChange={(e) => handleChange('ogTitle', e.target.value)}
                placeholder={metaTitle || 'Seitentitel'}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '4px',
              }}>
                OG Description
              </label>
              <textarea
                value={ogDescription}
                onChange={(e) => handleChange('ogDescription', e.target.value)}
                placeholder={metaDescription || 'Seitenbeschreibung'}
                rows={2}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '4px',
              }}>
                OG Image URL
              </label>
              <input
                type="url"
                value={ogImage}
                onChange={(e) => handleChange('ogImage', e.target.value)}
                placeholder="https://example.com/image.jpg"
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* Advanced */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Erweitert</h5>

            <div style={{ marginBottom: '8px' }}>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '4px',
              }}>
                Canonical URL
              </label>
              <input
                type="url"
                value={canonicalUrl}
                onChange={(e) => handleChange('canonicalUrl', e.target.value)}
                placeholder="https://example.com/page"
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '0.85rem',
                fontWeight: 600,
                marginBottom: '4px',
              }}>
                Robots Meta Tag
              </label>
              <select
                value={robots}
                onChange={(e) => handleChange('robots', e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                }}
              >
                <option value="index, follow">Index and Follow (default)</option>
                <option value="index, nofollow">Index, No Follow</option>
                <option value="noindex, follow">No Index, Follow</option>
                <option value="noindex, nofollow">No Index, No Follow</option>
              </select>
            </div>
          </div>

          {/* Preview */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px', backgroundColor: '#f9f9f9', padding: '12px', borderRadius: '4px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Google Preview</h5>
            <div style={{ fontSize: '0.85rem', lineHeight: '1.4', color: '#1a0dab' }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {metaTitle || slug || 'Seitentitel'}
              </div>
              <div style={{ color: '#006621', marginBottom: '4px' }}>
                https://example.com/{slug || 'seite'}
              </div>
              <div style={{ color: '#545454' }}>
                {metaDescription || 'Hier wird die Meta-Beschreibung angezeigt...'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
