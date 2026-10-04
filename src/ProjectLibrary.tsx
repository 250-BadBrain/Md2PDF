import { useEffect, useRef, useState } from 'react';
import { deleteProject, listProjects, loadProject, type ProjectRecord } from './projects';
export function ProjectLibrary({ disabled, save, open, importFile, exportFile, close }: {
  disabled: boolean; save: (name: string, fresh: boolean) => Promise<void>; open: (project: ProjectRecord, revision?: number) => void;
  importFile: (file: File) => Promise<void>; exportFile: () => Promise<void>; close: () => void;
}) {
  const [projects, setProjects] = useState<Awaited<ReturnType<typeof listProjects>>>([]);
  const [name, setName] = useState('我的文档'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<ProjectRecord>(); const input = useRef<HTMLInputElement>(null);
  const refresh = async () => setProjects(await listProjects());
  useEffect(() => { void refresh().catch((error) => setError(String(error))); }, []);
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError(''); try { await work(); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  return <aside className="project-library" aria-label="本地项目">
    <div className="settings-heading"><h2>本地项目</h2><button onClick={close}>关闭项目库</button></div>
    <p>项目保存在此浏览器，包含本地图片和最近五个版本。导出项目包可备份或迁移；清除站点数据会删除本地项目。</p>
    {error ? <p role="alert">{error}</p> : null}
    <fieldset disabled={disabled || busy}>
      <label>项目名称<input aria-label="项目名称" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></label>
      <button onClick={() => void run(() => save(name.trim() || '我的文档', false))}>保存当前项目</button>
      <button onClick={() => void run(() => save(name.trim() || '我的文档', true))}>另存为新项目</button>
      <button onClick={() => void run(exportFile)}>导出项目包</button>
      <button onClick={() => input.current?.click()}>导入项目包</button>
      <input className="file-input" ref={input} type="file" accept=".zip" onChange={(e) => { const file = e.target.files?.[0]; if (file) void run(() => importFile(file)); e.target.value = ''; }} />
      <ul>{projects.map((project) => <li key={project.id}>
        <span>{project.name}</span>
        <button onClick={() => void run(async () => { const value = await loadProject(project.id); if (!value) throw new Error('项目已不存在'); setSelected(value); open(value); })}>打开 {project.name}</button>
        <button onClick={() => void run(async () => { await deleteProject(project.id); window.dispatchEvent(new CustomEvent('project-deleted', { detail: project.id })); if (selected?.id === project.id) setSelected(undefined); })}>删除 {project.name}</button>
      </li>)}</ul>
      {selected ? <div aria-label="项目历史"><h3>{selected.name} 的历史版本</h3>{selected.history.map((revision, index) => <button key={index} onClick={() => open(selected, index)}>恢复版本 {index + 1}（{new Date(revision.savedAt).toLocaleString()}）</button>)}</div> : null}
    </fieldset>
  </aside>;
}
