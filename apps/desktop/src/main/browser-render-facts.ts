/** Fixed read-only code; this is never replaced by a caller-supplied script. */
export const RENDERED_FACTS_SCRIPT = `(() => {
  const text = (value, limit = 200) => String(value ?? '').replace(/\\s+/g, ' ').trim().slice(0, limit);
  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const elements = Array.from(document.querySelectorAll('body *')).slice(0, 5000);
  const opaque = value => /^rgb\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*\\)$/.test(value) || /^rgba\\(\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*\\d+\\s*,\\s*1(?:\\.0+)?\\s*\\)$/.test(value);
  const qualify = element => {
    const controlKind = element.tagName === 'BUTTON' ? 'button' : element.tagName === 'A' && element.hasAttribute('href') ? 'link' : null;
    const result = eligibility => ({ controlKind, eligibility });
    if (!controlKind) return result('excluded');
    if (!visible(element)) return result('excluded');
    if (element.disabled || element.matches(':disabled')) return result('excluded');
    if (element.childNodes.length > 200) return result('unknown');
    const nodes = Array.from(element.childNodes).filter(node => node.nodeType === 3 && text(node.textContent));
    // This is a conservative computed-paint sentinel, not portable proof of
    // visibility/accessibility. Unsupported effects and uncertain hit tests
    // remain unknown. Never inspect or activate a caller-provided script.
    let parent = element;
    let backdrop = false;
    let depth = 0;
    while (parent && depth++ < 32) {
      if (parent.inert || parent.getAttribute('aria-hidden') === 'true' || parent.getAttribute('aria-disabled') === 'true') return result('excluded');
      const style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility !== 'visible') return result('excluded');
      if (style.opacity !== '1' || style.filter !== 'none' || style.backdropFilter !== 'none' || style.mixBlendMode !== 'normal' || style.maskImage !== 'none' || style.clipPath !== 'none' || style.transform !== 'none' || style.overflowX !== 'visible' || style.overflowY !== 'visible') return result('unknown');
      for (const pseudo of ['::before', '::after']) {
        const content = getComputedStyle(parent, pseudo).content;
        if (content !== 'none' && content !== 'normal') return result('unknown');
      }
      if (!backdrop) {
        if (style.backgroundImage !== 'none') return result('unknown');
        if (opaque(style.backgroundColor)) backdrop = true;
        else if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return result('unknown');
      }
      parent = parent.parentElement;
    }
    if (parent || !backdrop) return result('unknown');
    // Check generated paint before treating an empty native control as having
    // no text. Pseudo-element-only labels are unsupported, not excluded.
    if (!nodes.length) return element.childNodes.length ? result('unknown') : result('excluded');
    if (nodes.length > 8 || nodes.some(node => node.textContent.length > 200)) return result('unknown');
    // Colored emoji/symbol glyphs can ignore computed foreground color.
    if (nodes.some(node => !/^[\\x20-\\x7e]+$/.test(text(node.textContent)) || !/[A-Za-z0-9]/.test(text(node.textContent)))) return result('unknown');
    const style = getComputedStyle(element);
    if (!opaque(style.color) || style.textShadow !== 'none' || style.textDecorationLine !== 'none' || style.webkitTextStrokeWidth !== '0px' || style.webkitTextFillColor !== style.color || style.backgroundClip === 'text' || style.pointerEvents === 'none') return result('unknown');
    for (const node of nodes) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      if (!rects.length || rects.length > 8) return result('unknown');
      for (const rect of rects) {
        if (rect.width <= 0 || rect.height <= 0 || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight) return result('unknown');
        // Centre/corners must hit the owning control, not an overlay. This is
        // bounded sampling, not a complete occlusion or pixel-compositing test.
        for (const [x, y] of [[(rect.left + rect.right)/2, (rect.top + rect.bottom)/2], [rect.left + .5, rect.top + .5], [rect.right - .5, rect.bottom - .5]]) {
          const hit = document.elementFromPoint(x, y);
          if (hit !== element) return result('unknown');
        }
      }
    }
    return result('eligible');
  };
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
  // New sentinel enumeration is incremental and finite. Legacy generic facts
  // above remain unchanged; no JS budget claims native traversal preemption.
  const walker = document.createTreeWalker(document.body, 1);
  const controls = [];
  let visited = 0;
  let exhausted = false;
  while (visited < 5000 && controls.length < 120) {
    const element = walker.nextNode();
    if (!element) { exhausted = true; break; }
    visited++;
    if (element.tagName === 'BUTTON' || (element.tagName === 'A' && element.hasAttribute('href'))) controls.push(element);
  }
  const subjectCounts = new Map();
  const interactiveTextCandidates = controls.map(element => {
    const interactiveText = qualify(element);
    const style = getComputedStyle(element);
    let parent = element;
    let background = null;
    let depth = 0;
    while (parent && depth++ < 32) {
      const color = getComputedStyle(parent).backgroundColor;
      if (opaque(color)) { background = color; break; }
      parent = parent.parentElement;
    }
    const direct = [];
    for (let index = 0; index < Math.min(element.childNodes.length, 200); index++) {
      const node = element.childNodes[index];
      if (node.nodeType === 3) direct.push(node.textContent.length <= 200 ? node.textContent : '');
    }
    const label = text(direct.join(''), 201);
    const id = element.getAttribute('id') || '';
    const href = interactiveText.controlKind === 'link' ? element.getAttribute('href') || '' : '';
    const identity = id ? id.length <= 128 ? ['id', interactiveText.controlKind, id] : null : label && label.length <= 200 && href.length <= 2048 ? ['label', interactiveText.controlKind, label, href] : null;
    const key = identity ? JSON.stringify(identity) : null;
    if (key) subjectCounts.set(key, (subjectCounts.get(key) || 0) + 1);
    return { text: label.slice(0, 80), foreground: style.color, background, fontSize: style.fontSize, fontWeight: style.fontWeight, interactiveText: { ...interactiveText, subject: identity }, subjectKey: key };
  });
  let unknown = false;
  for (const candidate of interactiveTextCandidates) {
    candidate.interactiveText.unambiguous = exhausted && candidate.subjectKey !== null && subjectCounts.get(candidate.subjectKey) === 1;
    delete candidate.subjectKey;
    if (candidate.interactiveText.eligibility === 'unknown') unknown = true;
  }
  const interactiveTextScan = { version: 1, complete: exhausted, unknown };
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
    links, images, contrastCandidates, interactiveTextCandidates, interactiveTextScan,
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
