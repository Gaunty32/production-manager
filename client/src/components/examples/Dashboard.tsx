import Dashboard from '../../pages/Dashboard';
import { SidebarProvider } from '@/components/ui/sidebar';
import { ThemeProvider } from '../ThemeProvider';

export default function DashboardExample() {
  const style = {
    "--sidebar-width": "16rem",
  };

  return (
    <ThemeProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="h-[600px] w-full">
          <Dashboard />
        </div>
      </SidebarProvider>
    </ThemeProvider>
  );
}
