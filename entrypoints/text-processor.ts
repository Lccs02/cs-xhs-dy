import { classifyText } from '../src/core/classification';
import type { Category } from '../src/core/types';

interface Request {
  id: string;
  type: 'CLASSIFY_BATCH';
  items: Array<{ id: string; title: string; text: string | null }>;
  categories: Category[];
}

export default defineUnlistedScript(() => {
  globalThis.addEventListener('message', (event: MessageEvent<Request>) => {
    if (event.data?.type !== 'CLASSIFY_BATCH') return;
    const results = event.data.items.map((item) => ({
      itemId: item.id,
      categories: classifyText(item.title, item.text, event.data.categories),
    }));
    globalThis.postMessage({ id: event.data.id, ok: true, results });
  });
});
