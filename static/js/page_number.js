document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('pagenum-upload-zone');
    const fileInput = document.getElementById('pagenum-file-input');
    const formSection = document.getElementById('pagenum-form');
    const fileNameDisplay = document.getElementById('pagenum-file-name');
    const removeBtn = document.getElementById('remove-pagenum-file');
    const applyBtn = document.getElementById('apply-pagenum-btn');
    
    let currentFile = null;

    // --- Upload Zone Logic ---
    uploadZone.addEventListener('click', () => {
        if (!currentFile) fileInput.click();
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

    function handleFileSelect(file) {
        if (file.type !== 'application/pdf') {
            window.showToast?.('Please upload a valid PDF file.', 'error');
            return;
        }
        currentFile = file;
        fileNameDisplay.textContent = file.name;
        uploadZone.classList.add('hidden');
        formSection.classList.remove('hidden');
    }

    removeBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        formSection.classList.add('hidden');
        uploadZone.classList.remove('hidden');
    });

    // --- Submit Flow ---
    applyBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        const formData = new FormData();
        formData.append('pdf_file', currentFile);
        formData.append('range', document.getElementById('pagenum-range').value);
        formData.append('prefix', document.getElementById('pagenum-prefix').value);
        formData.append('start_num', document.getElementById('pagenum-start').value);
        formData.append('position', document.getElementById('pagenum-pos').value);
        formData.append('size', document.getElementById('pagenum-size').value);
        formData.append('color', document.getElementById('pagenum-color').value);

        const btnText = applyBtn.querySelector('.btn-text');
        const spinner = applyBtn.querySelector('.spinner');
        
        applyBtn.disabled = true;
        btnText.textContent = 'Processing...';
        spinner.classList.remove('hidden');

        try {
            const response = await fetch('/api/add_page_numbers', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Server processing failed');
            }

            // It's a file blob download
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            
            // Generate clean native output filename
            let baseName = currentFile.name.replace(/\.[^/.]+$/, "");
            const finalName = `${baseName}_Numbered.pdf`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = finalName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            window.showToast?.('Page numbers successfully added!', 'success');

        } catch (err) {
            window.showToast?.('Error: ' + err.message, 'error');
        } finally {
            applyBtn.disabled = false;
            btnText.textContent = 'Add Page Numbers';
            spinner.classList.add('hidden');
        }
    });
});
