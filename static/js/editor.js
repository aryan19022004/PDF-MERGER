document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // 1. TABS LOGIC
    // -------------------------------------------------------------------------
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));

            tab.classList.add('active');
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // -------------------------------------------------------------------------
    // 2. EDITOR STATE & DOM ELEMENTS
    // -------------------------------------------------------------------------
    let currentSessionId = null;
    let pdfDoc = null;
    let currentPageNum = 1;
    let totalPages = 0;
    
    let editedBlocksMap = new Map(); // Keep track of blocks we changed
    let deletedBlockBboxList = []; // Original BBoxes of changed elements to erase

    // Upload Elements
    const editFileInput = document.getElementById('edit_pdf');
    const labelEditPdf = document.getElementById('label-edit-pdf');
    const uploadSection = document.getElementById('edit-upload-section');
    const errorMsg = document.getElementById('edit-error-message');

    // Workspace Elements
    const workspace = document.getElementById('editor-workspace');
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    const textLayerDiv = document.getElementById('text-overlay-layer');
    const canvasContainer = document.getElementById('pdf-canvas-container');

    // Toolbar
    const pageIndicator = document.getElementById('page-indicator');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const saveBtn = document.getElementById('save-edit-btn');
    const textTools = document.getElementById('text-tools');
    const managePagesBtn = document.getElementById('manage-pages-btn');
    const fontSelect = document.getElementById('font-family-select');
    const sizeInput = document.getElementById('font-size-input');
    const colorInput = document.getElementById('text-color-input');
    const deleteBtn = document.getElementById('delete-text-btn');
    const btnBold = document.getElementById('btn-bold');
    const btnItalic = document.getElementById('btn-italic');
    const btnUnderline = document.getElementById('btn-underline');

    // Page Management Modal Elements
    const pagesModal = document.getElementById('pages-modal');
    const closePagesModalBtn = document.getElementById('close-pages-modal');
    const pagesList = document.getElementById('pages-list');
    const addBlankModalBtn = document.getElementById('add-blank-modal-btn');
    const applyPagesBtn = document.getElementById('apply-pages-btn');
    let pagesSortable = null;
    let pageOrder = [];

    let currentViewport = null;
    let activeSpan = null;

    // -------------------------------------------------------------------------
    // 3. FILE UPLOAD & INIT
    // -------------------------------------------------------------------------
    editFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            if (window.showToast) window.showToast("Please select a valid PDF.", "error");
            return;
        }

        labelEditPdf.classList.add('has-file');
        labelEditPdf.querySelector('.file-name').textContent = 'Uploading...';

        const formData = new FormData();
        formData.append('edit_pdf', file);

        try {
            const res = await fetch('/api/upload_edit', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            currentSessionId = data.session_id;
            
            // Switch UI
            uploadSection.classList.add('hidden');
            workspace.classList.remove('hidden');
            managePagesBtn.classList.remove('opacity-50', 'pe-none');

            // Load PDF via PDF.js
            const url = `/api/get_pdf/${currentSessionId}`;
            pdfDoc = await pdfjsLib.getDocument(url).promise;
            totalPages = pdfDoc.numPages;
            currentPageNum = 1;
            
            await renderPage(currentPageNum);

        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast(err.message || 'Upload failed.', "error");
            labelEditPdf.classList.remove('has-file');
            labelEditPdf.querySelector('.file-name').textContent = '';
        }
    });

    async function renderPage(num) {
        if (!pdfDoc) return;
        
        // Reset states for new page
        textLayerDiv.innerHTML = '';
        activeSpan = null;
        textTools.classList.add('opacity-50', 'pe-none');
        updatePaginationUI();

        try {
            const page = await pdfDoc.getPage(num);
            
            // Adjust scale based on screen width/desired size, let's just use 1.5 
            const viewport = page.getViewport({ scale: 1.5 });
            currentViewport = viewport;

            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            canvasContainer.style.width = `${viewport.width}px`;
            canvasContainer.style.height = `${viewport.height}px`;
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;

            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };

            await page.render(renderContext).promise;

            // Render TextLayer for true WYSIWYG
            const textContent = await page.getTextContent();
            
            pdfjsLib.renderTextLayer({
                textContent: textContent,
                container: textLayerDiv,
                viewport: viewport,
                textDivs: []
            }).promise.then(() => {
                // Once text layer is rendered, attach editing events
                setupEditingEnvironment();
            });

        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast("Failed to render page.", "error");
        }
    }

    function setupEditingEnvironment() {
        const spans = textLayerDiv.querySelectorAll('span');
        spans.forEach((span, index) => {
            span.dataset.id = `span-${index}`;
            // Provide visual feedback for editable text
            span.style.cursor = 'text';
            span.style.transition = 'background 0.1s, outline 0.1s';
            span.classList.add('editable-span');
            
            span.addEventListener('mouseover', () => {
                if (span !== activeSpan) {
                    span.style.outline = '1px dashed rgba(79, 70, 229, 0.4)';
                }
            });
            
            span.addEventListener('mouseout', () => {
                if (span !== activeSpan) {
                    span.style.outline = 'none';
                }
            });
            
            span.addEventListener('click', (e) => {
                e.stopPropagation();
                activateSpanForEditing(span);
            });
        });
        
        // Click outside to deactivate
        document.addEventListener('click', (e) => {
            if (activeSpan && e.target !== activeSpan && !textTools.contains(e.target)) {
                deactivateSpan();
            }
        });
    }

    function activateSpanForEditing(span) {
        if (activeSpan) {
            deactivateSpan();
        }
        activeSpan = span;
        
        // Save original bounding box if not already saved!
        if (!editedBlocksMap.has(span.dataset.id)) {
            // Calculate PyMuPDF original bounding box
            const rect = span.getBoundingClientRect();
            const containerRect = canvasContainer.getBoundingClientRect();
            // Coordinates relative to canvas (which uses css pixels)
            const leftPx = rect.left - containerRect.left;
            const topPx = rect.top - containerRect.top;
            
            // map viewport coords to pdf points
            const pt1 = currentViewport.convertToPdfPoint(leftPx, topPx);
            const pt2 = currentViewport.convertToPdfPoint(leftPx + rect.width, topPx + rect.height);
            // In PDF coords, y goes up from bottom, but PyMuPDF rects are x0,y0,x1,y1 strictly ordered:
            const x0 = Math.min(pt1[0], pt2[0]);
            const x1 = Math.max(pt1[0], pt2[0]);
            const y0 = Math.min(pt1[1], pt2[1]);
            const y1 = Math.max(pt1[1], pt2[1]);
            
            // Pad slightly for better erasure
            deletedBlockBboxList.push([x0-1, y0-2, x1+1, y1+2]);
        }
        
        span.contentEditable = "true";
        span.style.outline = '2px solid var(--primary)';
        span.style.background = 'white';
        span.style.color = span.style.color || window.getComputedStyle(span).color;
        span.style.whiteSpace = 'pre-wrap'; // Fixes the space typing bug
        span.style.minWidth = '20px'; // Ensure it doesn't collapse
        span.focus();
        
        textTools.classList.remove('opacity-50', 'pe-none');
        
        // Update toolbar
        const currentSizePx = parseFloat(window.getComputedStyle(span).fontSize); // px
        // convert px back to pt approx for backend (pt = px * 0.75 / scale) roughly
        sizeInput.value = Math.round(currentSizePx / currentViewport.scale) || 12;
        
        const rgbColor = window.getComputedStyle(span).color;
        colorInput.value = rgbToHex(rgbColor) || "#000000";
        
        const currentFont = window.getComputedStyle(span).fontFamily.toLowerCase();
        if (currentFont.includes('time') || currentFont.includes('serif')) fontSelect.value = 'times';
        else if (currentFont.includes('cour') || currentFont.includes('mono')) fontSelect.value = 'courier';
        else fontSelect.value = 'helvetica';
        
        span.addEventListener('input', trackChanges);
    }
    
    function trackChanges() {
        if (!activeSpan) return;
        
        const rect = activeSpan.getBoundingClientRect();
        const containerRect = canvasContainer.getBoundingClientRect();
        const leftPx = rect.left - containerRect.left;
        const topPx = rect.top - containerRect.top;
        
        const pt1 = currentViewport.convertToPdfPoint(leftPx, topPx);
        const pt2 = currentViewport.convertToPdfPoint(leftPx + rect.width, topPx + rect.height);
        
        const x0 = Math.min(pt1[0], pt2[0]);
        const x1 = Math.max(pt1[0], pt2[0]);
        const y0 = Math.min(pt1[1], pt2[1]);
        const y1 = Math.max(pt1[1], pt2[1]);
        
        // Clean text nodes from contenteditable artifacts
        let rawText = activeSpan.textContent || activeSpan.innerText;
        rawText = rawText.replace(/\u00A0/g, " ");

        editedBlocksMap.set(activeSpan.dataset.id, {
            text: rawText,
            html: activeSpan.innerHTML, // NEW: Capture the formatted HTML
            new_bbox: [x0, y0, x1, y1],
            fontFamilly: fontSelect.value,
            fontSize: parseInt(sizeInput.value),
            color: colorInput.value
        });
    }

    function deactivateSpan() {
        if (activeSpan) {
            activeSpan.contentEditable = "false";
            activeSpan.style.outline = 'none';
            activeSpan.style.background = 'transparent';
            activeSpan.removeEventListener('input', trackChanges);
            // ensure it tracks on blur
            trackChanges();
            activeSpan = null;
            textTools.classList.add('opacity-50', 'pe-none');
        }
    }

    // Toolbar Listeners
    fontSelect.addEventListener('change', () => {
        if (activeSpan) {
            let cssFont = 'sans-serif';
            if(fontSelect.value === 'times') cssFont = 'serif';
            if(fontSelect.value === 'courier') cssFont = 'monospace';
            activeSpan.style.fontFamily = cssFont;
            trackChanges();
        }
    });

    sizeInput.addEventListener('change', () => {
        if (activeSpan) {
            const rawSize = parseInt(sizeInput.value);
            // approximate display size
            activeSpan.style.fontSize = `${rawSize * currentViewport.scale}px`;
            trackChanges();
        }
    });

    colorInput.addEventListener('input', () => {
        if (activeSpan) {
            activeSpan.style.color = colorInput.value;
            trackChanges();
        }
    });

    if(btnBold) {
        btnBold.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent losing focus
            document.execCommand('bold', false, null);
            trackChanges();
        });
    }
    if(btnItalic) {
        btnItalic.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand('italic', false, null);
            trackChanges();
        });
    }
    if(btnUnderline) {
        btnUnderline.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.execCommand('underline', false, null);
            trackChanges();
        });
    }

    // -------------------------------------------------------------------------
    // 7. SAVE TO BACKEND
    // -------------------------------------------------------------------------
    saveBtn.addEventListener('click', async () => {
        if (!currentSessionId) return;
        if (editedBlocksMap.size === 0 && deletedBlockBboxList.length === 0) {
            alert("No changes made on this page.");
            return;
        }

        const btnText = saveBtn.querySelector('.btn-text');
        const spinner = saveBtn.querySelector('.spinner');
        saveBtn.disabled = true;
        btnText.textContent = 'Saving...';
        spinner.classList.remove('hidden');

        try {
            // Note: backend expects 0-indexed page num!
            const payload = {
                session_id: currentSessionId,
                page_num: currentPageNum - 1, 
                edits: Array.from(editedBlocksMap.values()),
                deleted: deletedBlockBboxList
            };

            const res = await fetch('/api/save_edit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Successfully saved page changes. Download the whole doc.
            window.location.href = `/api/download_edit/${currentSessionId}`;

            // Clear out edits for next actions if they don't leave
            editedBlocksMap.clear();
            deletedBlockBboxList = [];

        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast("Failed to save changes: " + err.message, "error");
        } finally {
            saveBtn.disabled = false;
            btnText.textContent = 'Save Changes';
            spinner.classList.add('hidden');
        }
    });

    // -------------------------------------------------------------------------
    // 8. UTILS
    // -------------------------------------------------------------------------
    prevBtn.addEventListener('click', () => {
        if (currentPageNum <= 1) return;
        currentPageNum--;
        renderPage(currentPageNum);
    });

    nextBtn.addEventListener('click', () => {
        if (currentPageNum >= totalPages) return;
        currentPageNum++;
        renderPage(currentPageNum);
    });

    function updatePaginationUI() {
        if (totalPages > 0) {
            pageIndicator.textContent = `Page ${currentPageNum} / ${totalPages}`;
            prevBtn.disabled = currentPageNum <= 1;
            nextBtn.disabled = currentPageNum >= totalPages;
        }
    }

    function rgbToHex(rgbStr) {
        if (!rgbStr) return "#000000";
        if (rgbStr.startsWith('#')) return rgbStr;
        const matches = rgbStr.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)$/);
        if (!matches) return "#000000";
        return "#" +
            ("0" + parseInt(matches[1]).toString(16)).slice(-2) +
            ("0" + parseInt(matches[2]).toString(16)).slice(-2) +
            ("0" + parseInt(matches[3]).toString(16)).slice(-2);
    }

    // -------------------------------------------------------------------------
    // 9. PAGE MANAGEMENT
    // -------------------------------------------------------------------------
    managePagesBtn.addEventListener('click', () => {
        openPagesModal();
    });

    closePagesModalBtn.addEventListener('click', () => {
        pagesModal.classList.add('hidden');
    });

    addBlankModalBtn.addEventListener('click', () => {
        pageOrder.push('BLANK');
        renderPageListRow('BLANK', 'BLANK', pageOrder.length);
    });

    function openPagesModal() {
        pagesModal.classList.remove('hidden');
        pagesList.innerHTML = '';
        pageOrder = [];
        
        for (let i = 0; i < totalPages; i++) {
            pageOrder.push(i);
            renderPageListRow(`Page ${i + 1}`, i, i + 1);
        }

        if (pagesSortable) pagesSortable.destroy();
        pagesSortable = new Sortable(pagesList, {
            animation: 150,
            handle: '.page-drag-handle',
            onEnd: () => {
                syncPageOrder();
            }
        });
    }

    function renderPageListRow(title, originalValue, displayIndex) {
        const div = document.createElement('div');
        div.className = 'page-row';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.padding = '0.75rem';
        div.style.background = 'white';
        div.style.marginBottom = '0.5rem';
        div.style.borderRadius = 'var(--radius-sm)';
        div.style.border = '1px solid var(--border)';
        div.dataset.value = originalValue;
        
        div.innerHTML = `
            <div style="display: flex; align-items: center; gap: 1rem;">
                <span class="page-drag-handle" style="cursor: grab; color: var(--text-muted); font-size: 1.2rem;">&#x21c5;</span>
                <span class="page-title-display"><strong>${displayIndex}.</strong> ${title}</span>
            </div>
            <button class="icon-btn text-error remove-page-btn" title="Delete Page" style="color: var(--error); border: none;">&times;</button>
        `;
        
        const removeBtn = div.querySelector('.remove-page-btn');
        removeBtn.addEventListener('click', () => {
            div.remove();
            syncPageOrder();
        });
        
        pagesList.appendChild(div);
    }

    function syncPageOrder() {
        const rows = pagesList.querySelectorAll('.page-row');
        pageOrder = [];
        rows.forEach((row, index) => {
            pageOrder.push(row.dataset.value);
            const titleDisplay = row.querySelector('.page-title-display');
            let currentText = titleDisplay.textContent.split('.')[1] || ' Blank Page';
            currentText = currentText.trim();
            titleDisplay.innerHTML = `<strong>${index + 1}.</strong> ${currentText}`;
        });
    }

    applyPagesBtn.addEventListener('click', async () => {
        if (!currentSessionId) return;
        
        const btnText = applyPagesBtn.querySelector('.btn-text');
        const spinner = applyPagesBtn.querySelector('.spinner');
        applyPagesBtn.disabled = true;
        btnText.textContent = 'Applying...';
        spinner.classList.remove('hidden');

        try {
            const payload = {
                session_id: currentSessionId,
                new_order: pageOrder
            };

            const res = await fetch('/api/reorder_pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Re-fetch document into PDF.js
            const url = `/api/get_pdf/${currentSessionId}?t=${Date.now()}`;
            pdfDoc = await pdfjsLib.getDocument(url).promise;
            totalPages = pdfDoc.numPages;
            
            // Go to page 1
            currentPageNum = 1;
            
            // clear edits! If pages shift, their edits might mismatch.
            editedBlocksMap.clear();
            deletedBlockBboxList = [];
            
            await renderPage(currentPageNum);
            
            pagesModal.classList.add('hidden');

        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast("Failed to apply page changes: " + err.message, "error");
        } finally {
            applyPagesBtn.disabled = false;
            btnText.textContent = 'Apply';
            spinner.classList.add('hidden');
        }
    });
});
