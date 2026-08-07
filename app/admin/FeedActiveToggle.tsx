"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import { toggleFeed } from "./actions";

export function FeedActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Switch
      checked={active}
      disabled={isPending}
      onCheckedChange={() => {
        const formData = new FormData();
        formData.set("id", id);
        formData.set("active", String(active));
        startTransition(() => {
          toggleFeed(formData);
        });
      }}
    />
  );
}
