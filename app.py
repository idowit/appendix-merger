"""
מיזוג מסמכים ונספחים - Document Merger
Hebrew Legal Documents Edition

Merges a main document with multiple appendices into a single PDF with:
- Table of Contents (תוכן עניינים)
- Appendix cover sheets (עמודי שער לנספחים)
- Continuous page numbering (מספור עמודים רציף)
"""

import io
import json
import base64
import os
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime
import streamlit as st
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, cm
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black, gray, white, HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# =============================================================================
# FONT SETUP FOR HEBREW SUPPORT
# =============================================================================

# Try to register Hebrew-supporting fonts
HEBREW_FONT = "Helvetica"  # Fallback
HEBREW_FONT_BOLD = "Helvetica-Bold"

def setup_hebrew_fonts():
    """Register Hebrew-supporting fonts. Uses bundled David font first."""
    global HEBREW_FONT, HEBREW_FONT_BOLD
    
    # Get the directory where app.py is located
    app_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Bundled fonts - prefer David (professional look for legal docs)
    david_regular = os.path.join(app_dir, "fonts", "David-Regular.ttf")
    david_bold = os.path.join(app_dir, "fonts", "David-Bold.ttf")
    noto_regular = os.path.join(app_dir, "fonts", "NotoSansHebrew-Regular.ttf")
    noto_bold = os.path.join(app_dir, "fonts", "NotoSansHebrew-Bold.ttf")
    
    try:
        # Priority 1: Bundled David font (best for legal docs)
        if os.path.exists(david_regular):
            pdfmetrics.registerFont(TTFont('David', david_regular))
            HEBREW_FONT = 'David'
        if os.path.exists(david_bold):
            pdfmetrics.registerFont(TTFont('David-Bold', david_bold))
            HEBREW_FONT_BOLD = 'David-Bold'
        
        # Priority 2: Bundled Noto Sans Hebrew (fallback)
        if HEBREW_FONT == "Helvetica":
            if os.path.exists(noto_regular):
                pdfmetrics.registerFont(TTFont('NotoHebrew', noto_regular))
                HEBREW_FONT = 'NotoHebrew'
            if os.path.exists(noto_bold):
                pdfmetrics.registerFont(TTFont('NotoHebrew-Bold', noto_bold))
                HEBREW_FONT_BOLD = 'NotoHebrew-Bold'
        
        # Priority 3: Windows system fonts (for local development without bundled fonts)
        if HEBREW_FONT == "Helvetica":
            if os.path.exists(r"C:\Windows\Fonts\david.ttf"):
                pdfmetrics.registerFont(TTFont('David', r"C:\Windows\Fonts\david.ttf"))
                HEBREW_FONT = 'David'
            if os.path.exists(r"C:\Windows\Fonts\davidbd.ttf"):
                pdfmetrics.registerFont(TTFont('David-Bold', r"C:\Windows\Fonts\davidbd.ttf"))
                HEBREW_FONT_BOLD = 'David-Bold'
            
    except Exception as e:
        print(f"Warning: Could not load Hebrew fonts: {e}")

# Initialize fonts
setup_hebrew_fonts()

# =============================================================================
# CONSTANTS AND CONFIGURATION
# =============================================================================

A4_WIDTH, A4_HEIGHT = A4
SUPPORTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.tif', '.bmp']

# Hebrew letters for numbering
HEBREW_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י',
                  'יא', 'יב', 'יג', 'יד', 'טו', 'טז', 'יז', 'יח', 'יט', 'כ',
                  'כא', 'כב', 'כג', 'כד', 'כה', 'כו', 'כז', 'כח', 'כט', 'ל']

# Roman numerals
ROMAN_NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
                  'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI', 'XXVII', 'XXVIII', 'XXIX', 'XXX']

# Numbering formats
NUMBERING_FORMATS = {
    'אבג (Hebrew)': 'hebrew',
    '123 (Arabic)': 'arabic',
    'I II III (Roman)': 'roman',
}

