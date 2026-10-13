import { useEffect } from 'react';
import { Viewport } from './canvas/Viewport';
import { useStore } from './store/store';
import { Inspector } from './ui/Inspector';
import { ParametersPanel } from './ui/ParametersPanel';
import { StatusBar, Toast } from './ui/StatusBar';
import { Toolbar } from './ui/Toolbar';
import { TopBar } from './ui/TopBar';

export default function App() {
  const init = useStore((s) => s.init);
  const notify = useStore((s) => s.notify);

  useEffect(() => {
    init().catch((err) => notify(`The constraint solver failed to load: ${(err as Error).message}`, 'error'));
  }, [init, notify]);

  return (
    <div className="app">
      <TopBar />
      <div className="workspace">
        <Toolbar />
        <main className="canvas-area">
          <Viewport />
          <Toast />
        </main>
        <aside className="sidebar">
          <Inspector />
          <ParametersPanel />
        </aside>
      </div>
      <StatusBar />
    </div>
  );
}
