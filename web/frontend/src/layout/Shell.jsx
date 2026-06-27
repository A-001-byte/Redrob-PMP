import CommandBar from './CommandBar.jsx';
import Sidebar from './Sidebar.jsx';
import ContextRail from './ContextRail.jsx';
import FooterConsole from './FooterConsole.jsx';

export default function Shell({ children }) {
  return (
    <div className="grid grid-rows-[64px_minmax(0,1fr)_36px] h-screen w-screen overflow-hidden">
      {/* Command Bar */}
      <header className="w-full h-full border-b">
        <CommandBar />
      </header>

      {/* Middle Workspace: Sidebar | Main Content | Context Rail */}
      {/* FUTURE: Integrate dynamic width state here when implementing draggable resize handlers */}
      <div className="grid grid-cols-[260px_minmax(0,1fr)_320px] min-h-0 w-full">
        {/* Sidebar Panel */}
        {/* FUTURE: Add horizontal drag-resize divider and drag events between Sidebar and Main Content */}
        <aside className="h-full overflow-y-auto border-r">
          <Sidebar />
        </aside>

        {/* Main Workspace Viewport */}
        <main className="h-full overflow-y-auto">
          {children}
        </main>

        {/* Context Information Rail */}
        {/* FUTURE: Add horizontal drag-resize divider and drag events between Main Content and Context Rail */}
        <aside className="h-full overflow-y-auto border-l">
          <ContextRail />
        </aside>
      </div>

      {/* Footer Console */}
      <footer className="w-full h-full border-t">
        <FooterConsole />
      </footer>
    </div>
  );
}
