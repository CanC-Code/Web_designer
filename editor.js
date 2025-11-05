// editor.js -- Web Designer: GitHub Pages + local project
(() => {
  const pageUrlInput = document.getElementById('pageUrl');
  const loadPageBtn = document.getElementById('loadPage');
  const pageListEl = document.getElementById('pageList');
  const previewFrame = document.getElementById('preview');
  const exportZipBtn = document.getElementById('exportZip');
  const selectedLabel = document.getElementById('selectedLabel');
  const styleBg = document.getElementById('styleBg');
  const styleColor = document.getElementById('styleColor');
  const styleFontSize = document.getElementById('styleFontSize');
  const stylePadding = document.getElementById('stylePadding');
  const styleMargin = document.getElementById('styleMargin');
  const applyStylesBtn = document.getElementById('applyStyles');
  const clearStylesBtn = document.getElementById('clearStyles');
  const createPageBtn = document.getElementById('createPage');
  const addSectionBtn = document.getElementById('addSection');
  const viewportSelect = document.getElementById('viewport');

  let files = {};       // key -> { content, blobUrl?, isText }
  let htmlFiles = [];   // list of html paths
  let currentFile = null;
  let selectedElementId = null;

  function addFile(key, content, isText = true) {
    files[key] = files[key] || {};
    files[key].content = content;
    files[key].isText = isText;
  }

  function ensureBlobUrl(key) {
    const f = files[key];
    if (!f) return null;
    if (f.blobUrl) return f.blobUrl;
    if (f.isText) {
      const blob = new Blob([f.content], { type: detectMimeType(key) });
      f.blobUrl = URL.createObjectURL(blob);
      return f.blobUrl;
    } else {
      f.blobUrl = URL.createObjectURL(f.content);
      return f.blobUrl;
    }
  }

  function detectMimeType(path) {
    const ext = path.split('.').pop().toLowerCase();
    if (['png','jpg','jpeg','gif','webp','svg'].includes(ext)) return 'image/' + (ext==='jpg'?'jpeg':ext);
    if (ext==='css') return 'text/css';
    if (ext==='js') return 'application/javascript';
    if (ext==='html'||ext==='htm') return 'text/html';
    return 'application/octet-stream';
  }

  function prepareHtmlList() {
    htmlFiles = Object.keys(files).filter(k=>/\.(html?|htm)$/i.test(k)).sort();
    renderPageList();
  }

  function renderPageList() {
    pageListEl.innerHTML = '';
    htmlFiles.forEach(p=>{
      const li = document.createElement('li');
      li.textContent = p;
      li.dataset.path = p;
      li.addEventListener('click', () => { 
        document.querySelectorAll('#pageList li').forEach(n=>n.classList.remove('active'));
        li.classList.add('active');
        loadPage(p);
      });
      pageListEl.appendChild(li);
    });
  }

  async function loadPage(path) {
    if (!files[path]) return alert('Page not found: '+path);
    currentFile = path;
    let htmlText = files[path].content;
    const basePath = path.split('/').slice(0,-1).join('/') + (path.indexOf('/')===-1?'':'/');
    htmlText = await rewriteAssetURLs(htmlText, basePath);
    htmlText = injectEditorClient(htmlText);
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open();
    doc.write(htmlText);
    doc.close();
    setTimeout(initIframeInteractions,200);
  }

  async function rewriteAssetURLs(htmlText, basePath) {
    for(const k of Object.keys(files)) ensureBlobUrl(k);
    function resolvePath(url) {
      if(!url||url.startsWith('data:')||url.startsWith('http')||url.startsWith('//')) return url;
      const dummyBase='https://dummy/'+basePath;
      try { return new URL(url,dummyBase).pathname.replace(/^\//,''); } catch(e){ return url; }
    }
    htmlText = htmlText.replace(/(src|href)\s*=\s*(['"])(.*?)\2/gi,(m,attr,q,url)=>{
      const r = resolvePath(url);
      if(files[r]) return `${attr}=${q}${ensureBlobUrl(r)}${q}`; else return m;
    });
    htmlText = htmlText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,(m,q,url)=>{
      const r = resolvePath(url); return files[r]?`url(${ensureBlobUrl(r)})`:m;
    });
    return htmlText;
  }

  function injectEditorClient(htmlText) {
    const clientScript = `
      <script>
      let idCounter=0;
      document.querySelectorAll('*').forEach(el=>{
        if(!el.dataset.editorId) el.dataset.editorId='ed-'+(idCounter++);
      });
      document.body.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        const el=e.target;
        const id=el.dataset.editorId;
        window.parent.postMessage({type:'element-selected',id:id,tag:el.tagName},'*');
      });
      </script>
    `;
    if(/<\/body>/i.test(htmlText)) return htmlText.replace(/<\/body>/i,clientScript+'</body>');
    else return htmlText+clientScript;
  }

  function initIframeInteractions() { window.addEventListener('message',handleIframeMessage); }

  function handleIframeMessage(e) {
    const data=e.data||{};
    if(data.type==='element-selected') {
      selectedElementId=data.id;
      selectedLabel.textContent=`${data.tag} (${selectedElementId})`;
      const el=getIframeElementById(selectedElementId);
      if(el){
        styleBg.value=rgbToHex(window.getComputedStyle(el).backgroundColor)||'#ffffff';
        styleColor.value=rgbToHex(window.getComputedStyle(el).color)||'#000000';
        styleFontSize.value=parseInt(window.getComputedStyle(el).fontSize)||'';
        stylePadding.value=el.style.padding||'';
        styleMargin.value=el.style.margin||'';
      }
    }
  }

  function getIframeElementById(id){ const d=previewFrame.contentDocument||previewFrame.contentWindow.document; if(!d) return null; return d.querySelector('[data-editor-id="'+id+'"]'); }

  applyStylesBtn.addEventListener('click',()=>{
    if(!selectedElementId) return alert('Select an element first');
    const el=getIframeElementById(selectedElementId);
    if(!el) return;
    if(styleBg.value) el.style.background=styleBg.value;
    if(styleColor.value) el.style.color=styleColor.value;
    if(styleFontSize.value) el.style.fontSize=styleFontSize.value?styleFontSize.value+'px':'';
    el.style.padding=stylePadding.value||'';
    el.style.margin=styleMargin.value||'';
  });

  clearStylesBtn.addEventListener('click',()=>{
    if(!selectedElementId) return;
    const el=getIframeElementById(selectedElementId);
    if(!el) return;
    el.style.background=''; el.style.color=''; el.style.fontSize=''; el.style.padding=''; el.style.margin='';
    selectedLabel.textContent='?'; selectedElementId=null;
  });

  createPageBtn.addEventListener('click',()=>{
    const name=prompt('New page name (e.g. newpage.html)');
    if(!name) return;
    addFile(name,'<html><body><h1>New Page</h1></body></html>',true);
    prepareHtmlList();
  });

  addSectionBtn.addEventListener('click',()=>{
    if(!currentFile) return alert('Open a page first');
    const type=prompt('Section type (header, footer, paragraph, div, image):','paragraph');
    if(!type) return;
    const doc=previewFrame.contentDocument||previewFrame.contentWindow.document;
    let el;
    switch(type.toLowerCase()){
      case 'header': el=doc.createElement('header'); el.innerHTML='<h1>Header</h1>'; break;
      case 'footer': el=doc.createElement('footer'); el.innerHTML='<p>Footer</p>'; break;
      case 'image': el=doc.createElement('img'); el.src=''; el.alt='Image'; el.style.maxWidth='100%'; break;
      case 'div': el=doc.createElement('div'); el.innerHTML='<p>New block</p>'; break;
      default: el=doc.createElement('p'); el.innerText='New paragraph'; break;
    }
    el.dataset.editorId='ed-new-'+Date.now();
    doc.body.appendChild(el);
  });

  exportZipBtn.addEventListener('click',async()=>{
    const zip=new JSZip();
    for(const key of Object.keys(files)){
      if(key===currentFile){
        const doc=previewFrame.contentDocument||previewFrame.contentWindow.document;
        zip.file(key,'\n'+doc.documentElement.outerHTML);
      } else {
        const entry=files[key]; if(!entry) continue;
        if(entry.isText) zip.file(key,entry.content);
        else zip.file(key,await blobToArrayBuffer(entry.content));
      }
    }
    const blob=await zip.generateAsync({type:'blob'});
    saveAs(blob,'project.zip');
  });

  async function blobToArrayBuffer(blob){ return await blob.arrayBuffer(); }

  viewportSelect.addEventListener('change',()=>{ previewFrame.style.width=viewportSelect.value; });

  function rgbToHex(rgb){ if(!rgb) return ''; const m=rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); if(!m) return ''; return '#'+[1,2,3].map(i=>parseInt(m[i]).toString(16).padStart(2,'0')).join(''); }

  // --- GitHub Pages Loader ---
  loadPageBtn.addEventListener('click',async()=>{
    const url=pageUrlInput.value.trim();
    if(!url) return;
    try{
      // parse URL to owner/repo
      const match=url.match(/github\.io\/([^\/]+)\/?([^\/]*)/);
      if(!match) return alert('Invalid GitHub Pages URL');
      const owner=match[1];
      const repo=match[2]||owner;
      const repoPath=repo?repo+'/':'';
      // fetch repo API
      const repoRes=await fetch(`https://api.github.com/repos/${owner}/${repo}`);
      if(!repoRes.ok) throw new Error('Failed to fetch repo info');
      const repoData=await repoRes.json();
      const branch=repoData.default_branch||'main';
      // fetch tree
      const treeRes=await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
      if(!treeRes.ok) throw new Error('Failed to fetch tree');
      const treeData=await treeRes.json();
      files={}; htmlFiles=[]; currentFile=null;
      const tree=treeData.tree;
      for(const entry of tree){
        const filePath=entry.path;
        const blobRes=await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${entry.sha}`);
        const blobJson=await blobRes.json();
        const contentBase64=blobJson.content||'';
        const isText=/\.(html?|css|js|svg|txt|json)$/i.test(filePath);
        if(isText){
          addFile(filePath,atob(contentBase64.replace(/\n/g,'')),true);
        } else {
          const bytes=Uint8Array.from(atob(contentBase64.replace(/\n/g,'')),c=>c.charCodeAt(0));
          addFile(filePath,new Blob([bytes],{type:detectMimeType(filePath)}),false);
        }
      }
      prepareHtmlList();
      const mainPage=htmlFiles.includes('index.html')?'index.html':htmlFiles[0];
      if(mainPage) loadPage(mainPage);
    }catch(err){
      alert('Error loading GitHub Pages: '+err.message);
    }
  });

})();
