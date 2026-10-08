import {
  ChangeEvent,
  CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
} from 'react';
import { getPdfName, getFilePath, isMarkdownFile, isImageFile, renderMarkdownToHtml, type RenderedDocument } from './markdown';
import { paginateHtml } from './pagination';
import { renderImagePdf, printPages } from './export';
import type { DocumentMeta } from './markdown';
import { buildPreview, clearPreviewCache } from './preview';
import { PagePreview } from './PagePreview';
import { pageDimensions, loadSettings, saveSettings, resolveLayout, normalizeSettings, type LayoutSettings as Preferences } from './settings';
import { LayoutSettings } from './LayoutSettings';
import { locatedWarnings } from './diagnostics';
import { navigateToSource } from './source-map';
import { clearDraft, readDraft, saveDraft } from './draft';
import { Editor } from './Editor';
import { loadExportSettings, saveExportSettings, shouldFlushBatch, type ExportQuality } from './export-settings';
import { ACTIVE_PROJECT, exportProject, importProject, loadProject, saveProject, type Project, type ProjectRecord } from './projects';
import { ProjectLibrary } from './ProjectLibrary';
import { pageSize } from './page-size';
import { FontSettings } from './FontSettings';
import { activeFont } from './fonts';
import { ImageAssets } from './ImageAssets';
import { imageMarkdown, prepareImageAssets } from './image-assets';
import { PageSelection } from './PageSelection';
import { pageChapters, selectPageIndices, type ExportScope } from './page-selection';
import { DocumentProperties } from './DocumentProperties';

type UploadedMarkdownFile = {
  name: string;
  content: string;
  path?: string;
};

type Mode = 'single' | 'batch';
type AssetUrls = Record<string, string>;
const cleanDefaultMarkdown = `# Md2PDF 示例

这是一段可以直接编辑的 Markdown 内容，右侧会实时显示分页后的 PDF 预览效果。

## 基础格式

- 支持中文内容
- 支持标题、列表、代码块
- 支持表格、图片和分页

| 项目 | 状态 |
| --- | --- |
| Markdown 编辑 | 可用 |
| PDF 预览 | 实时 |
| 下载导出 | 可用 |

\`\`\`ts
const title = 'Md2PDF';
console.log(title);
\`\`\`
`;

async function renderPdfBlob(document: RenderedDocument, signal?: AbortSignal, quality?: ExportQuality) {
  const pages = await paginateHtml(document.html, document.meta, signal);
  return renderImagePdf(pages, document.meta, { signal, quality });
}

