// editor.js
// Browser-based web designer: load local folder or GitHub repo by URL,
// render into iframe with live editing, style editor, and ZIP export.

(() => {
  // DOM refs
  const localFolder = document.getElementById('localFolder');
  const ghUrlInput = document.getElementById('ghUrl');
  const loadGithubBtn = document.getElementById('loadGithub');
  const ghStatus = document.getElementById('ghStatus');

  const pageListEl = document.getElementById('pageList');
  const createPageBtn = document.getElementById('createPage');
  const addSectionBtn = document.getElementById('addSection');
  const exportZipBtn = document.getElementById('exportZip');

  const previewFrame = document.getElementById('preview');
  const viewportSelect = document.getElementById('viewport');

  // Style editor refs
  const selectedLabel = document.getElementById('selectedLabel');
  const styleBg = document.getElementById('styleBg');
  const styleColor = document.getElementById('styleColor');
  const styleFontSize = document.getElementById('styleFontSize');
  const stylePadding = document.getElementById('stylePadding');
  const styleMargin = document.getElementById('styleMargin');
  const applyStylesBtn = document.getElementById('applyStyles');
  const clearStylesBtn = document.getElementById('clearStyles');

  // Internal state
  let files = {};      // map path -> {content, isText, blobUrl?}
  let htmlFiles = [];  // list of html file keys
  let currentFile = null;
  let selectedElementId = null;

  // Utilities
  function detectMimeType(path) {
    const ext = path.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image/' + (ext === 'jpg' ? 'jpeg' : ext);
    if (ext === 'css') return 'text/css';
    if (ext === 'js') return 'application/javascript';
    if (ext === 'html' || ext === 'htm') return 'text/html';
    return 'application/octet-stream';
  }

  function addFile(key, content, isText=true) {
    files[key] = files[key] || {};
    files[key].content = content;
    files[key].isText = !!isText;
  }

  function ensureBlobUrl(key) {
    const f = files[key];
    if (!f) return null;
    if (f.blobUrl) return f.blobUrl;
    if (f.isText) {
      const blob = new Blob([f.content], {type: detectMimeType(key)});
      f.blobUrl = URL.createObjectURL(blob);
      return f.blobUrl;
    } else {
      f.blobUrl = URL.createObjectURL(f.content);
      return f.blobUrl;
    }
  }

  // ---------------- Local folder loader ----------------
  localFolder.addEventListener('change', async (ev) => {
    const flist = Array.from(ev.target.files || []);
    if (!flist.length) return;
    files = {}; htmlFiles = []; currentFile = null;
    for (const f of flist) {
      const key = f.webkitRelativePath || f.name;
      const isText = /\.(html?|css|js|svg|txt|json|md)$/i.test(key);
      if (isText) {
        const text = await f.text();
        addFile(key, text, true);
      } else {
        addFile(key, f, false);
      }
    }
    prepareHtmlList();
    ghStatus.textContent = `Loaded ${Object.keys(files).length} files from local folder.`;
  });

  // --------------- GitHub URL loader ---------------
  loadGithubBtn.addEventListener('click', async () => {
    const url = (ghUrlInput.value || '').trim();
    if (!url) { ghStatus.textContent = 'Paste a GitHub repo URL first.'; return; }
    ghStatus.textContent = 'Parsing URL...';
    try {
      const parsed = parseGitHubUrl(url);
      if (!parsed) throw new Error('Invalid GitHub URL.');
      ghStatus.textContent = `Fetching ${parsed.owner}/${parsed.repo} ${parsed.path ? 'path:' + parsed.path : ''} ...`;
      await loadGitHubRepo(parsed.owner, parsed.repo, parsed.path, parsed.branch);
      ghStatus.textContent = `Loaded ${Object.keys(files).length} files from GitHub ${parsed.owner}/${parsed.repo}${parsed.path?'/'+parsed.path:''} (branch:${parsed.branch||'default'})`;
    } catch (err) {
      console.error(err);
      ghStatus.textContent = 'Error: ' + (err.message || err);
    }
  });

  // Parse GitHub URL patterns:
  // Examples:
  // https://github.com/owner/repo
  // https://github.com/owner/repo/tree/branch/path/to/dir
  // allow query params ?path=foo&branch=main
  function parseGitHubUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
      const parts = u.pathname.replace(/^\/|\/$/g,'').split('/');
      if (parts.length < 2) return null;
      const owner = parts[0], repo = parts[1];
      let branch = null, path = '';
      // if /tree/{branch}/{path...}
      if (parts[2] === 'tree' && parts.length >= 4) {
        branch = parts[3];
        if (parts.length > 4) path = parts.slice(4).join('/');
      }
      // query params override
      const q = Object.fromEntries(u.searchParams.entries());
      if (q.branch) branch = q.branch;
      if (q.path) path = q.path.replace(/^\/*|\/*$/g,'');
      return {owner, repo, path, branch};
    } catch(e) { return null; }
  }

  // Fetch GitHub repo tree (public only). Uses git/trees API then blob fetch.
  async function loadGitHubRepo(owner, repo, path='', branch='') {
    files = {}; htmlFiles = []; currentFile = null;
    // get branch if not provided
    if (!branch) {
      const repoInfo = await fetchJson(`https://api.github.com/repos/${owner}/${repo}`);
      branch = repoInfo.default_branch;
    }
    // fetch recursive tree
    const treeJson = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
    const tree = treeJson.tree || [];
    const normalizedPath = path ? (path.replace(/^\/*/, '').replace(/\/*$/, '') + '/') : '';
    const blobs = tree.filter(entry => entry.type === 'blob' && entry.path.startsWith(normalizedPath));
    // fetch blobs
    for (const b of blobs) {
      const blobJson = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${b.sha}`);
      const base64 = blobJson.content || '';
      const text = atob(base64.replace(/\n/g,''));
      const isText = /\.(html?|css|js|svg|txt|json|md)$/i.test(b.path);
      if (isText) addFile(b.path, text, true);
      else {
        // decode into blob
        const bytes = base64ToArrayBuffer(base64);
        const blob = new Blob([bytes], {type: detectMimeType(b.path)});
        addFile(b.path, blob, false);
      }
    }
    prepareHtmlList();
  }

  async function fetchJson(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} - ${url}`);
    return r.json();
  }
  function base64ToArrayBuffer(base64) {
    const cleaned = base64.replace(/\n/g,'');
    const bin = atob(cleaned);
    const len = bin.length;
    const arr = new Uint8Array(len);
    for (let i=0;i<len;i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  }

  // ----------------- Explorer / Pages list -----------------
  function prepareHtmlList() {
    htmlFiles = Object.keys(files).filter(k => /\.(html?|htm)$/i.test(k)).sort();
    renderPageList();
  }
  function renderPageList() {
    pageListEl.innerHTML = '';
    for (const p of htmlFiles) {
      const li = document.createElement('li');
      li.textContent = p;
      li.dataset.path = p;
      li.addEventListener('click', () => {
        document.querySelectorAll('#pageList li').forEach(n=>n.classList.remove('active'));
        li.classList.add('active');
        loadPage(p);
      });
      pageListEl.appendChild(li);
    }
  }

  // ----------------- Load page into iframe -----------------
  async function loadPage(path) {
    if (!files[path]) { alert('Page not found: ' + path); return; }
    currentFile = path;
    const htmlText = files[path].content;
    const basePath = path.split('/').slice(0,-1).join('/') + (path.indexOf('/') === -1 ? '' : '/');
    const rewritten = await rewriteAssetURLs(htmlText, basePath);
    const injected = injectEditorClient(rewritten);
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open();
    doc.write(injected);
    doc.close();
    // initialize after a short delay
    setTimeout(initIframeInteractions, 250);
  }

  // Replace relative asset URLs with blob URLs for files present in `files`
  async function rewriteAssetURLs(htmlText, basePath) {
    // precreate blob urls
    for (const k of Object.keys(files)) ensureBlobUrl(k);

    function resolvePath(url) {
      if (!url) return url;
      if (url.startsWith('data:') || url.startsWith('http:') || url.startsWith('https:') || url.startsWith('//')) return url;
      // resolve relative path against basePath
      const dummy = 'https://dummy/' + basePath;
      try {
        const res = new URL(url, dummy).pathname.replace(/^\//,'');
        return res;
      } catch(e) { return url; }
    }

    const attrPattern = /(src|href)\s*=\s*(['"])(.*?)\2/gi;
    let out = htmlText.replace(attrPattern, (m, attr, q, url) => {
      const resolved = resolvePath(url);
      if (files[resolved]) {
        const blob = ensureBlobUrl(resolved);
        return `${attr}=${q}${blob}${q}`;
      } else return m;
    });

    out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, url) => {
      const resolved = resolvePath(url);
      if (files[resolved]) {
        const blob = ensureBlobUrl(resolved);
        return `url(${blob})`;
      } else return m;
    });

    return out;
  }

  // Append client editor script into HTML (handles click selection, drag & drop, resize handles)
  function injectEditorClient(htmlText) {
    const client = `
<script>
(function(){
  let idCounter=1;
  function mark() {
    const sel = 'p,h1,h2,h3,h4,header,footer,section,div,article,img';
    document.querySelectorAll(sel).forEach(el=>{
      if (!el.dataset.editorId) el.dataset.editorId = 'ed-' + (idCounter++);
      if (el.tagName.toLowerCase() !== 'img') el.setAttribute('contenteditable', 'true');
      el.classList.add('editable-block');
      el.setAttribute('draggable', true);
      el.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain',''); el.classList.add('dragging'); });
      el.addEventListener('dragend', (e)=>{ el.classList.remove('dragging'); });
    });
  }
  document.addEventListener('DOMContentLoaded', mark);
  mark();

  document.addEventListener('click', function(e){
    const el = e.target.closest('[data-editor-id]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    document.querySelectorAll('.section-selected').forEach(x=>x.classList.remove('section-selected'));
    el.classList.add('section-selected');
    const r = el.getBoundingClientRect();
    parent.postMessage({type:'element-selected', id: el.dataset.editorId, tag: el.tagName, text: el.innerText, rect:{top:r.top,left:r.left,width:r.width,height:r.height}}, '*');
  }, true);

  document.body.addEventListener('dragover', e=>e.preventDefault());
  document.body.addEventListener('drop', e=>{
    e.preventDefault();
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    const y = e.clientY;
    const kids = Array.from(document.body.children).filter(c=>c!==dragging);
    let insertBefore = null;
    for (const c of kids) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height/2) { insertBefore = c; break; }
    }
    document.body.insertBefore(dragging, insertBefore);
    parent.postMessage({type:'dom-changed'}, '*');
  });

  function addHandles(el) {
    if (el.querySelector('.resize-handle')) return;
    const handle = document.createElement('div');
    handle.className = 'resize-handle';
    handle.style.position='absolute'; handle.style.right='6px'; handle.style.bottom='6px';
    handle.style.width='12px'; handle.style.height='12px'; handle.style.zIndex=99999;
    handle.addEventListener('mousedown', function(e){
      e.preventDefault(); e.stopPropagation();
      const startX = e.clientX, startY = e.clientY;
      const startW = el.offsetWidth, startH = el.offsetHeight;
      function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        el.style.width = Math.max(10, startW + dx) + 'px';
        el.style.height = Math.max(10, startH + dy) + 'px';
      }
      function onUp(){ document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); parent.postMessage({type:'dom-changed'}, '*'); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    el.style.position = el.style.position || 'relative';
    el.appendChild(handle);
  }

  setInterval(()=>{ mark(); document.querySelectorAll('.editable-block').forEach(addHandles); }, 700);

  // Interact.js resizing for images (if available)
  if (typeof interact !== 'undefined') {
    window.addEventListener('load', ()=> {
      document.querySelectorAll('img').forEach(img=>{
        interact(img).resizable({
          edges: { left: false, right: true, bottom: true, top: false },
          listeners: {
            move (ev) {
              ev.target.style.width = ev.rect.width + 'px';
              ev.target.style.height = ev.rect.height + 'px';
            },
            end () { parent.postMessage({type:'dom-changed'}, '*'); }
          },
          modifiers: [ interact.modifiers.restrictSize({ min: { width: 30, height: 20 } }) ]
        });
      });
    });
  }

})();
</script>
`;
    if (/<\/body>/i.test(htmlText)) return htmlText.replace(/<\/body>/i, client + '</body>');
    return htmlText + client;
  }

  // --- Parent receives messages from iframe
  function initIframeInteractions() {
    window.addEventListener('message', onMessageFromIframe);
  }

  function onMessageFromIframe(e) {
    const data = e.data || {};
    if (data.type === 'element-selected') {
      selectedElementId = data.id;
      selectedLabel.textContent = `${data.tag} (${data.id})`;
      // populate style editor with computed styles from iframe
      const el = getIframeElementById(selectedElementId);
      if (el) {
        styleBg.value = rgbToHex(getComputedStyle(el).backgroundColor) || '#ffffff';
        styleColor.value = rgbToHex(getComputedStyle(el).color) || '#000000';
        const fs = parseInt(getComputedStyle(el).fontSize) || '';
        styleFontSize.value = fs;
        stylePadding.value = el.style.padding || '';
        styleMargin.value = el.style.margin || '';
      }
    } else if (data.type === 'dom-changed') {
      // nothing yet; used to know live DOM changed
    }
  }

  function getIframeElementById(editorId) {
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    if (!doc) return null;
    return doc.querySelector('[data-editor-id="'+editorId+'"]');
  }

  // Style editor actions
  applyStylesBtn.addEventListener('click', () => {
    if (!selectedElementId) { alert('Select element first'); return; }
    const el = getIframeElementById(selectedElementId);
    if (!el) return;
    if (styleBg.value) el.style.background = styleBg.value;
    if (styleColor.value) el.style.color = styleColor.value;
    if (styleFontSize.value) el.style.fontSize = styleFontSize.value ? (styleFontSize.value + 'px') : '';
    el.style.padding = stylePadding.value || '';
    el.style.margin = styleMargin.value || '';
  });
  clearStylesBtn.addEventListener('click', () => {
    if (!selectedElementId) return;
    const el = getIframeElementById(selectedElementId);
    if (!el) return;
    el.style.background = ''; el.style.color=''; el.style.fontSize=''; el.style.padding=''; el.style.margin='';
    selectedLabel.textContent = '?';
    selectedElementId = null;
  });

  // Create page & add section
  createPageBtn.addEventListener('click', () => {
    const name = prompt('Enter new page name (e.g. newpage.html)');
    if (!name) return;
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>' + name + '</title></head><body><h1>New Page</h1></body></html>';
    addFile(name, html, true);
    prepareHtmlList();
  });

  addSectionBtn.addEventListener('click', () => {
    if (!currentFile) return alert('Open a page first');
    const type = prompt('Section type (header, paragraph, image, footer, div):', 'paragraph');
    if (!type) return;
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    let el;
    switch(type.toLowerCase()) {
      case 'header': el = doc.createElement('header'); el.innerHTML = '<h1>Header</h1>'; break;
      case 'footer': el = doc.createElement('footer'); el.innerHTML = '<p>Footer</p>'; break;
      case 'image': el = doc.createElement('img'); el.src = ''; el.alt = 'Image'; el.style.maxWidth = '100%'; break;
      case 'div': el = doc.createElement('div'); el.innerHTML = '<p>New block</p>'; break;
      default: el = doc.createElement('p'); el.innerText = 'New paragraph'; break;
    }
    el.classList.add('editable-block');
    el.dataset.editorId = 'ed-new-' + Date.now();
    doc.body.appendChild(el);
  });

  // Export ZIP: include live HTML for currentFile plus all other assets
  exportZipBtn.addEventListener('click', async () => {
    const zip = new JSZip();
    for (const key of Object.keys(files)) {
      if (key === currentFile) {
        const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
        zip.file(key, '<!doctype html>\n' + doc.documentElement.outerHTML);
      } else {
        const entry = files[key];
        if (!entry) continue;
        if (entry.isText) zip.file(key, entry.content);
        else {
          const arr = await blobToArrayBuffer(entry.content);
          zip.file(key, arr);
        }
      }
    }
    const blob = await zip.generateAsync({type:'blob'});
    saveAs(blob, 'project.zip');
  });

  function blobToArrayBuffer(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsArrayBuffer(blob);
    });
  }

  // Viewport change
  viewportSelect.addEventListener('change', () => {
    preview.style.width = viewportSelect.value;
  });

  // Utilities
  function rgbToHex(rgb) {
    if (!rgb) return '';
    const m = rgb.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
    if (!m) return '';
    return '#' + [1,2,3].map(i=>parseInt(m[i]).toString(16).padStart(2,'0')).join('');
  }

  // Expose lightweight API for integration if you want to plug the full Github_repo_explorer UI later
  window.webDesigner = {
    loadPageByContent: async (name, content) => {
      addFile(name, content, true);
      prepareHtmlList();
      await loadPage(name);
    },
    getFilesMap: () => files
  };

  // export helper (not required but handy)
  window._webdesigner_files = files;

})(); // IIFE end
