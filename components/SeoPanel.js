import React, { useState, useEffect, useMemo } from 'react';

const RECOMMENDED_OG_WIDTH = 1200;
const RECOMMENDED_OG_HEIGHT = 630;
const RECOMMENDED_RATIO = RECOMMENDED_OG_WIDTH / RECOMMENDED_OG_HEIGHT;

const labelStyle = {
  display: 'block',
  fontSize: '0.85rem',
  fontWeight: 600,
  marginBottom: '4px',
};

const inputStyle = {
  width: '100%',
  padding: '8px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
};

// Grün = im empfohlenen Bereich, Amber = zu kurz/zu lang (Google schneidet
// zu lange Titel/Beschreibungen in den Suchergebnissen ab).
function lengthIndicatorColor(len, min, max) {
  if (len === 0) return '#666';
  if (len < min || len > max) return '#b45309';
  return '#15803d';
}

/**
 * SeoPanel - SEO metadata editor for pages
 * Manages meta title, description, OG tags, robots, canonical URL,
 * and shows how the page will look in search results and when shared
 * on social platforms.
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
  const [twitterTitle, setTwitterTitle] = useState('');
  const [twitterDescription, setTwitterDescription] = useState('');
  const [twitterImage, setTwitterImage] = useState('');
  const [sitemapPriority, setSitemapPriority] = useState('');
  const [sitemapChangefreq, setSitemapChangefreq] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Website-weite Standardwerte (Einstellungen > SEO) — greifen als Fallback,
  // wenn diese Seite kein eigenes Meta-Bild/-Beschreibung hinterlegt hat.
  const [siteDefaults, setSiteDefaults] = useState({
    siteName: '',
    defaultDescription: '',
    defaultOgImage: '',
    twitterHandle: '',
  });

  // Herkunft (Protokoll+Host) der Seite, für die Link-Vorschauen und
  // Debug-Tool-Links. Erst im Browser bekannt, daher useState+useEffect.
  const [origin, setOrigin] = useState('');

  const [imageMeta, setImageMeta] = useState(null);

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
      setTwitterTitle(pageData.seo.twitterTitle || '');
      setTwitterDescription(pageData.seo.twitterDescription || '');
      setTwitterImage(pageData.seo.twitterImage || '');
      setSitemapPriority(pageData.seo.sitemapPriority || '');
      setSitemapChangefreq(pageData.seo.sitemapChangefreq || '');
    }
  }, [pageData.seo]);

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        setSiteDefaults({
          siteName: data.seo_site_name || '',
          defaultDescription: data.seo_default_description || '',
          defaultOgImage: data.seo_default_og_image || '',
          twitterHandle: data.seo_twitter_handle || '',
        });
      })
      .catch(() => {});
  }, []);

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

  // Effektive Werte: Seiten-Override -> Website-Standard -> generischer Fallback.
  // Genau die Kette, die später auch beim serverseitigen Rendering greift.
  const usingDefaultImage = !ogImage && !!siteDefaults.defaultOgImage;
  const effectiveDescription = metaDescription || siteDefaults.defaultDescription || '';
  const effectiveOgImage = ogImage || siteDefaults.defaultOgImage || '';
  const effectiveOgTitle = ogTitle || metaTitle || slug || 'Seitentitel';
  const effectiveOgDescription = ogDescription || effectiveDescription || 'Seitenbeschreibung';
  const effectiveTwitterTitle = twitterTitle || effectiveOgTitle;
  const effectiveTwitterDescription = twitterDescription || effectiveOgDescription;
  const effectiveTwitterImage = twitterImage || effectiveOgImage;

  const domain = useMemo(() => (origin ? origin.replace(/^https?:\/\//, '') : 'example.com'), [origin]);
  const pageUrl = useMemo(() => `${origin || `https://${domain}`}/${slug || ''}`, [origin, domain, slug]);

  // Bildgröße prüfen, sobald sich das (effektive) Vorschaubild ändert.
  useEffect(() => {
    if (!effectiveOgImage || typeof window === 'undefined') {
      setImageMeta(null);
      return;
    }
    let cancelled = false;
    setImageMeta({ loading: true });
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      setImageMeta({ loading: false, width: img.naturalWidth, height: img.naturalHeight, error: false });
    };
    img.onerror = () => {
      if (cancelled) return;
      setImageMeta({ loading: false, error: true });
    };
    img.src = effectiveOgImage;
    return () => { cancelled = true; };
  }, [effectiveOgImage]);

  const imageWarning = useMemo(() => {
    if (!imageMeta || imageMeta.loading) return null;
    if (imageMeta.error) return 'Bild konnte nicht geladen werden — Pfad/URL prüfen.';
    const { width, height } = imageMeta;
    if (width < 200 || height < 200) {
      return `Bild ist mit ${width}×${height}px sehr klein (Facebook-Minimum: 200×200px).`;
    }
    if (Math.abs(width / height - RECOMMENDED_RATIO) > 0.15) {
      return `Seitenverhältnis ${width}×${height}px weicht vom empfohlenen 1.91:1 ab (z. B. ${RECOMMENDED_OG_WIDTH}×${RECOMMENDED_OG_HEIGHT}px) — Bild kann zugeschnitten dargestellt werden.`;
    }
    return null;
  }, [imageMeta]);

  const linkBtnStyle = {
    display: 'inline-block',
    padding: '6px 12px',
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#1a0dab',
    background: '#fff',
    border: '1px solid #ddd',
    borderRadius: '4px',
    textDecoration: 'none',
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
            <label style={labelStyle}>
              Meta Title (50-60 Zeichen)
            </label>
            <input
              type="text"
              value={metaTitle}
              onChange={(e) => handleChange('metaTitle', e.target.value)}
              placeholder="Seitentitel für Suchmaschinen"
              maxLength="60"
              style={inputStyle}
            />
            <div style={{ fontSize: '0.8rem', color: lengthIndicatorColor(metaTitle.length, 30, 60), marginTop: '2px' }}>
              {metaTitle.length}/60
            </div>
          </div>

          {/* Meta Description */}
          <div>
            <label style={labelStyle}>
              Meta Description (150-160 Zeichen)
            </label>
            <textarea
              value={metaDescription}
              onChange={(e) => handleChange('metaDescription', e.target.value)}
              placeholder={siteDefaults.defaultDescription || 'Kurze Beschreibung für Suchmaschinen'}
              maxLength="160"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
            <div style={{ fontSize: '0.8rem', color: lengthIndicatorColor(metaDescription.length, 120, 160), marginTop: '2px' }}>
              {metaDescription.length}/160
              {!metaDescription && siteDefaults.defaultDescription && (
                <span style={{ color: '#666' }}> — es wird die Website-Standardbeschreibung verwendet</span>
              )}
            </div>
          </div>

          {/* Open Graph Tags */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Open Graph (Social Media)</h5>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>
                OG Title
              </label>
              <input
                type="text"
                value={ogTitle}
                onChange={(e) => handleChange('ogTitle', e.target.value)}
                placeholder={metaTitle || 'Seitentitel'}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>
                OG Description
              </label>
              <textarea
                value={ogDescription}
                onChange={(e) => handleChange('ogDescription', e.target.value)}
                placeholder={effectiveDescription || 'Seitenbeschreibung'}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                OG Image URL
              </label>
              <input
                type="url"
                value={ogImage}
                onChange={(e) => handleChange('ogImage', e.target.value)}
                placeholder={siteDefaults.defaultOgImage || 'https://example.com/image.jpg'}
                style={inputStyle}
              />
              {usingDefaultImage && (
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '2px' }}>
                  Kein eigenes Bild gesetzt — es wird das Standard-Bild der Website verwendet.
                </div>
              )}
              {imageWarning && (
                <div style={{ fontSize: '0.8rem', color: '#b45309', marginTop: '2px' }}>
                  ⚠ {imageWarning}
                </div>
              )}
            </div>
          </div>

          {/* X (Twitter) Overrides — nur nötig, wenn sich die Karte von OG unterscheiden soll */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>
              X (Twitter) — abweichende Angaben (optional)
            </h5>
            <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '8px' }}>
              Bleibt leer → es werden die Open-Graph-Werte oben verwendet.
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>Twitter Title</label>
              <input
                type="text"
                value={twitterTitle}
                onChange={(e) => handleChange('twitterTitle', e.target.value)}
                placeholder={effectiveOgTitle}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>Twitter Description</label>
              <textarea
                value={twitterDescription}
                onChange={(e) => handleChange('twitterDescription', e.target.value)}
                placeholder={effectiveOgDescription}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={labelStyle}>Twitter Image URL</label>
              <input
                type="url"
                value={twitterImage}
                onChange={(e) => handleChange('twitterImage', e.target.value)}
                placeholder={effectiveOgImage || 'https://example.com/image.jpg'}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Advanced */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem' }}>Erweitert</h5>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>
                Canonical URL
              </label>
              <input
                type="url"
                value={canonicalUrl}
                onChange={(e) => handleChange('canonicalUrl', e.target.value)}
                placeholder={pageUrl}
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: '8px' }}>
              <label style={labelStyle}>
                Robots Meta Tag
              </label>
              <select
                value={robots}
                onChange={(e) => handleChange('robots', e.target.value)}
                style={{ ...inputStyle, padding: '6px' }}
              >
                <option value="index, follow">Index and Follow (default)</option>
                <option value="index, nofollow">Index, No Follow</option>
                <option value="noindex, follow">No Index, Follow</option>
                <option value="noindex, nofollow">No Index, No Follow</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Sitemap-Priorität</label>
                <select
                  value={sitemapPriority}
                  onChange={(e) => handleChange('sitemapPriority', e.target.value)}
                  style={{ ...inputStyle, padding: '6px' }}
                >
                  <option value="">Automatisch</option>
                  <option value="1.0">1.0 (höchste)</option>
                  <option value="0.8">0.8</option>
                  <option value="0.6">0.6</option>
                  <option value="0.4">0.4</option>
                  <option value="0.2">0.2 (niedrigste)</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Änderungsfrequenz</label>
                <select
                  value={sitemapChangefreq}
                  onChange={(e) => handleChange('sitemapChangefreq', e.target.value)}
                  style={{ ...inputStyle, padding: '6px' }}
                >
                  <option value="">Automatisch (weekly)</option>
                  <option value="always">Always</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="never">Never</option>
                </select>
              </div>
            </div>
          </div>

          {/* Link-Vorschau: wie die Seite aussieht, wenn sie extern verlinkt/geteilt wird */}
          <div style={{ borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <h5 style={{ margin: '0 0 12px 0', fontSize: '0.9rem' }}>Link-Vorschau</h5>

            {/* Google-Suchergebnis */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                Google-Suchergebnis
              </div>
              <div style={{ background: '#f9f9f9', borderRadius: '4px', padding: '12px' }}>
                <div style={{ fontSize: '0.85rem', lineHeight: '1.4' }}>
                  <div style={{ color: '#202124', fontSize: '0.8rem', marginBottom: '2px' }}>
                    {domain}{slug ? ` › ${slug.split('/').join(' › ')}` : ''}
                  </div>
                  <div style={{ color: '#1a0dab', fontWeight: 400, fontSize: '1.1rem', marginBottom: '2px' }}>
                    {metaTitle || slug || 'Seitentitel'}
                  </div>
                  <div style={{ color: '#4d5156' }}>
                    {effectiveDescription || 'Hier wird die Meta-Beschreibung angezeigt...'}
                  </div>
                </div>
              </div>
            </div>

            {/* Facebook / LinkedIn / WhatsApp-Stil */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                Facebook / LinkedIn / WhatsApp
              </div>
              <div style={{ border: '1px solid #dadde1', borderRadius: '6px', overflow: 'hidden', maxWidth: '400px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
                <div style={{ width: '100%', aspectRatio: '1.91 / 1', background: '#e9ebee', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {effectiveOgImage ? (
                    <img src={effectiveOgImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#90949c', fontSize: '0.8rem' }}>Kein Vorschaubild</span>
                  )}
                </div>
                <div style={{ padding: '10px 12px', background: '#f2f3f5' }}>
                  <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#606770', marginBottom: '4px' }}>
                    {domain}
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#050505', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {effectiveOgTitle}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#606770', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {effectiveOgDescription}
                  </div>
                </div>
              </div>
            </div>

            {/* X (Twitter)-Stil */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                X (Twitter)
              </div>
              <div style={{ border: '1px solid #cfd9de', borderRadius: '16px', overflow: 'hidden', maxWidth: '400px', fontFamily: 'Helvetica, Arial, sans-serif' }}>
                <div style={{ width: '100%', aspectRatio: '1.91 / 1', background: '#e9ebee', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {effectiveTwitterImage ? (
                    <img src={effectiveTwitterImage} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#90949c', fontSize: '0.8rem' }}>Kein Vorschaubild</span>
                  )}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#0f1419', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {effectiveTwitterTitle}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#536471', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginBottom: '2px' }}>
                    {effectiveTwitterDescription}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#536471' }}>
                    🔗 {domain}
                  </div>
                </div>
              </div>
            </div>

            {/* Slack / Discord-Stil */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                Slack / Discord
              </div>
              <div style={{ display: 'flex', gap: '12px', border: '1px solid #ddd', borderLeft: '4px solid #36c5f0', borderRadius: '4px', padding: '10px 12px', maxWidth: '460px', background: '#fff' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.75rem', color: '#616061', marginBottom: '2px' }}>
                    {domain}
                  </div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1264a3', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {effectiveOgTitle}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#1d1c1d', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {effectiveOgDescription}
                  </div>
                </div>
                {effectiveOgImage && (
                  <img src={effectiveOgImage} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '4px', flexShrink: 0 }} />
                )}
              </div>
            </div>

            {/* Debug-Tools */}
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888', marginBottom: '6px', textTransform: 'uppercase' }}>
                Vorschau nach Veröffentlichung testen
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <a
                  href={`https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(pageUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkBtnStyle}
                >
                  Facebook Sharing Debugger ↗
                </a>
                <a
                  href={`https://www.linkedin.com/post-inspector/inspect/${encodeURIComponent(pageUrl)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={linkBtnStyle}
                >
                  LinkedIn Post Inspector ↗
                </a>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '6px' }}>
                Hinweis: Diese Tools laden die <strong>veröffentlichte</strong> Seite und können Vorschauen
                zwischenspeichern — nach Änderungen ggf. dort einen erneuten Scan anstoßen. X (Twitter) bietet
                keinen öffentlichen Card-Validator mehr an; die Vorschau oben zeigt die zu erwartende Darstellung.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
