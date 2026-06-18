// A dropdown bound to a config path holding one of `options` (shows the selection).
import { Select } from '../../components/ui/select.js';
import { useConfigStore } from '../../stores/config.js';
import { getByPath } from '../../lib/path.js';

export function SelectGroup({ path, options }: { path: string; options: readonly string[] }) {
  const value = useConfigStore((s) => getByPath(s.config, path) as string);
  const set = useConfigStore((s) => s.set);
  return (
    <Select value={value} onChange={(e) => set(path, e.target.value)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </Select>
  );
}
