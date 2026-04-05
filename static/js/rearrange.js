document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('rr-upload-zone');
    const interfaceSection = document.getElementById('rr-interface');
    const fileInput = document.getElementById('rr-file-input');
    const fileNameDisplay = document.getElementById('rr-file-name');
    const statusText = document.getElementById('rr-status');
    const resetBtn = document.getElementById('rr-reset-btn');
    const submitBtn = document.getElementById('rr-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const pagesGrid = document.getElementById('rr-pages-grid');

    let currentFile = null;
    let sortableInstance = null;
    let totalPages = 0;

    uploadZone.addEventListener('click', (e) => {
        if (!currentFile && e.target !== fileInput) fileInput.click();
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });

    uploadZone.addEventListener('dragleave', () => {
        uploadZone.classList.remove('dragover');
    });

    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFileSelect(e.target.files[0]);
        }
    });

    async function handleFileSelect(file) {
        if (file.type !== 'application/pdf') {
            window.showToast?.('Please upload a valid PDF file.', 'error');
            return;
        }
        currentFile = file;
        fileNameDisplay.textContent = file.name;
        
        uploadZone.classList.add('hidden');
        interfaceSection.classList.remove('hidden');
        pagesGrid.innerHTML = ''; // reset
        submitBtn.disabled = true;

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            totalPages = pdf.numPages;
            
            // Limit for browser UI safety
            if (totalPages > 150) {
                statusText.textContent = "PDF is too large for visual rearranging (> 150 pages).";
                return;
            }

            statusText.textContent = `Extracting ${totalPages} thumbnails...`;

            for (let i = 1; i <= totalPages; i++) {
                const page = await pdf.getPage(i);
                
                // Get viewport but shrink it for memory efficiency (thumbnails)
                const viewport = page.getViewport({ scale: 0.3 }); 
                
                // Create container
                const itemDiv = document.createElement('div');
                itemDiv.className = 'rr-page-item';
                itemDiv.dataset.originalIndex = i - 1; // 0-based for the backend Array

                // Create Canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // Render PDF page into canvas context
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;

                // Add label
                const label = document.createElement('span');
                label.className = 'font-bold text-slate-700 text-sm';
                label.textContent = i;
                
                itemDiv.appendChild(canvas);
                itemDiv.appendChild(label);
                
                pagesGrid.appendChild(itemDiv);

                statusText.textContent = `Extracted ${i} of ${totalPages}...`;
            }

            // Initialize Sortable
            sortableInstance = new Sortable(pagesGrid, {
                animation: 150,
                ghostClass: 'sortable-ghost',
                dragClass: 'sortable-drag',
                onEnd: function (evt) {
                    // Update visual labels if you want them to represent 1,2,3 or keep original numbers
                    // Generally, we keep original numbers so users know what page went where.
                },
            });

            statusText.textContent = `${totalPages} Pages. Ready!`;
            statusText.classList.replace('text-amber-500', 'text-emerald-500');
            submitBtn.disabled = false;

        } catch (err) {
            console.error(err);
            statusText.textContent = "Error rendering PDF pages.";
            statusText.classList.replace('text-amber-500', 'text-red-500');
        }
    }

    resetBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        pagesGrid.innerHTML = '';
        if (sortableInstance) sortableInstance.destroy();
        statusText.classList.replace('text-emerald-500', 'text-amber-500');
        statusText.classList.replace('text-red-500', 'text-amber-500');
        
        interfaceSection.classList.add('hidden');
        uploadZone.classList.remove('hidden');
    });

    submitBtn.addEventListener('click', async () => {
        if (!currentFile || !sortableInstance) return;

        submitBtn.disabled = true;
        btnText.textContent = 'Saving...';
        spinner.classList.remove('hidden');

        // Extract order from DOM
        const orderArr = [];
        const items = pagesGrid.querySelectorAll('.rr-page-item');
        items.forEach(item => {
            orderArr.push(item.dataset.originalIndex);
        });
        
        const orderStr = orderArr.join(',');

        try {
            const formData = new FormData();
            formData.append('pdf_file', currentFile);
            formData.append('order', orderStr);

            const response = await fetch('/api/rearrange', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Server processing failed');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            
            let baseName = currentFile.name.replace(/\.[^/.]+$/, "");
            const finalName = `${baseName}_Rearranged.pdf`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = finalName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            window.showToast?.('Pages successfully rearranged!', 'success');

        } catch (err) {
            window.showToast?.('Error: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Save Order';
            spinner.classList.add('hidden');
        }
    });
});
