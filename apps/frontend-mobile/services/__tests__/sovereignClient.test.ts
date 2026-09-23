// services/__tests__/sovereignClient.test.ts
// Verifies brief §8 requirements against the sovereign-core HTTP client:
//   - base URL is sovereign-core on port 8790
//   - Authorization: Bearer header is injected when a token is set
//   - non-2xx responses surface a real SovereignError
//   - PATCH is supported end-to-end

import { sovereignClient, SovereignError } from '../sovereignClient';
import * as SecureStore from 'expo-secure-store';

function mockResponse(body: unknown, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const KEYS = ['sovereign_host', 'sovereign_port', 'sovereign_scheme', 'sovereign_token'];

describe('sovereignClient', () => {
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    mockFetch = jest.fn();
    (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;
    for (const k of KEYS) await SecureStore.deleteItemAsync(k);
  });

  test('defaults to sovereign-core on port 8790', async () => {
    const url = await sovereignClient.getBaseUrl();
    expect(url).toBe('http://192.168.43.101:8790');
    expect(url).toContain(':8790');
  });

  test('reads custom host/port/scheme from SecureStore', async () => {
    await sovereignClient.setHost('10.0.0.5');
    await sovereignClient.setPort('9999');
    await sovereignClient.setScheme('https');
    const url = await sovereignClient.getBaseUrl();
    expect(url).toBe('https://10.0.0.5:9999');
  });

  test('injects Authorization: Bearer when a token is set', async () => {
    await sovereignClient.setToken('abc123');
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }, 200));

    await sovereignClient.get('/health');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://192.168.43.101:8790/health');
    expect(opts.headers['authorization']).toBe('Bearer abc123');
  });

  test('omits Authorization when no token is set', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }, 200));

    await sovereignClient.get('/health');

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers['authorization']).toBeUndefined();
  });

  test('throws SovereignError on non-2xx with server message', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'project not found' }, 404));

    await expect(sovereignClient.get('/projects/missing')).rejects.toMatchObject({
      name: 'SovereignError',
      status: 404,
      message: 'project not found',
    });
  });

  test('passes PATCH method and JSON body through', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ ok: true }, 200));

    await sovereignClient.request({
      method: 'PATCH',
      path: '/projects/p1',
      body: { archived: true },
    });

    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.method).toBe('PATCH');
    expect(opts.body).toBe(JSON.stringify({ archived: true }));
    expect(opts.headers['content-type']).toBe('application/json');
  });

  test('error is instanceof SovereignError', async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: 'nope' }, 500));
    try {
      await sovereignClient.get('/x');
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(SovereignError);
    }
  });
});
