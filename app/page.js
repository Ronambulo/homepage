import Home from "@/components/Home";
import { readConfig } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function Page() {
  return <Home config={await readConfig()} />;
}
