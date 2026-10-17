import Link from "next/link";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function OrderNotFound() {
  return (
    <EmptyState
      title="We could not find that order"
      description="Check the order ID, or open it from your list of orders."
      action={
        <Link href="/orders" className={buttonStyles()}>
          My orders
        </Link>
      }
    />
  );
}
