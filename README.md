# Document Merger

A Streamlit application that merges a main document with multiple appendices into a single PDF with:
- Table of Contents (TOC)
- Appendix cover sheets
- Continuous page numbering

## Features

- Upload PDFs and images (JPG/PNG)
- Edit appendix titles
- Select which file is the "Main Document"
- Reorder appendices with Up/Down buttons
- Generate merged PDF with automatic TOC and page numbers

## Setup

1. **Create virtual environment**:
   ```powershell
   cd "c:\Users\idowi\Documents\Ido's Documents\kfirs_document_merger"
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```

2. **Install dependencies**:
   ```powershell
   pip install -r requirements.txt
   ```

3. **Run the application**:
   ```powershell
   streamlit run app.py
   ```

4. Open your browser to the URL shown (typically http://localhost:8501)

## Usage

1. Upload your files (at least 2 files required)
2. Edit titles for each file as needed
3. Select one file as the "Main Document"
4. Reorder appendices using Up/Down buttons
5. Click "Generate PDF"
6. Download the merged PDF

## Output PDF Structure

1. **Main Document** - Your selected main file
2. **Table of Contents** - Lists all appendices with page numbers
3. **Appendices** - Each appendix preceded by a cover sheet showing:
   - Appendix number (1, 2, 3...)
   - Appendix title

All pages are numbered continuously from 1 to N.
