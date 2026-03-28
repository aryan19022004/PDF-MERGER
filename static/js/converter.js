document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('conv-upload-zone');
    const convForm = document.getElementById('conv-form');
    const formFileInput = document.getElementById('conv-form-file');
    const fileListDisplay = document.getElementById('conv-file-list');
    
    const submitBtn = document.getElementById('conv-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    let selectedFiles = [];

    window.setupDropzone('conv-upload-zone', 'conv-file-input', (files) => {
        const acceptExts = document.getElementById('conv-file-input').accept.split(',');
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            const isValid = acceptExts.some(a => a.trim() === ext || a.trim() === file.type);
            
            if (isValid || acceptExts.includes('*/*') || acceptExts.includes('')) {
                selectedFiles.push(file);
            } else {
                window.showToast?.(`Skipped ${file.name} - Unsupported format.`, 'error');
            }
        }
        
        updateFileList();
        
        if (selectedFiles.length > 0) {
            uploadZone.classList.add('hidden');
            convForm.classList.remove('hidden');
        }
    });

    // Add more files button inside the form
    const addMoreBtn = document.getElementById('add-more-files-btn');
    if (addMoreBtn) {
        addMoreBtn.addEventListener('click', () => {
            document.getElementById('conv-file-input').click();
        });
    }

    function updateFileList() {
        fileListDisplay.innerHTML = '';
        const dt = new DataTransfer();
        
        selectedFiles.forEach((file, index) => {
            dt.items.add(file);
            
            const div = document.createElement('div');
            div.className = 'file-item';
            div.innerHTML = `
                <div class="file-item-info">
                    <i class="fa-solid fa-file"></i>
                    <span>${file.name}</span>
                </div>
                <button type="button" class="btn-icon remove-file-btn" data-index="${index}"><i class="fa-solid fa-trash text-error"></i></button>
            `;
            fileListDisplay.appendChild(div);
        });
        
        formFileInput.files = dt.files;
        
        document.querySelectorAll('.remove-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index);
                selectedFiles.splice(idx, 1);
                updateFileList();
                if (selectedFiles.length === 0) {
                    convForm.classList.add('hidden');
                    uploadZone.classList.remove('hidden');
                }
            });
        });
    }

    convForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (selectedFiles.length === 0) {
            window.showToast?.('Please select files to convert.', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Processing...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(convForm);
            const actionUrl = convForm.action;
            
            const response = await fetch(actionUrl, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Conversion failed');
            }

            const blob = await response.blob();
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'converted_files.zip'; 
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
            
            window.showToast?.('Successfully converted!', 'success');

        } catch (error) {
            console.error('Error:', error);
            window.showToast?.(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Convert Files';
            spinner.classList.add('hidden');
        }
    });
});
