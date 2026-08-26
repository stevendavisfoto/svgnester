import { useEffect, useRef, useState } from "react";
import { FileArrowUpIcon } from "@phosphor-icons/react";
import * as S from "./FileUpload.styles";

const PARSING_MESSAGES = [
  "Reading shapes…",
  "Tracing curves…",
  "Computing polygons…",
  "Building geometry tree…",
  "Almost there…",
];

interface FileUploadProps {
  onSvgLoaded: (svgString: string) => void;
  disabled?: boolean;
  parsing?: boolean;
  progress?: number;
  error?: string | null;
}

export function FileUpload({
  onSvgLoaded,
  disabled,
  parsing,
  progress = 0,
  error,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (!parsing) {
      setMsgIdx(0);
      return;
    }
    const id = setInterval(() => {
      setMsgIdx((i) => (i + 1) % PARSING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(id);
  }, [parsing]);

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
      {parsing && (
        <S.ParsingBanner>
          <S.Spinner />
          <S.ParsingMessage>{PARSING_MESSAGES[msgIdx]}</S.ParsingMessage>
          <S.ProgressTrack>
            <S.ProgressFill $pct={progress} />
          </S.ProgressTrack>
          <S.ProgressLabel>{progress}%</S.ProgressLabel>
        </S.ParsingBanner>
      )}
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
