(() => {
  'use strict';
  const POLL_MS = 30000;
  const TIMEOUT_MS = 12000;
  const session = Date.now().toString(36) + Math.random().toString(36).slice(2);
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
  let products = [], rows = [], timer, pollTimer, controller, requestNumber = 0, returnFocus, lastText = null;
  try {
    localStorage.removeItem('b2b_catalog_data');
    localStorage.removeItem('b2b_catalog_version');
    localStorage.removeItem('flameworks_sheet_active_v1');
  } catch (_) { /* Storage may be disabled in an embedded browser. */ }

  function number(value) {
    const text = String(value == null ? '' : value).replace(/[,\s₩원]/g, '');
    if (text === '') return null;
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new Error('catalog_number');
    return Number(text);
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
      throw new Error('catalog_columns');
    }
    return matrix.slice(1).filter(row => row.some(cell => String(cell == null ? '' : cell).trim())).map((row, index) => {
      if (row.length < Math.max(model, shade, price, image, ...quantities) + 1 || row.length > header.length) throw new Error('catalog_columns');
      if (!String(row[model] == null ? '' : row[model]).trim()) throw new Error('missing_model');
      const qty = quantities.map(i => number(row[i]));
      return {index, model: String(row[model]).trim(), color: String(row[shade] || '').trim(),
        price: number(row[price]), qty, stock: qty.every(v => v !== null) ? qty.reduce((a, b) => a + b, 0) : null,
        image: imageURL(row[image] || '')};
    });
  }

  async function textFrom(url, signal) {
    const response = await fetch(url, {
      cache: 'no-store', credentials: 'omit', signal,
      headers: {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}
    });
    if (!response.ok) throw new Error('http_' + response.status);
    const bytes = new Uint8Array(await response.arrayBuffer());
    try { return new TextDecoder('utf-8', {fatal: true}).decode(bytes); }
    catch (error) {
      // A damaged UTF-8 BOM file must not be misread as another encoding.
      if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) throw error;
      // Browser EUC-KR decoding also covers Korean Windows CP949 CSV files.
      return new TextDecoder('euc-kr', {fatal: true}).decode(bytes);
    }
  }

  function quantity(value, label, total = false) {
    return '<td class="qty' + (total ? ' total' : '') + (value === 0 ? ' zero' : value === null ? ' blank' : '') + '" data-label="' + label + '">' + (value === null ? '-' : money.format(value)) + '</td>';
  }

  function render(data) {
    // Price/stock edits keep existing rows and images; only changed cells update.
    if (data.length === products.length && data.every((p, i) =>
      p.model === products[i].model && p.color === products[i].color && p.image === products[i].image)) {
      for (const p of data) {
        const old = products[p.index], cells = rows[p.index].cells;
        if (p.price !== old.price) cells[3].textContent = p.price === null ? '-' : money.format(p.price) + '원';
        const values = [...p.qty, p.stock], before = [...old.qty, old.stock];
        values.forEach((value, i) => {
          if (value === before[i]) return;
          const cell = cells[i + 4];
          cell.textContent = value === null ? '-' : money.format(value);
          cell.classList.toggle('zero', value === 0);
          cell.classList.toggle('blank', value === null);
        });
      }
      products = data;
      applyFilters();
      return;
    }
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
    const reorder = ordered.some((p, i) => body.rows[i] !== rows[p.index]);
    const fragment = document.createDocumentFragment(); let previous = null, visible = 0;
    for (const p of ordered) {
      const row = rows[p.index];
      const text = normal(p.model + p.color);
      row.hidden = (codes.length > 0 && !codes.some(code => normal(p.model).includes(normal(code)))) || !words.every(word => text.includes(normal(word))) || (color.value !== '' && p.color !== color.value);
      if (!row.hidden) { row.classList.toggle('group-start', previous !== p.model); previous = p.model; visible++; }
      if (reorder) fragment.appendChild(row);
    }
    if (reorder) body.appendChild(fragment);
    $('empty').hidden = visible > 0 || table.hidden;
  }

  function showError() {
    table.hidden = true; $('empty').hidden = true;
    message.hidden = false;
    message.textContent = navigator.onLine === false ? '인터넷 연결을 확인한 뒤 새로고침해 주세요.' : '최신 정보를 불러오지 못했습니다. 새로고침해 주세요.';
  }

  async function refresh(mask = false, restart = false) {
    if (document.visibilityState === 'hidden' || (controller && !restart)) return;
    clearTimeout(timer); clearTimeout(pollTimer);
    if (controller) controller.abort();
    const current = new AbortController();
    controller = current;
    const request = ++requestNumber;
    const token = session + '_' + Date.now() + '_' + request;
    table.setAttribute('aria-busy', 'true');
    if (mask || table.hidden) document.documentElement.classList.add('refreshing');
    if (table.hidden) { message.hidden = false; message.textContent = '상품을 불러오는 중입니다.'; }
    const timeout = setTimeout(() => current.abort(), TIMEOUT_MS);
    try {
      if (navigator.onLine === false) throw new Error('offline');
      const text = await textFrom('catalog.csv?t=' + token, current.signal);
      if (current.signal.aborted || request !== requestNumber) return;
      if (text !== lastText) {
        const data = decode(parseCSV(text));
        table.hidden = false;
        render(data);
        lastText = text;
      } else {
        table.hidden = false;
        $('empty').hidden = rows.some(row => !row.hidden);
      }
      table.dataset.source = 'csv';
      message.hidden = true;
    } catch (error) {
      if (request !== requestNumber) return;
      // Never present the previous price as current after a failed refresh.
      showError();
    } finally {
      clearTimeout(timeout);
      if (request === requestNumber) {
        controller = null;
        table.removeAttribute('aria-busy');
        document.documentElement.classList.remove('refreshing');
        if (document.visibilityState !== 'hidden' && navigator.onLine !== false) {
          pollTimer = setTimeout(() => refresh(), POLL_MS);
        }
      }
    }
  }

  function suspend() {
    clearTimeout(timer); clearTimeout(pollTimer);
    ++requestNumber;
    if (controller) controller.abort();
    controller = null;
    table.removeAttribute('aria-busy');
    // Hide price/stock before a back-forward-cache snapshot is restored.
    document.documentElement.classList.add('refreshing');
  }

  function schedule() {
    if (document.visibilityState === 'hidden') { suspend(); return; }
    clearTimeout(timer);
    document.documentElement.classList.add('refreshing');
    timer = setTimeout(() => refresh(true), 180);
  }
  search.addEventListener('input', applyFilters);
  color.addEventListener('change', applyFilters);
  sort.addEventListener('change', applyFilters);
  $('reload').onclick = null;
  $('reload').addEventListener('click', () => refresh(true, true));
  ['pageshow', 'focus', 'online'].forEach(type => window.addEventListener(type, schedule));
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('resume', schedule);
  window.addEventListener('pagehide', suspend);
  window.addEventListener('offline', () => { suspend(); showError(); });

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
