// services/__tests__/sovereign.test.ts
// Brief §8 coverage for the sovereign-core endpoint wrappers:
//   - every request goes to port 8790
//   - Authorization: Bearer header present when token is set
//   - request paths, methods, and bodies match sovereign-core's real API
//   - response shapes round-trip faithfully

import { sovereign, type CreateProjectInput } from '../sovereign';
import { sovereignClient } from '../sovereignClient';
import * as SecureStore from 'expo-secure-store';

const KEYS = ['sovereign_host', 'sovereign_port', 'sovereign_scheme', 'sovereign_token'];

function mockResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

describe('sovereign endpoint wrappers', () => {
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    mockFetch = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
    for (const k of KEYS) await SecureStore.deleteItemAsync(k);
    await sovereignClient.setToken('test-bearer');
  });

  test('getHealth GETs /health on port 8790 with Bearer', async () => {
    const body = {
      ok: true,
      service: 'termux-bridge',
      uptimeSeconds: 42,
      snapshot: { pid: 1, uptimeSeconds: 42, nodeVersion: 'v24.17.0', platform: 'android', arch: 'arm64', cpuCount: 0, loadAvg: [0, 0, 0] as [number, number, number], memory: { totalBytes: 1, freeBytes: 1, usedBytes: 0, processRssBytes: 1, processHeapUsedBytes: 1 }, timestamp: '2026-01-01T00:00:00Z' },
    };
    mockFetch.mockResolvedValueOnce(mockResponse(body));

    const out = await sovereign.getHealth();
    expect(out).toEqual(body);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/health');
    expect(opts.headers['authorization']).toBe('Bearer test-bearer');
  });

  test('getProcessStatus GETs /process/status on port 8790', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true,
      status: { pid: 1, uptimeSeconds: 1, nodeVersion: 'v24', platform: 'android', arch: 'arm64', cpuCount: 0, loadAvg: [0, 0, 0] as [number, number, number], memory: { totalBytes: 1, freeBytes: 1, usedBytes: 0, processRssBytes: 1, processHeapUsedBytes: 1 }, timestamp: '2026-01-01T00:00:00Z' },
    }));

    await sovereign.getProcessStatus();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/process/status');
    expect(opts.method ?? 'GET').toBe('GET');
    expect(opts.headers['authorization']).toBe('Bearer test-bearer');
  });

  test('executeCommand POSTs /executeCommand with the correct body', async () => {
    const runResult = {
      exitCode: 0,
      signal: null,
      stdout: '/home\n',
      stderr: '',
      durationMs: 12,
      truncated: false,
      command: 'pwd',
      args: [],
      cwd: '/home',
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, result: runResult }));

    const out = await sovereign.executeCommand({ command: 'pwd' });
    expect(out.result).toEqual(runResult);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/executeCommand');
    expect(opts.method).toBe('POST');
    expect(opts.headers['authorization']).toBe('Bearer test-bearer');
    expect(opts.headers['content-type']).toBe('application/json');
    expect(JSON.parse(opts.body)).toEqual({ command: 'pwd' });
  });

  test('listProjects GETs /projects with query params', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true, projects: [], total: 0, limit: 100, offset: 0,
    }));

    await sovereign.listProjects({ archived: false, limit: 50 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/projects?archived=false&limit=50');
  });

  test('createProject POSTs /projects with the correct body', async () => {
    const project = {
      id: 'p1', name: 'UI Overhaul', slug: 'ui-overhaul', description: 'x',
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
      archived: false,
      metrics: { goalCount: 0, openTaskCount: 0, doneTaskCount: 0, activeAgentCount: 0, ledgerEntryCount: 0, lastActivityAt: '2026-01-01T00:00:00Z' },
    };
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, project }));

    const input: CreateProjectInput = { name: 'UI Overhaul', description: 'x' };
    const out = await sovereign.createProject(input);
    expect(out.project).toEqual(project);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/projects');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual(input);
  });

  test('updateProject PATCHes /projects/:id with the patch body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, project: { id: 'p1' } }));

    await sovereign.updateProject('p1', { archived: true });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/projects/p1');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ archived: true });
  });

  test('listTasks GETs /tasks with filters', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true, tasks: [], total: 0, limit: 100, offset: 0,
    }));

    await sovereign.listTasks({ projectId: 'p1', status: 'in_progress' });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/tasks?projectId=p1&status=in_progress');
  });

  test('createTask POSTs /tasks with the correct body', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, task: { id: 't1' } }));

    await sovereign.createTask({
      projectId: 'p1',
      title: 'Wire missions',
      description: 'x',
      priority: 'P1',
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/tasks');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({
      projectId: 'p1',
      title: 'Wire missions',
      priority: 'P1',
    });
  });

  test('updateTask PATCHes /tasks/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, task: { id: 't1' } }));

    await sovereign.updateTask('t1', { status: 'done' });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/tasks/t1');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ status: 'done' });
  });

  test('deleteTask DELETEs /tasks/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));

    await sovereign.deleteTask('t1');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/tasks/t1');
    expect(opts.method).toBe('DELETE');
  });

  test('listAgents GETs /agents', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({
      ok: true, agents: [], total: 0, limit: 100, offset: 0,
    }));

    await sovereign.listAgents({ role: 'builder' });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/agents?role=builder');
  });

  test('createAgent POSTs /agents with role and skills', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, agent: { id: 'a1' } }));

    await sovereign.createAgent({
      name: 'Atlas',
      role: 'architect',
      persona: 'Designs systems',
      skills: ['systems-design'],
    });

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/agents');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({
      name: 'Atlas',
      role: 'architect',
      skills: ['systems-design'],
    });
  });
});