# Template styles
TEMPLATES = {
    'קלאסי (Classic)': 'classic',
    'מודרני (Modern)': 'modern',
    'מינימלי (Minimal)': 'minimal',
}

# UI Text in Hebrew
UI_TEXT = {
    'app_title': '📄 מיזוג מסמכים ונספחים',
    'app_subtitle': 'מיזוג מסמך ראשי עם נספחים לקובץ PDF אחד עם תוכן עניינים ומספור עמודים',
    'settings': 'הגדרות',
    'numbering': 'סוג מספור נספחים',
    'template': 'תבנית עיצוב',
    'add_marking': 'הוסף סימון נספח בעמוד הראשון',
    'project': 'פרויקט',
    'save_project': 'שמור פרויקט',
    'load_project': 'טען פרויקט',
    'upload_files': 'העלאת קבצים',
    'upload_help': 'העלה קבצי PDF ותמונות (JPG/PNG)',
    'configure_docs': 'הגדרת מסמכים',
    'select_main': 'בחר מסמך ראשי:',
    'all_docs': 'כל המסמכים',
    'main_doc': 'מסמך ראשי',
    'appendix': 'נספח',
    'appendix_name': 'שם הנספח',
    'pages': 'עמודים',
    'preview': 'תצוגה מקדימה',
    'generate': 'יצירת PDF',
    'download': 'הורדת PDF',
    'generating': 'מייצר PDF...',
    'success': 'ה-PDF נוצר בהצלחה!',
    'error': 'שגיאה:',
    'warning_min_files': 'יש להעלות לפחות 2 קבצים (מסמך ראשי + נספח אחד)',
    'warning_no_appendix': 'נדרש לפחות נספח אחד',
}


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def get_appendix_number(index: int, format_type: str) -> str:
    """Convert 1-based index to formatted appendix number."""
    if format_type == 'hebrew':
        if index <= len(HEBREW_LETTERS):
            return HEBREW_LETTERS[index - 1]
        return str(index)
    elif format_type == 'roman':
        if index <= len(ROMAN_NUMERALS):
            return ROMAN_NUMERALS[index - 1]
        return str(index)
    else:  # arabic
        return str(index)


def reverse_hebrew(text: str) -> str:
    """
    Prepare Hebrew text for RTL display in PDF using python-bidi.
    The bidi library implements the Unicode Bidirectional Algorithm
    which correctly handles mixed Hebrew/English/numbers/punctuation.
    """
    if not text:
        return text
    
    try:
        from bidi.algorithm import get_display
        return get_display(text)
    except ImportError:
        # Fallback: simple reversal if bidi not available
        return text[::-1]


# =============================================================================
# CORE PDF FUNCTIONS
# =============================================================================

def load_and_normalize_file(uploaded_file) -> Tuple[bytes, int]:
    """Convert uploaded file to PDF bytes and return page count."""
    file_name = uploaded_file.name.lower()
    file_bytes = uploaded_file.read()
    uploaded_file.seek(0)
    
    if file_name.endswith('.pdf'):
        reader = PdfReader(io.BytesIO(file_bytes))
        page_count = len(reader.pages)
        return file_bytes, page_count
    else:
        pdf_bytes = image_to_pdf(file_bytes)
        return pdf_bytes, 1


def image_to_pdf(image_bytes: bytes) -> bytes:
    """Convert image bytes to A4 PDF page, centered with aspect ratio preserved."""
    img = Image.open(io.BytesIO(image_bytes))
    
    # Convert to RGB if necessary
    if img.mode in ('RGBA', 'P'):
        background = Image.new('RGB', img.size, (255, 255, 255))
        if img.mode == 'P':
            img = img.convert('RGBA')
        if img.mode == 'RGBA':
            background.paste(img, mask=img.split()[-1])
        else:
            background.paste(img)
        img = background
    elif img.mode != 'RGB':
        img = img.convert('RGB')
    
    margin = 0.5 * inch
    max_width = A4_WIDTH - (2 * margin)
    max_height = A4_HEIGHT - (2 * margin)
    
    img_width, img_height = img.size
    scale = min(max_width / img_width, max_height / img_height)
    
    new_width = img_width * scale
    new_height = img_height * scale
    
    x_offset = (A4_WIDTH - new_width) / 2
    y_offset = (A4_HEIGHT - new_height) / 2
    
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    
    img_buffer = io.BytesIO()
    img.save(img_buffer, format='PNG')
    img_buffer.seek(0)
    
    from reportlab.lib.utils import ImageReader
    c.drawImage(ImageReader(img_buffer), x_offset, y_offset, 
                width=new_width, height=new_height)
    c.save()
    
    buffer.seek(0)
    return buffer.read()


