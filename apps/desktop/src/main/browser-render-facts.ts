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
    limitations: ['Viewport-only pixels.', 'Image readiness inspects only the first 200 DOM images within a cooperative 1500ms budget; individual renderer work is not preempted and paint settling is heuristic.', 'No keyboard, click, form submission, motion, or reduced-motion testing.', 'Contrast candidates omit alpha compositing, gradients, image backgrounds and potentially decorative text.'],
  };
})()`;

export const WAIT_FOR_RENDER_SCRIPT = `new Promise(resolve => {
  let finished = false;
  let poll;
  let frame;
  let fontsReady = false;
  let stableSince = null;
  let tracked = new Map();
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    clearTimeout(poll);
    cancelAnimationFrame(frame);
    tracked.clear();
    resolve();
  };
  // This cooperative budget includes discovery, decoding, settling and frames.
  // Timers cannot preempt an individual layout/style call. Check elapsed time
  // between inspections and cap discovery; never promise complete page readiness.
  const endsAt = performance.now() + 1500;
  const deadline = setTimeout(finish, 1500);
  Promise.resolve(document.fonts?.ready).then(() => {
    if (!finished) fontsReady = true;
  }, () => {
    if (!finished) fontsReady = true;
  });
  const visible = image => {
    const rect = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const check = (painted = false) => {
    if (finished) return;
    if (performance.now() >= endsAt) return finish();
    const next = new Map();
    let changed = false;
    // Do not materialize/scan the full live collection on image-heavy pages.
    // Images beyond the first 200, or arriving after resolution, are not awaited.
    const count = Math.min(document.images.length, 200);
    for (let index = 0; index < count; index++) {
      if (performance.now() >= endsAt) return finish();
      const image = document.images[index];
      if (!visible(image)) continue;
      if (performance.now() >= endsAt) return finish();
      const source = [image.currentSrc, image.src, image.srcset].join('\\n');
      let entry = tracked.get(image);
      if (!entry || entry.source !== source) {
        changed = true;
        entry = { source, done: false };
        const decoding = entry;
        // complete/naturalWidth describe availability, not decoded/painted pixels.
        // decode also waits for async/lazy images; rejection must not hang capture.
        Promise.resolve().then(() => { if (!finished) return image.decode(); }).then(() => {
          if (!finished) decoding.done = true;
        }, () => {
          if (!finished) decoding.done = true;
        });
      }
      next.set(image, entry);
    }
    if (next.size !== tracked.size) changed = true;
    tracked = next;
    if (changed || !fontsReady || Array.from(tracked.values()).some(entry => !entry.done)) stableSince = null;
    else if (stableSince === null) stableSince = performance.now();
    // Hidden Electron capture can miss a loaded raster even after decode + two
    // RAFs. 250ms unchanged settling is a bounded heuristic, not a pixel guarantee.
    if (stableSince !== null && performance.now() - stableSince >= 250) {
      if (painted) return finish();
      frame = requestAnimationFrame(() => {
        if (!finished) frame = requestAnimationFrame(() => check(true));
      });
    } else poll = setTimeout(check, 25);
  };
  check();
})`;
