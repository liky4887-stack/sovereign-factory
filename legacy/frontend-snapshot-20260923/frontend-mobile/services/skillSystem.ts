import AsyncStorage from '@react-native-async-storage/async-storage';

const SKILLS_KEY = 'ghost_skills';

export interface Skill {
  id: string;
  name: string;
  description: string;
  sourceUrl: string;
  capabilities: string[];
  installedAt: number;
  version: string;
}

export interface FusedSkill extends Skill {
  parentIds: string[];
  fusedAt: number;
}

class SkillSystem {
  private skills: Skill[] = [];

  async load(): Promise<Skill[]> {
    const raw = await AsyncStorage.getItem(SKILLS_KEY);
    this.skills = raw ? JSON.parse(raw) : this.defaultSkills();
    return this.skills;
  }

  async importFromGitHub(url: string, name: string, capabilities: string[]): Promise<Skill> {
    const skill: Skill = {
      id: `skill-${Date.now()}`,
      name,
      description: `Imported from ${url}`,
      sourceUrl: url,
      capabilities,
      installedAt: Date.now(),
      version: '1.0.0',
    };
    this.skills = [...this.skills, skill];
    await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(this.skills));
    return skill;
  }

  async fuse(skillIds: string[], newName: string): Promise<FusedSkill> {
    await this.load();
    const parents = this.skills.filter((s) => skillIds.includes(s.id));
    if (parents.length < 2) throw new Error('Fusion requires at least 2 skills');
    const fused: FusedSkill = {
      id: `fused-${Date.now()}`,
      name: newName,
      description: `Fused from: ${parents.map((p) => p.name).join(' + ')}`,
      sourceUrl: 'local://fusion',
      capabilities: [...new Set(parents.flatMap((p) => p.capabilities))],
      installedAt: Date.now(),
      version: '1.0.0-fused',
      parentIds: skillIds,
      fusedAt: Date.now(),
    };
    this.skills = [...this.skills, fused];
    await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(this.skills));
    return fused;
  }

  private defaultSkills(): Skill[] {
    return [
      { id: 'skill-core-1', name: 'GitHub Pusher',
        description: 'Pushes generated code directly to configured GitHub repositories.',
        sourceUrl: 'https://github.com/ghostmode/skill-github-pusher',
        capabilities: ['git.push', 'git.branch', 'git.commit'],
        installedAt: Date.now() - 86400_000, version: '1.2.0' },
      { id: 'skill-core-2', name: 'Crash Healer',
        description: 'Spawns repair agents when runtime crashes are detected.',
        sourceUrl: 'https://github.com/ghostmode/skill-crash-healer',
        capabilities: ['crash.detect', 'agent.spawn', 'code.patch'],
        installedAt: Date.now() - 43200_000, version: '2.0.1' },
    ];
  }
}

export const skillSystem = new SkillSystem();
