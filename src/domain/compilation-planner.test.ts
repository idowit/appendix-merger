import { describe, expect, it } from "vitest";
import { appendixLabel, CompilationValidationError, planCompilation } from "./compilation-planner";

const defaultSettings = {
  numbering: "hebrew" as const,
  outputLanguage: "he" as const,
  outputStyle: "polished" as const,
  appendixMarkers: true,
  pageNumbers: true,
};

describe("planCompilation", () => {
  it("continues Hebrew and Roman appendix numbering without a small-list fallback", () => {
    expect(appendixLabel(20, "hebrew")).toBe("כא");
    expect(appendixLabel(41, "hebrew")).toBe("מב");
    expect(appendixLabel(10, "roman")).toBe("XI");
    expect(appendixLabel(48, "roman")).toBe("XLIX");
  });

  it("plans the main document, TOC, appendix cover, and appendix pages in output order", () => {
    const plan = planCompilation({
      mode: "appendix",
      documents: [
        { id: "main", name: "claim.pdf", title: "כתב תביעה", pageCount: 2, role: "main" },
        { id: "appendix-a", name: "contract.pdf", title: "הסכם", pageCount: 3, role: "appendix" },
      ],
      settings: defaultSettings,
    });

    expect(plan).toEqual({
      mode: "appendix",
      totalPages: 7,
      sections: [
        { kind: "source", documentId: "main", startPage: 1, endPage: 2 },
        { kind: "toc", startPage: 3, endPage: 3 },
        { kind: "cover", documentId: "appendix-a", appendixLabel: "א", startPage: 4, endPage: 4 },
        { kind: "source", documentId: "appendix-a", appendixLabel: "א", startPage: 5, endPage: 7 },
      ],
    });
  });

  it("rejects an Appendix Compilation without both required document roles", () => {
    expect(() =>
      planCompilation({
        mode: "appendix",
        documents: [{ id: "main", name: "claim.pdf", title: "Claim", pageCount: 2, role: "main" }],
        settings: defaultSettings,
      }),
    ).toThrowError(new CompilationValidationError("APPENDIX_REQUIRED"));
  });

  it("plans Quick Merge as ordered source documents without generated appendix sections", () => {
    const plan = planCompilation({
      mode: "quick-merge",
      documents: [
        { id: "one", name: "one.pdf", title: "One", pageCount: 2 },
        { id: "two", name: "two.png", title: "Two", pageCount: 1 },
      ],
      settings: { ...defaultSettings, pageNumbers: false },
    });

    expect(plan).toEqual({
      mode: "quick-merge",
      totalPages: 3,
      sections: [
        { kind: "source", documentId: "one", startPage: 1, endPage: 2 },
        { kind: "source", documentId: "two", startPage: 3, endPage: 3 },
      ],
    });
  });

  it("allocates additional TOC pages for large Appendix Compilations", () => {
    const appendices = Array.from({ length: 30 }, (_, index) => ({
      id: `appendix-${index + 1}`,
      name: `appendix-${index + 1}.pdf`,
      title: `Appendix ${index + 1}`,
      pageCount: 1,
      role: "appendix" as const,
    }));
    const plan = planCompilation({
      mode: "appendix",
      documents: [
        { id: "main", name: "main.pdf", title: "Main", pageCount: 1, role: "main" },
        ...appendices,
      ],
      settings: defaultSettings,
    });

    expect(plan.sections[1]).toEqual({ kind: "toc", startPage: 2, endPage: 3 });
    expect(plan.totalPages).toBe(63);
  });
});
