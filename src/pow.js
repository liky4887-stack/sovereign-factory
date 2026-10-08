import PowSolver from '@rezaparsian/deepseek-pow-solver';

let _solver = null;

async function getSolver() {
  if (_solver) return _solver;
  _solver = new PowSolver();
  await _solver.init();
  return _solver;
}

// challenge: { algorithm, challenge, salt, signature, difficulty, expire_at }
// targetPath: e.g. "/api/v0/chat/completion"
export async function solveToHeader(challenge, targetPath) {
  const solver = await getSolver();
  const payload = solver.solve(challenge);
  const full = {
    algorithm: payload.algorithm,
    challenge: payload.challenge,
    salt: payload.salt,
    answer: payload.answer,
    signature: payload.signature,
    target_path: targetPath,
  };
  return Buffer.from(JSON.stringify(full)).toString('base64');
}
