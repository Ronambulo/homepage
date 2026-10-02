import KeroBrain from "@/components/KeroBrain";
import Login from "@/components/Login";
import { isAuthed } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cerebro · Kero" };

export default async function BrainPage() {
  if (!(await isAuthed())) return <Login />;
  return <KeroBrain />;
}
