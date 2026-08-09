import { Users } from 'lucide-react';
import OpenLobbyButton from './OpenLobbyButton';

// The card that stands in for a lobby nobody has opened yet.
//
// This is the common case, not the empty state — most of the time there is no
// game filling, and the honest thing to show is the one action that changes
// that. It occupies a card slot and matches the game cards' height so the row
// doesn't reflow the moment somebody opens a lobby.
//
// Deliberately loud where a game card is informational: a game card competes
// for attention with two others, this one is competing with nothing.

export default function OpenLobbyCard() {
  return (
    <div
      className="group relative flex flex-col justify-between min-h-[220px] rounded-2xl p-5
                 border border-dashed border-[#E7000B]/40 hover:border-[#E7000B]
                 bg-gradient-to-br from-[#E7000B]/12 to-transparent hover:from-[#E7000B]/20
                 backdrop-blur-md transition-colors"
    >
      <div>
        <div className="flex items-center gap-2.5">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full
                       bg-[#E7000B]/20 border border-[#E7000B]/40 text-[#f87171]"
          >
            <Users className="h-4 w-4" />
          </span>
          <h3 className="text-[22px] font-bold text-white leading-tight">Nikt jeszcze nie gra</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          Ktoś musi być pierwszy. Otwórz lobby jednym kliknięciem — nazwę, hasło i ustawienia
          bierzemy na siebie, a reszta zwykle dosiada się w kilka minut.
        </p>
      </div>

      <div className="mt-5">
        <OpenLobbyButton variant="card" />
      </div>
    </div>
  );
}
