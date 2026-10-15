import type { ReactNode } from 'react'
import { Badge, Card, Page, ScreenHeader } from '../../ui/index.ts'

export function FeatureStub({
  title,
  subtitle,
  owner,
  note,
  subnav,
  children,
}: {
  title: string
  subtitle?: string
  owner: string
  note: string
  subnav?: ReactNode
  children?: ReactNode
}) {
  return (
    <Page>
      <ScreenHeader title={title} subtitle={subtitle} />
      {subnav}
      {children}
      <Card className="border-dashed bg-charcoal/80">
        <Badge tone="warn">{owner}</Badge>
        <p className="mt-2 text-sm leading-relaxed text-ink">{note}</p>
      </Card>
    </Page>
  )
}
