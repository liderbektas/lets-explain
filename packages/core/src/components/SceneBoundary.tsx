import { Component, type ReactNode } from "react";

interface Props {
  message: string;
  children: ReactNode;
}

/** Keeps one broken scene from blanking the whole site. */
export class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[scene]", error);
  }

  render() {
    if (this.state.failed) return <div className="scene-error">{this.props.message}</div>;
    return this.props.children;
  }
}
