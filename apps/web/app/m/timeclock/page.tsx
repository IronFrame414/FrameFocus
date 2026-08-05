import { SlicePlaceholder } from "../slice-placeholder";

// M6M §1 — tab slot 2. The real screen is M-5 (§4.5, §4.5a, §4.12.1), a later
// slice. This route exists so the shell is navigable and assertable now.
export default function MobileTimeclockPage() {
  return <SlicePlaceholder screen="M-5 · Timeclock" title="Timeclock" />;
}
