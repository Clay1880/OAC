import { FOOD_CREDITS } from "@/lib/foodImages";

export const metadata = { title: "Photo credits" };

export default function CreditsPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Photo credits</h1>
      <p className="mt-2 text-ink-soft">
        Dish photos come from Wikimedia Commons and are shared under Creative Commons licences. Thank you to the
        photographers.
      </p>
      <ul className="mt-6 divide-y divide-line rounded-card border border-line bg-surface px-4 shadow-edge">
        {FOOD_CREDITS.map((c) => (
          <li key={c.file} className="py-3 text-sm">
            <a href={c.page} target="_blank" rel="noreferrer" className="font-semibold underline">
              {c.title.replace(/\.[a-z]+$/i, "")}
            </a>
            <span className="text-ink-soft">
              {" "}
              by {c.author} · {c.license}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
