/** Fixed read-only code; this is never replaced by a caller-supplied script. */
export const RENDERED_FACTS_SCRIPT = `(() => {
  const text = (value, limit = 200) => String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, limit);
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const elements = Array.from(document.querySelectorAll('body *')).slice(0, 5000);
  const contrastCandidates = [];
  for (const element of elements) {
    if (contrastCandidates.length >= 120) break;
    if (!visible(element) || !Array.from(element.childNodes).some(node => node.nodeType === 3 && text(node.textContent))) continue;
    const style = getComputedStyle(element);
    let parent = element;
    let background = '';
    while (parent) {
      const color = getComputedStyle(parent).backgroundColor;
      if (/^rgb\\(/.test(color) || /^rgba\\(.*,[ ]*1\\)$/.test(color)) { background = color; break; }
      parent = parent.parentElement;
    }
    contrastCandidates.push({ text: text(element.textContent, 80), foreground: style.color, background: background || null, fontSize: style.fontSize, fontWeight: style.fontWeight });
  }
  const links = Array.from(document.querySelectorAll('a[href]')).slice(0, 80).map(element => {
    const href = element.getAttribute('href') || '';
    let target = null;
    if (href.startsWith('#')) {
      try { target = document.getElementById(decodeURIComponent(href.slice(1))); } catch {}
    }
    return { label: text(element.textContent || element.getAttribute('aria-label')), href: href.slice(0, 2048), targetExists: href.startsWith('#') ? Boolean(target) : null, targetText: target ? text(target.textContent) : null };
  });
  const images = Array.from(document.images).filter(visible).slice(0, 40).map(element => ({ alt: text(element.alt), loaded: element.complete && element.naturalWidth > 0 }));
  return {
    url: location.href,
    title: text(document.title, 300),
    text: text(document.body?.innerText, 16000),
    viewport: { width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio },
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
    counts: { main: document.querySelectorAll('main').length, h1: document.querySelectorAll('h1').length, links: document.querySelectorAll('a[href]').length, images: document.images.length, headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length },
    headings: Array.from(document.querySelectorAll('h1,h2,h3')).slice(0, 40).map(element => text(element.textContent)),
    links, images, contrastCandidates,
    limitations: ['Viewport-only pixels.', 'No keyboard, click, form submission, motion, or reduced-motion testing.', 'Contrast candidates omit alpha compositing, gradients, image backgrounds and potentially decorative text.'],
  };
})()`;

export const WAIT_FOR_RENDER_SCRIPT = `new Promise(resolve => {
  const timer = setTimeout(resolve, 1500);
  Promise.allSettled([
    document.fonts?.ready,
    ...Array.from(document.images).filter(image => !image.complete && image.getBoundingClientRect().top < innerHeight).map(image => new Promise(done => { image.addEventListener('load', done, { once: true }); image.addEventListener('error', done, { once: true }); })),
  ]).then(() => { clearTimeout(timer); requestAnimationFrame(() => requestAnimationFrame(resolve)); });
})`;