// ── Added coverage: offers, goals, ledger ──────────────────────────────

describe('sovereign endpoint wrappers — extended', () => {
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    mockFetch = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
    for (const k of ['sovereign_host', 'sovereign_port', 'sovereign_scheme', 'sovereign_token']) {
      await SecureStore.deleteItemAsync(k);
    }
    await sovereignClient.setToken('test-bearer');
  });

  test('listOffers GETs /offers', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, offers: [], total: 0, limit: 100, offset: 0 }));
    await sovereign.listOffers({ limit: 20 });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/offers?limit=20');
    expect(opts.headers['authorization']).toBe('Bearer test-bearer');
  });

  test('getOffer GETs /offers/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, offer: { id: 'o1' } }));
    await sovereign.getOffer('o1');
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/offers/o1');
  });

  test('createOffer POSTs /offers with levers', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, offer: { id: 'o1' } }));
    await sovereign.createOffer({
      name: 'Console Sprint',
      coreDeliverable: 'Ship screens',
      priceUsd: 4900,
      dreamOutcome: 9,
      perceivedLikelihood: 7,
      timeDelay: 3,
      effortSacrifice: 2,
    });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/offers');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({
      name: 'Console Sprint',
      dreamOutcome: 9,
      perceivedLikelihood: 7,
    });
  });

  test('updateOffer PATCHes /offers/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, offer: { id: 'o1' } }));
    await sovereign.updateOffer('o1', { perceivedLikelihood: 10 });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/offers/o1');
    expect(opts.method).toBe('PATCH');
    expect(JSON.parse(opts.body)).toEqual({ perceivedLikelihood: 10 });
  });

  test('deleteOffer DELETEs /offers/:id', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }));
    await sovereign.deleteOffer('o1');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/offers/o1');
    expect(opts.method).toBe('DELETE');
  });

  test('listGoals GETs /goals with projectId filter', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, goals: [], total: 0, limit: 100, offset: 0 }));
    await sovereign.listGoals({ projectId: 'p1', status: 'active' });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/goals?projectId=p1&status=active');
  });

  test('createGoal POSTs /goals', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, goal: { id: 'g1' } }));
    await sovereign.createGoal({
      projectId: 'p1',
      title: 'Ship all screens',
      description: 'Console IA complete',
      priority: 'P0',
      status: 'active',
    });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/goals');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toMatchObject({ title: 'Ship all screens', priority: 'P0' });
  });

  test('linkTaskToGoal POSTs /goals/:id/tasks', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, goal: { id: 'g1' } }));
    await sovereign.linkTaskToGoal('g1', 't1');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/goals/g1/tasks');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ taskId: 't1' });
  });

  test('unlinkTaskFromGoal DELETEs /goals/:id/tasks/:taskId', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, goal: { id: 'g1' } }));
    await sovereign.unlinkTaskFromGoal('g1', 't1');
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/goals/g1/tasks/t1');
    expect(opts.method).toBe('DELETE');
  });

  test('listLedger GETs /ledger/query with limit default 50', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, entries: [], total: 0, limit: 50, offset: 0 }));
    await sovereign.listLedger();
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/ledger/query?limit=50');
  });

  test('listLedger respects custom limit and type filter', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true, entries: [], total: 0, limit: 20, offset: 0 }));
    await sovereign.listLedger({ limit: 20, type: 'SERVER_START' });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/ledger/query?type=SERVER_START&limit=20');
  });
});
