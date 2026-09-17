import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("ProjectHub page error", error, info);
  }

  reset = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="state surface page-error-state">
        <strong>This page could not be loaded.</strong>
        <span>Your other ProjectHub pages are still available.</span>
        <button className="button primary" type="button" onClick={this.reset}>
          Try again
        </button>
      </div>
    );
  }
}
