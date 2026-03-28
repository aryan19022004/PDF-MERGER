document.addEventListener('DOMContentLoaded', () => {
    const pdfBlocksContainer = document.getElementById('pdf-blocks-container');
    const addPdfBtn = document.getElementById('add-pdf-btn');
    const pdfBlockTemplate = document.getElementById('pdf-block-template');
    const mergeForm = document.getElementById('merge-form');
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    let blockCount = 0;

    // Initialize Sortable
    new Sortable(pdfBlocksContainer, {
        animation: 150,
        handle: '.drag-handle',
        ghostClass: 'sortable-ghost'
    });

    function addPdfBlock() {
        const clone = pdfBlockTemplate.content.cloneNode(true);
        const block = clone.querySelector('.pdf-block');

        block.dataset.id = `block-${blockCount}`;

        const fileInput = block.querySelector('.pdf-file-input');
        const nameSpan = block.querySelector('.file-name');
        const labelBtn = block.querySelector('label.btn');
        const rangeInput = block.querySelector('.range-input');
        const removeBtn = block.querySelector('.remove-block-btn');

        // Setup unique names for backend ordering
        fileInput.name = `temp_pdf_${blockCount}`; // Will be renamed on submit
        rangeInput.name = `temp_range_${blockCount}`; // Will be renamed on submit

        fileInput.addEventListener('change', (e) => handleFileSelect(e, labelBtn, nameSpan));
        removeBtn.addEventListener('click', () => {
            if (pdfBlocksContainer.children.length > 2) {
                block.remove();
            } else {
                window.showToast?.('At least 2 PDF blocks are required.', 'error');
            }
        });

        pdfBlocksContainer.appendChild(block);
        blockCount++;
    }

    function handleFileSelect(event, labelDiv, nameSpan) {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            labelDiv.classList.add('btn-primary');
            labelDiv.classList.remove('btn-secondary');
            nameSpan.textContent = file.name;
        } else {
            labelDiv.classList.add('btn-secondary');
            labelDiv.classList.remove('btn-primary');
            nameSpan.textContent = 'No file chosen';
            window.showToast?.('Please select a valid PDF file.', 'error');
            event.target.value = ''; // Reset
        }
    }

    // Init first two blocks
    addPdfBlock();
    addPdfBlock();

    addPdfBtn.addEventListener('click', addPdfBlock);

    mergeForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const blocks = Array.from(pdfBlocksContainer.children);
        const fileInputs = blocks.map(b => b.querySelector('.pdf-file-input'));

        // Validation
        let allValid = true;
        fileInputs.forEach(input => {
            if (!input.files.length) allValid = false;
        });

        if (!allValid || fileInputs.length < 2) {
            window.showToast?.('All blocks must have a PDF selected, and at least 2 PDFs are required!', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Merging...';
        spinner.classList.remove('hidden');

        try {
            // Ensure names are ordered based on DOM
            blocks.forEach((block, index) => {
                const input = block.querySelector('.pdf-file-input');
                const range = block.querySelector('.range-input');
                input.name = `pdf_${index}`;
                range.name = `range_${index}`;
            });

            const formData = new FormData(mergeForm);

            const response = await fetch('/merge', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to merge PDFs');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'merged_document.pdf';
            document.body.appendChild(a);
            a.click();

            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            window.showToast?.('PDFs merged successfully!', 'success');

        } catch (error) {
            console.error('Error:', error);
            window.showToast?.(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Merge PDFs';
            spinner.classList.add('hidden');
        }
    });
});