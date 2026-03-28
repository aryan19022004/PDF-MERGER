document.addEventListener('DOMContentLoaded', () => {
    // --- MERGE PDFS LOGIC ---
    const mergeForm = document.getElementById('merge-form');
    const mergeInputsWrapper = document.getElementById('pdf-inputs-wrapper');
    const addPdfBtn = document.getElementById('add-pdf-btn');
    const mergeTemplate = document.getElementById('pdf-block-template');
    
    // Sortable initialization
    let mergeSortable;
    if (typeof Sortable !== 'undefined') {
        mergeSortable = new Sortable(mergeInputsWrapper, {
            animation: 150,
            handle: '.drag-handle-btn',
            onEnd: updateMergeStepNumbers
        });
    }

    let pdfBlockCount = 0;

    function addPdfBlock() {
        pdfBlockCount++;
        const clone = mergeTemplate.content.cloneNode(true);
        const card = clone.querySelector('.pdf-card');
        card.dataset.index = pdfBlockCount;
        
        // Setup IDs for labels
        const input = clone.querySelector('.file-input');
        const label = clone.querySelector('.upload-label');
        const fileId = `pdf_${pdfBlockCount}`;
        input.id = fileId;
        label.setAttribute('for', fileId);
        
        // Setup Drag&Drop and Input change
        setupFileInput(input, label);
        
        // Setup Remove Button
        const removeBtn = clone.querySelector('.remove-pdf-btn');
        removeBtn.addEventListener('click', () => {
            if (mergeInputsWrapper.children.length > 2) {
                card.remove();
                updateMergeStepNumbers();
            } else {
                showError('You need at least 2 documents to merge.', true);
            }
        });
        
        mergeInputsWrapper.appendChild(clone);
        updateMergeStepNumbers();
    }

    function updateMergeStepNumbers() {
        const cards = mergeInputsWrapper.querySelectorAll('.pdf-card');
        cards.forEach((card, index) => {
            card.querySelector('.step-num').textContent = index + 1;
            // Update input names so they match the order in DOM!
            const fileInput = card.querySelector('.file-input');
            const rangeInput = card.querySelector('.range-input');
            fileInput.name = `pdf_${index}`;
            rangeInput.name = `range_${index}`;
        });
    }

    function setupFileInput(input, label) {
        const nameSpan = label.querySelector('.file-name');
        
        input.addEventListener('change', (e) => {
            handleFileSelect(e.target.files[0], label, nameSpan);
        });

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
                handleFileSelect(e.dataTransfer.files[0], label, nameSpan);
            }
        });
    }

    function handleFileSelect(file, labelDiv, nameSpan) {
        if (file && file.type === 'application/pdf') {
            labelDiv.classList.add('has-file');
            nameSpan.textContent = file.name;
        } else {
            labelDiv.classList.remove('has-file');
            nameSpan.textContent = '';
            showToast('Please select a valid PDF file.', 'error');
        }
    }

    // Init first two blocks
    addPdfBlock();
    addPdfBlock();

    addPdfBtn.addEventListener('click', addPdfBlock);

    // Form Submission
    const submitBtn = document.getElementById('submit-btn');
    const btnText = submitBtn.querySelector('.btn-text');
    const spinner = submitBtn.querySelector('.spinner');

    window.showToast = function(msg, type = 'error') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        // fallback colors in case variables aren't defined
        const bgColor = type === 'error' ? 'var(--error, #EF4444)' : 'var(--success, #10B981)';
        
        toast.style.padding = '1rem 1.5rem';
        toast.style.background = bgColor;
        toast.style.color = 'white';
        toast.style.borderRadius = 'var(--radius-sm)';
        toast.style.boxShadow = 'var(--shadow, 0 4px 6px rgba(0,0,0,0.1))';
        toast.style.transition = 'opacity 0.3s ease';
        toast.style.pointerEvents = 'auto';
        toast.style.fontWeight = '500';
        toast.textContent = msg;
        
        container.appendChild(toast);
        
        setTimeout(() => toast.style.opacity = '0', 4700);
        setTimeout(() => toast.remove(), 5000);
    };

    mergeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const fileInputs = mergeInputsWrapper.querySelectorAll('.file-input');
        let allValid = true;
        fileInputs.forEach(input => {
            if (!input.files.length) allValid = false;
        });

        if (!allValid || fileInputs.length < 2) {
            showToast('All blocks must have a PDF selected, and at least 2 PDFs are required!', 'error');
            return;
        }

        submitBtn.disabled = true;
        btnText.textContent = 'Merging...';
        spinner.classList.remove('hidden');

        try {
            // Before submitting, ensure names are ordered
            updateMergeStepNumbers();
            
            const formData = new FormData(mergeForm);
            
            const response = await fetch('/merge', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to merge PDFs');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `merged_${new Date().getTime()}.pdf`;
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            showToast('PDFs merged successfully!', 'success');

        } catch (error) {
            console.error('Error:', error);
            showToast(error.message, 'error');
        } finally {
            submitBtn.disabled = false;
            btnText.textContent = 'Merge PDFs';
            spinner.classList.add('hidden');
        }
    });

    // Validating range inputs globally
    document.addEventListener('input', (e) => {
        if (e.target.classList.contains('range-input')) {
            e.target.value = e.target.value.replace(/[^0-9,\-\s]/g, '');
        }
    });

    // --- CONVERT LOGIC ---
    const convBtns = document.querySelectorAll('.conv-btn');
    if(convBtns.length > 0) {
        const convertTypeInput = document.getElementById('convert-type');
        const convHint = document.getElementById('conv-hint');
        const convInput = document.getElementById('conv_files');
        const convLabel = document.getElementById('label-conv-files');
        const convFileNameSpan = convLabel.querySelector('.file-name');
        const convForm = document.getElementById('convert-form');
        const convFileList = document.getElementById('conv-file-list');
        
        // Convert Type Switcher
        convBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Prevent form submit if inside form
                convBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const ctype = btn.dataset.conv;
                convertTypeInput.value = ctype;
                
                // Update UI text and accept types based on conversion type
                if (ctype === 'img2pdf') {
                    convHint.textContent = 'Select multiple JPG/PNG images to combine into one PDF.';
                    convInput.accept = '.jpg,.jpeg,.png';
                } else if (ctype === 'pdf2ppt') {
                    convHint.textContent = 'Select a PDF and optionally additional Images to append as slides.';
                    convInput.accept = '.pdf,.jpg,.jpeg,.png';
                }
                // Clear current files
                convInput.value = '';
                updateConvFileList([]);
            });
        });

        // File input change
        let selectedConvFiles = [];
        
        convInput.addEventListener('change', (e) => {
            selectedConvFiles = Array.from(e.target.files);
            updateConvFileList(selectedConvFiles);
        });

        convLabel.addEventListener('dragover', (e) => {
            e.preventDefault();
            convLabel.classList.add('dragover');
        });

        convLabel.addEventListener('dragleave', (e) => {
            e.preventDefault();
            convLabel.classList.remove('dragover');
        });

        convLabel.addEventListener('drop', (e) => {
            e.preventDefault();
            convLabel.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                convInput.files = e.dataTransfer.files;
                selectedConvFiles = Array.from(e.dataTransfer.files);
                updateConvFileList(selectedConvFiles);
            }
        });

        function updateConvFileList(files) {
            if (files.length === 0) {
                convLabel.classList.remove('has-file');
                convFileNameSpan.textContent = 'Multiple files allowed';
                convFileList.innerHTML = '';
                return;
            }
            
            convLabel.classList.add('has-file');
            convFileNameSpan.textContent = `${files.length} file(s) selected`;
            
            convFileList.innerHTML = files.map((f, i) => `
                <div style="display:flex; justify-content:space-between; padding:0.5rem; background:#f9fafb; margin-bottom:0.25rem; border-radius:4px; font-size:0.85rem;">
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:80%;">${f.name}</span>
                    <span class="text-muted" style="margin-left:0.5rem;">${(f.size/1024/1024).toFixed(2)} MB</span>
                </div>
            `).join('');
        }

        const convSubmitBtn = document.getElementById('conv-submit-btn');
        const convBtnText = convSubmitBtn.querySelector('.btn-text');
        const convSpinner = convSubmitBtn.querySelector('.spinner');

        convForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (selectedConvFiles.length === 0) {
                showToast('Please select files to convert.', 'error');
                return;
            }

            convSubmitBtn.disabled = true;
            convBtnText.textContent = 'Converting...';
            convSpinner.classList.remove('hidden');

            try {
                const formData = new FormData(convForm);
                
                const response = await fetch('/convert', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to convert');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                const ext = convertTypeInput.value === 'img2pdf' ? '.pdf' : '.pptx';
                a.download = `converted_${new Date().getTime()}${ext}`;
                document.body.appendChild(a);
                a.click();
                
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                
                showToast('Files converted successfully!', 'success');

            } catch (error) {
                console.error('Error:', error);
                showToast(error.message, 'error');
            } finally {
                convSubmitBtn.disabled = false;
                convBtnText.textContent = 'Convert Files';
                convSpinner.classList.add('hidden');
            }
        });
    }
});
