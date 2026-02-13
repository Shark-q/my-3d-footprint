import MapboxView from "@/components/MapboxView";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

export default function Home() {
  return (
    <main>
      <SignedIn>
        <MapboxView />
      </SignedIn>

      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
