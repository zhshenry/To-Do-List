import type { DockIconPreset } from '../shared/contracts';

export const DOCK_ICONS: { id: DockIconPreset; name: string }[] = [
  { id: 'orbit', name: '圆环' }, { id: 'note', name: '小笺' },
  { id: 'sprout', name: '嫩芽' }, { id: 'cat', name: '团猫' },
];

export function DockIcon({ preset, custom }: { preset: DockIconPreset; custom?: string }) {
  return <img src={custom || `./dock-icons/${preset}.svg`} alt="" className={custom ? 'is-cover' : undefined} draggable={false} />;
}
