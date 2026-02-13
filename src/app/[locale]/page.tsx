import MapboxView from "@/components/MapboxView";
import { SignedIn, SignedOut, RedirectToSignIn } from "@clerk/nextjs";
import LanguageSelector from "@/components/LanguageSelector";

export default function Home() {
  return (
    <main>
      <SignedIn>
        <MapboxView />
        <LanguageSelector />
      </SignedIn>

      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