def make_cover_pdf(
    appendix_number: str,
    title: str,
    start_page: int,
    end_page: int,
    template: str = 'classic'
) -> bytes:
    """
    Generate a cover sheet for an appendix.
    Shows: נספח X, document title (subtitle), and page range.
    """
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    
    center_x = A4_WIDTH / 2
    center_y = A4_HEIGHT / 2
    
    # Hebrew text and numbers are now handled properly by reverse_hebrew
    appendix_text = reverse_hebrew(f"נספח {appendix_number}")
    title_text = reverse_hebrew(title) if title else ""
    pages_text = reverse_hebrew(f"עמודים: {start_page} - {end_page}")
    
    if template == 'modern':
        # Modern template with colored header bar
        c.setFillColor(HexColor('#2C3E50'))
        c.rect(0, A4_HEIGHT - 180, A4_WIDTH, 180, fill=True, stroke=False)
        
        c.setFillColor(white)
        c.setFont(HEBREW_FONT_BOLD, 48)
        c.drawCentredString(center_x, A4_HEIGHT - 70, appendix_text)
        
        # Subtitle - document name
        if title_text:
            c.setFont(HEBREW_FONT, 24)
            c.drawCentredString(center_x, A4_HEIGHT - 115, title_text)
        
        c.setFont(HEBREW_FONT, 20)
        c.drawCentredString(center_x, A4_HEIGHT - 155, pages_text)
        
    elif template == 'minimal':
        # Minimal template - just text
        c.setFont(HEBREW_FONT_BOLD, 48)
        c.drawCentredString(center_x, center_y + 50, appendix_text)
        
        # Subtitle - document name
        if title_text:
            c.setFont(HEBREW_FONT, 22)
            c.drawCentredString(center_x, center_y, title_text)
        
        c.setFont(HEBREW_FONT, 18)
        c.drawCentredString(center_x, center_y - 50, pages_text)
        
    else:  # classic
        # Classic template with border
        margin = 50
        c.setStrokeColor(black)
        c.setLineWidth(2)
        c.rect(margin, margin, A4_WIDTH - 2*margin, A4_HEIGHT - 2*margin)
        
        c.setFont(HEBREW_FONT_BOLD, 56)
        c.drawCentredString(center_x, center_y + 70, appendix_text)
        
        # Subtitle - document name
        if title_text:
            c.setFont(HEBREW_FONT, 26)
            c.drawCentredString(center_x, center_y + 10, title_text)
        
        c.setFont(HEBREW_FONT, 22)
        c.drawCentredString(center_x, center_y - 50, pages_text)
    
    c.save()
    buffer.seek(0)
    return buffer.read()


