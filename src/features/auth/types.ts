/**
 * Shape returned by every auth Server Action and consumed by useActionState.
 * `values` echoes non-secret inputs back so the form keeps them after an error
 * (React 19 resets uncontrolled forms after an action runs).
 */
export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  values?: Record<string, string>;
};

export const initialActionState: ActionState = {};
