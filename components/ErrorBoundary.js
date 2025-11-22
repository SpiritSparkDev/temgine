import React from 'react';

// Simple error boundary to catch chunk/load/runtime errors from dynamic imports
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Could log to a monitoring service here
    console.error('ErrorBoundary caught', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback({ error: this.state.error, reset: () => this.setState({ hasError: false, error: null }) });
      return <div style={{ padding: 12, background: '#fee', borderRadius: 6 }}>Ein Fehler ist aufgetreten.</div>;
    }
    return this.props.children;
  }
}
