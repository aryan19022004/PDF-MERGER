document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('ocrpdf-upload-zone');
    const formContainer = document.getElementById('ocrpdf-form');
    const fileInput = document.getElementById('ocrpdf-file-input');
    const fileNameDisplay = document.getElementById('ocrpdf-file-name');
    const removeFileBtn = document.getElementById('remove-ocrpdf-file');
    
    const startBtn = document.getElementById('start-ocrpdf-btn');
    const btnText = startBtn.querySelector('.btn-text');
    const spinner = startBtn.querySelector('.spinner');

    const progressContainer = document.getElementById('ocrpdf-progress-container');
    const statusText = document.getElementById('ocrpdf-status-text');
    const progressBar = document.getElementById('ocrpdf-progress-bar');
    const percentageText = document.getElementById('ocrpdf-percentage');

    const previewContainer = document.getElementById('ocrpdf-preview-container');
    const imagePreview = document.getElementById('ocrpdf-image-preview');

    let currentFile = null;

    window.setupDropzone('ocrpdf-upload-zone', 'ocrpdf-file-input', (files) => {
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                currentFile = file;
                fileNameDisplay.textContent = file.name;
                
                // Show preview
                const url = URL.createObjectURL(file);
                imagePreview.src = url;
                previewContainer.classList.remove('hidden');

                uploadZone.classList.add('hidden');
                formContainer.classList.remove('hidden');
                
                // Reset state
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
                percentageText.textContent = '0%';
                
            } else {
                window.showToast?.('Please select a valid image file (PNG/JPG).', 'error');
            }
        }
    });

    removeFileBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        formContainer.classList.add('hidden');
        uploadZone.classList.remove('hidden');
        imagePreview.src = '';
        previewContainer.classList.add('hidden');
    });

    startBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        startBtn.disabled = true;
        btnText.textContent = 'Analyzing Image...';
        spinner.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        
        try {
            statusText.textContent = 'Loading OCR Engine...';
            
            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        progressBar.style.width = `${progress}%`;
                        percentageText.textContent = `${progress}%`;
                        statusText.textContent = `Extracting Text... ${progress}%`;
                    }
                }
            });
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            const { data: { text } } = await worker.recognize(currentFile);
            
            await worker.terminate();

            statusText.textContent = 'Generating PDF...';
            
            // Generate PDF from text
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            // Basic word wrapping logic for jspdf
            const pageWidth = doc.internal.pageSize.width;
            const margin = 10;
            const maxLineWidth = pageWidth - margin * 2;
            const lines = doc.splitTextToSize(text, maxLineWidth);
            
            // Keep adding text logic ensuring new pages when height exceeds
            let cursorY = margin;
            const pageHeight = doc.internal.pageSize.height;
            
            for (let i = 0; i < lines.length; i++) {
                if (cursorY + 10 > pageHeight - margin) {
                    doc.addPage();
                    cursorY = margin;
                }
                doc.text(lines[i], margin, cursorY);
                cursorY += 7; // line height approx
            }
            
            doc.save(`OCR_${currentFile.name.split('.')[0]}.pdf`);
            
            statusText.textContent = 'Success!';
            window.showToast?.('PDF generated successfully!', 'success');
            
        } catch (error) {
            console.error(error);
            window.showToast?.('Error during extraction process.', 'error');
            statusText.textContent = 'Failed.';
        } finally {
            startBtn.disabled = false;
            btnText.textContent = 'Generate Secure PDF';
            spinner.classList.add('hidden');
        }
    });

});
