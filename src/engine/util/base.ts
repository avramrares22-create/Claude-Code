/** App base path ("/" locally, "/Repo/" on GitHub Pages). Safe outside Vite (Node scripts). */
export const BASE_URL: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

/** Static data published next to the app by the CI pipeline. */
export const dataUrl = (path: string) => `${BASE_URL}data/${path}`;
