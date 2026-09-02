import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AgentWorkspaceProvider } from "@/hooks/use-agent-workspace";
import { LoginForm } from "@/components/login-form";
import { AgentConfirmationDialog } from "@/components/agent-confirmation-dialog";
import Home from "@/pages/home";

function AuthenticatedApp() {
  const { session, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-shell" role="status" aria-label="Opening Fasting Tracker" aria-busy="true">
        <div className="loading-ring" />
        <p>Opening your tracker</p>
      </div>
    );
  }

  return session?.authenticated ? <Home /> : <LoginForm />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AgentWorkspaceProvider>
          <AuthenticatedApp />
          <AgentConfirmationDialog />
        </AgentWorkspaceProvider>
      </AuthProvider>
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
