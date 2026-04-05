document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('protect-upload-zone');
    const protectForm = document.getElementById('protect-form');
    const fileInput = document.getElementById('protect-file-input');
    const formFileInput = document.getElementById('protect-form-file');
    const fileNameDisplay = document.getElementById('protect-file-name');
    const removeFileBtn = document.getElementById('remove-protect-file');
    
    const submitBtn = document.getElementById('protect-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    const togglePwBtn = document.getElementById('toggle-pw-btn');
    const passwordInput = document.getElementById('protect-password-input');

    togglePwBtn.addEventListener('click', () => {
        if (passwordInput.type === 'password') {
            passwordInput.type = 'text';
            togglePwBtn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
        } else {
            passwordInput.type = 'password';
            togglePwBtn.innerHTML = '<i class="fa-solid fa-eye"></i>';
        }
    });

    window.setupDropzone('protect-upload-zone', 'protect-file-input', (files) => {
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                const dt = new DataTransfer();
                dt.items.add(file);
                formFileInput.files = dt.files;
                
                fileNameDisplay.textContent = file.name;
                uploadZone.classList.add('hidden');
                protectForm.classList.remove('hidden');
            } else {
                window.showToast?.('Please select a valid PDF file.', 'error');
            }
        }
    });

    removeFileBtn.addEventListener('click', () => {
        formFileInput.value = '';
        fileInput.value = '';
        protectForm.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        passwordInput.value = '';
    });

    protectForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!formFileInput.files.length || !passwordInput.value.trim()) {
            window.showToast?.('File and password are required!', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Protecting...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(protectForm);
            
            const response = await fetch('/api/protect', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to protect PDF');
            }

            const blob = await response.blob();
            // Try to extract original filename
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = 'Protected_Document.pdf'; 
            if (contentDisposition && contentDisposition.indexOf('attachment') !== -1) {
                const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                const matches = filenameRegex.exec(contentDisposition);
                if (matches != null && matches[1]) { 
                    filename = matches[1].replace(/['"]/g, '');
                }
            } else {
                 filename = "Protected_" + formFileInput.files[0].name;
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
            
            window.showToast?.('Document protected securely!', 'success');

        } catch (error) {
            console.error('Error:', error);
            window.showToast?.(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Protect PDF';
            spinner.classList.add('hidden');
        }
    });

});
