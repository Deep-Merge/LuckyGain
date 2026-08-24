import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("LuckyGain crashed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: "100%",
            display: "grid",
            placeItems: "center",
            padding: 32,
            background: "#F7F5EF",
            color: "#20221F",
            fontFamily: "Figtree, system-ui, sans-serif",
          }}
        >
          <div
            style={{
              maxWidth: 480,
              border: "1px solid #F0DDD9",
              background: "#F0DDD9",
              borderRadius: 16,
              padding: 24,
            }}
          >
            <h1 style={{ margin: 0, fontSize: 20 }}>Something went wrong</h1>
            <p style={{ marginTop: 10, lineHeight: 1.5 }}>
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 16,
                border: 0,
                borderRadius: 10,
                background: "#C6A15B",
                padding: "10px 14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
