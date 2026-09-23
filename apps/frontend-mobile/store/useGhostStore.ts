import { create } from 'zustand';
import { Session, sessionManager } from '@/services/session';
import { LedgerEntry, truthLedger } from '@/services/truthLedger';
import { Skill, skillSystem } from '@/services/skillSystem';
import { AutopilotEvent, autopilot } from '@/services/autopilot';

interface GhostState {
  session: Session | null;
  ledger: LedgerEntry[];
  skills: Skill[];
  autopilotEvents: AutopilotEvent[];
  consoleLines: string[];
  init: () => Promise<void>;
  refreshLedger: () => Promise<void>;
  refreshSkills: () => Promise<void>;
  appendConsole: (line: string) => void;
  clearConsole: () => void;
}

export const useGhostStore = create<GhostState>((set) => ({
  session: null,
  ledger: [],
  skills: [],
  autopilotEvents: [],
  consoleLines: [],

  init: async () => {
    const session = await sessionManager.init();
    const ledger = await truthLedger.load();
    const skills = await skillSystem.load();
    const autopilotEvents = autopilot.getEvents();

    sessionManager.subscribe((s) => set({ session: s }));
    autopilot.subscribe((events) => set({ autopilotEvents: events }));

    set({ session, ledger, skills, autopilotEvents });
  },

  refreshLedger: async () => {
    const ledger = await truthLedger.load();
    set({ ledger });
  },

  refreshSkills: async () => {
    const skills = await skillSystem.load();
    set({ skills });
  },

  appendConsole: (line) =>
    set((state) => ({ consoleLines: [...state.consoleLines.slice(-200), line] })),

  clearConsole: () => set({ consoleLines: [] }),
}));
