import type { LayoutSettings } from './settings';
import { normalizeSettings } from './settings';

export type Project = { id: string; name: string; source: string; path?: string; preferences: LayoutSettings;
  assets: Record<string, Blob>; savedAt: number };
export type ProjectRecord = Project & { history: Project[]; assetSignature?: string };
type BinaryAsset={bytes:ArrayBuffer;type:string};
type StoredProject=Omit<Project,'assets'> & {assets:Record<string,BinaryAsset|Blob>};
type StoredRecord=StoredProject & {history:StoredProject[];assetSignature?:string};
const DB = 'md2pdf-projects';
export const ACTIVE_PROJECT = 'md2pdf:active-project';
const MAX_BYTES = 100 * 1048576;
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('本地数据库不可用'));
    request.onblocked = () => reject(new Error('请关闭其他页面后重试本地数据库操作'));
  });
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode); let result: T;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('本地保存失败，可能空间不足')); };
    try { work(tx.objectStore('projects'), (value) => { result = value; }); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  });
}
export const validProjectPath = (path: string) => path.length > 0 && path.length < 1024
  && !/^[\/]|[\\\u0000-\u001f]|^[a-z]:/i.test(path) && path.split('/').every((part) => part !== '..' && part !== '.' && part !== '');
function validateProject(project: Project) {
  if (!project.id || !project.name || project.source.length > 2 * 1048576 || (project.path && !validProjectPath(project.path))) throw new Error('项目名称、路径或正文无效');
  if (Object.keys(project.assets).length > 200 || Object.entries(project.assets).some(([path, blob]) => !validProjectPath(path) || !(blob instanceof Blob) || !/^image\//.test(blob.type))) throw new Error('项目图片无效');
  if (Object.values(project.assets).reduce((size, blob) => size + blob.size, project.source.length * 2) > MAX_BYTES) throw new Error('项目超过 100MiB，请减少图片');
}
const fingerprints = new WeakMap<Blob, Promise<string>>();
const binaryAssets=new WeakMap<Blob,Promise<BinaryAsset>>();
function binaryAsset(blob:Blob){
  if(!binaryAssets.has(blob))binaryAssets.set(blob,blob.arrayBuffer().then(bytes=>({bytes,type:blob.type})));
  return binaryAssets.get(blob)!;
}
async function storeAssets(assets:Record<string,Blob>){
  const entries:[string,BinaryAsset][]=[];
  for(const [path,blob] of Object.entries(assets))entries.push([path,await binaryAsset(blob)]);
  return Object.fromEntries(entries);
}
function restoreProject(project:StoredProject):Project{
  return {...project,preferences:normalizeSettings(project.preferences),assets:Object.fromEntries(Object.entries(project.assets).map(([path,asset])=>{
    const blob=asset instanceof Blob?asset:new Blob([asset.bytes],{type:asset.type});
    if(!(asset instanceof Blob))binaryAssets.set(blob,Promise.resolve(asset));
    return [path,blob];
  }))};
}
async function assetSignature(assets: Record<string, Blob>) {
  const entries=[];
  for(const [path,blob] of Object.entries(assets).sort(([a],[b])=>a.localeCompare(b))){
    if(!fingerprints.has(blob))fingerprints.set(blob,binaryAsset(blob).then(asset=>crypto.subtle.digest('SHA-256',asset.bytes)).then(hash=>Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')));
    entries.push([path,blob.type,await fingerprints.get(blob)]);
  }
  return JSON.stringify(entries);
}
export async function saveProject(project: Project, signal?: AbortSignal) {
  validateProject(project);
  const signature=await assetSignature(project.assets);
  const assets=await storeAssets(project.assets);
  signal?.throwIfAborted();
  return transaction<void>('readwrite', (store, done) => {
    signal?.throwIfAborted();
    const request = store.get(project.id);
    request.onsuccess = () => {
      const old = request.result as StoredRecord | undefined;
      const changed = old && (old.source !== project.source || old.path !== project.path || JSON.stringify(old.preferences) !== JSON.stringify(project.preferences)
        || old.assetSignature !== signature);
      const history = changed ? [{ ...old, history: undefined } as StoredProject, ...old.history].slice(0, 5) : old?.history || [];
      store.put({ ...project, assets, history, assetSignature:signature }); done();
    };
  });
}
export async function loadProject(id: string) {
  const record=await transaction<StoredRecord | undefined>('readonly', (store, done) => { const request = store.get(id); request.onsuccess = () => done(request.result); });
  return record?{...restoreProject(record),history:record.history.map(restoreProject),assetSignature:record.assetSignature}:undefined;
}
export function listProjects() {
  return transaction<Pick<Project, 'id' | 'name' | 'savedAt'>[]>('readonly', (store, done) => {
    const summaries: Pick<Project, 'id' | 'name' | 'savedAt'>[] = [];
    const request = store.openCursor(); request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(summaries.sort((a, b) => b.savedAt - a.savedAt)); return; }
      const { id, name, savedAt } = cursor.value; summaries.push({ id, name, savedAt }); cursor.continue();
    };
  });
}
export function deleteProject(id: string) {
  return transaction<void>('readwrite', (store, done) => { store.delete(id); done(); });
}
export async function exportProject(project: Project) {
  validateProject(project); const { default: JSZip } = await import('jszip'); const zip = new JSZip();
  const assets = await Promise.all(Object.entries(project.assets).map(async ([path, blob], index) => {
    const file = `assets/${index}.bin`; zip.file(file, await blob.arrayBuffer()); return { path, file, type: blob.type, size: blob.size };
  }));
  zip.file('project.json', JSON.stringify({ version: 1, name: project.name, source: project.source, path: project.path, preferences: project.preferences, assets }));
  return zip.generateAsync({ type: 'blob', streamFiles: true });
}
// Inspect ZIP central-directory sizes before JSZip allocates any expanded entries.
function checkArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer); let end = -1;
  for (let offset = buffer.byteLength - 22; offset >= Math.max(0, buffer.byteLength - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === buffer.byteLength) { end = offset; break; }
  }
  if (end < 0 || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('不支持的 ZIP 项目格式');
  const count = view.getUint16(end + 10, true); let offset = view.getUint32(end + 16, true); let total = 0;
  if (count > 202 || offset >= end) throw new Error('项目文件过多或 ZIP 无效');
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new Error('ZIP 目录无效');
    total += view.getUint32(offset + 24, true); const length = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(new Uint8Array(buffer, offset + 46, length));
    if (!validProjectPath(name.replace(/\/$/, '')) || (view.getUint16(offset + 8, true) & 1)) throw new Error('ZIP 包含不安全路径或加密文件');
    if (total > MAX_BYTES) throw new Error('展开后的项目超过 100MiB');
    offset += 46 + length + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  if (offset !== end) throw new Error('不支持的 ZIP 目录');
}
export async function importProject(blob: Blob): Promise<Project> {
  if (blob.size > MAX_BYTES) throw new Error('项目压缩包超过 100MiB');
  const buffer = await blob.arrayBuffer(); checkArchive(buffer);
  const { default: JSZip } = await import('jszip'); const zip = await JSZip.loadAsync(buffer, { createFolders: false });
  const manifest = zip.file('project.json'); if (!manifest) throw new Error('缺少 project.json');
  const value = JSON.parse(await manifest.async('string'));
  if (value.version !== 1 || typeof value.name !== 'string' || typeof value.source !== 'string' || !Array.isArray(value.assets) || value.assets.length > 200
    || (value.path !== undefined && typeof value.path !== 'string')) throw new Error('项目清单格式无效');
  const assets: Record<string, Blob> = Object.create(null);
  const used = new Set<string>();
  for (const entry of value.assets) {
    if (typeof entry.path !== 'string' || !validProjectPath(entry.path) || !/^assets\/\d+\.bin$/.test(entry.file) || typeof entry.type !== 'string' || !/^image\//.test(entry.type)
      || assets[entry.path] || used.has(entry.file) || !Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error('项目图片清单无效');
    const file = zip.file(entry.file); if (!file) throw new Error('项目图片缺失');
    const bytes = await file.async('uint8array'); if (bytes.byteLength !== entry.size) throw new Error('项目图片大小不匹配');
    assets[entry.path] = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: entry.type }); used.add(entry.file);
  }
  const project = { id: crypto.randomUUID(), name: value.name.slice(0, 120), source: value.source, path: value.path, preferences: normalizeSettings(value.preferences), assets, savedAt: Date.now() };
  validateProject(project); return project;
}
