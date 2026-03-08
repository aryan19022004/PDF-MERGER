document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------------
    // 1. TABS LOGIC
    // -------------------------------------------------------------------------
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active from all tabs
            tabs.forEach(t => t.classList.remove('active'));
            // Hide all views
            document.querySelectorAll('.view-section').forEach(v => v.classList.add('hidden'));

            // Activate clicked tab
            tab.classList.add('active');
            // Show target view
            const targetId = tab.getAttribute('data-target');
            document.getElementById(targetId).classList.remove('hidden');
        });
    });

    // -------------------------------------------------------------------------
    // 2. EDITOR STATE & DOM ELEMENTS
    // -------------------------------------------------------------------------
    let currentSessionId = null;
    let currentPage = 0;
    let totalPages = 0;
    let textBlocks = []; // Data from backend
    let editedBlocksMap = new Map(); // Keep track of blocks we changed
    let deletedBlockBboxList = []; // Original BBoxes of changed elements to erase

    let activeBlockId = null; // Currently clicked block

    // Upload Elements
    const editFileInput = document.getElementById('edit_pdf');
    const labelEditPdf = document.getElementById('label-edit-pdf');
    const uploadSection = document.getElementById('edit-upload-section');
    const errorMsg = document.getElementById('edit-error-message');

    // Workspace Elements
    const workspace = document.getElementById('editor-workspace');
    const bgImage = document.getElementById('pdf-bg-layer');
    const overlayLayer = document.getElementById('text-overlay-layer');
    const canvasContainer = document.getElementById('pdf-canvas-container');

    // Toolbar
    const pageIndicator = document.getElementById('page-indicator');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const saveBtn = document.getElementById('save-edit-btn');
    const textTools = document.getElementById('text-tools');
    const fontSelect = document.getElementById('font-family-select');
    const sizeInput = document.getElementById('font-size-input');
    const colorInput = document.getElementById('text-color-input');

    // Drag State
    let isDragging = false;
    let dragTarget = null;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    // -------------------------------------------------------------------------
    // 3. FILE UPLOAD & INIT
    // -------------------------------------------------------------------------
    editFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || file.type !== 'application/pdf') {
            showError("Please select a valid PDF.");
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
            totalPages = data.total_pages;
            currentPage = 0;

            // Switch UI
            uploadSection.classList.add('hidden');
            workspace.classList.remove('hidden');

            // Load first page
            await loadPageData();

        } catch (err) {
            console.error(err);
            showError(err.message);
            labelEditPdf.classList.remove('has-file');
            labelEditPdf.querySelector('.file-name').textContent = '';
        }
    });

    async function loadPageData() {
        if (!currentSessionId) return;

        // Reset states for new page
        overlayLayer.innerHTML = '';
        activeBlockId = null;
        textTools.classList.add('opacity-50', 'pe-none');
        updatePaginationUI();

        try {
            const res = await fetch(`/api/page_data/${currentSessionId}/${currentPage}`);
            const data = await res.json();

            if (data.error) throw new Error(data.error);

            // Set image
            bgImage.src = data.image;
            bgImage.onload = () => {
                // Resize container to match natural image size 
                // Wait for CSS to lay it out, but usually width: 100% works cleanly
                const scaleX = bgImage.clientWidth / data.width;
                const scaleY = bgImage.clientHeight / data.height;

                textBlocks = data.blocks;
                renderTextBlocks(scaleX, scaleY);
            };

        } catch (err) {
            console.error(err);
            showError("Failed to load page.");
        }
    }

    function renderTextBlocks(scaleX, scaleY) {
        textBlocks.forEach(block => {
            const div = document.createElement('div');
            div.className = 'pdf-text-block';
            div.id = `block-${block.id}`;
            div.textContent = block.text;

            // Map BBox from PDF (points) to HTML (px relative to scaled image)
            const [x0, y0, x1, y1] = block.bbox;
            const width = (x1 - x0) * scaleX;
            const height = (y1 - y0) * scaleY;

            div.style.left = `${x0 * scaleX}px`;
            div.style.top = `${y0 * scaleY}px`;
            // div.style.width = `${width}px`;  // Letting it size to content prevents wrap bugs
            div.style.fontSize = `${block.size * scaleX * 1.3}px`; // 1.3 approximate conversion

            // Convert PyMuPDF int color to hex
            let hexColorStr = "#000000";
            if (typeof block.color === 'number') {
                hexColorStr = '#' + ('000000' + block.color.toString(16)).slice(-6);
            }
            div.style.color = hexColorStr;
            div.dataset.originalColor = hexColorStr;
            div.dataset.font = block.font;
            div.dataset.scaleX = scaleX;
            div.dataset.scaleY = scaleY;
            div.dataset.originalBbox = JSON.stringify(block.bbox); // Keep the exact original

            // Interactions
            div.addEventListener('mousedown', onBlockMouseDown);
            div.addEventListener('click', (e) => onBlockClick(e, div));
            div.addEventListener('input', () => onBlockEdit(div)); // when contenteditable changes

            overlayLayer.appendChild(div);
        });
    }

    // -------------------------------------------------------------------------
    // 4. INTERACTION: CLICK, SELECT, TOOLBAR
    // -------------------------------------------------------------------------

    // Deselect clicking outside
    canvasContainer.addEventListener('mousedown', (e) => {
        if (e.target.id === 'text-overlay-layer' || e.target.id === 'pdf-bg-layer') {
            deactivateAllBlocks();
        }
    });

    function deactivateAllBlocks() {
        document.querySelectorAll('.pdf-text-block').forEach(b => {
            b.classList.remove('active');
            b.removeAttribute('contenteditable');
        });
        activeBlockId = null;
        textTools.classList.add('opacity-50', 'pe-none');
    }

    function onBlockClick(e, div) {
        e.stopPropagation();

        // If it's already active, make it editable
        if (div.classList.contains('active')) {
            div.setAttribute('contenteditable', 'true');
            div.focus();
            return;
        }

        // Otherwise, make it active
        deactivateAllBlocks();
        div.classList.add('active');
        activeBlockId = div.id;

        // Populate toolbar
        textTools.classList.remove('opacity-50', 'pe-none');

        const currentFontSize = parseInt(window.getComputedStyle(div).fontSize);
        const currentScaleX = parseFloat(div.dataset.scaleX);
        sizeInput.value = Math.round(currentFontSize / (currentScaleX * 1.3)); // Back to approx pt size

        // Try getting hex from rgb
        const rgbColor = window.getComputedStyle(div).color;
        colorInput.value = rgbToHex(rgbColor) || div.dataset.originalColor;

        // Note: PyMuPDF font names are messy (e.g. "Times-Roman", "Helvetica-Bold").
        // We do a rough match for the dropdown.
        const fontLower = (div.dataset.font || '').toLowerCase();
        if (fontLower.includes('time') || fontLower.includes('serif')) {
            fontSelect.value = 'times';
        } else if (fontLower.includes('cour') || fontLower.includes('mono')) {
            fontSelect.value = 'courier';
        } else {
            fontSelect.value = 'helvetica';
        }
    }

    // Toolbar Listeners
    fontSelect.addEventListener('change', () => applyStyleToActive('fontFamily', fontSelect.value));
    sizeInput.addEventListener('change', () => {
        if (!activeBlockId) return;
        const div = document.getElementById(activeBlockId);
        const scaleX = parseFloat(div.dataset.scaleX);
        const rawSize = parseInt(sizeInput.value);
        div.style.fontSize = `${rawSize * scaleX * 1.3}px`;
        onBlockEdit(div); // mark as dirty
    });
    colorInput.addEventListener('input', () => applyStyleToActive('color', colorInput.value));

    function applyStyleToActive(prop, value) {
        if (!activeBlockId) return;
        const div = document.getElementById(activeBlockId);
        div.style[prop] = value;
        onBlockEdit(div); // mark dirty
    }

    // -------------------------------------------------------------------------
    // 5. INTERACTION: DRAG & DROP
    // -------------------------------------------------------------------------
    function onBlockMouseDown(e) {
        // Don't start drag if we are actively typing text inside
        if (e.target.getAttribute('contenteditable') === 'true') {
            return;
        }

        isDragging = true;
        dragTarget = e.target;

        const rect = dragTarget.getBoundingClientRect();
        const containerRect = canvasContainer.getBoundingClientRect();

        // Store mouse offset relative to the block's top-left
        startX = e.clientX - rect.left;
        startY = e.clientY - rect.top;

        document.addEventListener('mousemove', onDocumentMouseMove);
        document.addEventListener('mouseup', onDocumentMouseUp);
        e.preventDefault(); // Prevent text selection highlight while dragging
    }

    function onDocumentMouseMove(e) {
        if (!isDragging || !dragTarget) return;

        const containerRect = canvasContainer.getBoundingClientRect();

        // Calculate new top/left relative to the container
        let newLeft = Math.round(e.clientX - containerRect.left - startX);
        let newTop = Math.round(e.clientY - containerRect.top - startY);

        // Optional bounding box constraint so it doesn't leave canvas
        newLeft = Math.max(0, Math.min(newLeft, containerRect.width - dragTarget.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, containerRect.height - dragTarget.offsetHeight));

        dragTarget.style.left = `${newLeft}px`;
        dragTarget.style.top = `${newTop}px`;
    }

    function onDocumentMouseUp(e) {
        if (isDragging && dragTarget) {
            onBlockEdit(dragTarget); // Register position change
        }
        isDragging = false;
        dragTarget = null;
        document.removeEventListener('mousemove', onDocumentMouseMove);
        document.removeEventListener('mouseup', onDocumentMouseUp);
    }

    // -------------------------------------------------------------------------
    // 6. RECORDING CHANGES
    // -------------------------------------------------------------------------
    function onBlockEdit(div) {
        // If this is the first time we edit this block, save its original bounding box
        // so the backend knows to erase the *original* text under it.
        if (!editedBlocksMap.has(div.id)) {
            const origBbox = JSON.parse(div.dataset.originalBbox);
            deletedBlockBboxList.push(origBbox);
        }

        // Calculate new BBox for PyMuPDF based on new HTML position
        // Backwards calculation: divide px by scale factor
        const scaleX = parseFloat(div.dataset.scaleX);
        const scaleY = parseFloat(div.dataset.scaleY);

        const pxLeft = parseFloat(div.style.left);
        const pxTop = parseFloat(div.style.top);

        const newX0 = pxLeft / scaleX;
        const newY0 = pxTop / scaleY;
        // width/height approximation
        const newX1 = newX0 + (div.offsetWidth / scaleX);
        const newY1 = newY0 + (div.offsetHeight / scaleY);

        const fontName = fontSelect.value || 'helv'; // fallback logic
        const fontSizeRaw = sizeInput.value || 12;
        const colorHex = rgbToHex(window.getComputedStyle(div).color) || '#000000';

        // Save new state
        editedBlocksMap.set(div.id, {
            text: div.textContent || div.innerText,
            new_bbox: [newX0, newY0, newX1, newY1],
            fontFamilly: fontName,
            fontSize: parseInt(fontSizeRaw),
            color: colorHex
        });
    }

    // -------------------------------------------------------------------------
    // 7. SAVE TO BACKEND
    // -------------------------------------------------------------------------
    saveBtn.addEventListener('click', async () => {
        if (!currentSessionId) return;
        if (editedBlocksMap.size === 0) {
            alert("No changes made on this page.");
            return;
        }

        const btnText = saveBtn.querySelector('.btn-text');
        const spinner = saveBtn.querySelector('.spinner');
        saveBtn.disabled = true;
        btnText.textContent = 'Saving...';
        spinner.classList.remove('hidden');

        try {
            const payload = {
                session_id: currentSessionId,
                page_num: currentPage,
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

            // NOTE: Usually you stay and keep editing, but per requirement we allow download
            // Clear out edits for next actions if they don't leave
            editedBlocksMap.clear();
            deletedBlockBboxList = [];

        } catch (err) {
            console.error(err);
            showError("Failed to save changes: " + err.message);
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
        if (currentPage > 0) {
            currentPage--;
            loadPageData();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages - 1) {
            currentPage++;
            loadPageData();
        }
    });

    function updatePaginationUI() {
        if (totalPages > 0) {
            pageIndicator.textContent = `Page ${currentPage + 1} / ${totalPages}`;
            prevBtn.disabled = currentPage === 0;
            nextBtn.disabled = currentPage === totalPages - 1;
        }
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
        setTimeout(() => {
            errorMsg.classList.add('hidden');
        }, 5000);
    }

    function rgbToHex(rgbStr) {
        const matches = rgbStr.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
        if (!matches) return null;
        return "#" +
            ("0" + parseInt(matches[1]).toString(16)).slice(-2) +
            ("0" + parseInt(matches[2]).toString(16)).slice(-2) +
            ("0" + parseInt(matches[3]).toString(16)).slice(-2);
    }
});
