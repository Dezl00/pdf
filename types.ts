export interface ProcessedPage {
  id: string;
  originalIndex: number; // 1-based index from the PDF
  sourceFileName?: string; // Name of the source PDF
  thumbnailUrl: string; // Small preview
  fullResUrl: string; // High res for canvas
  isSelected: boolean;
  canvasState?: any; // JSON export from Fabric
}

export enum AppStep {
  UPLOAD = 'UPLOAD',
  SELECT_PAGES = 'SELECT_PAGES',
  EDITOR = 'EDITOR',
  EXPORTING = 'EXPORTING'
}

export interface CanvasObjectProps {
  opacity: number;
  blendMode: string;
  scale: number;
}