def make_toc_pdf(entries: List[Dict[str, Any]], template: str = 'classic') -> Tuple[bytes, int]:
    """
    Generate Table of Contents pages in Hebrew.
    Shows title "רשימת נספחים לתביעה" with columns for document name and pages.
    Each entry shows: נספח X - שם המסמך ........... עמודים 5-10
    """
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=A4)
    
    margin = inch
    y_position = A4_HEIGHT - margin
    line_height = 35
    
    pages = 1
    
    # Draw TOC title
    c.setFont(HEBREW_FONT_BOLD, 22)
    c.setFillColor(black)
    title_text = reverse_hebrew("רשימת נספחים לתביעה")
    c.drawCentredString(A4_WIDTH / 2, y_position, title_text)
    y_position -= 20
    
    # Draw column headers
    c.setFont(HEBREW_FONT_BOLD, 14)
    pages_header = reverse_hebrew("עמודים")
    doc_name_header = reverse_hebrew("שם מסמך")
    c.drawRightString(A4_WIDTH - margin, y_position, doc_name_header)
    c.drawString(margin, y_position, pages_header)
    y_position -= 10
    
    # Draw separator line
    c.setStrokeColor(black)
    c.setLineWidth(0.5)
    c.line(margin, y_position, A4_WIDTH - margin, y_position)
    y_position -= 25
    
    c.setFont(HEBREW_FONT, 14)
    c.setFillColor(black)
    
    for entry in entries:
        if y_position < margin + 50:
            c.showPage()
            pages += 1
            y_position = A4_HEIGHT - margin
            c.setFont(HEBREW_FONT, 14)
            c.setFillColor(black)
        
        # Format for RTL: page range on left, appendix info on right
        # Include the user-provided title (שם נספח) if provided
        if entry.get('title'):
            appendix_text = reverse_hebrew(f"נספח {entry['number']} - {entry['title']}")
        else:
            appendix_text = reverse_hebrew(f"נספח {entry['number']}")
        page_range = f"{entry['start_page']}-{entry['end_page']}"
        
        # Draw appendix label on the RIGHT (RTL)
        c.drawRightString(A4_WIDTH - margin, y_position, appendix_text)
        
        # Draw page range on the LEFT
        c.drawString(margin, y_position, page_range)
        
        # Draw dotted line in between
        appendix_width = c.stringWidth(appendix_text, HEBREW_FONT, 14)
        range_width = c.stringWidth(page_range, HEBREW_FONT, 14)
        
        dot_start = margin + range_width + 15
        dot_end = A4_WIDTH - margin - appendix_width - 15
        
        c.setFillColor(gray)
        dot_x = dot_start
        while dot_x < dot_end:
            c.drawString(dot_x, y_position, ".")
            dot_x += 6
        c.setFillColor(black)
        
        y_position -= line_height
    
    c.save()
    buffer.seek(0)
    return buffer.read(), pages


def add_appendix_marking(pdf_bytes: bytes, appendix_number: str) -> bytes:
    """Add appendix marking stamp on the first page of an appendix document."""
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    
    for i, page in enumerate(reader.pages):
        if i == 0:  # First page only
            # Get rotation from the page (0, 90, 180, 270)
            rotation = int(page.get('/Rotate') or 0)
            
            # Get the raw mediabox dimensions
            raw_width = float(page.mediabox.width)
            raw_height = float(page.mediabox.height)
            
            # Determine the VISUAL dimensions based on rotation
            if rotation in [90, 270]:
                visual_width, visual_height = raw_height, raw_width
            else:
                visual_width, visual_height = raw_width, raw_height
            
            # Create overlay with the same raw dimensions as the page
            overlay_buffer = io.BytesIO()
            c = canvas.Canvas(overlay_buffer, pagesize=(raw_width, raw_height))
            
            # Box dimensions
            box_width = 70
            box_height = 30
            margin = 15
            
            # Calculate position based on rotation
            # We want top-right corner in the VISUAL (rotated) view
            if rotation == 0:
                # Normal: top-right is (width-margin, height-margin)
                box_x = raw_width - box_width - margin
                box_y = raw_height - box_height - margin
            elif rotation == 90:
                # 90° clockwise: visual top-right maps to raw bottom-right
                box_x = raw_width - box_height - margin
                box_y = margin
                # Rotate canvas
                c.saveState()
                c.translate(box_x + box_height/2, box_y + box_width/2)
                c.rotate(90)
                c.translate(-box_width/2, -box_height/2)
                box_x, box_y = 0, 0
            elif rotation == 180:
                # 180°: visual top-right maps to raw bottom-left
                box_x = margin
                box_y = margin
            elif rotation == 270:
                # 270° clockwise (90° counter-clockwise): visual top-right maps to raw top-left
                box_x = margin
                box_y = raw_height - box_height - margin
                # Rotate canvas
                c.saveState()
                c.translate(box_x + box_height/2, box_y + box_height/2)
                c.rotate(-90)
                c.translate(-box_width/2, -box_height/2)
                box_x, box_y = 0, 0
            else:
                box_x = raw_width - box_width - margin
                box_y = raw_height - box_height - margin
            
            # Draw the marking box
            c.setFillColor(HexColor('#F5F5F5'))
            c.setStrokeColor(black)
            c.setLineWidth(1)
            c.roundRect(box_x, box_y, box_width, box_height, 4, fill=True, stroke=True)
            
            # Reverse Hebrew for RTL
            marking_text = reverse_hebrew(f"נספח {appendix_number}")
            
            c.setFillColor(black)
            c.setFont(HEBREW_FONT_BOLD, 12)
            c.drawCentredString(box_x + box_width/2, box_y + 10, marking_text)
            
            if rotation in [90, 270]:
                c.restoreState()
            
            c.save()
            overlay_buffer.seek(0)
            
            overlay_reader = PdfReader(overlay_buffer)
            page.merge_page(overlay_reader.pages[0])
        
        writer.add_page(page)
    
    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output.read()


