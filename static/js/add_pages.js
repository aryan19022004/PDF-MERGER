document.addEventListener('DOMContentLoaded', () => {
    const formSection = document.getElementById('add-form');
    
    const mainUploadZone = document.getElementById('main-upload-zone');
    const mainFileInput = document.getElementById('main-file-input');
    const mainFileText = document.getElementById('main-file-text');

    const addonUploadZone = document.getElementById('addon-upload-zone');
    const addonFileInput = document.getElementById('addon-file-input');
    const addonFileText = document.getElementById('addon-file-text');
    
    const submitBtn = document.getElementById('add-submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    const positionRadios = document.querySelectorAll('input[name="position"]');
    const customPageContainer = document.getElementById('custom-page-container');

    // UI Updates
    mainFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            mainFileText.textContent = e.target.files[0].name;
            mainUploadZone.classList.add('border-blue-500', 'bg-blue-50');
        }
    });

    addonFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            addonFileText.textContent = e.target.files[0].name;
            addonUploadZone.classList.add('border-emerald-500', 'bg-emerald-50');
        }
    });

    // Custom Position Input visibility
    positionRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                customPageContainer.classList.remove('hidden');
            } else {
                customPageContainer.classList.add('hidden');
            }
        });
    });

    formSection.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!mainFileInput.files.length || !addonFileInput.files.length) {
            window.showToast?.('Both files are required!', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Inserting Pages...';
        spinner.classList.remove('hidden');

        try {
            const formData = new FormData(formSection);
            const response = await fetch('/api/add-pages', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Server processing failed');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            
            let baseName = mainFileInput.files[0].name.replace(/\.[^/.]+$/, "");
            const finalName = `${baseName}_Expanded.pdf`;

            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = finalName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(downloadUrl);
            
            window.showToast?.('Media inserted successfully!', 'success');

        } catch (err) {
            window.showToast?.('Error: ' + err.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Insert Media';
            spinner.classList.add('hidden');
        }
    });
});
