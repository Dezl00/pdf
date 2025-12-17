import React, { useEffect, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { Loader2, Trash2, Layers, Move, Maximize, Image as ImageIcon, Copy, RotateCw } from 'lucide-react';

interface FabricCanvasProps {
  backgroundUrl: string;
  pageContentUrl: string;
  initialState?: any;
  onSaveState: (json: any) => void;
  isActive: boolean;
}

const A4_WIDTH = 595; // Standard A4 width at 72 DPI (approx)
const A4_HEIGHT = 842;

const FabricCanvas: React.FC<FabricCanvasProps> = ({ 
  backgroundUrl, 
  pageContentUrl, 
  initialState, 
  onSaveState,
  isActive
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<fabric.Canvas | null>(null);
  const [selectedObject, setSelectedObject] = useState<fabric.Object | null>(null);
  
  // -- Initialization --
  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Fabric Canvas
    const canvas = new fabric.Canvas(canvasRef.current, {
      width: A4_WIDTH,
      height: A4_HEIGHT,
      backgroundColor: '#ffffff',
      preserveObjectStacking: true, // Important so background stays at bottom
    });

    fabricRef.current = canvas;

    // Selection Events
    canvas.on('selection:created', (e) => setSelectedObject(e.selected?.[0] || null));
    canvas.on('selection:updated', (e) => setSelectedObject(e.selected?.[0] || null));
    canvas.on('selection:cleared', () => setSelectedObject(null));
    
    // We attach modification events after loading to avoid initial trigger loops, 
    // but typically it's fine if we handle state carefully.
    const attachEvents = () => {
        canvas.on('object:modified', () => {
            onSaveState(canvas.toJSON());
        });
        canvas.on('object:added', (e) => {
            onSaveState(canvas.toJSON());
        });
    };

    // Load Logic
    const loadContent = async () => {
      try {
        // 1. Load State or Setup Fresh
        if (initialState) {
            await canvas.loadFromJSON(initialState);
            
            // Re-lock background after loading JSON
            const bgObj = canvas.getObjects().find((o: any) => o.id === 'background');
            if (bgObj) {
                bgObj.set({
                    selectable: false,
                    evented: false,
                    lockMovementX: true,
                    lockMovementY: true,
                });
                canvas.sendObjectToBack(bgObj);
            }
            canvas.renderAll();
        } else {
            // 2. Fresh Setup
            
            // A. Background (HR Letter)
            const bgImg = await fabric.FabricImage.fromURL(backgroundUrl, { crossOrigin: 'anonymous' });
            bgImg.set({
                originX: 'left',
                originY: 'top',
                selectable: false, // Locked
                evented: false,
                lockMovementX: true,
                lockMovementY: true,
                // @ts-ignore custom id property
                id: 'background'
            });
            // Scale background to fit A4 width
            bgImg.scaleToWidth(A4_WIDTH);
            canvas.add(bgImg);
            canvas.sendObjectToBack(bgImg);

            // B. PDF Page Content
            const pageImg = await fabric.FabricImage.fromURL(pageContentUrl, { crossOrigin: 'anonymous' });
            pageImg.set({
                left: 0,
                top: 0,
                // Default to multiply as requested
                globalCompositeOperation: 'multiply',
                // @ts-ignore custom id
                id: 'pdf-page'
            });
            // Scale PDF page to fit width (assuming standard doc)
            pageImg.scaleToWidth(A4_WIDTH);
            canvas.add(pageImg);
            canvas.renderAll();
            
            // Initial Save
            onSaveState(canvas.toJSON());
        }
      } catch (error) {
          console.error("Error initializing canvas content:", error);
      }
      
      attachEvents();
    };

    loadContent();

    return () => {
      canvas.dispose();
      fabricRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundUrl, pageContentUrl, isActive]); // Re-init if active page changes

  // -- Helpers --

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && fabricRef.current) {
      const reader = new FileReader();
      reader.onload = async (f) => {
        const data = f.target?.result as string;
        try {
            const img = await fabric.FabricImage.fromURL(data);
            img.set({
                left: 100,
                top: 100,
            });
            img.scaleToWidth(150);
            fabricRef.current?.add(img);
            fabricRef.current?.setActiveObject(img);
            onSaveState(fabricRef.current?.toJSON());
        } catch (err) {
            console.error("Error adding image:", err);
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const updateSelectedProp = (key: keyof fabric.Object, value: any) => {
    if (!fabricRef.current) return;
    const activeObj = fabricRef.current.getActiveObject();
    if (activeObj) {
      activeObj.set(key, value);
      fabricRef.current.requestRenderAll();
      onSaveState(fabricRef.current.toJSON());
      setSelectedObject({ ...activeObj } as fabric.Object); // Trigger re-render of toolbar
    }
  };

  const deleteSelected = () => {
    if (!fabricRef.current) return;
    const activeObj = fabricRef.current.getActiveObject();
    // Prevent deleting background
    // @ts-ignore
    if (activeObj && activeObj.id !== 'background') {
      fabricRef.current.remove(activeObj);
      fabricRef.current.discardActiveObject();
      fabricRef.current.requestRenderAll();
      setSelectedObject(null);
      onSaveState(fabricRef.current.toJSON());
    }
  };

  const duplicateSelected = async () => {
    if (!fabricRef.current) return;
    const activeObj = fabricRef.current.getActiveObject();
    if (activeObj) {
        const cloned = await activeObj.clone();
        fabricRef.current.discardActiveObject();
        cloned.set({
            left: (cloned.left || 0) + 20,
            top: (cloned.top || 0) + 20,
            evented: true,
        });
        if (cloned.type === 'activeSelection') {
            cloned.canvas = fabricRef.current;
            (cloned as fabric.ActiveSelection).forEachObject((obj: any) => {
                fabricRef.current?.add(obj);
            });
            cloned.setCoords();
        } else {
            fabricRef.current.add(cloned);
        }
        fabricRef.current.setActiveObject(cloned);
        fabricRef.current.requestRenderAll();
        onSaveState(fabricRef.current.toJSON());
    }
  };

  const rotateSelected = () => {
     if (!fabricRef.current) return;
     const activeObj = fabricRef.current.getActiveObject();
     if (activeObj) {
         const currentAngle = activeObj.angle || 0;
         activeObj.rotate((currentAngle + 90) % 360);
         fabricRef.current.requestRenderAll();
         onSaveState(fabricRef.current.toJSON());
     }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Toolbar */}
      <div className="h-16 bg-white border-b px-4 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-4">
           <label className="flex items-center gap-2 cursor-pointer bg-brand-50 hover:bg-brand-100 text-brand-600 px-3 py-1.5 rounded-md transition-colors text-sm font-medium">
            <ImageIcon size={16} />
            <span>إضافة ختم</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleAddImage} />
          </label>
        </div>

        {selectedObject && (
           <div className="flex items-center gap-4 divide-x divide-x-reverse divide-gray-200">
             {/* Actions */}
             <div className="flex items-center gap-2 pr-4 pl-2">
                <button 
                  onClick={rotateSelected}
                  title="تدوير 90 درجة"
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-700"
                >
                  <RotateCw size={18} />
                </button>
                <button 
                  onClick={duplicateSelected}
                  title="نسخ (مضاعفة)"
                  className="p-1.5 hover:bg-gray-100 rounded text-gray-700"
                >
                  <Copy size={18} />
                </button>
             </div>

             {/* Opacity */}
             <div className="flex items-center gap-2 pr-4 pl-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">الشفافية</span>
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.1"
                  value={selectedObject.opacity || 1}
                  onChange={(e) => updateSelectedProp('opacity', parseFloat(e.target.value))}
                  className="w-24 accent-brand-500"
                />
             </div>

             {/* Blend Mode */}
             <div className="flex items-center gap-2 pr-4 pl-2">
                <span className="text-xs font-semibold text-gray-500 uppercase">وضع المزج</span>
                <select 
                  value={selectedObject.globalCompositeOperation || 'source-over'}
                  onChange={(e) => updateSelectedProp('globalCompositeOperation', e.target.value)}
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-brand-500 focus:ring-brand-500 py-1"
                >
                  <option value="source-over">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                </select>
             </div>

             {/* Layer & Delete */}
             <div className="flex items-center gap-2 pr-4">
                <button 
                  onClick={() => {
                    const obj = fabricRef.current?.getActiveObject();
                    if (obj) {
                        fabricRef.current?.bringObjectForward(obj);
                        onSaveState(fabricRef.current?.toJSON());
                    }
                  }}
                  title="إحضار للأمام"
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <Layers size={18} className="text-gray-600" />
                </button>
                <button 
                  onClick={deleteSelected}
                  // @ts-ignore
                  disabled={selectedObject.id === 'background'}
                  title="حذف"
                  className="p-1 hover:bg-red-50 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 size={18} className="text-red-500" />
                </button>
             </div>
           </div>
        )}
        {!selectedObject && <div className="text-sm text-gray-400 italic">اختر ختمًا أو صفحة للتعديل</div>}
      </div>

      {/* Canvas Area */}
      <div className="flex-1 overflow-auto flex justify-center p-8 bg-gray-100 relative">
        <div className="shadow-lg bg-white" style={{ width: A4_WIDTH, height: A4_HEIGHT }}>
          <canvas ref={canvasRef} />
        </div>
      </div>
    </div>
  );
};

export default FabricCanvas;