let pages = {};
let currentFile = null;
let undoStack = [], redoStack = [];

const folderInput = document.getElementById('folderInput');
const pageList = document.getElementById('pageList');
const editorPreview = document.getElementById('editorPreview');
const createPageBtn = document.getElementById('createPage');
const addSectionBtn = document.getElementById('addSectionBtn');
const exportPageBtn = document.getElementById('exportPageBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const viewportSelect = document.getElementById('viewportSelect');

// ------------------ Load Folder ------------------
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
    editorPreview.innerHTML = pages[filename];
    pushUndo();
}

// ------------------ Create Page ------------------
createPageBtn.addEventListener('click', () => {
    const name = prompt("Enter new page name (with .html):");
    if (!name) return;
    const html = '<!DOCTYPE html><html><head><title>New Page</title></head><body></body></html>';
    pages[name] = html;
    const li = document.createElement('li');
    li.textContent = name;
    li.addEventListener('click', () => loadPage(name));
    pageList.appendChild(li);
});

// ------------------ Add Section ------------------
addSectionBtn.addEventListener('click', () => {
    if (!currentFile) { alert("Select a page first"); return; }
    const type = prompt("Section type: header, paragraph, image, footer");
    let div = document.createElement('div');
    div.classList.add('section');
    div.setAttribute('contenteditable', 'true');
    div.setAttribute('draggable', 'true');

    switch(type) {
        case 'header': div.innerHTML = '<h1>Header Title</h1>'; break;
        case 'paragraph': div.innerHTML = '<p>New paragraph...</p>'; break;
        case 'image': div.innerHTML = '<img src="" alt="Image">'; break;
        case 'footer': div.innerHTML = '<footer>Footer content</footer>'; break;
        default: div.innerHTML = '<div>New Section</div>';
    }

    editorPreview.appendChild(div);
    makeDraggable(div);
    pushUndo();
});

// ------------------ Export Page ------------------
exportPageBtn.addEventListener('click', () => {
    if (!currentFile) return;
    const blob = new Blob([editorPreview.innerHTML], {type:'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = currentFile;
    a.click();
});

// ------------------ Undo/Redo ------------------
function pushUndo() {
    undoStack.push(editorPreview.innerHTML);
    redoStack = [];
}

undoBtn.addEventListener('click', () => {
    if (undoStack.length < 2) return;
    redoStack.push(undoStack.pop());
    editorPreview.innerHTML = undoStack[undoStack.length-1];
});

redoBtn.addEventListener('click', () => {
    if (redoStack.length === 0) return;
    const html = redoStack.pop();
    editorPreview.innerHTML = html;
    undoStack.push(html);
});

// ------------------ Draggable Sections ------------------
function makeDraggable(el) {
    el.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', null);
        el.classList.add('dragging');
    });
    el.addEventListener('dragend', e => el.classList.remove('dragging'));
}

// Allow dropping sections in editor
editorPreview.addEventListener('dragover', e => e.preventDefault());
editorPreview.addEventListener('drop', e => {
    e.preventDefault();
    const dragging = document.querySelector('.dragging');
    if (!dragging) return;
    const y = e.clientY;
    const children = Array.from(editorPreview.children);
    let insertBefore = null;
    for (const child of children) {
        const rect = child.getBoundingClientRect();
        if (y < rect.top + rect.height/2) { insertBefore = child; break; }
    }
    editorPreview.insertBefore(dragging, insertBefore);
    pushUndo();
});

// ------------------ Viewport Simulation ------------------
viewportSelect.addEventListener('change', () => {
    switch(viewportSelect.value) {
        case 'desktop': editorPreview.style.width = '100%'; break;
        case 'tablet': editorPreview.style.width = '768px'; break;
        case 'mobile': editorPreview.style.width = '375px'; break;
    }
});
