# Test script to verify bidi handling
from bidi.algorithm import get_display

tests = [
    ("Numbers", "עמודים: 14 - 20"),
    ("Appendix number", "נספח 14"),
    ("Quoted title", 'נספח א - "מסמך בדיקה"'),
    ("Mixed Hebrew/English", "נספח ב - Document Name"),
    ("Simple Hebrew", "רשימת נספחים לתביעה"),
]

# Write to file to avoid encoding issues
with open("test_output.txt", "w", encoding="utf-8") as f:
    f.write("Testing python-bidi get_display():\n\n")
    for name, text in tests:
        result = get_display(text)
        f.write(f"{name}:\n")
        f.write(f"  Input:  {text}\n")
        f.write(f"  Output: {result}\n")
        f.write("\n")

print("Test completed - results in test_output.txt")
