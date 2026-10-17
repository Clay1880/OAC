"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useToast } from "@/components/ui/Toast";

/** Interactive pieces of the design sheet (sheet + toasts need client state). */
export function DesignDemos() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast({ title: "Order placed", description: "Pickup at 1:15 PM.", tone: "success" })}
      >
        Success toast
      </Button>
      <Button
        variant="secondary"
        onClick={() => toast({ title: "Could not place order", description: "That slot just filled up. Pick another.", tone: "error" })}
      >
        Error toast
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Your cart"
        description="2 items, pickup at 1:15 PM"
        footer={
          <Button fullWidth size="lg" onClick={() => setOpen(false)}>
            Place order
          </Button>
        }
      >
        <div className="space-y-3">
          <p className="text-ink-soft">Sheet body scrolls when the content is long.</p>
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                title: "Could not place order",
                description: "That slot just filled up. Pick another.",
                tone: "error",
              })
            }
          >
            Raise error toast
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
