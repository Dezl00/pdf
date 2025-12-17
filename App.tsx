import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, Image as ImageIcon, CheckCircle, ArrowRight, Download, ArrowLeft, Loader2, X, Plus, GripHorizontal } from 'lucide-react';
import { loadPdf, renderPageToImage } from './services/pdfService';
import FabricCanvas from './components/FabricCanvas';
import { jsPDF } from 'jspdf';
import * as fabric from 'fabric';
import { AppStep, ProcessedPage } from './types';

// Helper to generate unique IDs
const generateId = () => Math.random().toString(36).substr(2, 9);

function App() {
  const [step, setStep] = useState<AppStep>(AppStep.UPLOAD);
  
  // Initial Upload State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [bgImageFile, setBgImageFile] = useState<string | null>(null); // Data URL
  
  // Pages State
  const [pages, setPages] = useState<ProcessedPage[]>([]);
  const [currentEditIndex, setCurrentEditIndex] = useState<number>(0);
  
  // Processing States
  const [isProcessing, setIsProcessing] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // -- ADD MORE PDFS STATE --
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [tempNewPages, setTempNewPages] = useState<ProcessedPage[]>([]); // Pages from the new PDF being added
  const [isProcessingNew, setIsProcessingNew] = useState(false);
  const [newPdfFilename, setNewPdfFilename] = useState<string>('');

  // -- DRAG & DROP REORDER STATE --
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // -- STEP 1: Upload Handling --

  const onDropPdf = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) setPdfFile(acceptedFiles[0]);
  }, []);

  const onDropBg = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      const reader = new FileReader();
      reader.onload = () => setBgImageFile(reader.result as string);
      reader.readAsDataURL(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps: getPdfRootProps, getInputProps: getPdfInputProps } = useDropzone({
    onDrop: onDropPdf,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1
  });

  const { getRootProps: getBgRootProps, getInputProps: getBgInputProps } = useDropzone({
    onDrop: onDropBg,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg'] },
    maxFiles: 1
  });

  // Initial Processing
  const handleProcessUploads = async () => {
    if (!pdfFile || !bgImageFile) return;
    setIsProcessing(true);

    try {
      const pdf = await loadPdf(pdfFile);
      const newPages: ProcessedPage[] = [];

      for (let i = 1; i <= pdf.numPages; i++) {
        // Render small thumbnail
        const thumbUrl = await renderPageToImage(pdf, i, 0.5);
        // Render high res for canvas
        const fullUrl = await renderPageToImage(pdf, i, 2.0);

        newPages.push({
          id: generateId(),
          originalIndex: i,
          sourceFileName: pdfFile.name,
          thumbnailUrl: thumbUrl,
          fullResUrl: fullUrl,
          isSelected: true // Select all by default
        });
      }

      setPages(newPages);
      setStep(AppStep.SELECT_PAGES);
    } catch (error) {
      console.error("Error processing PDF", error);
      alert("فشل في معالجة PDF. يرجى تجربة ملف آخر.");
    } finally {
      setIsProcessing(false);
    }
  };

  // -- ADD MORE PDF LOGIC --

  const handleAddPdfFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setNewPdfFilename(file.name);
      setIsProcessingNew(true);
      setIsAddModalOpen(true);
      setTempNewPages([]); // Clear previous

      try {
        const pdf = await loadPdf(file);
        const pagesList: ProcessedPage[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const thumbUrl = await renderPageToImage(pdf, i, 0.5);
            const fullUrl = await renderPageToImage(pdf, i, 2.0);
            pagesList.push({
                id: generateId(),
                originalIndex: i,
                sourceFileName: file.name,
                thumbnailUrl: thumbUrl,
                fullResUrl: fullUrl,
                isSelected: true // Default to selected
            });
        }
        setTempNewPages(pagesList);
      } catch (error) {
          console.error("Error adding PDF", error);
          alert("فشل في قراءة الملف الإضافي.");
          setIsAddModalOpen(false);
      } finally {
          setIsProcessingNew(false);
      }
    }
  };

  const toggleTempPageSelection = (id: string) => {
    setTempNewPages(prev => prev.map(p => 
        p.id === id ? { ...p, isSelected: !p.isSelected } : p
    ));
  };

  const confirmAddPages = () => {
    const pagesToAdd = tempNewPages.filter(p => p.isSelected);
    setPages(prev => [...prev, ...pagesToAdd]);
    setIsAddModalOpen(false);
    setTempNewPages([]);
  };

  const cancelAddPages = () => {
    setIsAddModalOpen(false);
    setTempNewPages([]);
  };

  // -- REORDER LOGIC --

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    
    // Duplicate items
    const _pages = [...pages];
    
    // Remove and save the dragged item content
    const draggedItemContent = _pages.splice(dragItem.current, 1)[0];
    
    // Switch the position
    _pages.splice(dragOverItem.current, 0, draggedItemContent);
    
    // Reset position refs
    dragItem.current = null;
    dragOverItem.current = null;
    
    // Update state
    setPages(_pages);
  };


  // -- STEP 2: Selection Handling --

  const togglePageSelection = (id: string) => {
    setPages(prev => prev.map(p => 
      p.id === id ? { ...p, isSelected: !p.isSelected } : p
    ));
  };

  const selectedCount = pages.filter(p => p.isSelected).length;

  const startEditing = () => {
    // Find first selected page index
    const firstSelected = pages.findIndex(p => p.isSelected);
    if (firstSelected === -1) return;
    
    setCurrentEditIndex(firstSelected);
    setStep(AppStep.EDITOR);
  };

  // -- STEP 3: Editor Handling --

  const handleSavePageState = (json: any) => {
    setPages(prev => {
      const newPages = [...prev];
      newPages[currentEditIndex] = {
        ...newPages[currentEditIndex],
        canvasState: json
      };
      return newPages;
    });
  };

  const changePage = (index: number) => {
    if (pages[index].isSelected) {
      setCurrentEditIndex(index);
    }
  };

  // -- STEP 4: Export --

  const generatePDF = async () => {
    if (!bgImageFile) return;
    setStep(AppStep.EXPORTING);
    setExportProgress(0);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4' // 595.28 x 841.89
    });

    const selectedPages = pages.filter(p => p.isSelected);
    const total = selectedPages.length;

    // We need a temporary hidden canvas to render the full resolution output
    const tempCanvasEl = document.createElement('canvas');
    tempCanvasEl.width = 595 * 2; // 2x scale for quality
    tempCanvasEl.height = 842 * 2;
    
    // Use fabric to render onto this temp canvas
    // Note: We can't use the React component here, we utilize raw fabric logic
    const tempFabric = new fabric.StaticCanvas(tempCanvasEl);
    tempFabric.setDimensions({ width: 595, height: 842 });

    try {
        for (let i = 0; i < total; i++) {
          const pageData = selectedPages[i];
          setExportProgress(Math.round(((i) / total) * 100));

          // Clear
          tempFabric.clear();

          if (pageData.canvasState) {
              // If the user edited this page, load the state
              await tempFabric.loadFromJSON(pageData.canvasState);
              // Canvas state loaded
          } else {
              // Manual construction for unedited pages
              // Background
              const bgImg = await fabric.FabricImage.fromURL(bgImageFile, { crossOrigin: 'anonymous' });
              bgImg.set({ originX: 'left', originY: 'top', selectable: false });
              bgImg.scaleToWidth(595);
              tempFabric.add(bgImg);
              tempFabric.sendObjectToBack(bgImg);

              // PDF Content
              const pdfImg = await fabric.FabricImage.fromURL(pageData.fullResUrl, { crossOrigin: 'anonymous' });
              pdfImg.set({ 
                left: 0, 
                top: 0, 
                globalCompositeOperation: 'multiply' 
              });
              pdfImg.scaleToWidth(595);
              tempFabric.add(pdfImg);
          }
          
          // Wait for rendering to stabilize
          tempFabric.renderAll();

          // Get Data URL (PNG for quality)
          const imgData = tempFabric.toDataURL({
            format: 'png',
            multiplier: 2 // Export at 2x resolution (approx 150-200 DPI effective)
          });

          if (i > 0) doc.addPage();
          doc.addImage(imgData, 'PNG', 0, 0, 595, 842);
        }

        setExportProgress(100);
        doc.save('composed-document.pdf');
    } catch (e) {
        console.error("Error generating PDF", e);
        alert("حدث خطأ أثناء إنشاء ملف PDF.");
    } finally {
        // Clean up
        tempFabric.dispose();
        setStep(AppStep.EDITOR);
    }
  };


  // -- RENDERERS --

  if (step === AppStep.UPLOAD) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
          {/* Header Centered */}
          <div className="p-8 border-b border-gray-100 flex flex-col items-center justify-center text-center">
            <h1 className="text-3xl font-bold text-gray-800">تطبيق المزور</h1>
            <p className="text-gray-500 mt-2 font-semibold" dir="ltr">by: Mohamed Alshobaky</p>
          </div>
          
          <div className="p-8 grid md:grid-cols-2 gap-8 items-stretch">
            {/* PDF Upload */}
            <div className="space-y-4 flex flex-col">
              <h3 className="font-semibold text-gray-700 flex items-center"><FileText className="ml-2 text-brand-500" /> ملف PDF المصدر</h3>
              <div {...getPdfRootProps()} className={`flex-1 h-64 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors ${pdfFile ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}>
                <input {...getPdfInputProps()} />
                {pdfFile ? (
                  <div className="text-gray-900 font-bold break-all">{pdfFile.name}</div>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">اسحب وأفلت ملف PDF هنا</p>
                  </>
                )}
              </div>
            </div>

            {/* Background Upload */}
            <div className="space-y-4 flex flex-col">
              <h3 className="font-semibold text-gray-700 flex items-center"><ImageIcon className="ml-2 text-brand-500" /> خلفية الموارد البشرية (صورة)</h3>
              <div {...getBgRootProps()} className={`flex-1 h-64 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-colors relative overflow-hidden ${bgImageFile ? 'border-brand-500' : 'border-gray-200 hover:border-brand-300'}`}>
                <input {...getBgInputProps()} />
                {bgImageFile ? (
                   <img src={bgImageFile} alt="Background Preview" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">اسحب وأفلت صورة الخطاب هنا</p>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="p-8 bg-gray-50 flex justify-end">
            <button 
              onClick={handleProcessUploads}
              disabled={!pdfFile || !bgImageFile || isProcessing}
              className="bg-brand-600 hover:bg-brand-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="animate-spin ml-2" /> جارٍ معالجة PDF...
                </>
              ) : (
                <>
                  بدء اختيار الصفحات <ArrowLeft className="mr-2" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === AppStep.SELECT_PAGES) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
           <h2 className="text-xl font-bold text-gray-800">اختر ورتب الصفحات</h2>
           <div className="flex gap-4">
             <button onClick={() => setStep(AppStep.UPLOAD)} className="text-gray-500 hover:text-gray-800">عودة</button>
             <button 
               onClick={startEditing} 
               disabled={selectedCount === 0}
               className="bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
             >
               تعديل المحدد ({selectedCount})
             </button>
           </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto">
           <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6 mb-12">
             {pages.map((page, index) => (
               <div 
                 key={page.id} 
                 draggable
                 onDragStart={() => (dragItem.current = index)}
                 onDragEnter={() => (dragOverItem.current = index)}
                 onDragEnd={handleSort}
                 onDragOver={(e) => e.preventDefault()}
                 onClick={() => togglePageSelection(page.id)}
                 className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all shadow-sm
                  ${page.isSelected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200 hover:border-gray-300'}
                  active:cursor-grabbing hover:shadow-md
                 `}
               >
                 <div className="aspect-[1/1.41] bg-gray-100 relative">
                    <img src={page.thumbnailUrl} alt={`Page ${page.originalIndex}`} className="w-full h-full object-contain" />
                 </div>
                 
                 {/* Selection Checkmark */}
                 <div className={`absolute top-2 right-2 rounded-full p-1 z-10 ${page.isSelected ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                   <CheckCircle size={20} />
                 </div>

                 {/* Drag Handle Icon - UPDATED COLOR */}
                 <div className="absolute top-2 left-2 p-1 bg-white border border-gray-200 text-gray-600 rounded cursor-grab active:cursor-grabbing hover:bg-gray-100 shadow-sm">
                    <GripHorizontal size={16} />
                 </div>
                 
                 {/* Page Info Footer - UPDATED COLOR */}
                 <div className="absolute bottom-0 inset-x-0 bg-white/95 border-t border-gray-200 text-gray-800 text-xs py-1.5 px-2 text-center truncate font-medium" dir="ltr">
                   {page.sourceFileName ? `${page.sourceFileName} - ` : ''}P{page.originalIndex}
                 </div>
               </div>
             ))}

             {/* Add More Button */}
             <label className="border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center p-6 cursor-pointer hover:border-brand-500 hover:bg-brand-50 transition-all min-h-[200px]">
               <input type="file" accept=".pdf" className="hidden" onChange={handleAddPdfFile} />
               <div className="bg-brand-100 text-brand-600 p-3 rounded-full mb-3">
                 <Plus size={24} />
               </div>
               <span className="text-gray-900 font-bold">إضافة ملف PDF آخر</span>
               <span className="text-xs text-gray-500 mt-1">اضغط للرفع</span>
             </label>
           </div>
        </main>

        {/* Modal for Adding New Pages */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
                {/* Modal Header */}
                <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
                    <h3 className="text-lg font-bold text-gray-800">إضافة صفحات من: {newPdfFilename}</h3>
                    <button onClick={cancelAddPages} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100">
                    {isProcessingNew ? (
                        <div className="flex flex-col items-center justify-center h-64">
                            <Loader2 className="h-10 w-10 text-brand-600 animate-spin mb-4" />
                            <p className="text-gray-600">جارٍ معالجة الملف الجديد...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {tempNewPages.map((page) => (
                                <div 
                                    key={page.id}
                                    onClick={() => toggleTempPageSelection(page.id)}
                                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${page.isSelected ? 'border-brand-500 ring-2 ring-brand-200' : 'border-gray-200'}`}
                                >
                                    <img src={page.thumbnailUrl} className="w-full h-auto" />
                                    <div className={`absolute top-2 right-2 rounded-full p-1 ${page.isSelected ? 'bg-brand-500 text-white' : 'bg-gray-200 text-gray-400'}`}>
                                       <CheckCircle size={16} />
                                    </div>
                                    {/* Modal Page Info - UPDATED COLOR */}
                                    <div className="absolute bottom-0 inset-x-0 bg-white/95 border-t border-gray-200 text-gray-800 text-xs py-1 text-center font-medium">
                                       Page {page.originalIndex}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-4 border-t flex justify-between items-center bg-white">
                    <span className="text-sm text-gray-500">تم تحديد {tempNewPages.filter(p => p.isSelected).length} صفحة</span>
                    <div className="flex gap-3">
                        <button 
                            onClick={cancelAddPages}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                        >
                            إلغاء
                        </button>
                        <button 
                            onClick={confirmAddPages}
                            disabled={isProcessingNew || tempNewPages.filter(p => p.isSelected).length === 0}
                            className="px-6 py-2 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
                        >
                            إضافة المحدد
                        </button>
                    </div>
                </div>
            </div>
          </div>
        )}

      </div>
    );
  }

  if (step === AppStep.EDITOR || step === AppStep.EXPORTING) {
    const currentPage = pages[currentEditIndex];
    const selectedPages = pages.filter(p => p.isSelected);

    return (
      <div className="h-screen flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white border-b h-16 flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-4">
             <button onClick={() => setStep(AppStep.SELECT_PAGES)} className="text-gray-500 hover:bg-gray-100 p-2 rounded-full">
               <ArrowRight size={20} />
             </button>
             <h2 className="font-bold text-lg text-gray-800">المحرر <span className="text-gray-400 font-normal">| صفحة {currentPage.originalIndex}</span></h2>
          </div>
          
          <button 
            onClick={generatePDF}
            disabled={step === AppStep.EXPORTING}
            className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg font-medium flex items-center shadow-sm disabled:opacity-70"
          >
            {step === AppStep.EXPORTING ? (
               <><Loader2 className="animate-spin ml-2" /> جارٍ الإنشاء ({exportProgress}%)</>
            ) : (
               <><Download className="ml-2" size={18} /> تحميل PDF</>
            )}
          </button>
        </header>

        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Thumbnails - Border Left in RTL */}
          <aside className="w-48 bg-gray-50 border-l flex flex-col overflow-y-auto shrink-0">
             <div className="p-4 space-y-3">
               {pages.map((page, idx) => {
                 if (!page.isSelected) return null;
                 return (
                   <div 
                    key={page.id}
                    onClick={() => changePage(idx)}
                    className={`cursor-pointer border rounded-md overflow-hidden relative transition-all ${currentEditIndex === idx ? 'border-brand-500 ring-2 ring-brand-200 opacity-100' : 'border-gray-200 opacity-60 hover:opacity-90'}`}
                   >
                     <img src={page.thumbnailUrl} className="w-full" alt="thumbnail" />
                     {/* Sidebar Thumbnail Info - UPDATED COLOR */}
                     <div className="absolute bottom-1 right-1 bg-white/95 border border-gray-200 text-gray-800 text-[10px] px-1.5 rounded font-medium shadow-sm">
                       {page.originalIndex}
                     </div>
                   </div>
                 );
               })}
             </div>
          </aside>

          {/* Main Canvas Area */}
          <main className="flex-1 bg-gray-200 relative flex flex-col">
            {step === AppStep.EXPORTING && (
              <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center flex-col">
                <Loader2 className="h-12 w-12 text-brand-600 animate-spin mb-4" />
                <h3 className="text-xl font-bold text-gray-800">جارٍ إنشاء PDF عالي الدقة...</h3>
                <p className="text-gray-500">يرجى الانتظار بينما نقوم بإنشاء المستند.</p>
              </div>
            )}
            
            <FabricCanvas 
              key={currentPage.id} // Force re-mount on page change to ensure clean fabric instance
              isActive={true}
              backgroundUrl={bgImageFile!}
              pageContentUrl={currentPage.fullResUrl}
              initialState={currentPage.canvasState}
              onSaveState={handleSavePageState}
            />
          </main>
        </div>
      </div>
    );
  }

  return null;
}

export default App;