document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('wm-upload-zone');
    const formSection = document.getElementById('wm-form');
    const fileInput = document.getElementById('wm-file-input');
    const formFileInput = document.getElementById('wm-form-file');
    const fileNameDisplay = document.getElementById('wm-file-name');
    const removeBtn = document.getElementById('remove-wm-file');
    
    const submitBtn = document.getElementById('wm-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    const opacityInput = document.querySelector('input[name="opacity"]');
    const opacityVal = document.getElementById('opacity-val');

    opacityInput?.addEventListener('input', (e) => {
        opacityVal.textContent = e.target.value;
    });

    let currentFile = null;

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

    function handleFileSelect(file) {
        if (file.type !== 'application/pdf') {
            window.showToast?.('Please upload a valid PDF file.', 'error');
            return;
        }
        currentFile = file;
        fileNameDisplay.textContent = file.name;
        uploadZone.classList.add('hidden');
        formSection.classList.remove('hidden');

        const dt = new DataTransfer();
        dt.items.add(file);
        formFileInput.files = dt.files;
    }

    removeBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        formFileInput.value = '';
        formSection.classList.add('hidden');
        uploadZone.classList.remove('hidden');
    });

    formSection.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!formFileInput.files.length) return;

        submitBtn.disabled = true;
        btnText.textContent = 'Applying...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(formSection);
            const response = await fetch('/api/watermark', {
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
            const finalName = `${baseName}_Watermarked.pdf`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = finalName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            window.showToast?.('Watermark added successfully!', 'success');

        } catch (err) {
            window.showToast?.('Error: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Add Watermark';
            spinner.classList.add('hidden');
        }
    });
});
