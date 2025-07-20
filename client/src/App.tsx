import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
// import { SpeedInsights } from "@vercel/speed-insights/react"; // Removed for now
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { PWAInstallPrompt, PWAUpdatePrompt, PWAOfflineIndicator } from "./components/ui/pwa-install-prompt";
import AppLayout from "./components/layout/AppLayout";
import Dashboard from "./pages/Dashboard";
import WorkOrders from "./pages/WorkOrders";
import Equipment from "./pages/Equipment";
import Inventory from "./pages/Inventory";
import PreventiveMaintenance from "./pages/PreventiveMaintenance";
import Vendors from "./pages/Vendors";
import Phase1Demo from "./pages/Phase1Demo";
import Auth from "./pages/Auth";
import Analytics from "./pages/Analytics";
import { PerformanceDashboard } from "./components/admin/PerformanceDashboard";
import EnterpriseMonitoring from "./pages/EnterpriseMonitoring";
import SystemDashboard from "./pages/monitoring/SystemDashboard";
import NotFound from "@/pages/not-found";

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Loading MaintainPro...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  // In a real app, check authentication status here
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <Switch>
      <Route path="/auth" component={Auth} />
      <Route path="/login" component={Auth} />
      <Route path="/">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/work-orders">
        <ProtectedRoute>
          <WorkOrders />
        </ProtectedRoute>
      </Route>
      <Route path="/equipment">
        <ProtectedRoute>
          <Equipment />
        </ProtectedRoute>
      </Route>
      <Route path="/inventory">
        <ProtectedRoute>
          <Inventory />
        </ProtectedRoute>
      </Route>
      <Route path="/preventive">
        <ProtectedRoute>
          <PreventiveMaintenance />
        </ProtectedRoute>
      </Route>
      <Route path="/vendors">
        <ProtectedRoute>
          <Vendors />
        </ProtectedRoute>
      </Route>
      <Route path="/analytics">
        <ProtectedRoute>
          <Analytics />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/performance">
        <ProtectedRoute>
          <PerformanceDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/admin/monitoring">
        <ProtectedRoute>
          <EnterpriseMonitoring />
        </ProtectedRoute>
      </Route>
      <Route path="/monitoring/system-dashboard">
        <ProtectedRoute>
          <SystemDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/system-monitoring">
        <ProtectedRoute>
          <SystemDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/phase1-demo">
        <ProtectedRoute>
          <Phase1Demo />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AppRoutes />
          <PWAInstallPrompt />
          <PWAUpdatePrompt />
          <PWAOfflineIndicator />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
