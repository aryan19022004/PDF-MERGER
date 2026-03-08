# PDF Editor & Merger Application

A beautiful, advanced Python web application built with Flask that allows users to either merge multiple PDFs with precise page limits, or seamlessly edit text directly on top of highly rendering PDF page visuals.

## Features

### 1. Merge PDFs
- **Upload Two PDFs**: Simple UI for selecting a primary and a secondary PDF file.
- **Custom Page Selection**: Extract only the pages you need. Support for ranges like `1-4`, comma-separated values like `2, 4, 6`, and complex combinations `1-3, 5, 8-10`.
- **Merge Order Maintained**: The selected pages of the first PDF are properly prepended before the selected pages of the second PDF.

### 2. Edit PDFs (New!)
- **Upload and Render**: Upload a single PDF document. The backend instantly renders a 2x scaled image of the document, extracting all text bounding boxes dynamically.
- **Canvas Interface**: View the exact layout of the PDF right in your browser.
- **Drag-and-Drop Elements**: Click and drag text around the PDF page to fix misalignments.
- **Direct Text Editing**: Click any text to make it editable. Add, remove, or modify words and sentences.
- **Styling Toolbar**: Adjust font sizes, switch between Helvetica/Times/Courier, or apply rich colors dynamically to the text.
- **Save and Download**: The backend seamlessly "erases" the original text behind your edits, re-injecting your new custom text.

## Environment & Tech Stack

- **Backend**: [Flask](https://flask.palletsprojects.com/)
- **PDF Merging Engine**: [pypdf](https://pypdf.readthedocs.io/en/stable/)
- **PDF Extraction & Editing Engine**: [PyMuPDF (fitz)](https://pymupdf.readthedocs.io/en/latest/) 
- **Frontend**: Vanilla HTML5, CSS3 Variables, Container Grids, HTML5 Canvas concepts via Absolute DOM overlays.

## How to Run the Application

**Prerequisites:** Ensure you have Python 3.8+ installed on your system.

1. **Clone or locate the repository directory**
   Open your terminal and navigate to the project root:
   ```bash
   cd d:\pdf-merger
   ```

2. **Create a Virtual Environment (Recommended)**
   To keep dependencies isolated:
   ```bash
   python -m venv venv
   ```

3. **Activate the Virtual Environment**
   - On **Windows**:
     ```bash
     venv\Scripts\activate
     ```
   - On **macOS / Linux**:
     ```bash
     source venv/bin/activate
     ```

4. **Install Required Packages**
   Once the virtual environment is active, install the dependencies listed in `requirements.txt`.
   Note: This includes `PyMuPDF` which handles the complex text extraction geometry.
   ```bash
   pip install -r requirements.txt
   ```

5. **Start the Application**
   Run the Flask server:
   ```bash
   python app.py
   ```

6. **Access the App**
   Open your preferred web browser and navigate to:
   `http://127.0.0.1:5000`
