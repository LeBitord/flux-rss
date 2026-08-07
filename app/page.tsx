import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 py-32 text-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Flux RSS</h1>
      <p className="text-muted-foreground max-w-md">
        Surveillance de flux RSS multi-domaines avec notifications Discord.
      </p>
      <Button render={<Link href="/admin" />}>
        Aller à l&apos;administration
      </Button>
    </main>
  );
}
