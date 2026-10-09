import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { SERIES } from "@/domain/series";
import { SERIES_IDS } from "@/domain/types";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-20 text-center">
      <BrandMark className="size-12 text-primary" />
      <p className="mt-6 font-mono text-sm font-medium text-muted-foreground">404</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tighter sm:text-4xl">Off the racing line</h1>
      <p className="mt-3 text-muted-foreground">That page doesn&apos;t exist. Pick a Series to get back on track.</p>
      <ul className="mt-8 flex flex-wrap justify-center gap-2">
        {SERIES_IDS.map((id) => (
          <li key={id}>
            <Link href={`/${id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
              {SERIES[id].shortName}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
