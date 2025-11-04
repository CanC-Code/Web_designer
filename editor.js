let pages = {};
let currentFile = null;
const folderInput = document.getElementById('folderInput');
const pageList = document.getElementById('pageList');
const previewFrame = document.getElementById('previewFrame');
const createPageBtn = document.getElementById('createPageBtn');
const addSectionBtn = document.getElementById('addSectionBtn');
const exportPageBtn = document.getElementById('exportPageBtn');
const viewportSelect = document.getElementById('viewportSelect');

// ------------------ Load Local Folder ------------------
folderInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.html'));
    pageList.innerHTML = '';
    pages = {};
    for (const file of files) {
        const content = await file.text();
        pages[file.name] = content;
        const li = document.createElement('li');
        li.textContent = file.name;
        li.addEventListener('click', () => loadPage(file.name));
        pageList.appendChild(li);
    }
});

// ------------------ Load Page ------------------
function loadPage(filename) {
    currentFile = filename;
    const htmlContent = pages[filename];
    const iframeDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();
    makeEditableSections();
}

// ------------------ Add Section ------------------
addSectionBtn.addEventListener('click', () => {
    if (!currentFile) return alert("Select a page first");
    const type = prompt("Section type: header, paragraph, image, footer");
    const iframeDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    let el;
    switch(type) {
        case 'header': el = iframeDoc.createElement('header'); el.innerHTML='<h1>Header</h1>'; break;
        case 'paragraph': el = iframeDoc.createElement('p'); el.textContent='New paragraph'; break;
        case 'image': el = iframeDoc.createElement('img'); el.src=''; el.alt='Image'; el.style.maxWidth='100%'; break;
        case 'footer': el = iframeDoc.createElement('footer'); el.textContent='Footer'; break;
        default: el = iframeDoc.createElement('div'); el.textContent='New Section';
    }
    el.classList.add('section');
    el.setAttribute('contenteditable','true');
    iframeDoc.body.appendChild(el);
    makeEditableSections();
});

// ------------------ Make Sections Editable & Draggable ------------------
function makeEditableSections() {
    const iframeDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    const sections = iframeDoc.querySelectorAll('.section');
    sections.forEach(sec=>{
        sec.setAttribute('contenteditable','true');
        sec.style.cursor='move';
        sec.draggable=true;
        sec.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain',''); sec.classList.add('dragging'); });
        sec.addEventListener('dragend', e => sec.classList.remove('dragging'));
    });
    // Enable dropping to reorder
    iframeDoc.body.addEventListener('dragover', e=>e.preventDefault());
    iframeDoc.body.addEventListener('drop', e=>{
        e.preventDefault();
        const dragging = iframeDoc.querySelector('.dragging');
        if(!dragging) return;
        const y = e.clientY;
        const children = Array.from(iframeDoc.body.children);
        let insertBefore = null;
        for(const child of children){
            const rect = child.getBoundingClientRect();
            if(y < rect.top + rect.height/2){ insertBefore = child; break; }
        }
        iframeDoc.body.insertBefore(dragging, insertBefore);
    });
}

// ------------------ Export Page ------------------
exportPageBtn.addEventListener('click', () => {
    if(!currentFile) return;
    const iframeDoc = previewFrame.contentDocument || previewFrame.contentWindow.document;
    const blob = new Blob([iframeDoc.documentElement.outerHTML], {type:'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = currentFile;
    a.click();
});

// ------------------ Responsive Preview ------------------
viewportSelect.addEventListener('change', () => {
    switch(viewportSelect.value){
        case 'desktop': previewFrame.style.width='100%'; break;
        case 'tablet': previewFrame.style.width='768px'; break;
        case 'mobile': previewFrame.style.width='375px'; break;
    }
});
