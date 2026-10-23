import { SyncBridge } from '../features/friends/SyncBridge.tsx'
import { WhoopCallbackBridge } from '../features/whoop/WhoopCallbackBridge.tsx'
import { StoreProvider } from '../store/StoreProvider.tsx'
import { ConfirmProvider } from '../ui/Confirm.tsx'
import { ToastProvider } from '../ui/Toast.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'
import { RouteView } from './RouteView.tsx'
import { Shell } from './Shell.tsx'
import { UpdateToast } from './UpdateToast.tsx'

export default function App() {
  return (
    <ErrorBoundary>
      <StoreProvider>
        <ToastProvider>
          <ConfirmProvider>
            <SyncBridge />
            <WhoopCallbackBridge />
            <Shell>
              <RouteView />
            </Shell>
            <UpdateToast />
          </ConfirmProvider>
        </ToastProvider>
      </StoreProvider>
    </ErrorBoundary>
  )
}
