// The linked resources the backend reads, typed for the E2E typecheck. (The app's sst-env.d.ts pulls in
// SST's whole platform, with its own Node types, which clashes with this project's.)
import 'sst';
declare module 'sst' {
  export interface Resource {
    Table: { name: string };
    Images: { name: string };
    MapTilerKey: { value: string };
  }
}
