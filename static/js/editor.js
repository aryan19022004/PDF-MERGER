// editor.js - Canva-Style Interactive UI

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
    let pdfDoc = null;
    let currentPageNum = 1;
    let currentScale = 1.0;
    let currentViewport = null;
    let currentSessionId = null;

    let activeSpan = null;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;

    // We must track ALL edits across the entire document
    // mapped by page_num (0-indexed) => array of edit objects
    const documentEdits = {};

    // DOM Elements
    const fileInput = document.getElementById('edit-pdf-input');
    const filenameLabel = document.getElementById('active-filename');
    const addTextBtn = document.getElementById('add-text-btn');
    const savePdfBtn = document.getElementById('save-pdf-btn');

    const canvasContainer = document.getElementById('canvas-container');
    const canvas = document.getElementById('pdf-canvas');
    const ctx = canvas.getContext('2d');
    const textLayer = document.getElementById('text-layer');
    const scrollArea = document.getElementById('canvas-scroll-area');

    const floatToolbar = document.getElementById('floating-toolbar');
    const fontSelect = document.getElementById('font-family');
    const sizeInput = document.getElementById('font-size');
    const colorInput = document.getElementById('text-color');
    const btnBold = document.getElementById('btn-bold');
    const btnItalic = document.getElementById('btn-italic');
    const btnUnderline = document.getElementById('btn-underline');
    const btnDelete = document.getElementById('delete-text-btn');

    const pageNav = document.getElementById('page-navigator');
    const btnPrev = document.getElementById('prev-page-btn');
    const btnNext = document.getElementById('next-page-btn');
    const pageInd = document.getElementById('page-indicator');
    const btnZoomIn = document.getElementById('zoom-in-btn');
    const btnZoomOut = document.getElementById('zoom-out-btn');
    const zoomLvl = document.getElementById('zoom-level');
    const btnDeletePage = document.getElementById('delete-page-btn');

    // -------------------------------------------------------------------------
    // 1. UPLOAD & INIT
    // -------------------------------------------------------------------------
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        filenameLabel.textContent = file.name;

        // Upload to backend immediately to get a session
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

            // Load into PDF.js
            const fileReader = new FileReader();
            fileReader.onload = async function () {
                const typedarray = new Uint8Array(this.result);
                pdfDoc = await pdfjsLib.getDocument(typedarray).promise;
                currentPageNum = 1;
                currentScale = 1.0;

                addTextBtn.disabled = false;
                savePdfBtn.disabled = false;
                pageNav.style.opacity = '1';
                pageNav.style.pointerEvents = 'auto';

                renderPage(currentPageNum);
            };
            fileReader.readAsArrayBuffer(file);
        } catch (err) {
            window.showToast?.('Upload failed: ' + err.message, 'error');
        }
    });

    // -------------------------------------------------------------------------
    // 2. RENDER PAGE
    // -------------------------------------------------------------------------
    async function renderPage(num) {
        if (!pdfDoc) return;
        pageInd.textContent = `Page ${num} of ${pdfDoc.numPages}`;
        zoomLvl.textContent = `${Math.round(currentScale * 100)}%`;

        btnPrev.disabled = num <= 1;
        btnNext.disabled = num >= pdfDoc.numPages;

        const page = await pdfDoc.getPage(num);
        const viewport = page.getViewport({ scale: currentScale });
        currentViewport = viewport;

        // Container sizing
        canvasContainer.style.width = `${viewport.width}px`;
        canvasContainer.style.height = `${viewport.height}px`;

        // Canvas sizing
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        // Render PDF Graphics
        const renderContext = {
            canvasContext: ctx,
            viewport: viewport
        };
        await page.render(renderContext).promise;

        // Update Text Layer
        textLayer.style.setProperty('--scale-factor', currentScale);
        textLayer.innerHTML = '';
        hideToolbar();

        // 1. Extract existing PDF text
        const textContent = await page.getTextContent();
        pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport: viewport,
            textDivs: []
        });

        // 2. Setup extracted text to be editable
        setTimeout(() => {
            const spans = textLayer.querySelectorAll('span');
            spans.forEach((span, index) => {
                span.dataset.id = `orig_${index}`;
                span.dataset.isNew = 'false';
                span.classList.add('draggable-handle');

                // Track original bounds right away
                const rect = span.getBoundingClientRect();
                const crect = canvasContainer.getBoundingClientRect();
                span.dataset.origLeft = rect.left - crect.left;
                span.dataset.origTop = rect.top - crect.top;

                span.addEventListener('mousedown', handleSpanClick);
            });

            // 3. Restore any existing edits we made on this page during this session!
            restoreEditsForPage(num - 1); // 0-indexed for backend
        }, 100);
    }

    // -------------------------------------------------------------------------
    // Navigation & Zoom
    // -------------------------------------------------------------------------
    btnPrev.addEventListener('click', () => { if (currentPageNum > 1) renderPage(--currentPageNum); });
    btnNext.addEventListener('click', () => { if (currentPageNum < pdfDoc.numPages) renderPage(++currentPageNum); });

    btnZoomIn.addEventListener('click', () => {
        if (currentScale < 3.0) { currentScale += 0.25; renderPage(currentPageNum); }
    });
    btnZoomOut.addEventListener('click', () => {
        if (currentScale > 0.5) { currentScale -= 0.25; renderPage(currentPageNum); }
    });

    // -------------------------------------------------------------------------
    // 3. TEXT EDITING & DRAGGING
    // -------------------------------------------------------------------------
    function handleSpanClick(e) {
        if (isDragging) return;

        // If clicking a different span, deactivate old one
        if (activeSpan && activeSpan !== e.currentTarget) deactivateSpan();

        activeSpan = e.currentTarget;
        activeSpan.contentEditable = "true";
        activeSpan.style.outline = '2px dashed var(--primary)';
        activeSpan.style.cursor = 'text';

        // Keep it easily editable
        activeSpan.style.whiteSpace = 'pre-wrap';
        activeSpan.style.minWidth = '20px';
        activeSpan.style.minHeight = '1em';

        // Setup dragging via a pseudo handler if we click slightly outside text?
        // Let's just allow drag on mousedown, then editable on mouseup
        isDragging = false;

        positionToolbar(activeSpan);
        syncToolbarStyles(activeSpan);

        activeSpan.addEventListener('input', trackSpanChange);
        activeSpan.addEventListener('blur', trackSpanChange);
    }

    // Drag Logic overrides
    textLayer.addEventListener('mousedown', (e) => {
        if (e.target.tagName.toLowerCase() === 'span' && e.target.classList.contains('draggable-handle')) {
            // Only drag if holding shift OR if it's the active span acting as a handle
            // Canva usually requires clicking a border, we'll just drag if mousedown occurs and mouse moves
            dragStartX = e.clientX;
            dragStartY = e.clientY;

            const onMouseMove = (moveEvent) => {
                isDragging = true;
                const dx = moveEvent.clientX - dragStartX;
                const dy = moveEvent.clientY - dragStartY;

                const curLeft = parseFloat(e.target.style.left || 0);
                const curTop = parseFloat(e.target.style.top || 0);

                e.target.style.left = `${curLeft + dx}px`;
                e.target.style.top = `${curTop + dy}px`;

                dragStartX = moveEvent.clientX;
                dragStartY = moveEvent.clientY;

                if (activeSpan === e.target) positionToolbar(e.target);
            };

            const onMouseUp = () => {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                if (isDragging && e.target === activeSpan) {
                    trackSpanChange(); // Save new pos
                }
                setTimeout(() => isDragging = false, 50);
            };

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        } else {
            // Click outside drops focus
            if (!floatToolbar.contains(e.target)) deactivateSpan();
        }
    });

    // -------------------------------------------------------------------------
    // 4. FLOATING TOOLBAR LOGIC
    // -------------------------------------------------------------------------
    function positionToolbar(span) {
        const rect = span.getBoundingClientRect();
        const scRect = scrollArea.getBoundingClientRect();

        // Try top, if hits ceiling, try bottom
        let top = (rect.top - scRect.top) - 55 + scrollArea.scrollTop;
        if (top < scrollArea.scrollTop) top = (rect.bottom - scRect.top) + 10 + scrollArea.scrollTop;

        let left = (rect.left - scRect.left) + scrollArea.scrollLeft;

        floatToolbar.style.top = `${top}px`;
        floatToolbar.style.left = `${Math.max(10, left)}px`;
        floatToolbar.classList.add('active');
    }

    function hideToolbar() {
        floatToolbar.classList.remove('active');
    }

    function deactivateSpan() {
        if (activeSpan) {
            activeSpan.contentEditable = "false";
            activeSpan.style.outline = 'none';
            trackSpanChange();
            activeSpan.removeEventListener('input', trackSpanChange);
            activeSpan.removeEventListener('blur', trackSpanChange);
            activeSpan = null;
            hideToolbar();
        }
    }

    function syncToolbarStyles(span) {
        const style = window.getComputedStyle(span);
        const ptSize = parseFloat(style.fontSize) / currentScale;
        sizeInput.value = Math.round(ptSize) || 12;

        const rgb = style.color;
        // simplistic rgb to hex
        const a = rgb.split('(')[1].split(')')[0].split(',');
        const hex = "#" + (1 << 24 | a[0] << 16 | a[1] << 8 | a[2]).toString(16).slice(1);
        colorInput.value = hex;
        // fontFamily parsing is messy, default to helvetica for now
    }

    // Toolbar events
    fontSelect.addEventListener('change', () => {
        if (activeSpan) { activeSpan.style.fontFamily = fontSelect.value; trackSpanChange(); positionToolbar(activeSpan); }
    });
    sizeInput.addEventListener('input', () => {
        if (activeSpan) { activeSpan.style.fontSize = `${parseFloat(sizeInput.value) * currentScale}px`; trackSpanChange(); positionToolbar(activeSpan); }
    });
    colorInput.addEventListener('input', () => {
        if (activeSpan) { activeSpan.style.color = colorInput.value; trackSpanChange(); }
    });
    btnBold.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('bold'); trackSpanChange(); });
    btnItalic.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('italic'); trackSpanChange(); });
    btnUnderline.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('underline'); trackSpanChange(); });

    btnDelete.addEventListener('click', () => {
        if (activeSpan) {
            // If it's original text, we must explicitly wipe it.
            activeSpan.innerHTML = '';
            activeSpan.textContent = '';
            trackSpanChange();
            activeSpan.remove();
            deactivateSpan();
        }
    });

    // -------------------------------------------------------------------------
    // 5. ADD TEXT & TRACKING
    // -------------------------------------------------------------------------
    addTextBtn.addEventListener('click', () => {
        if (!pdfDoc) return;
        // Scroll to center roughly
        const cx = scrollArea.scrollLeft + (scrollArea.clientWidth / 2) - 50;
        const cy = scrollArea.scrollTop + (scrollArea.clientHeight / 2) - 20;

        const sp = document.createElement('span');
        sp.dataset.id = `new_${Date.now()}`;
        sp.dataset.isNew = 'true';
        sp.classList.add('draggable-handle');

        sp.style.left = `${cx}px`;
        sp.style.top = `${cy}px`;
        sp.style.fontSize = `${16 * currentScale}px`;
        sp.style.fontFamily = 'helvetica';
        sp.style.color = '#000000';
        sp.style.position = 'absolute';
        sp.style.zIndex = '50';
        sp.innerText = "Double click to edit";

        textLayer.appendChild(sp);
        sp.addEventListener('mousedown', handleSpanClick);

        // Auto activate
        handleSpanClick({ currentTarget: sp, preventDefault: () => { } });
    });

    function trackSpanChange() {
        if (!activeSpan) return;
        const pIdx = currentPageNum - 1;
        if (!documentEdits[pIdx]) documentEdits[pIdx] = { edits: new Map(), deleted: [] };

        const rect = activeSpan.getBoundingClientRect();
        const crect = canvasContainer.getBoundingClientRect();

        const pt1 = currentViewport.convertToPdfPoint(rect.left - crect.left, rect.top - crect.top);
        const pt2 = currentViewport.convertToPdfPoint(rect.right - crect.left, rect.bottom - crect.top);

        const x0 = Math.min(pt1[0], pt2[0]);
        const x1 = Math.max(pt1[0], pt2[0]);
        const y0 = Math.min(pt1[1], pt2[1]);
        const y1 = Math.max(pt1[1], pt2[1]);

        let rawText = activeSpan.innerText || activeSpan.textContent;
        rawText = rawText.replace(/\u00A0/g, " ");

        // If origText modified/moved, mark original bbox for deletion
        if (activeSpan.dataset.isNew === 'false') {
            const op1 = currentViewport.convertToPdfPoint(parseFloat(activeSpan.dataset.origLeft), parseFloat(activeSpan.dataset.origTop));
            const odx = Math.min(op1[0], op1[0] + 50); // rough
            const ody = Math.min(op1[1], op1[1] + 20);
            // Append to deleted array uniquely
            documentEdits[pIdx].deleted.push([Math.min(op1[0], op1[0] + 5), Math.min(op1[1], op1[1] - 5), Math.max(op1[0], op1[0] + 100), Math.max(op1[1], op1[1] + 20)]);
        }

        documentEdits[pIdx].edits.set(activeSpan.dataset.id, {
            text: rawText,
            html: activeSpan.innerHTML,
            new_bbox: [x0, y0, x1, y1],
            fontFamilly: fontSelect.value,
            fontSize: parseInt(sizeInput.value),
            color: colorInput.value
        });
    }

    function restoreEditsForPage(pIdx) {
        if (!documentEdits[pIdx]) return;
        // For simplicity, we just keep edits in memory. Re-rendering customized HTML 
        // into the pdf.js generated <span> array is tricky without saving to backend first.
        // In this MVP, we warn the user or just keep the state. (Canva clones usually auto-save).
    }

    // -------------------------------------------------------------------------
    // 6. DELETE SEC PAGE & EXPORT
    // -------------------------------------------------------------------------
    btnDeletePage.addEventListener('click', async () => {
        if (!pdfDoc || !confirm('Are you sure you want to permanently delete this page?')) return;

        try {
            // Optional: call API to drop page from memory
            const res = await fetch('/api/delete_page', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId, page_num: currentPageNum - 1 })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            window.showToast?.('Page deleted.', 'success');

            // Refetch the Document from the server so pdfjs updates page count
            const fetchRes = await fetch(`/api/download_edit/${currentSessionId}`);
            const buf = await fetchRes.arrayBuffer();
            pdfDoc = await pdfjsLib.getDocument(new Uint8Array(buf)).promise;

            // Adjust page number 
            if (currentPageNum > pdfDoc.numPages) currentPageNum = Math.max(1, pdfDoc.numPages);
            if (pdfDoc.numPages > 0) renderPage(currentPageNum);
            else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                textLayer.innerHTML = '';
            }
        } catch (err) {
            window.showToast?.('Delete failed: ' + err.message, 'error');
        }
    });

    savePdfBtn.addEventListener('click', async () => {
        if (!currentSessionId) return;

        const btnText = savePdfBtn.querySelector('.btn-text');
        const spinner = savePdfBtn.querySelector('.spinner');
        savePdfBtn.disabled = true;
        btnText.textContent = 'Saving...';
        spinner.classList.remove('hidden');

        deactivateSpan(); // ensure tracked

        try {
            // Save iteratively for ALL pages that have edits
            for (const [pIdxStr, dataObj] of Object.entries(documentEdits)) {
                if (dataObj.edits.size === 0 && dataObj.deleted.length === 0) continue;

                const payload = {
                    session_id: currentSessionId,
                    page_num: parseInt(pIdxStr),
                    edits: Array.from(dataObj.edits.values()),
                    deleted: dataObj.deleted
                };

                const res = await fetch('/api/save_edit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const resData = await res.json();
                if (resData.error) throw new Error(resData.error);
            }

            // Finally, stream download
            window.location.href = `/api/download_edit/${currentSessionId}`;

        } catch (err) {
            window.showToast?.("Error saving: " + err.message, "error");
        } finally {
            savePdfBtn.disabled = false;
            btnText.textContent = 'Export PDF';
            spinner.classList.add('hidden');
        }
    });
});