def merge_pdfs(pdf_list: List[bytes]) -> bytes:
    """Merge multiple PDF byte objects into a single PDF."""
    writer = PdfWriter()
    
    for pdf_bytes in pdf_list:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        for page in reader.pages:
            writer.add_page(page)
    
    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output.read()


def add_page_numbers(pdf_bytes: bytes) -> bytes:
    """
    Add page numbers to every page of the PDF.
    Just the digit, bottom-left, size 14.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    writer = PdfWriter()
    
    for page_num, page in enumerate(reader.pages, 1):
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)
        
        overlay_buffer = io.BytesIO()
        c = canvas.Canvas(overlay_buffer, pagesize=(page_width, page_height))
        
        # Page number: just the digit, bottom-left, size 14
        c.setFont(HEBREW_FONT, 14)
        c.drawString(30, 25, str(page_num))
        c.save()
        
        overlay_buffer.seek(0)
        overlay_reader = PdfReader(overlay_buffer)
        
        page.merge_page(overlay_reader.pages[0])
        writer.add_page(page)
    
    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output.read()


def two_pass_generate(
    main_pdf: bytes,
    main_pages: int,
    appendices: List[Dict[str, Any]],
    settings: Dict[str, Any]
) -> bytes:
    """Two-pass generation for accurate TOC page numbers."""
    numbering_format = settings.get('numbering', 'hebrew')
    template = settings.get('template', 'classic')
    add_marking = settings.get('add_marking', True)
    
    # ==========================================================================
    # PASS 1: Estimate TOC pages and calculate page ranges
    # ==========================================================================
    draft_entries = []
    estimated_toc_pages = 1
    current_page = main_pages + estimated_toc_pages + 1
    
    for i, appendix in enumerate(appendices, 1):
        start_page = current_page
        # Cover sheet (1 page) + appendix content
        end_page = current_page + appendix['pages']
        
        draft_entries.append({
            'number': get_appendix_number(i, numbering_format),
            'title': appendix['title'],
            'start_page': start_page,
            'end_page': end_page
        })
        current_page = end_page + 1
    
    _, actual_toc_pages = make_toc_pdf(draft_entries, template)
    
    # ==========================================================================
    # PASS 2: Generate with correct page numbers
    # ==========================================================================
    final_entries = []
    current_page = main_pages + actual_toc_pages + 1
    
    appendix_page_info = []
    
    for i, appendix in enumerate(appendices, 1):
        start_page = current_page
        end_page = current_page + appendix['pages']
        
        appendix_info = {
            'number': get_appendix_number(i, numbering_format),
            'title': appendix['title'],
            'start_page': start_page,
            'end_page': end_page
        }
        final_entries.append(appendix_info)
        appendix_page_info.append(appendix_info)
        
        current_page = end_page + 1
    
    toc_pdf, _ = make_toc_pdf(final_entries, template)
    
    # Build PDF list
    pdf_list = [main_pdf, toc_pdf]
    
    for i, appendix in enumerate(appendices):
        info = appendix_page_info[i]
        
        # Cover sheet with page range (no title per user request)
        cover_pdf = make_cover_pdf(
            info['number'],
            appendix['title'],  # Still passed but not displayed
            info['start_page'],
            info['end_page'],
            template
        )
        pdf_list.append(cover_pdf)
        
        # Appendix content (with optional marking)
        appendix_pdf = appendix['pdf_bytes']
        if add_marking:
            appendix_pdf = add_appendix_marking(appendix_pdf, info['number'])
        pdf_list.append(appendix_pdf)
    
    # Merge and add page numbers
    merged_pdf = merge_pdfs(pdf_list)
    final_pdf = add_page_numbers(merged_pdf)
    
    return final_pdf


# =============================================================================
# PROJECT SAVE/LOAD
# =============================================================================

def save_project() -> bytes:
    """Export current project state to JSON bytes."""
    project_data = {
        'version': '2.2',
        'created': datetime.now().isoformat(),
        'numbering': st.session_state.get('numbering', 'אבג (Hebrew)'),
        'template': st.session_state.get('template', 'קלאסי (Classic)'),
        'add_marking': st.session_state.get('add_marking', True),
        'main_index': st.session_state.get('main_index', 0),
        'files': []
    }
    
    for f in st.session_state.get('files_data', []):
        file_entry = {
            'name': f['name'],
            'title': f['title'],
            'pages': f['pages'],
            'pdf_base64': base64.b64encode(f['pdf_bytes']).decode('utf-8')
        }
        project_data['files'].append(file_entry)
    
    return json.dumps(project_data, ensure_ascii=False, indent=2).encode('utf-8')


def load_project(json_bytes: bytes) -> bool:
    """Load project state from JSON bytes."""
    try:
        project_data = json.loads(json_bytes.decode('utf-8'))
        
        st.session_state.numbering = project_data.get('numbering', 'אבג (Hebrew)')
        st.session_state.template = project_data.get('template', 'קלאסי (Classic)')
        st.session_state.add_marking = project_data.get('add_marking', True)
        st.session_state.main_index = project_data.get('main_index', 0)
        
        files_data = []
        for f in project_data.get('files', []):
            files_data.append({
                'name': f['name'],
                'title': f['title'],
                'pages': f['pages'],
                'pdf_bytes': base64.b64decode(f['pdf_base64'])
            })
        
        st.session_state.files_data = files_data
        return True
    except Exception as e:
        st.error(f"שגיאה בטעינת הפרויקט: {e}")
        return False


# =============================================================================
# STREAMLIT UI
# =============================================================================

def main():
    st.set_page_config(
        page_title="מיזוג מסמכים ונספחים",
        page_icon="📄",
        layout="wide",
        initial_sidebar_state="expanded"
    )
    
    # Initialize session state
    if 'files_data' not in st.session_state:
        st.session_state.files_data = []
    if 'main_index' not in st.session_state:
        st.session_state.main_index = 0
    if 'numbering' not in st.session_state:
        st.session_state.numbering = 'אבג (Hebrew)'
    if 'template' not in st.session_state:
        st.session_state.template = 'קלאסי (Classic)'
    if 'add_marking' not in st.session_state:
        st.session_state.add_marking = True
    
    # RTL CSS for Hebrew
    st.markdown("""
    <style>
    .stApp { direction: rtl; }
    .stTextInput > div > div > input { direction: rtl; text-align: right; }
    .stRadio > div { direction: rtl; }
    .stSelectbox > div { direction: rtl; }
    h1, h2, h3, h4, h5, h6 { direction: rtl; text-align: right; }
    .stMarkdown { direction: rtl; text-align: right; }
    </style>
    """, unsafe_allow_html=True)
    
    # ==========================================================================
    # SIDEBAR - Settings
    # ==========================================================================
    with st.sidebar:
        st.header(f"⚙️ {UI_TEXT['settings']}")
        
        # Numbering format
        st.session_state.numbering = st.selectbox(
            UI_TEXT['numbering'],
            options=list(NUMBERING_FORMATS.keys()),
            index=list(NUMBERING_FORMATS.keys()).index(st.session_state.numbering),
            key='num_select'
        )
        
        # Template
        st.session_state.template = st.selectbox(
            UI_TEXT['template'],
            options=list(TEMPLATES.keys()),
            index=list(TEMPLATES.keys()).index(st.session_state.template),
            key='template_select'
        )
        
        # Appendix marking
        st.session_state.add_marking = st.checkbox(
            UI_TEXT['add_marking'],
            value=st.session_state.add_marking,
            key='marking_check'
        )
        
        st.divider()
        
        # Project save/load
        st.subheader(f"💾 {UI_TEXT['project']}")
        
        if st.session_state.files_data:
            project_bytes = save_project()
            st.download_button(
                label=f"📥 {UI_TEXT['save_project']}",
                data=project_bytes,
                file_name=f"project_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                mime="application/json"
            )
        
        uploaded_project = st.file_uploader(
            UI_TEXT['load_project'],
            type=['json'],
            key='project_upload'
        )
        if uploaded_project:
            if load_project(uploaded_project.read()):
                st.success("✅ הפרויקט נטען בהצלחה")
                st.rerun()
    
    # ==========================================================================
    # MAIN CONTENT
    # ==========================================================================
    
    st.title(UI_TEXT['app_title'])
    st.markdown(UI_TEXT['app_subtitle'])
    
    # File upload
    st.header(f"1️⃣ {UI_TEXT['upload_files']}")
    uploaded_files = st.file_uploader(
        UI_TEXT['upload_help'],
        type=['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'bmp'],
        accept_multiple_files=True,
        key='file_uploader'
    )
    
    if uploaded_files:
        current_names = [f['name'] for f in st.session_state.files_data]
        
        for uploaded_file in uploaded_files:
            if uploaded_file.name not in current_names:
                try:
                    pdf_bytes, page_count = load_and_normalize_file(uploaded_file)
                    st.session_state.files_data.append({
                        'name': uploaded_file.name,
                        'title': '',  # Empty by default
                        'pdf_bytes': pdf_bytes,
                        'pages': page_count
                    })
                except Exception as e:
                    st.error(f"{UI_TEXT['error']} {uploaded_file.name}: {e}")
        
        uploaded_names = [f.name for f in uploaded_files]
        st.session_state.files_data = [
            f for f in st.session_state.files_data
            if f['name'] in uploaded_names
        ]
        
        if st.session_state.main_index >= len(st.session_state.files_data):
            st.session_state.main_index = 0
    else:
        st.session_state.files_data = []
        st.session_state.main_index = 0
    
    # Document configuration
    if st.session_state.files_data:
        st.header(f"2️⃣ {UI_TEXT['configure_docs']}")
        
        file_names = [f['name'] for f in st.session_state.files_data]
        
        main_doc = st.radio(
            UI_TEXT['select_main'],
            options=file_names,
            index=st.session_state.main_index,
            key="main_doc_radio",
            horizontal=True
        )
        st.session_state.main_index = file_names.index(main_doc)
        
        st.divider()
        st.subheader(UI_TEXT['all_docs'])
        
        for i, file_data in enumerate(st.session_state.files_data):
            is_main = (i == st.session_state.main_index)
            
            col1, col2, col3, col4, col5 = st.columns([2, 3, 1, 0.5, 0.5])
            
            with col1:
                label = f"📑 {UI_TEXT['main_doc']}" if is_main else f"📎 {UI_TEXT['appendix']}"
                st.write(f"**{label}**")
                st.caption(file_data['name'])
            
            with col2:
                if not is_main:
                    placeholder = "הזן שם לנספח"
                    new_title = st.text_input(
                        UI_TEXT['appendix_name'],
                        value=file_data['title'],
                        key=f"title_{i}",
                        placeholder=placeholder
                    )
                    st.session_state.files_data[i]['title'] = new_title
                else:
                    st.write("")  # Empty for main doc
            
            with col3:
                st.write(f"{UI_TEXT['pages']}: {file_data['pages']}")
            
            with col4:
                if not is_main and i > 0:
                    if st.button("⬆️", key=f"up_{i}", help="הזז למעלה"):
                        prev_idx = i - 1
                        st.session_state.files_data[i], st.session_state.files_data[prev_idx] = \
                            st.session_state.files_data[prev_idx], st.session_state.files_data[i]
                        if st.session_state.main_index == prev_idx:
                            st.session_state.main_index = i
                        elif st.session_state.main_index == i:
                            st.session_state.main_index = prev_idx
                        st.rerun()
            
            with col5:
                if not is_main and i < len(st.session_state.files_data) - 1:
                    if st.button("⬇️", key=f"down_{i}", help="הזז למטה"):
                        next_idx = i + 1
                        st.session_state.files_data[i], st.session_state.files_data[next_idx] = \
                            st.session_state.files_data[next_idx], st.session_state.files_data[i]
                        if st.session_state.main_index == next_idx:
                            st.session_state.main_index = i
                        elif st.session_state.main_index == i:
                            st.session_state.main_index = next_idx
                        st.rerun()
        
        st.divider()
        
        # Validation
        total_files = len(st.session_state.files_data)
        appendix_count = total_files - 1
        
        if total_files < 2:
            st.warning(f"⚠️ {UI_TEXT['warning_min_files']}")
        elif appendix_count == 0:
            st.warning(f"⚠️ {UI_TEXT['warning_no_appendix']}")
        else:
            # Preview
            st.header(f"3️⃣ {UI_TEXT['preview']}")
            
            main_data = st.session_state.files_data[st.session_state.main_index]
            appendices = [
                f for i, f in enumerate(st.session_state.files_data)
                if i != st.session_state.main_index
            ]
            
            numbering_format = NUMBERING_FORMATS[st.session_state.numbering]
            
            st.markdown(f"""
            **{UI_TEXT['main_doc']}**: {main_data['name']} ({main_data['pages']} {UI_TEXT['pages']})  
            **תוכן עניינים** (עמוד אחד)
            """)
            
            for i, app in enumerate(appendices, 1):
                num = get_appendix_number(i, numbering_format)
                st.markdown(f"**נספח {num}** ({app['pages']} {UI_TEXT['pages']} + שער)")
            
            # Generate button
            st.header(f"4️⃣ {UI_TEXT['generate']}")
            
            if st.button(f"🚀 {UI_TEXT['generate']}", type="primary"):
                with st.spinner(UI_TEXT['generating']):
                    try:
                        main_pdf = main_data['pdf_bytes']
                        main_pages = main_data['pages']
                        
                        appendix_list = [{
                            'pdf_bytes': a['pdf_bytes'],
                            'pages': a['pages'],
                            'title': a['title']
                        } for a in appendices]
                        
                        settings = {
                            'numbering': NUMBERING_FORMATS[st.session_state.numbering],
                            'template': TEMPLATES[st.session_state.template],
                            'add_marking': st.session_state.add_marking,
                        }
                        
                        final_pdf = two_pass_generate(main_pdf, main_pages, appendix_list, settings)
                        
                        reader = PdfReader(io.BytesIO(final_pdf))
                        final_pages = len(reader.pages)
                        
                        st.success(f"✅ {UI_TEXT['success']} ({final_pages} {UI_TEXT['pages']})")
                        
                        st.download_button(
                            label=f"📥 {UI_TEXT['download']}",
                            data=final_pdf,
                            file_name=f"merged_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
                            mime="application/pdf"
                        )
                        
                    except Exception as e:
                        st.error(f"❌ {UI_TEXT['error']} {e}")
                        raise e


if __name__ == "__main__":
    main()
