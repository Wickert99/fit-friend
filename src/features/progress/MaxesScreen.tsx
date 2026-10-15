import { ProgressSubNav } from '../../app/TabSubNav.tsx'
import { Page, ScreenHeader } from '../../ui/index.ts'
import { MaxesPanel } from './MaxesPanel.tsx'

export default function MaxesScreen() {
  return (
    <Page>
      <ScreenHeader title="Progress" subtitle="1RMs, run times and benchmarks" />
      <ProgressSubNav value="maxes" />
      <div data-maxes-hub>
        <MaxesPanel />
      </div>
    </Page>
  )
}
