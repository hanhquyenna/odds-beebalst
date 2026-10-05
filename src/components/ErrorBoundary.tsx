import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

/** Wraps the whole app in main.tsx: a render crash or a lazy chunk that fails to load (an old tab after a deploy) shows a reload prompt instead of a blank page. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.failed) {
      return this.props.children
    }

    return (
      <div role="alert" className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background p-4 text-center text-foreground">
        <p>Something went wrong loading this page.</p>
        <Button className="cursor-pointer" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    )
  }
}
