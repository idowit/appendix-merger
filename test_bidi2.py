# Test script to verify bidi handling with the user's exact cases
from bidi.algorithm import get_display

tests = [
    ("User case 1", "של השלישי ניסוי 723"),
    ("Numbers in title", "נספח 14"),
    ("Page range", "עמודים: 14 - 20"),
    ("Appendix with dash", "נספח א - שם מסמך 123"),
]

# Write to file to avoid encoding issues
with open("test_output2.txt", "w", encoding="utf-8") as f:
    f.write("Testing python-bidi get_display() with user cases:\n\n")
    for name, text in tests:
        result = get_display(text)
        f.write(f"{name}:\n")
        f.write(f"  Input:  {text}\n")
        f.write(f"  Output: {result}\n")
        f.write(f"  Problem? Check if 723 became 327 or similar\n")
        f.write("\n")

print("Test completed - results in test_output2.txt")
