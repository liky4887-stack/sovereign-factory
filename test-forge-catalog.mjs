
import { catalog } from '@three-ws/forge';
try {
  const c = await catalog();
  console.log(JSON.stringify(c, null, 2));
} catch (e) {
  console.log('catalog failed:', e.message);
}
