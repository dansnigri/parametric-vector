import { useEffect } from 'react';
import { Viewport } from './canvas/Viewport';
import { useStore } from './store/store';
import { PropertyManager } from './ui/PropertyManager';
import { Ribbon } from './ui/Ribbon';
import { StatusBar, Toast } from './ui/StatusBar';
import { TitleBar } from './ui/TitleBar';

export default function App() {
  const init = useStore((s) => s.init);
  const notify = useStore((s) => s.notify);

  useEffect(() => {
    init().catch((err) => notify(`The constraint solver failed to load: ${(err as Error).message}`, 'error'));
  }, [init, notify]);

  return (
    <div className="app">
      <TitleBar />
      <Ribbon />
      <div className="workspace">
        <PropertyManager />
        <main className="canvas-area">
          <Viewport />
          <Toast />
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
