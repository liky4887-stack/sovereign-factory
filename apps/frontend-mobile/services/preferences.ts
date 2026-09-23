// services/preferences.ts
// CEO preferences, persisted in SecureStore.
// Three axes: risk tolerance, approval threshold, communication style.

import * as SecureStore from 'expo-secure-store';

export type RiskTolerance = 'low' | 'medium' | 'high';
export type ApprovalThreshold = 'all_actions' | 'mutating_only' | 'autonomous';
export type CommStyle = 'concise' | 'detailed';

export interface CeoPreferences {
  riskTolerance: RiskTolerance;
  approvalThreshold: ApprovalThreshold;
  commStyle: CommStyle;
}

const K_RISK = 'ceo_risk_tolerance';
const K_APPROVAL = 'ceo_approval_threshold';
const K_COMM = 'ceo_comm_style';

export const DEFAULT_PREFERENCES: CeoPreferences = {
  riskTolerance: 'medium',
  approvalThreshold: 'mutating_only',
  commStyle: 'concise',
};

async function readEnum<T extends string>(key: string, allowed: readonly T[], fallback: T): Promise<T> {
  const v = await SecureStore.getItemAsync(key);
  return (v && (allowed as readonly string[]).includes(v)) ? (v as T) : fallback;
}

export const preferences = {
  async getAll(): Promise<CeoPreferences> {
    const [riskTolerance, approvalThreshold, commStyle] = await Promise.all([
      readEnum<RiskTolerance>(K_RISK, ['low', 'medium', 'high'], DEFAULT_PREFERENCES.riskTolerance),
      readEnum<ApprovalThreshold>(
        K_APPROVAL,
        ['all_actions', 'mutating_only', 'autonomous'],
        DEFAULT_PREFERENCES.approvalThreshold
      ),
      readEnum<CommStyle>(K_COMM, ['concise', 'detailed'], DEFAULT_PREFERENCES.commStyle),
    ]);
    return { riskTolerance, approvalThreshold, commStyle };
  },

  async setRisk(value: RiskTolerance): Promise<void> {
    await SecureStore.setItemAsync(K_RISK, value);
  },
  async setApproval(value: ApprovalThreshold): Promise<void> {
    await SecureStore.setItemAsync(K_APPROVAL, value);
  },
  async setComm(value: CommStyle): Promise<void> {
    await SecureStore.setItemAsync(K_COMM, value);
  },

  async getRequestHeaders(): Promise<Record<string, string>> {
    const p = await this.getAll();
    return {
      'X-CEO-Risk-Tolerance': p.riskTolerance,
      'X-CEO-Approval-Threshold': p.approvalThreshold,
      'X-CEO-Comm-Style': p.commStyle,
    };
  },

  async reset(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(K_RISK),
      SecureStore.deleteItemAsync(K_APPROVAL),
      SecureStore.deleteItemAsync(K_COMM),
    ]);
  },
};
