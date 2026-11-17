// "This list changed on the server": a counter per resource, bumped by the API wrappers after every write that
// succeeds. Hooks that fetch a list subscribe to it and fetch again, so the sidebar, the list pages and the edit
// pages never show an outdated list. Only the counter lives here, never the data: the API stays its only owner.

type Listener = () => void;

export interface ChangeSignal {
  /** Increases by one on every change; a hook re-fetches when it differs from the one it fetched for. */
  revision: () => number;
  subscribe: (listener: Listener) => () => void;
  notify: () => void;
}

export function createChangeSignal(): ChangeSignal {
  let revision = 0;
  const listeners = new Set<Listener>();
  return {
    revision: () => revision,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => {
      revision += 1;
      listeners.forEach(listener => listener());
    }
  };
}

export const configurationsChanged = createChangeSignal();
export const templatesChanged = createChangeSignal();
