"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import type { Defaulter } from "@/lib/admin/defaulters";
import { formatPaise } from "@/lib/format";
import { createClient } from "@/lib/supabase/browser";

export function DefaultersAdmin({ defaulters }: { defaulters: Defaulter[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function markPaid(d: Defaulter) {
    setBusyId(d.studentId);
    const supabase = createClient();
    let failed = false;
    // One payment can cover several missed orders: settle them all; the last one clears the flag.
    for (const orderId of d.orderIds) {
      const { error } = await supabase.rpc("settle_no_show", { p_order_id: orderId });
      if (error) failed = true;
    }
    setBusyId(null);
    toast(
      failed
        ? { title: "Some orders could not be marked paid. Refresh and try again.", tone: "error" }
        : { title: `${d.name} can order again`, tone: "success" },
    );
    router.refresh();
  }

  if (defaulters.length === 0) {
    return <EmptyState title="No defaulters" description="Everyone has collected or paid for their orders." />;
  }

  return (
    <ul className="flex flex-col gap-4">
      {defaulters.map((d) => (
        <li key={d.studentId} data-student-id={d.studentId}>
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-2xl font-semibold">{d.name}</h2>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-ink-soft">Phone</dt>
                  <dd>
                    {d.phone ? (
                      <a href={`tel:${d.phone}`} className="num underline underline-offset-2">
                        {d.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt className="text-ink-soft">Reg. no.</dt>
                  <dd className="num">{d.regNo ?? "—"}</dd>
                  <dt className="text-ink-soft">Orders</dt>
                  <dd className="num">{d.orderIds.length}</dd>
                </dl>
              </div>
              <div className="text-right">
                <p className="text-sm text-ink-soft">Unpaid</p>
                <p className="num text-2xl font-semibold">{formatPaise(d.unpaidPaise)}</p>
              </div>
            </div>
            <Button className="mt-4" fullWidth loading={busyId === d.studentId} onClick={() => void markPaid(d)}>
              Mark paid
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  );
}