async function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [initialDraft] = useState(readDraft);
  const [mode, setMode] = useState<Mode>('single');
  const [source, setSource] = useState(initialDraft?.source ?? cleanDefaultMarkdown);
  const [singleFileName, setSingleFileName] = useState<string | undefined>(initialDraft?.name);
  const [singleFilePath, setSingleFilePath] = useState<string | undefined>(initialDraft?.path);
  const [draftStatus, setDraftStatus] = useState(initialDraft ? '已恢复本地草稿；本地图片需重新上传。' : '');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [showProjects, setShowProjects] = useState(false);
  const [showAssets, setShowAssets] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [activeProject, setActiveProject] = useState<{ id: string; name: string }>();
  const [projectReady, setProjectReady] = useState(false);
  const assetBlobs = useRef<Record<string, Blob>>({});
  const recoveryEdit = useRef(false);
  const [batchFiles, setBatchFiles] = useState<UploadedMarkdownFile[]>([]);
  const [assetUrls, setAssetUrls] = useState<AssetUrls>({});
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [batchErrorMessage, setBatchErrorMessage] = useState('');
  const [previewErrorMessage, setPreviewErrorMessage] = useState('');
  const [operationError, setOperationError] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [pages, setPages] = useState<string[]>([]);
  const [previewMeta, setPreviewMeta] = useState<DocumentMeta>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [exportScope, setExportScope] = useState<ExportScope>({ mode: 'all', range: '', chapter: '' });
  const [exportMode, setExportMode] = useState<'print' | 'image' | 'direct'>('print');
  const [fontRevision, setFontRevision] = useState(0);
  const [workspaceView, setWorkspaceView] = useState('editor');
  useEffect(() => {
    const edit = () => { if (window.matchMedia('(max-width:767px)').matches) setWorkspaceView('editor'); };
    window.addEventListener('source-navigation', edit);
    return () => window.removeEventListener('source-navigation', edit);
  }, []);
  useEffect(() => {
    const update = () => { clearPreviewCache(); setFontRevision(value => value + 1); };
    window.addEventListener('local-font-change', update);
    return () => window.removeEventListener('local-font-change', update);
  }, []);
  const [exportSettings, setExportSettings] = useState(loadExportSettings);
  const [previewScale, setPreviewScale] = useState(0.7);
  const [isRendering, setIsRendering] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>(loadSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(true);
  const exportController = useRef<AbortController | null>(null);
  const [exportStatus, setExportStatus] = useState('');
  const [offlineStatus, setOfflineStatus] = useState(navigator.onLine ? '' : '离线模式：远程图片可能不可用。');
  useEffect(() => {
    const ready = () => setOfflineStatus('应用已可离线使用');
    const updated = () => setOfflineStatus('离线缓存更新已准备好，关闭此站点的全部页面后生效。');
    const network = () => setOfflineStatus(navigator.onLine ? '' : '离线模式：远程图片可能不可用。');
    window.addEventListener('offline-ready', ready); window.addEventListener('online', network); window.addEventListener('offline', network);
    window.addEventListener('offline-update', updated);
    return () => { window.removeEventListener('offline-ready', ready); window.removeEventListener('online', network); window.removeEventListener('offline', network); window.removeEventListener('offline-update', updated); };
  }, []);
  const warnings = useMemo(() => locatedWarnings(pages), [pages]);
  const chapters = useMemo(() => pageChapters(pages, previewMeta.chapterLevel), [pages, previewMeta.chapterLevel]);
  const selectedPages = useMemo(() => {
    try { return { indices: selectPageIndices(exportScope, pages.length, currentPage, chapters), error: '' }; }
    catch (error) { return { indices: [], error: error instanceof Error ? error.message : '导出页码无效。' }; }
  }, [exportScope, pages.length, currentPage, chapters]);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const assetUrlsRef = useRef<AssetUrls>({});
  const previewPanelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let cancelled = false;
    const recover = async () => {
      try {
        const id = localStorage.getItem(ACTIVE_PROJECT);
        if (id) {
          const project = await loadProject(id);
          if (project && !cancelled && !recoveryEdit.current) {
            applyProject(project);
            if(initialDraft && initialDraft.savedAt>project.savedAt && initialDraft.projectId===project.id)setSource(initialDraft.source);
          }
        }
      } catch { if (!cancelled) setDraftStatus('本地项目未恢复；正文草稿仍可使用，请检查浏览器存储。'); }
      finally { if (!cancelled) setProjectReady(true); }
    };
    void recover();
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const deleted = (event: Event) => {
      if ((event as CustomEvent<string>).detail === activeProject?.id) {
        setActiveProject(undefined); try { localStorage.removeItem(ACTIVE_PROJECT); } catch { /* unavailable */ }
      }
    };
    const renamed = (event: Event) => { const detail = (event as CustomEvent<{id:string;name:string}>).detail; if (detail.id === activeProject?.id) setActiveProject(detail); };
    window.addEventListener('project-renamed', renamed);
    window.addEventListener('project-deleted', deleted); return () => { window.removeEventListener('project-deleted', deleted); window.removeEventListener('project-renamed', renamed); };
  }, [activeProject]);

  const canDownload =
    !isDownloading && !isUploading && !isRendering &&
    ((mode === 'single' && source.trim().length > 0 && selectedPages.indices.length > 0 && !selectedPages.error) ||
      (mode === 'batch' && batchFiles.length > 0));
  const downloadLabel = exportMode === 'print' && mode === 'single' ? '打印／保存 PDF' : '下载';

  useEffect(() => {
    if (mode !== 'single' || !draftEnabled) return;
    const persist = () => setDraftStatus(saveDraft({ source, name: singleFileName, path: singleFilePath, projectId:activeProject?.id, savedAt: Date.now() }) ? '草稿已保存在此浏览器' : '草稿未保存：存储不可用或文本超过 2Mi 字符，请下载 Markdown。');
    const timer = setTimeout(persist, 600);
    const leaving = () => { saveDraft({ source, name: singleFileName, path: singleFilePath, projectId:activeProject?.id, savedAt: Date.now() }); };
    window.addEventListener('pagehide', leaving);
    return () => { clearTimeout(timer); window.removeEventListener('pagehide', leaving); };
  }, [source, singleFileName, singleFilePath, mode, draftEnabled,activeProject]);
  useEffect(() => {
    if (!projectReady || !activeProject || mode !== 'single' || !draftEnabled) return;
    setDraftStatus('正在保存项目与图片…');
    const controller=new AbortController();
    const timer = setTimeout(() => {
      void saveProject(currentProject(activeProject.id, activeProject.name),controller.signal).then(() => {if(!controller.signal.aborted)setDraftStatus('项目与图片已保存在此浏览器');})
        .catch(() => {if(!controller.signal.aborted)setDraftStatus('项目未保存：本地存储不可用或空间不足，请导出项目包。');});
    }, 1000);
    return () => {clearTimeout(timer);controller.abort();};
  }, [projectReady, activeProject, source, singleFilePath, preferences, assetUrls, mode, draftEnabled]);

  function currentProject(id: string = crypto.randomUUID(), name = singleFileName || '我的文档'): Project {
    return { id, name, source, path: singleFilePath, preferences, assets: assetBlobs.current, savedAt: Date.now() };
  }
  function applyProject(record: ProjectRecord, revision?: number) {
    const project = revision === undefined ? record : record.history[revision]; if (!project) return;
    assetBlobs.current = project.assets;
    replaceAssetUrls(Object.fromEntries(Object.entries(project.assets).map(([path, blob]) => [path.toLowerCase(), URL.createObjectURL(blob)])));
    setSource(project.source); setSingleFileName(record.name.endsWith('.md') ? record.name : `${record.name}.md`); setSingleFilePath(project.path);
    const restored=normalizeSettings(project.preferences);
    setPreferences(restored); setSettingsSaved(saveSettings(restored)); setMode('single'); setBatchFiles([]); setDraftEnabled(true);
    setExportScope({ mode: 'all', range: '', chapter: '' }); setCurrentPage(1);
    setActiveProject({ id: record.id, name: record.name });
    try { localStorage.setItem(ACTIVE_PROJECT, record.id); } catch { /* Manual project opening still works. */ }
    setDraftStatus('已恢复本地项目与图片');
  }
  async function saveCurrentProject(name: string, fresh: boolean) {
    const project = currentProject(fresh ? crypto.randomUUID() : activeProject?.id, name);
    await saveProject(project); setActiveProject({ id: project.id, name });
    try { localStorage.setItem(ACTIVE_PROJECT, project.id); } catch { /* Manual project opening still works. */ }
    setDraftStatus('项目与图片已保存在此浏览器');
  }

  useLayoutEffect(() => {
    if (mode !== 'single' || source.trim().length === 0) {
      setPages([]);
      setPreviewErrorMessage('');
      setIsRendering(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setPreviewErrorMessage('');
    setIsRendering(true);

    const timer = window.setTimeout(() => {
      void buildPreview(source, singleFilePath, assetUrls, preferences, controller.signal)
        .then((document) => {
          if (cancelled) return;
          if (!cancelled) {
            setPages(document.pages);
            setPreviewMeta(document.meta);
            setIsRendering(false);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setPages([]);
            setIsRendering(false);
            setPreviewErrorMessage(error instanceof Error ? error.message : 'Markdown 渲染失败，请检查语法。');
          }
          console.error('Preview render failed', error);
        });
    }, 180);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [assetUrls, mode, singleFilePath, source, preferences, fontRevision]);

  useLayoutEffect(() => {
    const panel = previewPanelRef.current;
    if (!panel) return;

    const updateScale = () => {
      if (!panel.clientWidth || !panel.getClientRects().length) return;
      const availableWidth = panel.clientWidth - 40;
      const width=Math.max(pageDimensions(previewMeta).width,...pages.map(html=>pageSize(html,previewMeta).width));
      setPreviewScale(Math.min(1, Math.max(0.15, availableWidth / (width / 25.4 * 96))));
    };
    const observer = new ResizeObserver(updateScale);

    updateScale();
    observer.observe(panel);

    return () => observer.disconnect();
  }, [mode, previewMeta, pages]);

  useEffect(() => {
    return () => {
      Object.values(assetUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  function replaceAssetUrls(nextAssetUrls: AssetUrls) {
    clearPreviewCache();
    const previousUrls = Object.values(assetUrlsRef.current);
    // In-flight rendering may still be decoding the previous document's images.
    const kept = new Set(Object.values(nextAssetUrls));
    window.setTimeout(() => previousUrls.filter(url => !kept.has(url)).forEach((url) => URL.revokeObjectURL(url)), 12000);
    assetUrlsRef.current = nextAssetUrls;
    setAssetUrls(nextAssetUrls);
  }

  async function addImages(files: File[], replacePath?: string): Promise<string[]> {
    const prepared = prepareImageAssets(assetBlobs.current, files, singleFilePath, replacePath);
    if (Object.values(prepared.assets).reduce((size, blob) => size + blob.size, source.length * 2) > 100 * 1048576) {
      throw new Error('文档与图片超过 100MiB，请减少图片。');
    }
    const previous = assetBlobs.current;
    const urls = Object.fromEntries(Object.entries(prepared.assets).map(([path, blob]) => {
      const key = path.toLowerCase();
      return [key, previous[path] === blob && assetUrlsRef.current[key] ? assetUrlsRef.current[key] : URL.createObjectURL(blob)];
    }));
    recoveryEdit.current = true; setDraftEnabled(true); setDraftStatus('正在保存项目与图片…');
    assetBlobs.current = prepared.assets; replaceAssetUrls(urls);
    // Pasted images should survive a reload together with the document.
    if (!activeProject) {
      const project = { id: crypto.randomUUID(), name: singleFileName || '我的文档' };
      setActiveProject(project);
      try { localStorage.setItem(ACTIVE_PROJECT, project.id); } catch { /* Project library remains available. */ }
    }
    return prepared.markdown;
  }

  function createAssetUrls(files: File[]) {
    assetBlobs.current = Object.fromEntries(files.filter(isImageFile).map((file) => [getFilePath(file), file]));
    return files.reduce<AssetUrls>((urls, file) => {
      if (!isImageFile(file)) return urls;
      const key = getFilePath(file).toLowerCase();
      if (urls[key]) URL.revokeObjectURL(urls[key]);
      urls[key] = URL.createObjectURL(file);
      return urls;
    }, {});
  }

  async function readMarkdownFiles(files: File[]) {
    const markdownFiles = files.filter(isMarkdownFile);

    return Promise.all(
      markdownFiles.map(async (file) => ({
        name: file.name,
        path: getFilePath(file),
        content: await file.text(),
      })),
    );
  }

  function applyLoadedMarkdownFiles(
    loadedFiles: UploadedMarkdownFile[],
    nextAssetUrls: AssetUrls,
  ) {
    setBatchErrorMessage('');
    recoveryEdit.current = true;
    setActiveProject(undefined); try { localStorage.removeItem(ACTIVE_PROJECT); } catch { /* unavailable */ }
    replaceAssetUrls(nextAssetUrls);
    setDraftEnabled(true);
    setExportScope({ mode: 'all', range: '', chapter: '' }); setCurrentPage(1);

    if (loadedFiles.length === 1) {
      setMode('single');
      setBatchFiles([]);
      setSingleFileName(loadedFiles[0].name);
      setSingleFilePath(loadedFiles[0].path);
      setSource(loadedFiles[0].content);
      return;
    }

    setMode('batch');
    setBatchFiles(loadedFiles);
    setSingleFilePath(undefined);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = input.files;
    if (!files || files.length === 0) return;

    const selectedFiles = Array.from(files);
    setIsUploading(true);
    setOperationError('');
    try {
      const loadedFiles = await readMarkdownFiles(selectedFiles);
      if (loadedFiles.length === 0) {
        if (mode !== 'single') throw new Error('批量模式请同时选择 Markdown 或文本文件。');
        if (!selectedFiles.every(isImageFile)) throw new Error('所选内容中没有 Markdown、文本文件或可用图片。');
        await addImages(selectedFiles); setShowAssets(true);
      } else applyLoadedMarkdownFiles(loadedFiles, createAssetUrls(selectedFiles));
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : '文件读取失败，请重试。');
    } finally {
      input.value = '';
      setIsUploading(false);
    }
  }

  function handleSourceChange(value: string) {
    recoveryEdit.current = true;
    setDraftEnabled(true);
    setOperationError('');
    setBatchErrorMessage('');
    setMode('single');
    setBatchFiles([]);
    setSource(value);
    setDraftStatus(activeProject ? '正在保存项目与图片…' : '正在保存草稿…');
  }

  function handleBackToEditor() {
    setBatchErrorMessage('');
    if (batchFiles.length > 0) {
      const first = batchFiles[0];
      setSource(first.content);
      setSingleFileName(first.name);
      setSingleFilePath(first.path);
    }
    setMode('single');
    setBatchFiles([]);
  }

  async function downloadSinglePdf() {
    setDownloadProgress(35);
    const filename = getPdfName(singleFileName);
    const exportPages = selectedPages.indices.map(index => pages[index]);
    if (exportMode === 'print') {
      await printPages(exportPages, previewMeta);
      setExportStatus('打印对话框已打开：请选择另存为 PDF，关闭浏览器页眉页脚。');
      return;
    }
    if (exportMode === 'direct' && !activeFont()) throw new Error('请先在排版设置中导入包含正文字符的 TTF 字体。');
    const blob = await renderImagePdf(exportPages, previewMeta, { originalPages: pages, originalPageIndices: selectedPages.indices, searchable: exportMode === 'direct', quality: exportSettings.quality, signal: exportController.current?.signal, progress: (done, total) => {
      setDownloadProgress(Math.round(done / total * 85)); setExportStatus(`正在生成第 ${done} / ${total} 页`);
    } });
    exportController.current?.signal.throwIfAborted();
    setDownloadProgress(90);
    await downloadBlob(blob, filename);
  }

  async function downloadBatchZip() {
    const { default: JSZip } = await import('jszip');
    let zip = new JSZip();
    let part = 1; let partBytes = 0; let partFiles = 0;
    const flush = async (final = false) => {
      if (!partFiles) return;
      exportController.current?.signal.throwIfAborted();
      setExportStatus(`正在生成 ZIP 分卷 ${part}…`);
      const blob = await zip.generateAsync({ type: 'blob', streamFiles: true });
      exportController.current?.signal.throwIfAborted();
      await downloadBlob(blob, final && part === 1 ? 'md2pdf-batch.zip' : `md2pdf-batch-part-${part}.zip`);
      zip = new JSZip(); part++; partBytes = 0; partFiles = 0;
    };
    const failedFiles: string[] = [];
    const outputNames = new Set<string>();

    setBatchErrorMessage('');

    for (const [index, file] of batchFiles.entries()) {
      exportController.current?.signal.throwIfAborted();
      setExportStatus(`正在导出 ${index + 1} / ${batchFiles.length}：${file.name}`);
      try {
        const document = await renderMarkdownToHtml(file.content, file.path, assetUrls, preferences, exportController.current?.signal);
        document.meta = resolveLayout(document.meta, preferences);
        const baseName = getPdfName(file.path || file.name);
        let pdfName = baseName;
        let suffix = 2;
        while (outputNames.has(pdfName.toLowerCase())) {
          pdfName = baseName.replace(/\.pdf$/i, ` (${suffix++}).pdf`);
        }
        const blob = await renderPdfBlob(document, exportController.current?.signal, exportSettings.quality);
        if (shouldFlushBatch(partBytes, partFiles, blob.size, exportSettings)) await flush();
        zip.file(pdfName, blob);
        partBytes += blob.size; partFiles++;
        outputNames.add(pdfName.toLowerCase());
      } catch (error) {
        if (exportController.current?.signal.aborted) throw error;
        failedFiles.push(file.name);
        console.error(`Batch export failed: ${file.name}`, error);
      } finally {
        setDownloadProgress(Math.round(((index + 1) / batchFiles.length) * 85));
      }
    }

    if (failedFiles.length === batchFiles.length) {
      throw new Error('所有 Markdown 文件都导出失败，请检查文件内容后重试。');
    }

    exportController.current?.signal.throwIfAborted();
    await flush(true);
    setDownloadProgress(95);

    if (failedFiles.length > 0) {
      setBatchErrorMessage(`以下文件导出失败：${failedFiles.join('、')}`);
    }
  }

  async function handleDownload() {
    if (!canDownload) return;
    setIsDownloading(true);
    setOperationError('');
    setDownloadProgress(8);
    setExportStatus('正在准备导出…');
    exportController.current = new AbortController();

    try {
      if (mode === 'batch') {
        await downloadBatchZip();
      } else {
        await downloadSinglePdf();
      }
      setDownloadProgress(100);
      if (mode === 'batch' || exportMode !== 'print') setExportStatus('文件已生成，下载已发起。');
    } catch (error) {
      const message = exportController.current?.signal.aborted ? '导出已取消。' : error instanceof Error ? error.message : '导出失败，请稍后重试。';
      setExportStatus('');
      if (mode === 'batch') {
        setBatchErrorMessage(message);
      } else {
        setOperationError(message);
      }
      console.error('Download failed', error);
    } finally {
      window.setTimeout(() => {
        setIsDownloading(false);
        setDownloadProgress(0);
      }, 180);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <h1>Md2PDF</h1>
        <div className="actions">
          <button type="button" disabled={isDownloading} onClick={() => { setShowSettings(!showSettings); setShowAssets(false); setShowProperties(false); setShowProjects(false); }}>排版</button>
          <button type="button" disabled={isDownloading || isUploading || mode === 'batch'} onClick={() => { setShowAssets(!showAssets); setShowProperties(false); setShowSettings(false); setShowProjects(false); }}>图片</button>
          <button type="button" disabled={isDownloading || isUploading || mode === 'batch'} onClick={() => { setShowProperties(!showProperties); setShowAssets(false); setShowSettings(false); setShowProjects(false); }}>文档属性</button>
          <button type="button" disabled={isDownloading || isUploading || !projectReady || mode === 'batch'} onClick={() => { setShowProjects(!showProjects); setShowAssets(false); setShowProperties(false); setShowSettings(false); }}>项目库</button>
          <select aria-label="PDF 导出方式" value={mode === 'batch' ? 'image' : exportMode} disabled={isDownloading || mode === 'batch'} onChange={(event) => setExportMode(event.target.value as 'print' | 'image' | 'direct')}>
            <option value="print">可搜索 PDF（打印保存）</option>
            <option value="image">图像 PDF</option>
            <option value="direct">可搜索 PDF（直接下载·实验）</option>
          </select>
          {exportMode !== 'print' || mode === 'batch' ? <select aria-label="图像 PDF 清晰度" value={exportSettings.quality} disabled={isDownloading} onChange={(event) => {
            const next = { ...exportSettings, quality: event.target.value as ExportQuality }; setExportSettings(next); saveExportSettings(next);
          }}><option value="small">小体积</option><option value="balanced">均衡</option><option value="high">高清</option></select> : null}
          <button type="button" disabled={isDownloading || isUploading} onClick={() => inputRef.current?.click()}>
            上传
          </button>
          <button type="button" disabled={isDownloading || isUploading} onClick={() => folderInputRef.current?.click()}>
            上传文件夹
          </button>
          <button
            type="button"
            className={`download-button${isDownloading ? ' is-loading' : ''}`}
            onClick={handleDownload}
            disabled={!canDownload}
            aria-label={isDownloading ? '正在导出 PDF' : downloadLabel}
            title={isDownloading ? `正在导出 ${downloadProgress}%` : mode === 'single' && exportMode === 'print' ? '在打印对话框中选择另存为 PDF，并关闭浏览器页眉页脚' : undefined}
            style={{ '--download-progress': `${downloadProgress}%` } as CSSProperties}
          >
            {isDownloading ? <span className="download-spinner" /> : downloadLabel}
          </button>
          <input
            ref={inputRef}
            className="file-input"
            type="file"
            multiple
            accept=".md,.markdown,.txt,image/*,text/markdown,text/plain"
            onChange={handleUpload}
          />
          <input
            ref={folderInputRef}
            className="file-input"
            type="file"
            multiple
            onChange={handleUpload}
            {...{ webkitdirectory: '', directory: '' }}
          />
        </div>
      </header>
      {offlineStatus ? <div role="status" className="export-status">{offlineStatus}</div> : null}
      {exportStatus ? <div className="export-status" role="status">{exportStatus}</div> : null}
      {isDownloading && (mode === 'batch' || exportMode !== 'print') ? <button type="button" onClick={() => exportController.current?.abort()}>取消导出</button> : null}
      {operationError ? <div className="operation-error" role="alert">{operationError}</div> : null}
      {showAssets ? <ImageAssets assets={assetUrls} disabled={isDownloading || isUploading}
        add={async files => { await addImages(files); }} replace={async (path, file) => { await addImages([file], path); }}
        insert={path => window.dispatchEvent(new CustomEvent('editor-insert', { detail: imageMarkdown(path, singleFilePath) }))}
        close={() => setShowAssets(false)} /> : null}
      {showProperties ? <DocumentProperties source={source} change={handleSourceChange} disabled={isDownloading || isUploading} close={() => setShowProperties(false)} /> : null}
      {showProjects ? <ProjectLibrary disabled={isDownloading || isUploading} save={saveCurrentProject} open={applyProject} close={() => setShowProjects(false)}
        exportFile={async () => { await downloadBlob(await exportProject(currentProject()), 'md2pdf-project.zip'); }}
        importFile={async (file) => { const project = await importProject(file); await saveProject(project); applyProject({ ...project, history: [] }); }} /> : null}
      {showSettings ? <><LayoutSettings value={preferences} saved={settingsSaved} close={() => setShowSettings(false)} change={(value) => {
        const next = normalizeSettings(value);
        setPreferences(next); setSettingsSaved(saveSettings(next));
      }} /><FontSettings text={source} disabled={isDownloading} /></> : null}

      {mode === 'batch' ? (
        <section className="batch-message">
          <p>已上传多个 Markdown 文件，可点击下载批量导出 PDF</p>
          <p>批量 ZIP 使用图像 PDF（正文不可搜索）；可搜索 PDF 请逐个文档打印保存。</p>
          <p>每卷最多 10 个文件或约 32MiB PDF，超出后自动下载下一卷；浏览器可能需要允许多文件下载。取消不会撤回已下载的分卷。</p>
          {batchErrorMessage ? <p className="batch-error">{batchErrorMessage}</p> : null}
          <button type="button" disabled={isDownloading} onClick={handleBackToEditor}>
            返回
          </button>
        </section>
      ) : (
        <section className="workspace" data-view={workspaceView}>
          <div className="workspace-tabs" aria-label="工作区视图">
            <button aria-pressed={workspaceView === 'editor'} onClick={() => setWorkspaceView('editor')}>编辑</button>
            <button aria-pressed={workspaceView === 'preview'} onClick={() => setWorkspaceView('preview')}>预览</button>
          </div>
          <Editor source={source} change={handleSourceChange} disabled={isDownloading || isUploading} panel={previewPanelRef.current}
            images={addImages}
            draftStatus={draftStatus} clear={() => { if (clearDraft()) { setDraftEnabled(false); setActiveProject(undefined); try { localStorage.removeItem(ACTIVE_PROJECT); } catch { /* unavailable */ } setDraftStatus('已清除保存的草稿；项目库中的项目仍保留，继续编辑会重新保存。'); } else setDraftStatus('无法清除草稿。'); }}
            download={() => { void downloadBlob(new Blob([source], { type: 'text/markdown;charset=utf-8' }), (singleFileName || 'document.md').replace(/\.(markdown|txt)$/i, '.md')); }} />
          <section
            className="preview-panel"
            aria-label="PDF 预览区"
            ref={previewPanelRef}
            aria-busy={isRendering}
          >
            {isRendering ? <div className="preview-status" role="status">正在更新分页预览…</div> : null}
            {previewErrorMessage ? (
              <div className="preview-error">{previewErrorMessage}</div>
            ) : null}
            {warnings.length ? <details className="document-warnings"><summary>文档提示（{warnings.length}）</summary><ul>{warnings.map((warning,index) => <li key={index}>{warning.line ? <button onClick={() => navigateToSource({line:warning.line!,end:warning.end || warning.line!})}>第 {warning.line} 行：{warning.message}</button> : warning.message}</li>)}</ul></details> : null}
            <PageSelection value={exportScope} change={setExportScope} chapters={chapters} total={pages.length} currentPage={Math.min(currentPage, Math.max(1, pages.length))}
              count={selectedPages.indices.length} error={selectedPages.error} disabled={isDownloading || isRendering} />
            {exportMode === 'print' ? <p className="print-guide">打印时选择“另存为 PDF”、文档纸张尺寸，并关闭浏览器页眉页脚。</p> : null}
            {exportMode === 'direct' ? <p className="print-guide">实验：图像页面叠加可搜索正文，需要导入 TTF 字体。公式、图表保持图像；emoji、扩展区汉字和矢量输出请使用打印保存。</p> : null}
            <PagePreview pages={pages} meta={previewMeta} scale={previewScale} panel={previewPanelRef.current} currentPageChanged={setCurrentPage} />
          </section>
        </section>
      )}
    </main>
  );
}

export default App;
