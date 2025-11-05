(() => {
const localFolder = document.getElementById('localFolder');
const loadGithubBtn = document.getElementById('loadGithubBtn');
const ghOwner = document.getElementById('ghOwner');
const ghRepo = document.getElementById('ghRepo');
const ghStatus = document.getElementById('ghStatus');

const createPageBtn = document.getElementById('createPage');
const addSectionBtn = document.getElementById('addSection');
const exportZipBtn = document.getElementById('exportZip');
const pageListEl = document.getElementById('pageList');
const previewFrame = document.getElementById('preview');

const selectedLabel = document.getElementById('selectedLabel');
const styleBg = document.getElementById('styleBg');
const styleColor = document.getElementById('styleColor');
const styleFontSize = document.getElementById('styleFontSize');
const stylePadding = document.getElementById('stylePadding');
const styleMargin = document.getElementById('styleMargin');
const applyStylesBtn = document.getElementById('applyStyles');
const clearStylesBtn = document.getElementById('clearStyles');

const viewportSelect = document.getElementById('viewport');

let files = {};
let htmlFiles = [];
let currentFile = null;
let selectedElementId = null;

// ---------------- Helper Functions ----------------

function addFile(key, value, isText = true) {
    files[key] = files[key] || {};
    files[key].content = value;
    files[key].isText = !!isText;
}

function ensureBlobUrl(key) {
    const f = files[key]; if (!f) return null;
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

function blobToArrayBuffer(blob) {
    return new Promise((resolve,reject)=>{
        const fr = new FileReader();
        fr.onload = ()=>resolve(fr.result);
        fr.onerror = reject;
        fr.readAsArrayBuffer(blob);
    });
}

// ---------------- LOCAL FOLDER LOADER ----------------
localFolder.addEventListener('change', async (ev) => {
    const fileList = Array.from(ev.target.files || []);
    if (!fileList.length) return;
    files = {}; htmlFiles=[]; currentFile=null;

    for (const file of fileList) {
        const key = file.webkitRelativePath || file.name;
        const isText = /\.(html?|css|js|txt|svg)$/i.test(key);
        if (isText) {
            const text = await file.text();
            addFile(key, text, true);
        } else addFile(key, file, false);
    }
    prepareHtmlList();
    document.getElementById('localStatus').textContent = `Loaded ${Object.keys(files).length} files from local folder.`;
});

// ---------------- GITHUB + PAGES LOADER ----------------
async function loadGithubPage(owner, repo, pageUrl='') {
    try {
        const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if(!resp.ok) throw new Error('Failed to fetch repo info.');
        const repoData = await resp.json();
        const branch = repoData.default_branch || 'main';

        const treeResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`);
        if(!treeResp.ok) throw new Error('Failed to fetch repo tree.');
        const treeData = await treeResp.json();

        files = {}; htmlFiles=[]; currentFile=null;
        treeData.tree.forEach(item=>{
            const isText = /\.(html?|css|js|txt|json|md)$/i.test(item.path);
            addFile(item.path,'',isText);
        });

        let indexPath = pageUrl || 'index.html';
        if(!files[indexPath]){
            const htmls = Object.keys(files).filter(k=>k.endsWith('.html'));
            if(htmls.length) indexPath = htmls[0];
        }

        previewFrame.src = `https://${owner}.github.io/${repo}/${indexPath}`;
        ghStatus.textContent = `Loaded GitHub Pages and repo (${Object.keys(files).length} files).`;

        prepareHtmlList();
    } catch(e) {
        ghStatus.textContent = `Error loading GitHub Pages/repo: ${e.message}`;
        console.error(e);
    }
}

loadGithubBtn.addEventListener('click', () => {
    const owner = ghOwner.value.trim();
    const repo = ghRepo.value.trim();
    if(owner && repo) loadGithubPage(owner, repo);
});

// ---------------- PAGE LIST / LOAD PAGE ----------------
function prepareHtmlList() {
    htmlFiles = Object.keys(files).filter(k=>k.endsWith('.html')).sort();
    renderPageList();
}

function renderPageList() {
    pageListEl.innerHTML='';
    htmlFiles.forEach(p=>{
        const li=document.createElement('li');
        li.textContent=p;
        li.dataset.path=p;
        li.addEventListener('click', ()=>{
            document.querySelectorAll('#pageList li').forEach(n=>n.classList.remove('active'));
            li.classList.add('active');
            loadPage(p);
        });
        pageListEl.appendChild(li);
    });
}

async function loadPage(path) {
    if(!files[path]) { alert('Page not found'); return; }
    currentFile=path;
    const htmlText = files[path].content;
    const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    doc.open();
    doc.write(htmlText);
    doc.close();
}

// ---------------- CREATE PAGE / ADD SECTION ----------------
createPageBtn.addEventListener('click', ()=>{
    const name = prompt('New page name (e.g., page.html):');
    if(!name) return;
    const template = `<html><head><title>${name}</title></head><body></body></html>`;
    addFile(name, template,true);
    prepareHtmlList();
});

addSectionBtn.addEventListener('click', ()=>{
    if(!currentFile) return alert('Open a page first');
    const type = prompt('Section type (header, paragraph, image, footer, div):','paragraph');
    const doc = previewFrame.contentDocument||previewFrame.contentWindow.document;
    let el;
    switch(type.toLowerCase()){
        case 'header': el=doc.createElement('header'); el.innerText='Header'; break;
        case 'footer': el=doc.createElement('footer'); el.innerText='Footer'; break;
        case 'image': el=doc.createElement('img'); el.src=''; el.alt='Image'; el.style.maxWidth='100%'; break;
        case 'div': el=doc.createElement('div'); el.innerText='New block'; break;
        default: el=doc.createElement('p'); el.innerText='New paragraph'; break;
    }
    el.setAttribute('data-editor-id','ed-'+Date.now());
    doc.body.appendChild(el);
});

// ---------------- STYLE EDITOR ----------------
applyStylesBtn.addEventListener('click',()=>{
    if(!selectedElementId) { alert('Select an element first'); return; }
    const el = getIframeElementById(selectedElementId);
    if(!el) return;
    if(styleBg.value) el.style.background = styleBg.value;
    if(styleColor.value) el.style.color = styleColor.value;
    if(styleFontSize.value) el.style.fontSize = (styleFontSize.value?styleFontSize.value+'px':'');
    if(stylePadding.value!==undefined) el.style.padding=stylePadding.value||'';
    if(styleMargin.value!==undefined) el.style.margin=styleMargin.value||'';
});

clearStylesBtn.addEventListener('click',()=>{
    if(!selectedElementId) return;
    const el = getIframeElementById(selectedElementId);
    if(!el) return;
    el.style.background='';
    el.style.color='';
    el.style.fontSize='';
    el.style.padding='';
    el.style.margin='';
    selectedLabel.textContent='?';
    selectedElementId=null;
});

function getIframeElementById(id){
    const doc = previewFrame.contentDocument||previewFrame.contentWindow.document;
    return doc.querySelector('[data-editor-id="'+id+'"]');
}

// ---------------- EXPORT ZIP ----------------
exportZipBtn.addEventListener('click', async ()=>{
    const zip = new JSZip();
    for(const key of Object.keys(files)){
        const entry = files[key];
        if(entry.isText) zip.file(key, entry.content);
        else {
            const data = await blobToArrayBuffer(entry.content);
            zip.file(key,data);
        }
    }
    const content = await zip.generateAsync({type:'blob'});
    saveAs(content,'project.zip');
});

// ---------------- VIEWPORT ----------------
viewportSelect.addEventListener('change',()=>{
    const val = viewportSelect.value;
    previewFrame.style.width = val;
});

// ---------------- Expose Web Designer ----------------
window.webDesigner = {
    loadPageByContent: async (name, content, basePath='')=>{
        addFile(name,content,true);
        prepareHtmlList();
        await loadPage(name);
    }
};

window._webdesigner_files = files;
})();
