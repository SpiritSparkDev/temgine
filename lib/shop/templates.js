import Mustache from 'mustache'

/** Cent -> '24,90 €' (de-DE). Ungültige Werte -> ''. */
export function formatPriceCents(cents) {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return ''
  const abs = Math.abs(Math.round(cents))
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const rest = String(abs % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}${euros},${rest} €`
}

// Alle Werte nur mit {{ }} (escaped) – nie {{{ }}}.
export const PRODUCTS_TEMPLATE = `
<div class="shop-list">
  {{#hasCategories}}
  <div class="shop-filter" role="group" aria-label="Kategorie">
    <button type="button" class="shop-filter-btn{{#allActive}} is-active{{/allActive}}" data-shop-category="">Alle</button>
    {{#categories}}
    <button type="button" class="shop-filter-btn{{#active}} is-active{{/active}}" data-shop-category="{{name}}">{{name}}</button>
    {{/categories}}
  </div>
  {{/hasCategories}}
  {{#hasProducts}}
  <div class="shop-grid">
    {{#products}}
    <article class="shop-card">
      <a class="shop-card-link" href="{{url}}">
        {{#image}}<img class="shop-card-image" src="{{image}}" alt="{{title}}" loading="lazy">{{/image}}
        {{#category}}<span class="shop-card-category">{{category}}</span>{{/category}}
        <h3 class="shop-card-title">{{title}}</h3>
        {{#subtitle}}<p class="shop-card-subtitle">{{subtitle}}</p>{{/subtitle}}
        {{#shortText}}<p class="shop-card-text">{{shortText}}</p>{{/shortText}}
        {{#fromPrice}}<p class="shop-price">ab {{fromPrice}}</p>{{/fromPrice}}
        {{^fromPrice}}<p class="shop-unavailable">Derzeit nicht bestellbar</p>{{/fromPrice}}
      </a>
    </article>
    {{/products}}
  </div>
  {{/hasProducts}}
  {{^hasProducts}}<p class="shop-empty">Keine Produkte gefunden.</p>{{/hasProducts}}
</div>`

export const PRODUCT_TEMPLATE = `
<article class="shop-product">
  <div class="shop-product-media">
    {{#image}}<img class="shop-product-image" src="{{image}}" alt="{{title}}">{{/image}}
    {{#hasThumbs}}
    <div class="shop-thumbs">
      {{#thumbs}}<img class="shop-thumb" src="{{.}}" alt="" loading="lazy">{{/thumbs}}
    </div>
    {{/hasThumbs}}
  </div>
  <div class="shop-product-info">
    {{#category}}<span class="shop-card-category">{{category}}</span>{{/category}}
    <h1 class="shop-product-title">{{title}}</h1>
    {{#subtitle}}<p class="shop-product-subtitle">{{subtitle}}</p>{{/subtitle}}
    <div class="shop-product-description">
      {{#paragraphs}}<p>{{.}}</p>{{/paragraphs}}
    </div>
    {{#hasFormats}}
    <label class="shop-label" for="shop-format">Ausführung</label>
    <select id="shop-format" class="shop-format" data-shop-format>
      {{#formats}}
      <option value="{{sku}}" data-price="{{price}}"{{^orderable}} disabled{{/orderable}}{{#selected}} selected{{/selected}}>{{label}} – {{price}}{{^orderable}} (nicht verfügbar){{/orderable}}</option>
      {{/formats}}
    </select>
    {{/hasFormats}}
    <p class="shop-price"><strong data-shop-price>{{price}}</strong> <small>inkl. MwSt. zzgl. Versand</small></p>
    <button type="button" class="shop-add" data-shop-add{{^canOrder}} disabled{{/canOrder}}>In den Warenkorb</button>
    {{^canOrder}}<p class="shop-unavailable">Dieses Produkt ist derzeit nicht bestellbar.</p>{{/canOrder}}
    <p class="shop-added" data-shop-added hidden>Zum Warenkorb hinzugefügt.</p>
  </div>
</article>`

export function buildListView(data, activeCategory = '') {
  const products = (data?.products || []).map((p) => ({
    title: p.title,
    category: p.category || '',
    subtitle: p.subtitle || '',
    shortText: p.shortText || '',
    image: (p.images && p.images[0]) || '',
    url: `/shop/${encodeURIComponent(p.slug)}`,
    fromPrice: p.fromPriceCents == null ? '' : formatPriceCents(p.fromPriceCents),
  }))
  const categories = (data?.categories || []).map((name) => ({ name, active: name === activeCategory }))
  return {
    products,
    hasProducts: products.length > 0,
    categories,
    hasCategories: categories.length > 0,
    allActive: !activeCategory,
  }
}

export function buildProductView(product) {
  const formats = (product.formats || []).map((f) => ({
    sku: f.sku,
    label: f.label,
    price: formatPriceCents(f.priceCents),
    orderable: !!f.orderable,
  }))
  const first = formats.find((f) => f.orderable)
  if (first) first.selected = true
  const images = product.images || []
  return {
    title: product.title,
    category: product.category || '',
    subtitle: product.subtitle || '',
    image: images[0] || '',
    thumbs: images.slice(1),
    hasThumbs: images.length > 1,
    paragraphs: String(product.description || '').split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean),
    formats,
    hasFormats: formats.length > 0,
    canOrder: !!first,
    price: first ? first.price : (product.fromPriceCents == null ? '' : formatPriceCents(product.fromPriceCents)),
  }
}

export const renderProductList = (data, activeCategory = '') =>
  Mustache.render(PRODUCTS_TEMPLATE, buildListView(data, activeCategory))

export const renderProductDetail = (product) =>
  Mustache.render(PRODUCT_TEMPLATE, buildProductView(product))
