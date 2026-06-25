const STACK_KEY = "teamflow:ref-back-stack";
const MAX_ENTRIES = 24;

export type RefBackEntry = {
  ref: string;
  label: string;
};

function readStack(): RefBackEntry[] {
  try {
    const raw = sessionStorage.getItem(STACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RefBackEntry =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as RefBackEntry).ref === "string" &&
        typeof (item as RefBackEntry).label === "string",
    );
  } catch {
    return [];
  }
}

function writeStack(stack: RefBackEntry[]) {
  sessionStorage.setItem(STACK_KEY, JSON.stringify(stack.slice(-MAX_ENTRIES)));
}

export function getRefBackStack(): RefBackEntry[] {
  return readStack();
}

export function pushRefBack(entry: RefBackEntry) {
  const ref = entry.ref.trim();
  if (!ref) return;
  const stack = readStack();
  const last = stack[stack.length - 1];
  if (last?.ref === ref) return;
  writeStack([...stack, { ref, label: entry.label.trim() || ref }]);
}

export function popRefBack(): RefBackEntry | null {
  const stack = readStack();
  if (stack.length === 0) return null;
  const next = stack[stack.length - 1]!;
  writeStack(stack.slice(0, -1));
  return next;
}

export function peekRefBack(): RefBackEntry | null {
  const stack = readStack();
  return stack[stack.length - 1] ?? null;
}

export function clearRefBackStack() {
  sessionStorage.removeItem(STACK_KEY);
}
