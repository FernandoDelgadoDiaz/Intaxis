import { createClient } from '@supabase/supabase-js';

let clientPromise;
let active = false;
let rendering = false;
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

async function db() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const response = await fetch('/api/config');
      if (!response.ok) throw new Error('No se pudo leer la configuración.');
      const config = await response.json();
      return createClient(config.supabaseUrl, config.supabasePublishableKey);
    })();
  }
  return clientPromise;
}

function isBusinessView() {
  return document.querySelector('.page-intro .eyebrow')?.textContent?.trim() === 'Fuente de verdad';
}

function phaseLabel(value) {
  return ({
    in_development: 'En desarrollo',
    needs_data: 'En desarrollo · faltan datos',
    ready_for_pilot: 'Listo para piloto',
    validated: 'Validado',
  }[value] || 'En desarrollo');
}

function imageInfo(product) {
  const real = product.primary_media && typeof product.primary_media === 'object' ? product.primary_media : {};
  const aspirational = product.aspirational_media && typeof product.aspirational_media === 'object' ? product.aspirational_media : {};
  if (/^https:\/\//i.test(real.url || '')) return { url: real.url, label: 'Foto real', real: true };
  if (/^https:\/\//i.test(aspirational.url || '')) return { url: aspirational.url, label: 'Imagen aspiracional', real: false };
  return { url: null, label: 'Imagen pendiente', real: false };
}

function offerCard(product) {
  const media = imageInfo(product);
  const refs = Array.isArray(product.reference_media) ? product.reference_media : [];
  const strategy = product.visual_strategy && typeof product.visual_strategy === 'object' ? product.visual_strategy : {};
  return `<article class="business-offer-card">
    <div class="business-offer-image">${media.url ? `<img src="${esc(media.url)}" alt="${esc(product.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<span>Imagen en preparación</span>'}<em>${esc(media.label)}</em></div>
    <div class="business-offer-body">
      <div class="business-offer-top"><span class="pill neutral">${esc(phaseLabel(product.development_phase))}</span>${refs.length ? `<span class="business-offer-evidence">${refs.length} referencia${refs.length === 1 ? '' : 's'}</span>` : ''}</div>
      <h4>${esc(product.name)}</h4>
      <p>${esc(product.description || 'Oferta originada en Descubrimiento.')}</p>
      ${strategy.recommended_presentation ? `<small><strong>Presentación recomendada:</strong> ${esc(strategy.recommended_presentation)}</small>` : ''}
      <div class="business-offer-actions"><label class="secondary business-offer-upload">${media.real ? 'Reemplazar foto real' : 'Subir foto real'}<input type="file" accept="image/png,image/jpeg,image/webp" data-real-product-id="${esc(product.id)}" hidden></label><button class="ghost" type="button" data-open-discovery>Ver fundamento</button></div>
      <div class="business-offer-upload-status" data-upload-status="${esc(product.id)}"></div>
    </div>
  </article>`;
}

async function loadOffers() {
  const client = await db();
  const accessResult = await client.rpc('current_business_access');
  if (accessResult.error) throw accessResult.error;
  const access = Array.isArray(accessResult.data) ? accessResult.data[0] || null : accessResult.data || null;
  if (!access?.business_id) return { businessId: null, products: [] };
  const products = await client.from('products').select('*').eq('business_id', access.business_id).eq('origin', 'discovery').order('created_at');
  if (products.error) throw products.error;
  return { businessId: access.business_id, products: products.data || [] };
}

async function renderPanel() {
  if (!active || rendering || !isBusinessView()) return;
  rendering = true;
  try {
    const existing = document.querySelector('#business-developed-offers');
    if (existing) existing.remove();
    const { products } = await loadOffers();
    if (!active || !isBusinessView() || !products.length) return;
    const metrics = document.querySelector('.metrics-grid');
    if (!metrics) return;
    const panel = document.createElement('section');
    panel.id = 'business-developed-offers';
    panel.className = 'panel business-developed-offers';
    panel.innerHTML = `<div class="panel-head"><div><span class="eyebrow">Construido por el equipo agentic</span><h3>Ofertas en desarrollo</h3><p class="panel-subtitle">Nacen de oportunidades que ya confirmaste. La imagen aspiracional se conserva como referencia y podés reemplazarla por la foto real cuando produzcas el resultado.</p></div><span class="pill neutral">${products.length}</span></div><div class="business-offer-grid">${products.map(offerCard).join('')}</div>`;
    metrics.insertAdjacentElement('afterend', panel);
    bindPanel();
  } catch (error) {
    console.error('offer-media-ui', error);
  } finally {
    rendering = false;
  }
}

async function uploadRealPhoto(input) {
  const productId = input.dataset.realProductId;
  const file = input.files?.[0];
  if (!productId || !file) return;
  const status = document.querySelector(`[data-upload-status="${CSS.escape(productId)}"]`);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    if (status) status.textContent = 'Usá PNG, JPG o WebP.';
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    if (status) status.textContent = 'La imagen debe pesar menos de 10 MB.';
    return;
  }
  if (status) status.textContent = 'Subiendo foto real…';
  try {
    const client = await db();
    const { businessId } = await loadOffers();
    if (!businessId) throw new Error('No se encontró el negocio.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${businessId}/${productId}/real-${Date.now()}.${extension}`;
    const upload = await client.storage.from('business-offer-media').upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) throw upload.error;
    const publicResult = client.storage.from('business-offer-media').getPublicUrl(path);
    const url = publicResult?.data?.publicUrl;
    if (!url) throw new Error('No se pudo obtener la URL de la imagen.');
    const updated = await client.from('products').update({
      primary_media: {
        url,
        kind: 'real',
        uploaded_at: new Date().toISOString(),
        source: 'owner_upload',
      },
      updated_at: new Date().toISOString(),
    }).eq('business_id', businessId).eq('id', productId);
    if (updated.error) throw updated.error;
    if (status) status.textContent = 'Foto real guardada ✓';
    setTimeout(() => renderPanel(), 400);
  } catch (error) {
    if (status) status.textContent = error.message || 'No se pudo subir la foto.';
  } finally {
    input.value = '';
  }
}

function bindPanel() {
  document.querySelectorAll('[data-real-product-id]').forEach((input) => input.addEventListener('change', () => uploadRealPhoto(input)));
  document.querySelectorAll('[data-open-discovery]').forEach((button) => button.addEventListener('click', () => document.querySelector('[data-discovery-integrated]')?.click()));
}

document.addEventListener('click', (event) => {
  if (event.target.closest?.('[data-view="business"]')) {
    active = true;
    setTimeout(renderPanel, 80);
    return;
  }
  if (event.target.closest?.('[data-view]') || event.target.closest?.('[data-discovery-integrated]')) active = false;
}, true);

const observer = new MutationObserver(() => {
  if (!active || !isBusinessView()) return;
  if (!document.querySelector('#business-developed-offers')) setTimeout(renderPanel, 30);
});
observer.observe(document.querySelector('#app'), { childList: true, subtree: true });