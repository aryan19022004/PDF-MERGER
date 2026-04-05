document.addEventListener('DOMContentLoaded', () => {
    const uploadZone = document.getElementById('ocr-upload-zone');
    const ocrForm = document.getElementById('ocr-form');
    const fileInput = document.getElementById('ocr-file-input');
    const fileNameDisplay = document.getElementById('ocr-file-name');
    const removeFileBtn = document.getElementById('remove-ocr-file');
    
    const startOcrBtn = document.getElementById('start-ocr-btn');
    const btnText = startOcrBtn.querySelector('.btn-text');
    const spinner = startOcrBtn.querySelector('.spinner');

    const progressContainer = document.getElementById('ocr-progress-container');
    const statusText = document.getElementById('ocr-status-text');
    const progressBar = document.getElementById('ocr-progress-bar');
    const percentageText = document.getElementById('ocr-percentage');

    const resultContainer = document.getElementById('ocr-result-container');
    const textResult = document.getElementById('ocr-text-result');
    const copyBtn = document.getElementById('copy-btn');
    const downloadTxtBtn = document.getElementById('download-txt-btn');

    let currentFile = null;

    window.setupDropzone('ocr-upload-zone', 'ocr-file-input', (files) => {
        if (files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                currentFile = file;
                fileNameDisplay.textContent = file.name;
                uploadZone.classList.add('hidden');
                ocrForm.classList.remove('hidden');
                
                // reset state
                resultContainer.classList.add('hidden');
                progressContainer.classList.add('hidden');
                textResult.value = '';
                progressBar.style.width = '0%';
                percentageText.textContent = '0%';
                
            } else {
                window.showToast?.('Please select a valid PDF file.', 'error');
            }
        }
    });

    removeFileBtn.addEventListener('click', () => {
        currentFile = null;
        fileInput.value = '';
        ocrForm.classList.add('hidden');
        uploadZone.classList.remove('hidden');
    });

    copyBtn.addEventListener('click', () => {
        textResult.select();
        document.execCommand('copy');
        window.showToast?.('Text copied to clipboard!', 'success');
        window.getSelection().removeAllRanges();
    });

    downloadTxtBtn.addEventListener('click', () => {
        const text = textResult.value;
        if (!text) return;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = currentFile.name.replace('.pdf', '_ocr.txt');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    startOcrBtn.addEventListener('click', async () => {
        if (!currentFile) return;

        startOcrBtn.disabled = true;
        btnText.textContent = 'Processing PDF...';
        spinner.classList.remove('hidden');
        progressContainer.classList.remove('hidden');
        resultContainer.classList.add('hidden');
        
        try {
            statusText.textContent = 'Reading PDF...';
            
            const arrayBuffer = await currentFile.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const numPages = pdf.numPages;
            
            let allText = '';
            
            const worker = await Tesseract.createWorker({
                logger: m => {
                    if (m.status === 'recognizing text') {
                        const progress = Math.round(m.progress * 100);
                        statusText.textContent = `Recognizing text...`;
                    }
                }
            });
            await worker.loadLanguage('eng');
            await worker.initialize('eng');

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                progressBar.style.width = `${((pageNum - 1) / numPages) * 100}%`;
                percentageText.textContent = `${Math.round(((pageNum - 1) / numPages) * 100)}%`;
                statusText.textContent = `Rendering Page ${pageNum} of ${numPages}...`;
                
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR accuracy
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({ canvasContext: ctx, viewport: viewport }).promise;
                
                statusText.textContent = `Running OCR on Page ${pageNum} of ${numPages}...`;
                
                const { data: { text } } = await worker.recognize(canvas);
                allText += `\n--- Page ${pageNum} ---\n\n` + text + `\n`;
                
                progressBar.style.width = `${(pageNum / numPages) * 100}%`;
                percentageText.textContent = `${Math.round((pageNum / numPages) * 100)}%`;
            }
            
            await worker.terminate();
            
            statusText.textContent = 'Success!';
            textResult.value = allText;
            resultContainer.classList.remove('hidden');
            window.showToast?.('OCR extraction complete!', 'success');
            
        } catch (error) {
            console.error(error);
            window.showToast?.('Error during OCR processing.', 'error');
            statusText.textContent = 'Failed.';
        } finally {
            startOcrBtn.disabled = false;
            btnText.textContent = 'Extract Text';
            spinner.classList.add('hidden');
        }
    });

});
