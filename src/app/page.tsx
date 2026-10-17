import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatPaise, formatSlotTime } from "@/lib/format";

// Placeholder landing until the student menu lands; shows the visual identity end to end.
export default function Home() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-4 py-12">
      <header>
        <p className="font-display text-lg font-semibold tracking-wide text-chili">
          OAC
        </p>
        <h1 className="mt-2 text-5xl font-semibold">
          Order now.
          <br />
          Walk in, pick up.
        </h1>
        <p className="mt-4 text-lg text-ink-soft text-pretty">
          Pick your meal, choose a pickup slot, and pay at the counter. No queue,
          no cash fumbling.
        </p>
      </header>

      <Card
        variant="ticket"
        aria-label="Sample order"
        stub={
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-sm text-ink-faint">Order code</p>
              <p className="order-code text-4xl">A-482</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-ink-faint">Pay at counter</p>
              <p className="num text-2xl font-semibold">{formatPaise(12050)}</p>
            </div>
          </div>
        }
      >
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-xl font-semibold">Pickup</p>
          <Badge status="ready" />
        </div>
        <p className="num mt-2 text-3xl font-semibold">
          {formatSlotTime("2026-10-19T07:45:00Z")}
        </p>
        <p className="mt-1 text-ink-soft">Masala dosa, filter coffee</p>
      </Card>
    </main>
  );
}
