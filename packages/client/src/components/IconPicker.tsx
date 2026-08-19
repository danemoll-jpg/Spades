import { PLAYER_ICON_CHOICES } from '../lib/icons';

interface IconPickerProps {
  value: string;
  onChange: (icon: string) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="icon-picker">
      {PLAYER_ICON_CHOICES.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`icon-picker__option ${icon === value ? 'active' : ''}`}
          aria-pressed={icon === value}
          aria-label={`Choose avatar ${icon}`}
          onClick={() => onChange(icon)}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}
