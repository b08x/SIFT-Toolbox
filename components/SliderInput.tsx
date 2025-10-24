import React, { ChangeEvent } from 'react';

interface SliderInputProps {
  label: string;
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  description?: string;
  unit?: string;
  disabled?: boolean;
}

export const SliderInput: React.FC<SliderInputProps> = ({
  label,
  id,
  min,
  max,
  step,
  value,
  onChange,
  description,
  unit,
  disabled = false,
}) => {
  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(parseFloat(event.target.value));
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    let numValue = parseFloat(event.target.value);
    if (isNaN(numValue)) numValue = min; // Or handle appropriately
    if (numValue < min) numValue = min;
    if (numValue > max) numValue = max;
    onChange(numValue);
  };

  return (
    <div className={`space-y-1 ${disabled ? 'opacity-60' : ''}`}>
      <label htmlFor={id} className="block text-xs font-medium text-primary-accent">
        {label}
      </label>
      <div className="flex items-center space-x-2">
        <input
          type="range"
          id={id}
          name={id}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleSliderChange}
          disabled={disabled}
          className="w-full h-2 bg-border rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
        <input
          type="number"
          id={`${id}-number`}
          name={`${id}-number`}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInputChange}
          disabled={disabled}
          className="w-20 p-1.5 text-xs bg-main border border-ui rounded-md text-main focus:ring-primary focus:border-primary disabled:cursor-not-allowed"
        />
         {unit && <span className="text-xs text-light">{unit}</span>}
      </div>
      {description && <p className="text-xs text-light/70 italic mt-0.5">{description}</p>}
    </div>
  );
};