"use client";

import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import { fileSize } from "@/lib/format";
import type { Project } from "@/lib/types";

export function StepDrawings({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const [error, setError] = useState<string>();
  const [drag, setDrag] = useState(false);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const pdfs = Array.from(files).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) {
      setError("Upload PDF drawings only.");
      return;
    }
    setError(undefined);
    // Placeholder: store metadata only. Send the File to object storage in production.
    onChange({
      drawings: [
        ...project.drawings,
        ...pdfs.map((file) => ({
          name: file.name,
          size: file.size,
          type: file.type || "application/pdf",
          uploadedAt: new Date().toISOString(),
        })),
      ],
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-charcoal">Upload PDF drawings</h2>
      <p className="mt-2 rounded-xl bg-electric-soft px-4 py-3 text-sm text-charcoal">
        Energy Compliant Design uses the architectural drawings to complete the building takeoff and determine HOT2000 geometry.
      </p>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          addFiles(e.dataTransfer.files);
        }}
        className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center ${
          drag ? "border-electric bg-electric-soft" : "border-border bg-white"
        }`}
      >
        <Upload className="size-8 text-electric" />
        <span className="mt-3 text-sm font-medium">Drag and drop PDF drawings, or click to browse</span>
        <span className="mt-1 text-xs text-muted-foreground">PDF only · multiple files allowed</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
        />
      </label>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="mt-4 grid gap-2">
        {project.drawings.map((file, index) => (
          <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <FileText className="size-4 text-electric" />
              {file.name}
            </span>
            <span className="text-muted-foreground">{fileSize(file.size)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <h3 className="font-semibold text-charcoal">You do not need to calculate</h3>
        <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {[
            "Building volume",
            "Exterior wall areas",
            "Window areas",
            "Door areas",
            "Ceiling areas",
            "Exposed floor areas",
            "Foundation areas",
            "Window-to-wall ratio",
            "HOT2000 geometry",
          ].map((item) => (
            <li key={item} className="rounded-lg bg-muted px-3 py-2">
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
