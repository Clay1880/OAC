import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shown instead of the menu and checkout while a student has an unpaid no-show. */
export function DuesBlock() {
  return (
    <EmptyState
      tone="error"
      title="Clear your dues at the counter"
      description="You did not collect an earlier order, so ordering is paused. Pay at the canteen counter and the canteen staff will switch ordering back on."
      action={
        <Link href="/orders" className={buttonStyles({ variant: "secondary" })}>
          See my orders
        </Link>
      }
    />
  );
}
