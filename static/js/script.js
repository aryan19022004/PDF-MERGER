document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('merge-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');
    const errorMsg = document.getElementById('error-message');

    // Setup drag & drop and file selection for both inputs
    ['pdf1', 'pdf2'].forEach(id => {
        const input = document.getElementById(id);
        const label = document.getElementById(`label-${id}`);
        const fileNameSpan = label.querySelector('.file-name');
        
        // Handle file selection via click
        input.addEventListener('change', (e) => {
            handleFileSelect(e.target.files[0], label, fileNameSpan);
        });

        // Drag and drop events
        label.addEventListener('dragover', (e) => {
            e.preventDefault();
            label.classList.add('dragover');
        });

        label.addEventListener('dragleave', (e) => {
            e.preventDefault();
            label.classList.remove('dragover');
        });

        label.addEventListener('drop', (e) => {
            e.preventDefault();
            label.classList.remove('dragover');
            
            if (e.dataTransfer.files.length) {
                input.files = e.dataTransfer.files;
                handleFileSelect(e.dataTransfer.files[0], label, fileNameSpan);
            }
        });
    });

    function handleFileSelect(file, labelDiv, nameSpan) {
        if (file && file.type === 'application/pdf') {
            labelDiv.classList.add('has-file');
            nameSpan.textContent = file.name;
        } else {
            labelDiv.classList.remove('has-file');
            nameSpan.textContent = '';
            showError('Please select a valid PDF file.');
        }
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.classList.remove('hidden');
        setTimeout(() => {
            errorMsg.classList.add('hidden');
        }, 5000); // Hide error after 5 seconds
    }

    // Form submission processing
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const pdf1 = document.getElementById('pdf1').files.length;
        const pdf2 = document.getElementById('pdf2').files.length;

        if (!pdf1 || !pdf2) {
            showError('Both PDF files must be selected!');
            return;
        }

        // Set Loading State
        submitBtn.disabled = true;
        btnText.textContent = 'Merging...';
        spinner.classList.remove('hidden');
        errorMsg.classList.add('hidden');

        try {
            const formData = new FormData(form);
            
            const response = await fetch('/merge', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to merge PDFs');
            }

            // Successfully received PDF blob
            const blob = await response.blob();
            
            // Create automatic download link
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `merged_${new Date().getTime()}.pdf`;
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

        } catch (error) {
            console.error('Error:', error);
            showError(error.message);
        } finally {
            // Reset Button State
            submitBtn.disabled = false;
            btnText.textContent = 'Merge PDFs';
            spinner.classList.add('hidden');
        }
    });

    // Helper: Basic client-side validation for range format typing
    const rangeInputs = document.querySelectorAll('input[type="text"]');
    rangeInputs.forEach(input => {
        input.addEventListener('input', (e) => {
            // Only allow numbers, commas, dashes, and spaces
            e.target.value = e.target.value.replace(/[^0-9,\-\s]/g, '');
        });
    });
});
