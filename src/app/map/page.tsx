import MapboxView from "@/components/MapboxView";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";

export default function MapPage() {
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
