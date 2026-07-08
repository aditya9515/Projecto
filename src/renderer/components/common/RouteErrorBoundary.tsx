import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { PageError } from "./PageError";
type RouteErrorBoundaryState = { error: Error | null };
export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  RouteErrorBoundaryState
> {
  override state: RouteErrorBoundaryState = { error: null };
  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error };
  }
  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[Projecto route error]", error, errorInfo);
  }
  override render(): ReactNode {
    if (this.state.error) {
      return (
        <PageError
          description={
            this.state.error.message ||
            "Projecto could not render this screen. You can retry without restarting the whole app."
          }
          onAction={() => this.setState({ error: null })}
          title="This screen could not be rendered"
        />
      );
    }
    return this.props.children;
  }
}
