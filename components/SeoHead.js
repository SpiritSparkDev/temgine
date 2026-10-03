import Head from 'next/head';
import { escapeJsonLd } from '../lib/seo';

/**
 * Rendert Title/Description/Canonical/Robots/OG/Twitter/JSON-LD aus einem
 * von lib/seo.js::buildPageMeta() gebauten Meta-Objekt. Gemeinsam genutzt
 * von pages/index.js und pages/[...slug].js, damit Homepage und alle
 * anderen Seiten identisch behandelt werden.
 */
export default function SeoHead({ meta }) {
  if (!meta) return null;
  const { title, description, canonical, robots, siteName, twitterHandle, googleSiteVerification, bingSiteVerification, og, twitter, jsonLd } = meta;

  return (
    <Head>
      {title && <title>{title}</title>}
      {description && <meta name="description" content={description} />}
      {canonical && <link rel="canonical" href={canonical} />}
      {robots && <meta name="robots" content={robots} />}
      {googleSiteVerification && <meta name="google-site-verification" content={googleSiteVerification} />}
      {bingSiteVerification && <meta name="msvalidate.01" content={bingSiteVerification} />}

      <meta property="og:type" content="website" />
      {siteName && <meta property="og:site_name" content={siteName} />}
      {canonical && <meta property="og:url" content={canonical} />}
      {og?.title && <meta property="og:title" content={og.title} />}
      {og?.description && <meta property="og:description" content={og.description} />}
      {og?.image && <meta property="og:image" content={og.image} />}

      <meta name="twitter:card" content={twitter?.card || (og?.image ? 'summary_large_image' : 'summary')} />
      {twitterHandle && <meta name="twitter:site" content={twitterHandle} />}
      {(twitter?.title || og?.title) && <meta name="twitter:title" content={twitter?.title || og.title} />}
      {(twitter?.description || og?.description) && <meta name="twitter:description" content={twitter?.description || og.description} />}
      {(twitter?.image || og?.image) && <meta name="twitter:image" content={twitter?.image || og.image} />}

      {Array.isArray(jsonLd) && jsonLd.map((schema, i) => (
        // eslint-disable-next-line react/no-danger
        <script
          key={`jsonld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: escapeJsonLd(schema) }}
        />
      ))}
    </Head>
  );
}
