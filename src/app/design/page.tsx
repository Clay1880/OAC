import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge, ORDER_STATUS_LABEL, type OrderStatus } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonText } from "@/components/ui/Skeleton";
import { formatPaise } from "@/lib/format";
import { DesignDemos } from "./DesignDemos";

export const metadata: Metadata = { title: "Design sheet", robots: { index: false } };

const statuses = Object.keys(ORDER_STATUS_LABEL) as OrderStatus[];

const swatches = [
  ["paper", "bg-paper"],
  ["surface", "bg-surface"],
  ["sunken", "bg-sunken"],
  ["ink", "bg-ink"],
  ["brand", "bg-brand"],
  ["brand-soft", "bg-brand-soft"],
] as const;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b border-line pb-2 text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** Living reference for the UI primitives. Development only; 404s in production. */
export default function DesignSheet() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main id="main" className="mx-auto max-w-2xl space-y-10 px-4 py-10">
      <h1 className="text-4xl font-semibold">Design sheet</h1>

      <Section title="Colour">
        <ul className="grid grid-cols-3 gap-3">
          {swatches.map(([name, bg]) => (
            <li key={name} className="space-y-1.5">
              <div className={`h-14 rounded-card border border-line ${bg}`} />
              <p className="text-sm text-ink-soft">{name}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type">
        <p className="font-display text-4xl font-semibold">Plus Jakarta Sans for display</p>
        <p>Instrument Sans for everything you read and tap.</p>
        <p className="order-code text-3xl">A-482 B-07</p>
        <p className="num text-xl">{formatPaise(12050)} · {formatPaise(0)} · {formatPaise(99900)}</p>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-3">
          <Button>Place order</Button>
          <Button variant="secondary">View menu</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Cancel order</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Placing</Button>
          <Button size="lg">Mark ready</Button>
        </div>
      </Section>

      <Section title="Status badges">
        <div className="flex flex-wrap gap-3">
          {statuses.map((s) => (
            <Badge key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          {statuses.map((s) => (
            <Badge key={s} status={s} size="lg" />
          ))}
        </div>
        <div className="flex gap-3">
          <Badge>Veg</Badge>
          <Badge tone="accent">Sold out</Badge>
        </div>
      </Section>

      <Section title="Cards">
        <Card>
          <p className="font-semibold">Paper card</p>
          <p className="text-ink-soft">Flat sheet with a hairline edge.</p>
        </Card>
        <Card
          variant="ticket"
          stub={<p className="order-code text-3xl">A-482</p>}
        >
          <p className="font-semibold">Ticket card</p>
          <p className="text-ink-soft">Body above, stub below the perforation.</p>
        </Card>
      </Section>

      <Section title="Loading">
        <div role="status" aria-busy="true" className="space-y-4">
          <span className="sr-only">Loading</span>
          <div className="flex gap-4">
            <Skeleton className="size-20 shrink-0" />
            <SkeletonText className="flex-1" />
          </div>
        </div>
      </Section>

      <Section title="Empty and error">
        <Card>
          <EmptyState
            title="Nothing ordered yet"
            description="Orders you place will show up here with their pickup code."
            action={<Button>Browse the menu</Button>}
          />
        </Card>
        <Card>
          <EmptyState
            tone="error"
            title="Could not load the menu"
            description="Check your connection and try again."
            action={<Button variant="secondary">Try again</Button>}
          />
        </Card>
      </Section>

      <Section title="Sheet and toasts">
        <DesignDemos />
      </Section>
    </main>
  );
}
