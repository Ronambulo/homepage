import Admin from "@/components/Admin";
import Login from "@/components/Login";
import { readConfig } from "@/lib/store";
import { authEnabled, isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Panel · Inicio" };

export default async function AdminPage() {
  if (!(await isAuthed())) return <Login />;
  return <Admin initial={await readConfig()} authEnabled={authEnabled()} />;
}
