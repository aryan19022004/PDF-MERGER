document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('unprotect-upload-zone');
    const unprotectForm = document.getElementById('unprotect-form');
    const fileInput = document.getElementById('unprotect-file-input');
    const formFileInput = document.getElementById('unprotect-form-file');
    const fileNameDisplay = document.getElementById('unprotect-file-name');
    const removeFileBtn = document.getElementById('remove-unprotect-file');
    
    const submitBtn = document.getElementById('unprotect-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    const togglePwBtn = document.getElementById('toggle-pw-btn');
    const passwordInput = document.getElementById('unprotect-password-input');

    togglePwBtn.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            togglePwBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            passwordInput.type = 'password';
            togglePwBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    window.setupDropzone('unprotect-upload-zone', 'unprotect-file-input', (files) => {
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                const dt = new DataTransfer();
                dt.items.add(file);
                formFileInput.files = dt.files;
                
                fileNameDisplay.textContent = file.name;
                uploadZone.classList.add('hidden');
                unprotectForm.classList.remove('hidden');
            } else {
                window.showToast?.('Please select a valid PDF file.', 'error');
            }
        }
    });

    removeFileBtn.addEventListener('click', () => {
        formFileInput.value = '';
        fileInput.value = '';
        unprotectForm.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        passwordInput.value = '';
    });

    unprotectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!formFileInput.files.length || !passwordInput.value.trim()) {
            window.showToast?.('File and password are required!', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Unlocking...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(unprotectForm);
            
            const response = await fetch('/api/unprotect', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to unlock PDF. Is the password correct?');
            }

            const blob = await response.blob();
            // Try to extract original filename
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'Unlocked_Document.pdf'; 
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) { 
                    filename = matches[1].replace(/['"]/g, '');
                }
            } else {
                 filename = "Unlocked_" + formFileInput.files[0].name;
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
            
            window.showToast?.('Document successfully unlocked!', 'success');

        } catch (error) {
            console.error('Error:', error);
            window.showToast?.(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Unlock PDF';
            spinner.classList.add('hidden');
        }
    });

});
