export type WorkflowMode = "appendix" | "quick-merge";
export type DocumentRole = "main" | "appendix";
export type NumberingStyle = "hebrew" | "decimal" | "roman";
export type OutputLanguage = "he" | "en";

export interface CompilationDocument {
  id: string;
  name: string;
  title: string;
  pageCount: number;
  role?: DocumentRole;
}

export interface CompilationSettings {
  numbering: NumberingStyle;
  outputLanguage: OutputLanguage;
  tableOfContents: boolean;
  appendixCovers: boolean;
  appendixMarkers: boolean;
  pageNumbers: boolean;
}

export function normalizeCompilationSettings(settings: Partial<CompilationSettings>): CompilationSettings {
  return {
    numbering: settings.numbering ?? "hebrew",
    outputLanguage: settings.outputLanguage ?? "he",
    tableOfContents: settings.tableOfContents ?? true,
    appendixCovers: settings.appendixCovers ?? true,
    appendixMarkers: settings.appendixMarkers ?? true,
    pageNumbers: settings.pageNumbers ?? true,
  };
}

export interface CompilationRequest {
  mode: WorkflowMode;
  documents: CompilationDocument[];
  settings: CompilationSettings;
}

export type CompilationSection =
  | { kind: "source"; documentId: string; appendixLabel?: string; startPage: number; endPage: number }
  | { kind: "toc"; startPage: number; endPage: number }
  | { kind: "cover"; documentId: string; appendixLabel: string; startPage: number; endPage: number };

export interface CompilationPlan {
  mode: WorkflowMode;
  totalPages: number;
  sections: CompilationSection[];
}

export type CompilationValidationCode =
  | "MAIN_DOCUMENT_REQUIRED"
  | "MULTIPLE_MAIN_DOCUMENTS"
  | "APPENDIX_REQUIRED"
  | "DOCUMENT_REQUIRED"
  | "INVALID_PAGE_COUNT";

export class CompilationValidationError extends Error {
  constructor(public readonly code: CompilationValidationCode) {
    super(code);
    this.name = "CompilationValidationError";
  }
}

function hebrewNumber(value: number): string {
  if (value >= 1000) {
    const remainder = value % 1000;
    return `${hebrewNumber(Math.floor(value / 1000))}׳${remainder ? hebrewNumber(remainder) : ""}`;
  }
  const hundreds = ["", "ק", "ר", "ש"];
  const tens = ["", "י", "כ", "ל", "מ", "נ", "ס", "ע", "פ", "צ"];
  const ones = ["", "א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט"];
  let remaining = value;
  let result = "";
  while (remaining >= 400) {
    result += "ת";
    remaining -= 400;
  }
  result += hundreds[Math.floor(remaining / 100)];
  remaining %= 100;
  if (remaining === 15) return `${result}טו`;
  if (remaining === 16) return `${result}טז`;
  return `${result}${tens[Math.floor(remaining / 10)]}${ones[remaining % 10]}`;
}

function romanNumber(value: number): string {
  const numerals: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let remaining = value;
  let result = "";
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

export function appendixLabel(index: number, style: NumberingStyle): string {
  if (style === "hebrew") return hebrewNumber(index + 1);
  if (style === "roman") return romanNumber(index + 1);
  return String(index + 1);
}

export function planCompilation(request: CompilationRequest): CompilationPlan {
  if (request.documents.some((document) => !Number.isInteger(document.pageCount) || document.pageCount < 1)) {
    throw new CompilationValidationError("INVALID_PAGE_COUNT");
  }

  if (request.mode === "quick-merge") {
    if (request.documents.length === 0) throw new CompilationValidationError("DOCUMENT_REQUIRED");
    let nextPage = 1;
    const sections = request.documents.map<CompilationSection>((document) => {
      const section: CompilationSection = {
        kind: "source",
        documentId: document.id,
        startPage: nextPage,
        endPage: nextPage + document.pageCount - 1,
      };
      nextPage += document.pageCount;
      return section;
    });
    return { mode: request.mode, totalPages: nextPage - 1, sections };
  }

  const mains = request.documents.filter((document) => document.role === "main");
  if (mains.length === 0) throw new CompilationValidationError("MAIN_DOCUMENT_REQUIRED");
  if (mains.length > 1) throw new CompilationValidationError("MULTIPLE_MAIN_DOCUMENTS");
  const main = mains[0];
  const appendices = request.documents.filter((document) => document.role === "appendix");
  if (appendices.length === 0) throw new CompilationValidationError("APPENDIX_REQUIRED");
  const sections: CompilationSection[] = [];
  let nextPage = 1;

  sections.push({
    kind: "source",
    documentId: main.id,
    startPage: nextPage,
    endPage: nextPage + main.pageCount - 1,
  });
  nextPage += main.pageCount;

  if (request.settings.tableOfContents) {
    const tocPages = Math.max(1, Math.ceil(appendices.length / 18));
    sections.push({ kind: "toc", startPage: nextPage, endPage: nextPage + tocPages - 1 });
    nextPage += tocPages;
  }

  appendices.forEach((document, index) => {
    const label = appendixLabel(index, request.settings.numbering);
    if (request.settings.appendixCovers) {
      sections.push({
        kind: "cover",
        documentId: document.id,
        appendixLabel: label,
        startPage: nextPage,
        endPage: nextPage,
      });
      nextPage += 1;
    }
    sections.push({
      kind: "source",
      documentId: document.id,
      appendixLabel: label,
      startPage: nextPage,
      endPage: nextPage + document.pageCount - 1,
    });
    nextPage += document.pageCount;
  });

  return { mode: request.mode, totalPages: nextPage - 1, sections };
}
