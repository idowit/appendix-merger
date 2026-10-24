import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileImage, FileText, GripVertical, Trash2 } from "lucide-react";
import type { WorkflowMode } from "../domain/compilation-planner";
import type { StoredDocument } from "../persistence/compilation-file";

interface Labels {
  mainDocument: string; appendix: string; pages: string; remove: string; drag: string; titleLabel: string;
}

function SortableDocument({ document, mode, labels, onTitle, onMain, onRemove }: {
  document: StoredDocument; mode: WorkflowMode; labels: Labels;
  onTitle: (title: string) => void; onMain: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: document.id });
  return (
    <article ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`document-row${isDragging ? " is-dragging" : ""}`}>
      <button className="drag-handle" aria-label={labels.drag} {...attributes} {...listeners}><GripVertical size={19} /></button>
      <div className="file-icon" aria-hidden="true">{document.type.startsWith("image/") ? <FileImage /> : <FileText />}</div>
      <div className="document-fields">
        <div className="document-meta"><span className="file-name">{document.name}</span><span>{document.pageCount} {labels.pages}</span></div>
        <label className="sr-only" htmlFor={`title-${document.id}`}>{labels.titleLabel}</label>
        <input id={`title-${document.id}`} value={document.title} onChange={(event) => onTitle(event.target.value)} />
      </div>
      {mode === "appendix" && (
        <label className={`role-choice${document.role === "main" ? " is-main" : ""}`}>
          <input type="radio" name="main-document" checked={document.role === "main"} onChange={onMain} />
          {document.role === "main" ? labels.mainDocument : labels.appendix}
        </label>
      )}
      <button className="icon-button danger" aria-label={`${labels.remove} ${document.name}`} onClick={onRemove}><Trash2 size={18} /></button>
    </article>
  );
}

export function DocumentList({ documents, mode, labels, onTitle, onMain, onRemove, onReorder }: {
  documents: StoredDocument[]; mode: WorkflowMode; labels: Labels;
  onTitle: (id: string, title: string) => void; onMain: (id: string) => void;
  onRemove: (id: string) => void; onReorder: (from: number, to: number) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const dragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    onReorder(documents.findIndex((item) => item.id === event.active.id), documents.findIndex((item) => item.id === event.over?.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd}>
      <SortableContext items={documents.map((document) => document.id)} strategy={verticalListSortingStrategy}>
        <div className="document-list">
          {documents.map((document) => (
            <SortableDocument key={document.id} document={document} mode={mode} labels={labels}
              onTitle={(title) => onTitle(document.id, title)} onMain={() => onMain(document.id)} onRemove={() => onRemove(document.id)} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
