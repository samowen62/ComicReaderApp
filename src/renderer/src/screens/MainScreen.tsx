import React, { useState } from 'react';
import { useAppStore } from '../state/store';

export function MainScreen(): React.JSX.Element {
  const { projects, newProject, openProject, removeProject, setScreen, askConfirm, notify } =
    useAppStore();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      await newProject(trimmed);
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
      setName('');
    }
  };

  return (
    <div className="screen main-screen">
      <header className="screen-header">
        <h1>Comic Reader</h1>
        <button className="btn" onClick={() => setScreen('settings')}>
          Settings
        </button>
      </header>

      <section className="new-project">
        <h2>New Project</h2>
        <div className="new-project-row">
          <input
            className="input"
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void create()}
          />
          <button className="btn btn-primary" disabled={!name.trim() || creating} onClick={() => void create()}>
            New Project
          </button>
        </div>
      </section>

      <section className="project-list-section">
        <h2>Saved Projects</h2>
        {projects.length === 0 && <p className="muted">No projects yet.</p>}
        <ul className="project-list">
          {projects.map((p) => (
            <li key={p.name} className="project-row">
              <div className="project-info">
                <span className="project-name">{p.name}</span>
                <span className="muted">
                  {p.imageCount} page{p.imageCount === 1 ? '' : 's'} · modified{' '}
                  {new Date(p.modifiedAt).toLocaleString()}
                </span>
              </div>
              <div className="project-actions">
                <button className="btn btn-primary" onClick={() => void openProject(p.name)}>
                  Open
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() =>
                    askConfirm({
                      title: `Delete project "${p.name}"?`,
                      body: 'This permanently deletes the project directory and all of its images. This cannot be undone.',
                      confirmLabel: 'Delete',
                      danger: true,
                      onConfirm: () => void removeProject(p.name)
                    })
                  }
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
