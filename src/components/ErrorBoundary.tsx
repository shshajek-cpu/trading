import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  /** Short Korean description of what failed, e.g. "차트". */
  label: string
  /** Changing this value clears a caught error (e.g. symbol/interval/chart type). */
  resetKey?: string
  /** Applied to the fallback so it keeps the failed part's grid slot. */
  style?: CSSProperties
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  resetKey?: string
}

/**
 * Keeps one broken part from blanking the whole app. Without it, a single exception in a
 * chart effect unmounts the React root and the user sees an empty page.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    if (props.resetKey !== state.resetKey) return { error: null, resetKey: props.resetKey }
    return null
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.label}]`, error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="error-fallback" role="alert" style={this.props.style}>
        <p>{this.props.label}을(를) 표시하지 못했습니다.</p>
        <p className="error-detail">{error.message}</p>
        <button type="button" className="tv-btn" onClick={() => this.setState({ error: null })}>
          다시 시도
        </button>
      </div>
    )
  }
}
