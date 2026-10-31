import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, Check, ChevronDown, Download, FilePlus2, Files, FolderOpen, Globe2,
  LockKeyhole, LogOut, Merge, Save, ShieldCheck, Sparkles, Trash2, X,
} from "lucide-react";
import { DocumentList } from "./components/DocumentList";
import { PdfPreview } from "./components/PdfPreview";
import { downloadBytes, endSession, loadInterfaceLanguage, saveInterfaceLanguage } from "./browser/app-client";
import { planCompilation } from "./domain/compilation-planner";
import type { PdfGenerationStage } from "./pdf/generate-finished-pdf";
import { generateWithWorker } from "./pdf/generation-client";
import { exportCompilationFile, importCompilationFile } from "./persistence/compilation-file";
import { useWorkspace } from "./hooks/use-workspace";
import { t, translateNotice, type InterfaceLanguage } from "./i18n";

export default function App() {
  const workspace = useWorkspace();
  const [language, setLanguage] = useState<InterfaceLanguage>(loadInterfaceLanguage);
  const [dragging, setDragging] = useState(false);
  const [generated, setGenerated] = useState<Uint8Array | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ stage: PdfGenerationStage; value: number } | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const compilationInput = useRef<HTMLInputElement>(null);
  const labels = t(language);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "he" ? "rtl" : "ltr";
    saveInterfaceLanguage(language);
  }, [language]);

  const plan = useMemo(() => {
    try {
      return planCompilation({
        mode: workspace.mode,
        documents: workspace.documents.map(({ id, name, title, pageCount, role }) => ({ id, name, title, pageCount, role })),
        settings: workspace.settings,
      });
    } catch {
      return null;
    }
  }, [workspace.mode, workspace.documents, workspace.settings]);

  const acceptFiles = (files: FileList | File[]) => workspace.addFiles(Array.from(files));
  const startGeneration = async () => {
    if (!plan) return;
    setGenerated(null);
    setIsGenerating(true);
    const task = generateWithWorker(workspace.snapshot, (stage, completed, total) => {
      setProgress({ stage, value: total ? Math.round((completed / total) * 100) : 0 });
    });
    cancelRef.current = task.cancel;
    try {
      setGenerated(await task.promise);
      setProgress({ stage: "saving", value: 100 });
    } catch (error) {
      workspace.setNotice({ kind: "error", message: error instanceof Error ? error.message : "PDF_GENERATION_FAILED" });
    } finally {
      setIsGenerating(false);
      cancelRef.current = null;
    }
  };

  const saveCompilation = async () => {
    const bytes = await exportCompilationFile(workspace.snapshot);
    downloadBytes(bytes, "appendix-compilation.appendix", "application/zip");
  };
  const openCompilation = async (file?: File) => {
    if (!file) return;
    try {
      workspace.replace(await importCompilationFile(new Uint8Array(await file.arrayBuffer())));
    } catch (error) {
      workspace.setNotice({ kind: "error", message: error instanceof Error ? error.message : "INVALID_ARCHIVE" });
    }
  };
  const progressLabel = progress ? labels[`progress${progress.stage[0].toUpperCase()}${progress.stage.slice(1)}` as keyof typeof labels] : "";

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label={labels.appName}>
          <span className="brand-mark"><Files size={24} /></span>
          <span><strong>{labels.appName}</strong><small>{labels.tagline}</small></span>
        </a>
        <div className="header-actions">
          <span className="private-badge"><ShieldCheck size={15} />{labels.privateSession}</span>
          <button className="quiet-button" onClick={() => setLanguage(language === "he" ? "en" : "he")}><Globe2 size={17} />{labels.languageSwitch}</button>
          <button className="quiet-button" onClick={endSession}><LogOut size={17} />{labels.logout}</button>
        </div>
      </header>

      <main id="top" className="workspace">
        <nav className="mode-switch" aria-label={labels.workflowLabel}>
          <button className={workspace.mode === "appendix" ? "active" : ""} onClick={() => workspace.setMode("appendix")}><Archive size={18} />{labels.appendixMode}</button>
          <button className={workspace.mode === "quick-merge" ? "active" : ""} onClick={() => workspace.setMode("quick-merge")}><Merge size={18} />{labels.quickMode}</button>
        </nav>

        <section className="intro">
          <p className="eyebrow"><LockKeyhole size={14} />{labels.localOnly}</p>
          <h1>{workspace.mode === "appendix" ? labels.appendixTitle : labels.quickTitle}</h1>
          <p>{workspace.mode === "appendix" ? labels.appendixSubtitle : labels.quickSubtitle}</p>
        </section>

        {workspace.notice && <div className={`notice ${workspace.notice.kind}`} role="status"><span>{translateNotice(language, workspace.notice.message)}</span><button aria-label={labels.close} onClick={() => workspace.setNotice(null)}><X size={17} /></button></div>}

        <div className="workspace-grid">
          <div className="workspace-main">
            <section className={`drop-zone${dragging ? " is-dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFiles(event.dataTransfer.files); }}>
              <div className="drop-icon"><FilePlus2 size={28} /></div>
              <div><h2>{labels.dropTitle}</h2><p>{labels.dropHint}</p></div>
              <button className="secondary-button" onClick={() => fileInput.current?.click()}>{labels.chooseFiles}</button>
              <input ref={fileInput} hidden multiple type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(event) => event.target.files && acceptFiles(event.target.files)} />
            </section>

            <section className="panel document-panel">
              <div className="panel-heading"><div><span className="step">01</span><h2>{labels.documents}</h2></div><span className="count-badge">{workspace.documents.length}</span></div>
              {workspace.documents.length ? (
                <DocumentList documents={workspace.documents} mode={workspace.mode}
                  labels={labels} onTitle={(id, title) => workspace.updateDocument(id, { title })}
                  onMain={workspace.makeMain} onRemove={workspace.removeDocument} onReorder={workspace.reorder} />
              ) : <div className="empty-state"><Files size={32} /><p>{labels.empty}</p></div>}
            </section>

            <details className="panel settings-panel">
              <summary><span><span className="step">02</span>{labels.settings}</span><ChevronDown size={19} /></summary>
              <div className="settings-grid">
                {workspace.mode === "appendix" && <>
                  <label><span>{labels.numbering}</span><select value={workspace.settings.numbering} onChange={(event) => workspace.setSettings({ ...workspace.settings, numbering: event.target.value as typeof workspace.settings.numbering })}>
                    <option value="hebrew">{labels.hebrewSequence}</option><option value="decimal">{labels.decimal}</option><option value="roman">{labels.roman}</option>
                  </select></label>
                  <label><span>{labels.outputLanguage}</span><select value={workspace.settings.outputLanguage} onChange={(event) => workspace.setSettings({ ...workspace.settings, outputLanguage: event.target.value as "he" | "en" })}>
                    <option value="he">{labels.hebrew}</option><option value="en">{labels.english}</option>
                  </select></label>
                  <label className="toggle"><input type="checkbox" checked={workspace.settings.tableOfContents} onChange={(event) => workspace.setSettings({ ...workspace.settings, tableOfContents: event.target.checked })} /><span>{labels.tableOfContents}</span></label>
                  <label className="toggle"><input type="checkbox" checked={workspace.settings.appendixCovers} onChange={(event) => workspace.setSettings({ ...workspace.settings, appendixCovers: event.target.checked })} /><span>{labels.appendixCovers}</span></label>
                  <label className="toggle"><input type="checkbox" checked={workspace.settings.appendixMarkers} onChange={(event) => workspace.setSettings({ ...workspace.settings, appendixMarkers: event.target.checked })} /><span>{labels.markers}</span></label>
                </>}
                <label className="toggle"><input type="checkbox" checked={workspace.settings.pageNumbers} onChange={(event) => workspace.setSettings({ ...workspace.settings, pageNumbers: event.target.checked })} /><span>{labels.pageNumbers}</span></label>
              </div>
            </details>

            <div className="workspace-tools">
              {workspace.mode === "appendix" && <>
                <button className="quiet-button" onClick={saveCompilation} disabled={!workspace.documents.length}><Save size={17} />{labels.save}</button>
                <button className="quiet-button" onClick={() => compilationInput.current?.click()}><FolderOpen size={17} />{labels.open}</button>
                <input ref={compilationInput} hidden type="file" accept=".appendix,.zip" onChange={(event) => openCompilation(event.target.files?.[0])} />
              </>}
              <button className="quiet-button danger-text" onClick={workspace.clear} disabled={!workspace.documents.length}><Trash2 size={17} />{labels.clear}</button>
            </div>
          </div>

          <aside className="summary-card">
            <div className="summary-heading"><Sparkles size={18} /><h2>{labels.summary}</h2></div>
            <dl>
              <div><dt>{labels.sourceFiles}</dt><dd>{workspace.documents.length}</dd></div>
              <div><dt>{labels.finalPages}</dt><dd>{plan?.totalPages ?? "—"}</dd></div>
            </dl>
            <div className="privacy-note"><ShieldCheck size={20} /><p>{labels.localOnly}<small>{labels.privacyDetail}</small></p></div>
            {!plan && workspace.documents.length > 0 && <p className="validation-message">{workspace.mode === "appendix" ? labels.invalidAppendix : labels.invalidQuick}</p>}
            {isGenerating && <div className="progress-block"><div className="progress-copy"><span>{String(progressLabel)}</span><strong>{progress?.value ?? 0}%</strong></div><div className="progress-track"><span style={{ width: `${progress?.value ?? 4}%` }} /></div></div>}
            {isGenerating ? <button className="primary-button cancel-button" onClick={() => { cancelRef.current?.(); setIsGenerating(false); }}><X size={19} />{labels.cancel}</button>
              : <button className="primary-button" disabled={!plan} onClick={startGeneration}><Check size={19} />{labels.generate}</button>}
          </aside>
        </div>
      </main>

      {generated && <div className="preview-backdrop" role="dialog" aria-modal="true" aria-labelledby="preview-title">
        <section className="preview-dialog">
          <button className="preview-close" aria-label={labels.closePreview} onClick={() => setGenerated(null)}><X /></button>
          <div className="preview-copy"><span className="success-mark"><Check /></span><h2 id="preview-title">{labels.readyTitle}</h2><p>{labels.readyBody}</p>
            <button className="primary-button" onClick={() => downloadBytes(generated, "appendix-compilation.pdf", "application/pdf")}><Download size={19} />{labels.download}</button></div>
          <div className="preview-sheet"><PdfPreview bytes={generated} ariaLabel={labels.previewLabel} /></div>
        </section>
      </div>}
    </div>
  );
}
