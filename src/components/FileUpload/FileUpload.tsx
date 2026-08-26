import { useRef, useState } from "react";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import * as S from "./FileUpload.styles";

interface FileUploadProps {
  onSvgLoaded: (svgString: string) => void;
  disabled?: boolean;
  parsing?: boolean;
  error?: string | null;
}

export function FileUpload({
  onSvgLoaded,
  disabled,
  parsing,
  error,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.name.endsWith(".svg") && file.type !== "image/svg+xml") {
      alert("Please upload an SVG file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => onSvgLoaded(e.target?.result as string);
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <S.DropZone
      $dragging={dragging}
      $disabled={disabled}
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <S.UploadIcon>
        <FileArrowUpIcon size={36} weight="fill" />
      </S.UploadIcon>
      <S.Label>Drop an SVG here or click to browse</S.Label>
      <S.Steps>
        <S.Step>
          <S.StepNum>1</S.StepNum>One SVG file containing all your shapes
        </S.Step>
        <S.Step>
          <S.StepNum>2</S.StepNum>Include the <strong>sheet</strong> as one of
          the shapes
        </S.Step>
        <S.Step>
          <S.StepNum>3</S.StepNum>Click the sheet shape to select it, then start
          nesting
        </S.Step>
      </S.Steps>
      <S.Hint>
        Closed path outlines only — no text, groups, or raster images
      </S.Hint>
      {parsing && <S.ParsingBanner>Parsing SVG…</S.ParsingBanner>}
      {!parsing && error && <S.ErrorBanner>{error}</S.ErrorBanner>}
      <input
        ref={inputRef}
        type="file"
        accept=".svg,image/svg+xml"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </S.DropZone>
  );
}
