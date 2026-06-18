// A wrapping row of chips bound to a config path holding one of `options`.
import { Chip } from '../../components/ui/chip.js';
import { useConfigStore } from '../../stores/config.js';
import { getByPath } from '../../lib/path.js';

export function TabGroup({ path, options }: { path: string; options: readonly string[] }) {
  const value = useConfigStore((s) => getByPath(s.config, path) as string);
  const set = useConfigStore((s) => s.set);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => (
        <Chip key={opt} active={value === opt} onClick={() => set(path, opt)}>
          {opt}
        </Chip>
      ))}
    </div>
  );
}
