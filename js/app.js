(() => {
  'use strict';
  const SHEET_ID = '1GakBnRrG4DS02deVaHGvE70LpP9qo0HOdf6ClgyhLgA';
  const SHEET_GID = '1714803519';
  const SIZES = ['225', '230', '235', '240', '245', '250', '255'];
  const $ = id => document.getElementById(id);
  const body = document.querySelector('tbody');
  const table = $('catalog');
  const message = $('load-message');
  const search = $('search');
  const color = $('color');
  const sort = $('sort');
  const dialog = $('zoom');
  const zoomImage = $('zoom-image');
  const collator = new Intl.Collator('ko', {numeric: true, sensitivity: 'base'});
  const money = new Intl.NumberFormat('ko-KR');
  const esc = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const normal = text => String(text).trim().toLowerCase().replace(/\s+/g, '');
  let products = [], rows = [], timer, controller, requestNumber = 0, returnFocus;
  let sheetActivated = false;
  try {
    localStorage.removeItem('b2b_catalog_data');
    localStorage.removeItem('b2b_catalog_version');
    sheetActivated = localStorage.getItem('flameworks_sheet_active_v1') === '1';
  } catch (_) { /* Storage may be disabled in an embedded browser. */ }

  function number(value) {
    const text = String(value == null ? '' : value).replace(/[,\s₩원]/g, '');
    return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
  }

  function imageURL(value) {
    try {
      const url = new URL(String(value).trim());
      if (!['http:', 'https:'].includes(url.protocol)) return '';
      url.protocol = 'https:';
      return url.href;
    } catch (_) { return ''; }
  }

  // A small RFC 4180 reader also preserves empty cells and quoted line breaks.
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const result = []; let row = [], cell = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
      else if ((c === '\r' || c === '\n') && !quoted) {
        row.push(cell); result.push(row); row = []; cell = '';
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else cell += c;
    }
    if (quoted) throw new Error('invalid_csv');
    if (cell || row.length) { row.push(cell); result.push(row); }
    return result;
  }

  function decode(matrix) {
    if (!matrix.length) throw new Error('missing_header');
    const header = matrix[0].map(normal);
    const find = aliases => header.findIndex(name => aliases.includes(name));
    const model = find(['모델', 'model', '모델명']);
    const shade = find(['색상', 'color', '컬러']);
    const price = header.lastIndexOf('단가');
    const image = find(['이미지', 'image', '이미지url']);
    const quantities = SIZES.map(size => header.indexOf(size));
    if (model < 0 || shade < 0 || price < 0 || image < 0 || quantities.some(i => i < 0)) {
      const legacy = ['품번', '컬러', '사이즈', '소재', '굽높이', '도매가'].every((h, i) => header[i] === h);
      if (legacy && !sheetActivated) return null;
      throw new Error('sheet_columns');
    }
    return matrix.slice(1).filter(row => row.some(cell => String(cell == null ? '' : cell).trim())).map((row, index) => {
      if (!String(row[model] == null ? '' : row[model]).trim()) throw new Error('missing_model');
      const qty = quantities.map(i => number(row[i]));
      return {index, model: String(row[model]).trim(), color: String(row[shade] || '').trim(),
        price: number(row[price]), qty, stock: qty.every(v => v !== null) ? qty.reduce((a, b) => a + b, 0) : null,
        image: imageURL(row[image] || '')};
    });
  }

  async function csvFrom(url, signal) {
    const response = await fetch(url, {cache: 'no-store', credentials: 'omit', signal});
    if (!response.ok) throw new Error('http_' + response.status);
    return decode(parseCSV(await response.text()));
  }

  function jsonp(signal, token) {
    return new Promise((resolve, reject) => {
      const name = '__flameworks_' + token;
      const script = document.createElement('script');
      let done = false;
      function finish(error, result) {
        if (done) return; done = true;
        clearTimeout(timeout); script.remove(); signal.removeEventListener('abort', abort);
        // A cancelled JSONP response can arrive late; it must not overwrite newer rows.
        window[name] = () => {};
        setTimeout(() => { delete window[name]; }, 60000);
        if (error) reject(error); else resolve(result);
      }
      function abort() { finish(new DOMException('Cancelled', 'AbortError')); }
      const timeout = setTimeout(() => finish(new Error('timeout')), 12000);
      window[name] = payload => {
        try {
          if (!payload || payload.status === 'error' || !payload.table) throw new Error('sheet_response');
          const cols = payload.table.cols;
          const matrix = [cols.map(c => c.label || '')];
          for (const row of payload.table.rows || []) {
            matrix.push(cols.map((_, i) => row.c[i] && row.c[i].v != null ? String(row.c[i].v) : ''));
          }
          finish(null, decode(matrix));
        } catch (error) { finish(error); }
      };
      script.onerror = () => finish(new Error('sheet_network'));
      signal.addEventListener('abort', abort, {once: true});
      if (signal.aborted) { abort(); return; }
      const url = new URL('https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/gviz/tq');
      url.searchParams.set('gid', SHEET_GID);
      url.searchParams.set('headers', '1');
      url.searchParams.set('tqx', 'out:json;responseHandler:' + name);
      url.searchParams.set('t', token);
      script.src = url.href;
      document.head.appendChild(script);
    });
  }

  async function loadSheet(signal, token) {
    const url = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/export?format=csv&gid=' + SHEET_GID + '&t=' + token;
    // CSV is lossless. JSONP keeps the existing cross-origin fallback for webviews.
    const csvController = new AbortController();
    const abortCSV = () => csvController.abort();
    signal.addEventListener('abort', abortCSV, {once: true});
    const timeout = setTimeout(abortCSV, 5000);
    try { return await csvFrom(url, csvController.signal); }
    catch (error) {
      if (signal.aborted) throw error;
      return await jsonp(signal, token);
    } finally { clearTimeout(timeout); signal.removeEventListener('abort', abortCSV); }
  }

  function quantity(value, label, total = false) {
    return '<td class="qty' + (total ? ' total' : '') + (value === 0 ? ' zero' : value === null ? ' blank' : '') + '" data-label="' + label + '">' + (value === null ? '-' : money.format(value)) + '</td>';
  }

  function render(data) {
    const selected = color.value;
    color.replaceChildren(new Option('전체 색상', ''));
    for (const value of new Set(data.map(p => p.color))) if (value) color.add(new Option(value, value));
    color.value = Array.from(color.options).some(o => o.value === selected) ? selected : '';
    products = data;
    body.innerHTML = data.map(p => {
      const name = esc(p.model + ' ' + p.color);
      const image = p.image ? '<a class="photo" href="' + esc(p.image) + '" target="_blank" rel="noopener noreferrer" data-name="' + name + '" aria-label="' + name + ' 이미지 확대"><img src="' + esc(p.image) + '" width="104" height="104" loading="lazy" decoding="async" referrerpolicy="no-referrer" alt="' + name + '"><span class="image-error" hidden>이미지 연결 확인</span></a>' : '<span class="no-image">이미지 없음</span>';
      return '<tr class="item" data-index="' + p.index + '"><td class="image-cell">' + image + '</td><th scope="row" class="model" data-label="모델">' + esc(p.model) + '</th><td class="color" data-label="색상">' + esc(p.color) + '</td><td class="price" data-label="단가">' + (p.price === null ? '-' : money.format(p.price) + '원') + '</td>' + p.qty.map((v, i) => quantity(v, SIZES[i])).join('') + quantity(p.stock, '합계', true) + '</tr>';
    }).join('');
    rows = Array.from(body.rows);
    applyFilters();
  }

  function applyFilters() {
    const tokens = search.value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
    const codes = tokens.filter(t => /\d/.test(t));
    const words = tokens.filter(t => !/\d/.test(t));
    const [key, direction] = sort.value.split(':');
    const ordered = products.slice().sort((a, b) => {
      if (key === 'model') return collator.compare(a.model, b.model) || a.index - b.index;
      if (a[key] === null || b[key] === null) return a[key] === b[key] ? a.index - b.index : a[key] === null ? 1 : -1;
      return (a[key] - b[key]) * (direction === 'desc' ? -1 : 1) || a.index - b.index;
    });
    const fragment = document.createDocumentFragment(); let previous = null, visible = 0;
    for (const p of ordered) {
      const row = rows[p.index];
      const text = normal(p.model + p.color);
      row.hidden = (codes.length > 0 && !codes.some(code => normal(p.model).includes(normal(code)))) || !words.every(word => text.includes(normal(word))) || (color.value !== '' && p.color !== color.value);
      if (!row.hidden) { row.classList.toggle('group-start', previous !== p.model); previous = p.model; visible++; }
      fragment.appendChild(row);
    }
    body.appendChild(fragment);
    $('empty').hidden = visible > 0 || table.hidden;
  }

  async function refresh() {
    if (document.visibilityState === 'hidden') return;
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    const request = ++requestNumber;
    const token = Date.now() + '_' + request;
    table.setAttribute('aria-busy', 'true');
    document.documentElement.classList.add('refreshing');
    message.hidden = false; message.textContent = '상품을 불러오는 중입니다.';
    const timeout = setTimeout(() => controller && request === requestNumber && controller.abort(), 22000);
    try {
      let data = await loadSheet(signal, token);
      if (signal.aborted || request !== requestNumber) return;
      if (data === null) {
        // One-time migration: the existing sheet still has its old catalog schema.
        // Never use a price snapshot on a network error or after the new sheet activates.
        data = await csvFrom('catalog.csv?t=' + token, signal);
        if (!data) throw new Error('invalid_seed');
        if (signal.aborted || request !== requestNumber) return;
        table.dataset.source = 'attachment';
      } else {
        sheetActivated = true;
        try { localStorage.setItem('flameworks_sheet_active_v1', '1'); } catch (_) {}
        table.dataset.source = 'sheet';
      }
      if (signal.aborted || request !== requestNumber) return;
      table.hidden = false;
      render(data);
      message.hidden = true;
    } catch (error) {
      if (request !== requestNumber) return;
      table.hidden = true; $('empty').hidden = true;
      message.hidden = false;
      message.textContent = navigator.onLine === false ? '인터넷 연결을 확인한 뒤 새로고침해 주세요.' : '최신 정보를 불러오지 못했습니다. 새로고침해 주세요.';
    } finally {
      clearTimeout(timeout);
      if (request === requestNumber) {
        table.removeAttribute('aria-busy');
        document.documentElement.classList.remove('refreshing');
      }
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (document.visibilityState !== 'hidden') timer = setTimeout(refresh, 180);
  }
  search.addEventListener('input', applyFilters);
  color.addEventListener('change', applyFilters);
  sort.addEventListener('change', applyFilters);
  $('reload').onclick = null;
  $('reload').addEventListener('click', () => { clearTimeout(timer); refresh(); });
  ['pageshow', 'focus', 'online'].forEach(type => window.addEventListener(type, schedule));
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('resume', schedule);
  window.addEventListener('pagehide', () => { if (controller) controller.abort(); });
  // Some embedded browsers resume frozen timers without a focus event.
  let lastTick = Date.now();
  setInterval(() => { const now = Date.now(); if (now - lastTick > 45000) schedule(); lastTick = now; }, 15000);

  body.addEventListener('error', event => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement)) return;
    const link = img.closest('.photo');
    if (link) { img.hidden = true; link.classList.add('failed'); link.querySelector('.image-error').hidden = false; }
  }, true);
  body.addEventListener('load', event => {
    const img = event.target;
    if (img instanceof HTMLImageElement && img.closest('.photo')) {
      img.hidden = false; img.closest('.photo').classList.remove('failed'); img.closest('.photo').querySelector('.image-error').hidden = true;
    }
  }, true);
  zoomImage.addEventListener('load', () => { zoomImage.hidden = false; $('zoom-error').hidden = true; });
  zoomImage.addEventListener('error', () => { zoomImage.hidden = true; $('zoom-error').hidden = false; });
  body.addEventListener('click', event => {
    const link = event.target.closest('.photo');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || typeof dialog.showModal !== 'function') return;
    event.preventDefault(); returnFocus = link;
    $('zoom-name').textContent = link.dataset.name;
    zoomImage.alt = link.dataset.name; $('original-link').href = link.href;
    $('zoom-error').hidden = true; zoomImage.hidden = false; zoomImage.src = link.href;
    dialog.showModal();
  });
  $('close-zoom').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll: true}); });
  schedule();
})();
