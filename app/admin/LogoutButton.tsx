import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm">
        <LogOut className="size-4" />
        Se déconnecter
      </Button>
    </form>
  );
}
