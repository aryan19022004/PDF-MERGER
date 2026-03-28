document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('split-upload-zone');
    const splitForm = document.getElementById('split-form');
    const formFileInput = document.getElementById('split-form-file');
    const fileNameDisplay = document.getElementById('split-file-name');
    const removeBtn = document.getElementById('remove-split-file');
    
    const submitBtn = document.getElementById('split-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    window.setupDropzone('split-upload-zone', 'split-file-input', (files) => {
        const file = files[0];
        if (file && file.type === 'application/pdf') {
            // Because we can't assign FileList from datatransfer directly to another input easily across browsers,
            // we use DataTransfer to mirror it.
            const dt = new DataTransfer();
            dt.items.add(file);
            formFileInput.files = dt.files;
            
            fileNameDisplay.textContent = file.name;
            uploadZone.classList.add('hidden');
            splitForm.classList.remove('hidden');
        } else {
            window.showToast?.('Please upload a valid PDF file.', 'error');
        }
    });

    removeBtn.addEventListener('click', () => {
        formFileInput.value = '';
        fileNameDisplay.textContent = '';
        splitForm.classList.add('hidden');
        uploadZone.classList.remove('hidden');
    });

    splitForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!formFileInput.files.length) {
            window.showToast?.('Please select a file first.', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Splitting...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(splitForm);
            const response = await fetch('/split', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to split PDF');
            }

            // Could return a ZIP if multiple files, or a single PDF. Both are blobs.
            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'split_documents.zip'; // default
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) { 
                    filename = matches[1].replace(/['"]/g, '');
                }
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            window.showToast?.('Split successful!', 'success');

        } catch (error) {
            console.error('Error:', error);
            window.showToast?.(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Split PDF';
            spinner.classList.add('hidden');
        }
    });
});
